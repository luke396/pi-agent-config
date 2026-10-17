// Adapted from @luan.sh/pi-collapse-transcript 0.3.6 test/transcript.test.ts.
// MIT (c) 2026 Luan Santos; see ../../extensions/collapse-transcript/LICENSE.
// Assertions run inside the installed Pi to use its actual native components.
import assert from "node:assert/strict";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

const cases: { name: string; run: () => void | Promise<void> }[] = [];
function test(name: string, run: () => void | Promise<void>): void { cases.push({ name, run }); }
let theme: Theme;
const cleanups: (() => void)[] = [];

import {
	AssistantMessageComponent,
	CompactionSummaryMessageComponent,
	initTheme,
	type SessionEntry,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { Container, ProcessTerminal, Text, TuiAltScreen, visibleWidth } from "@earendil-works/pi-tui";
import { configureTuiAppearance, DEFAULT_TUI_APPEARANCE, sharedMotionScheduler, tuiTheme } from "../../npm/node_modules/@luan.sh/pi-libtui/src/index.ts";
import type { TuiMouseEvent } from "../../npm/node_modules/@luan.sh/pi-libtui/src/mouse.ts";
import { mountTranscriptProjection, ToolActivity, type TranscriptEntry } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";
import { ActivityTimings } from "../../extensions/collapse-transcript/activity-timing.ts";
import { ActivityTranscript, activitySummary } from "../../extensions/collapse-transcript/activity-transcript.ts";


class TestTui extends TuiAltScreen {
	requestRender(): void {}
}

function message(content: Parameters<AssistantMessageComponent["updateContent"]>[0]["content"]) {
	return {
		role: "assistant" as const,
		content,
		api: "openai-responses" as const,
		provider: "openai",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "toolUse" as const,
		timestamp: 0,
	};
}

function fixture(timings = new ActivityTimings(), now: () => number = () => 0, activeTheme = theme) {
	configureTuiAppearance({ activityIndicator: "static", textEffect: "off" });
	const tui = new TestTui(new ProcessTerminal());
	const document = new Container();
	const chat = new Container();
	document.addChild(new Container());
	document.addChild(new Container());
	document.addChild(chat);
	tui.addChild(document);
	let projection: ActivityTranscript | undefined;
	const unmount = mountTranscriptProjection(tui, (entries) => {
		projection = new ActivityTranscript(entries, activeTheme, () => {}, timings, now);
		return projection;
	});
	if (!unmount || !projection) throw new Error("Expected a mounted transcript");
	cleanups.push(unmount);
	return { tui, document, chat, projection, unmount };
}

function lines(component: { render(width: number): string[] }, width = 80): string[] {
	return component.render(width).map((line) => stripTerminalSequences(line).trimEnd());
}
function click(projection: ActivityTranscript, row: number): void {
	const event: TuiMouseEvent = {
		type: "press",
		row,
		col: 2,
		screenRow: row,
		screenCol: 2,
		button: 0,
		wheel: undefined,
		shift: false,
		alt: false,
		ctrl: false,
	};
	assert.equal(projection.onMouse(event), true);
	assert.equal(projection.onMouse({ ...event, type: "release" }), true);
}

test("native thinking and tool rows collapse together and expand with their original content", () => {
	const f = fixture();
	const thought = new AssistantMessageComponent(
		message([{ type: "thinking", thinking: "**Inspect source**\n\nDetailed reasoning." }]),
	);
	const tool = new ToolExecutionComponent(
		"exec_command",
		"one",
		{ cmd: "cat file" },
		undefined,
		undefined,
		f.tui,
		"/tmp",
	);
	tool.markExecutionStarted();
	tool.updateResult({ content: [{ type: "text", text: "original output" }], isError: false });
	f.chat.addChild(thought);
	f.chat.addChild(tool);
	const compact = lines(f.document);
	assert.equal((compact.filter(Boolean)).length, 1);
	assert.ok((compact.join("\n")).includes("Inspect source"));
	assert.ok((compact.join("\n")).includes("2 steps"));
	assert.ok(!(compact.join("\n")).includes("Detailed reasoning."));
	assert.ok(!(compact.join("\n")).includes("original output"));
	click(f.projection, 1);
	const expanded = lines(f.document).join("\n");
	assert.ok((expanded).includes("Detailed reasoning."));
	assert.ok((expanded).includes("original output"));
	click(f.projection, 1);
	assert.equal((lines(f.document).filter(Boolean)).length, 1);
	f.unmount();
	assert.equal(f.document.children[2], f.chat);
	assert.ok((lines(f.document).join("\n")).includes("original output"));
});

test("active work stays compact across tools and continuations while prose and previous folds stay visible", () => {
	const f = fixture();
	f.chat.addChild(
		new AssistantMessageComponent(
			message([{ type: "thinking", thinking: "**Previous turn**\n\nHistorical details." }]),
		),
	);
	f.chat.addChild(new Text("Next user request", 0, 0));
	f.projection.beginTurn();
	const thought = new AssistantMessageComponent();
	const source = message([{ type: "thinking", thinking: "**Current work**\n\nLive reasoning." }]);
	thought.updateContent(source, true);
	f.chat.addChild(thought);
	let rendered = lines(f.document).join("\n");
	assert.ok((rendered).includes("Working for 0s · Current work · 1 step"));
	assert.ok(!(rendered).includes("Live reasoning."));
	assert.ok(!(rendered).includes("Historical details."));
	thought.updateContent(source, false);
	const tool = new ToolExecutionComponent("read", "live", {}, undefined, undefined, f.tui, "/tmp");
	tool.markExecutionStarted();
	tool.updateResult({ content: [{ type: "text", text: "Live tool progress" }], isError: false }, true);
	f.chat.addChild(tool);
	rendered = lines(f.document).join("\n");
	assert.ok((rendered).includes("Working · Current work · 2 steps"));
	assert.ok(!(rendered).includes("Live tool progress"));
	tool.updateResult({ content: [{ type: "text", text: "Completed tool output" }], isError: false });
	// The group stays live between tool completion and the next model request.
	assert.ok((lines(f.document).join("\n")).includes("Working · Current work · 2 steps"));
	f.chat.addChild(new AssistantMessageComponent(message([{ type: "text", text: "Checking the result." }])));
	// Automatic continuation must not reveal the earlier output.
	f.projection.beginTurn();
	f.chat.addChild(
		new AssistantMessageComponent(message([{ type: "thinking", thinking: "**Verify result**\n\nFollow-up detail." }])),
	);
	rendered = lines(f.document).join("\n");
	assert.ok(!(rendered).includes("Live reasoning."));
	assert.ok(!(rendered).includes("Completed tool output"));
	assert.ok(!(rendered).includes("Follow-up detail."));
	assert.ok((rendered).includes("Worked · Current work · 2 steps"));
	assert.ok((rendered).includes("Working · Verify result · 1 step"));
	assert.ok((rendered).includes("Checking the result."));
	f.projection.finishTurn();
	rendered = lines(f.document).join("\n");
	assert.ok(!(rendered).includes("Live reasoning."));
	assert.ok(!(rendered).includes("Completed tool output"));
	assert.ok(!(rendered).includes("Follow-up detail."));
	assert.ok((rendered).includes("Current work · 2 steps"));
	assert.ok((rendered).includes("Verify result · 1 step"));
	assert.ok(!(rendered).includes("Working"));
	assert.ok((rendered).includes("Checking the result."));
	// Starting another turn leaves the finished folds alone.
	f.projection.beginTurn();
	assert.equal(lines(f.document).join("\n"), rendered);
	f.unmount();
});

test("streamed updates retain expansion and update the latest thinking heading", () => {
	const f = fixture();
	f.projection.beginTurn();
	const thought = new AssistantMessageComponent();
	const source = message([{ type: "thinking", thinking: "**First step**\n\nDetails." }]);
	thought.updateContent(source, true);
	f.chat.addChild(thought);
	assert.ok((lines(f.document).join("\n")).includes("First step"));
	click(f.projection, 1);
	// Pi may reuse the same streamed message object.
	source.content = [{ type: "thinking", thinking: "**Second step**\n\nMore detail." }];
	thought.updateContent(source, true);
	const updated = lines(f.document).join("\n");
	assert.ok((updated).includes("Second step"));
	assert.ok((updated).includes("More detail."));
	thought.updateContent(source, false);
	f.projection.beginTurn();
	assert.ok((lines(f.document).join("\n")).includes("More detail."));
	f.projection.finishTurn();
	assert.ok((lines(f.document).join("\n")).includes("More detail."));
	assert.ok(!(lines(f.document).join("\n")).includes("●"));
	click(f.projection, 1);
	assert.ok(!(lines(f.document).join("\n")).includes("More detail."));
	f.unmount();
});

test("compaction becomes one full-width divider with an independent summary disclosure", () => {
	const f = fixture();
	f.chat.addChild(new Text("Earlier conversation", 0, 0));
	const native = new CompactionSummaryMessageComponent({
		role: "compactionSummary",
		summary: "**Saved context**\n\nOriginal summary content.",
		tokensBefore: 257_174,
		timestamp: 0,
	});
	// Pi's global tool expansion must not expand our context disclosure.
	native.setExpanded(true);
	f.chat.addChild(native);
	const collapsed = lines(f.document, 100);
	assert.equal((collapsed).length, 2);
	assert.ok((collapsed[1]).startsWith("── Context compacted · 257,174 tokens before "));
	assert.ok((collapsed[1]).includes("───"));
	assert.equal(visibleWidth(collapsed[1]!), 100);
	assert.ok(!(collapsed.join("\n")).includes("Original summary content"));
	assert.ok(!(collapsed.join("\n")).includes("[compaction]"));
	click(f.projection, 1);
	assert.ok((lines(f.document).join("\n")).includes("Original summary content."));
	f.chat.addChild(new Text("Work continues", 0, 0));
	assert.ok((lines(f.document).join("\n")).includes("Original summary content."));
	click(f.projection, 1);
	assert.ok(!(lines(f.document).join("\n")).includes("Original summary content."));
	for (const width of [1, 2, 8, 40, 100]) {
		const divider = lines(f.projection, width)[1]!;
		assert.equal(visibleWidth(divider), width);
	}
	f.unmount();
	assert.ok((f.chat.children).includes(native));
	assert.ok((lines(f.document).join("\n")).includes("[compaction]"));
});

test("compaction separates activity without resetting an existing open fold", () => {
	const f = fixture();
	f.chat.addChild(
		new AssistantMessageComponent(message([{ type: "thinking", thinking: "**Before**\n\nEarlier detail." }])),
	);
	lines(f.document);
	click(f.projection, 1);
	f.chat.addChild(
		new CompactionSummaryMessageComponent({
			role: "compactionSummary",
			summary: "Summary.",
			tokensBefore: 100,
			timestamp: 0,
		}),
	);
	f.chat.addChild(
		new AssistantMessageComponent(message([{ type: "thinking", thinking: "**After**\n\nLater detail." }])),
	);
	const rendered = lines(f.document).join("\n");
	assert.ok((rendered).includes("Earlier detail."));
	assert.ok((rendered).includes("Before · 1 step"));
	assert.ok((rendered).includes("After · 1 step"));
	assert.ok(!(rendered).includes("Later detail."));
	assert.ok(!(rendered).includes("Summary."));
	f.unmount();
});

test("tools retain the latest thinking summary while running and after completion", () => {
	const f = fixture();
	const thought = new AssistantMessageComponent(
		message([{ type: "thinking", thinking: "**First step**\n\nDetails.\n\n**Implement marker helper**\n\nNext." }]),
	);
	f.chat.addChild(thought);
	const tool = new ToolExecutionComponent("exec", "one", {}, undefined, undefined, f.tui, "/tmp");
	tool.markExecutionStarted();
	f.chat.addChild(tool);
	const running = lines(f.document).join("\n");
	assert.ok((running).includes("Implement marker helper"));
	assert.ok((running).includes("2 steps"));
	assert.ok(!(running).includes("exec"));
	tool.updateResult({ content: [{ type: "text", text: "done" }], isError: false });
	assert.ok((lines(f.document).join("\n")).includes("Implement marker helper"));
	const next = new AssistantMessageComponent();
	next.updateContent(message([{ type: "thinking", thinking: "**Verify marker rendering**" }]), true);
	f.chat.addChild(next);
	assert.ok((lines(f.document).join("\n")).includes("Verify marker rendering"));
	f.unmount();
});

test("tool summaries use live semantic fields without flattening or pre-truncating custom renderers", () => {
	const f = fixture();
	f.projection.beginTurn();
	let headerRenders = 0;
	let payloadRenders = 0;
	const detail = `${"long/path/".repeat(12)}transcript.ts`;
	const activity = new ToolActivity({
		theme,
		requestRender: () => {},
		action: {
			render: () => {
				headerRenders++;
				return ["Explored", "  └ Read truncated…"];
			},
			invalidate() {},
		},
		view: {
			action: { verb: "Read", detail, status: "succeeded" },
			payload: {
				kind: "component",
				preview: {
					render: () => {
						payloadRenders++;
						return ["original tool output"];
					},
					invalidate() {},
				},
			},
		},
	});
	const tool = new ToolExecutionComponent(
		"exec",
		"one",
		{},
		undefined,
		{ renderResult: () => activity },
		f.tui,
		"/tmp",
	);
	tool.updateResult({ content: [], isError: false });
	f.chat.addChild(tool);
	const compact = lines(f.document, 200).join("\n");
	assert.ok((compact).includes(`Read · ${detail}`));
	assert.doesNotMatch(compact, /[└…]/u);
	assert.equal(headerRenders, 0);
	assert.equal(payloadRenders, 0);
	// Nested renderers can update independently of the enclosing Pi result.
	activity.update({ action: { verb: "Verified", detail: "transcript.ts", status: "succeeded" } });
	assert.ok((lines(f.document).join("\n")).includes("Verified · transcript.ts"));
	click(f.projection, 1);
	assert.ok((lines(f.document).join("\n")).includes("Explored"));
	assert.ok((headerRenders) > (0));
	f.unmount();
	activity.dispose();
});

test("prose separates folds and tool failures stay inside expansion after completion", () => {
	const f = fixture();
	f.projection.beginTurn();
	f.chat.addChild(
		new AssistantMessageComponent(
			message([
				{ type: "thinking", thinking: "**Check files**\n\nLonger thought." },
				{ type: "text", text: "Here is my answer." },
			]),
		),
	);
	const tool = new ToolExecutionComponent("build", "one", {}, undefined, undefined, f.tui, "/tmp");
	tool.updateResult({ content: [{ type: "text", text: "build failure details" }], isError: true });
	f.chat.addChild(tool);
	const compact = lines(f.document).join("\n");
	assert.ok((compact).includes("Here is my answer."));
	assert.ok((compact).includes("Check files"));
	assert.ok((compact).includes("Working · build · 1 step"));
	assert.ok(!(compact).includes("failed"));
	assert.ok(!(compact).includes("Longer thought."));
	assert.ok(!(compact).includes("Failed"));
	assert.ok(!(compact).includes("build failure details"));
	f.projection.finishTurn();
	const completed = lines(f.document);
	assert.ok((completed.join("\n")).includes("Worked · build · 1 step"));
	assert.ok(!(completed.join("\n")).includes("Failed"));
	assert.ok(!(completed.join("\n")).includes("build failure details"));
	click(
		f.projection,
		completed.findIndex((row) => row.includes("Worked · build")),
	);
	assert.ok((lines(f.document).join("\n")).includes("build failure details"));
	f.unmount();
});

for (const count of [1, 10]) test(`${count} failed calls stay folded while work continues and retain complete nested output`, () => {
	const f = fixture();
	f.projection.beginTurn();
	const output = `Partially edited files\n${"@@ patch diff\n+added line\n-removed line\n".repeat(30)}Script error: failed patch`;
	for (let index = 0; index < count; index++) {
		const tool = new ToolExecutionComponent("codemode", `failed-${index}`, {}, undefined, undefined, f.tui, "/tmp");
		tool.updateResult({ content: [{ type: "text", text: output }], isError: true });
		f.chat.addChild(tool);
	}
	const compact = lines(f.document);
	assert.equal((compact.filter(Boolean)).length, 1);
	assert.ok((compact.join("\n")).includes("Working · codemode"));
	assert.ok(!(compact.join("\n")).includes("failed"));
	assert.ok(!(compact.join("\n")).includes("Failed"));
	assert.ok(!(compact.join("\n")).includes("Partially edited"));
	assert.ok(!(compact.join("\n")).includes("patch diff"));
	assert.ok(!(compact.join("\n")).includes("Script error"));
	const continuing = new ToolExecutionComponent("read", "continuing", {}, undefined, undefined, f.tui, "/tmp");
	continuing.markExecutionStarted();
	f.chat.addChild(continuing);
	assert.ok((lines(f.document).join("\n")).includes("Working · read"));
	assert.equal((lines(f.document).filter(Boolean)).length, 1);
	click(f.projection, 1);
	assert.ok((lines(f.document).join("\n")).includes("Partially edited files"));
	assert.ok((lines(f.document).join("\n")).includes("patch diff"));
	click(f.projection, 1);
	assert.equal((lines(f.document).filter(Boolean)).length, 1);
	f.unmount();
});

test("retains unknown nodes and native error notices; detach stops animation without owning native tools", () => {
	const mounts = sharedMotionScheduler.activeMountCount;
	const f = fixture();
	f.chat.addChild(new Text("unknown notice", 0, 0));
	const failed = new AssistantMessageComponent({
		...message([{ type: "thinking", thinking: "Interrupted thought" }]),
		stopReason: "error",
		errorMessage: "network failed",
	});
	f.chat.addChild(failed);
	const tool = new ToolExecutionComponent("build", "one", {}, undefined, undefined, f.tui, "/tmp");
	tool.markExecutionStarted();
	f.chat.addChild(tool);
	const rendered = lines(f.document).join("\n");
	assert.ok((rendered).includes("unknown notice"));
	assert.ok((rendered).includes("network failed"));
	f.unmount();
	assert.equal(sharedMotionScheduler.activeMountCount, mounts);
	assert.ok((f.chat.children).includes(tool));
});

test("unsupported roots and duplicate mounts leave the host unchanged", () => {
	const tui = new TestTui(new ProcessTerminal());
	assert.equal(mountTranscriptProjection(tui, () => {
			throw new Error("must not run");
		}), undefined);
	const f = fixture();
	assert.equal(mountTranscriptProjection(f.tui, () => {
			throw new Error("must not run");
		}), undefined);
	f.unmount();
	const release = mountTranscriptProjection(f.tui, (entries) => new ActivityTranscript(entries, theme, () => {}));
	assert.notEqual(release, undefined);
	release?.();
});

test("summary uses the latest supplied heading, bounds text and strips control sequences", () => {
	const part: TranscriptEntry = {
		kind: "thinking",
		key: {},
		component: new Container(),
		running: false,
		failed: false,
		summary: "**Old**\n\nPrior.\n\n**Latest**\n\nCurrent.",
	};
	assert.equal(activitySummary(part), "Latest");
	const text = activitySummary({ ...part, summary: `\x1b]52;c;secret\x07${"word ".repeat(1000)}` });
	assert.ok(!(text).includes("\x1b"));
	assert.ok((text.length) <= (241));
	const transcript = new ActivityTranscript(
		() => [part],
		theme,
		() => {},
	);
	for (const width of [1, 2, 8, 40])
		assert.equal(transcript.render(width).every((row) => visibleWidth(row) <= width), true);
	transcript.dispose();
});

test("muted, underlined rows retain saved wall time across parallel tools and reloads", () => {
	// Chalk disables attributes without a TTY; exercise the terminal theme contract.
	const styledTheme = Object.create(theme) as Theme;
	styledTheme.underline = (text: string) => `\x1b[4m${text}\x1b[24m`;
	styledTheme.italic = (text: string) => `\x1b[3m${text}\x1b[23m`;
	const source = {
		...message([
			{ type: "thinking", thinking: "**Checking index baseline**" },
			{ type: "toolCall", id: "one", name: "read", arguments: {} },
			{ type: "toolCall", id: "two", name: "read", arguments: {} },
		]),
		timestamp: 1_000,
	};
	const branch: SessionEntry[] = [
		{
			type: "message",
			id: "assistant",
			parentId: null,
			timestamp: new Date(3_000).toISOString(),
			message: source,
		},
	];
	const result = (id: string, timestamp: number): SessionEntry => ({
		type: "message",
		id,
		parentId: "assistant",
		timestamp: new Date(timestamp).toISOString(),
		message: { role: "toolResult", toolCallId: id, toolName: "read", content: [], isError: false, timestamp },
	});
	const timings = new ActivityTimings();
	timings.load(branch);
	let now = 11_000;
	const f = fixture(timings, () => now, styledTheme);
	f.projection.beginTurn();
	f.chat.addChild(new AssistantMessageComponent(source));
	const tools: ToolExecutionComponent[] = [];
	for (const id of ["one", "two"]) {
		const tool = new ToolExecutionComponent("read", id, {}, undefined, undefined, f.tui, "/tmp");
		tool.markExecutionStarted();
		f.chat.addChild(tool);
		tools.push(tool);
	}
	assert.ok((lines(f.document).join("\n")).includes("Working for 10s · Checking index baseline · 3 steps"));
	now = 66_000;
	assert.ok((lines(f.document).join("\n")).includes("Working for 1m 5s · Checking index baseline · 3 steps"));
	branch.push(result("one", 101_000), result("two", 417_000));
	timings.load(branch);
	for (const tool of tools) tool.updateResult({ content: [], isError: false });
	now = 418_000;
	// The live timer includes gaps between completed tools and the next request.
	assert.ok((lines(f.document).join("\n")).includes("Working for 6m 57s · Checking index baseline · 3 steps"));
	f.projection.finishTurn();
	assert.ok((lines(f.document).join("\n")).includes("Worked for 6m 56s · Checking index baseline · 3 steps"));
	f.unmount();
	// Rebuilding native components must use saved timestamps, not their mount time.
	timings.load(branch);
	const reloaded = fixture(timings, () => 999_000, styledTheme);
	reloaded.chat.addChild(new AssistantMessageComponent(source));
	for (const id of ["one", "two"]) {
		const tool = new ToolExecutionComponent("read", id, {}, undefined, undefined, reloaded.tui, "/tmp");
		tool.updateResult({ content: [], isError: false });
		reloaded.chat.addChild(tool);
	}
	const rows = reloaded.document.render(100);
	const row = rows.find((line) => stripTerminalSequences(line).includes("Worked for"))!;
	assert.ok((stripTerminalSequences(row)).startsWith("  Worked for 6m 56s · Checking index baseline · 3 steps"));
	assert.ok((row).startsWith(tuiTheme(styledTheme).fgAnsi("text.muted")));
	assert.ok((row).includes(styledTheme.italic("Checking index baseline")));
	assert.ok((row).includes("\x1b[4:4m"));
	assert.equal(visibleWidth(row), 100);
	const padding = " ".repeat(100 - visibleWidth(stripTerminalSequences(row).trimEnd()));
	assert.ok((padding.length) > (20));
	assert.ok((row).includes(tuiTheme(styledTheme).fg("text.muted", padding)));
	assert.ok((row).includes(`${padding}\x1b[39m\x1b[24m`));
	assert.ok(!(row).includes("\x1b[1m"));
	assert.doesNotMatch(stripTerminalSequences(row), /[•●]/u);
	for (const width of [1, 2, 8, 40])
		assert.equal(reloaded.document.render(width).every((line) => visibleWidth(line) <= width), true);
	reloaded.unmount();
	timings.load([]);
	assert.equal(timings.elapsed(
			[
				{
					kind: "thinking",
					key: {},
					component: new Container(),
					summary: "Old",
					timestamp: 1_000,
					running: false,
					failed: false,
				},
			],
			999_000,
		), undefined);
});

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("test-collapse-transcript", {
		description: "Offline inherited folding contract assertions",
		handler: async (_args, ctx) => {
			theme = ctx.ui.theme;
			initTheme("dark", false);
			try {
				for (const { name, run } of cases) {
					try {
						await run();
					console.log(`PASS ${name}`);
					} finally {
						for (const cleanup of cleanups.splice(0).reverse()) cleanup();
						configureTuiAppearance(DEFAULT_TUI_APPEARANCE);
					}
				}
				console.log("COLLAPSE_TRANSCRIPT_TESTS_PASSED");
			} catch (error) {
				console.error(error);
				process.exitCode = 1;
			} finally {
				ctx.shutdown();
			}
		},
	});
}
