// Adapted from @luan.sh/pi-collapse-transcript 0.3.6 test/compaction.test.ts.
// MIT (c) 2026 Luan Santos; see ../../extensions/collapse-transcript/LICENSE.
// Assertions run inside the installed Pi to use its actual native components.
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

const cases: { name: string; run: () => void | Promise<void> }[] = [];
function test(name: string, run: () => void | Promise<void>): void { cases.push({ name, run }); }

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	DefaultResourceLoader,
	InteractiveMode,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { ProcessTerminal, type TUI } from "@earendil-works/pi-tui";
import transcriptExtension from "../../extensions/collapse-transcript/index.ts";

class CapturedTerminal extends ProcessTerminal {
	private input: ((data: string) => void) | undefined;
	get columns() {
		return 120;
	}
	get rows() {
		return 60;
	}
	start(onInput: (data: string) => void): void {
		this.input = onInput;
	}
	stop(): void {
		this.input = undefined;
	}
	write(data: string): void {
		// Answer the color-query sentinel immediately; tests never wait for a terminal timeout.
		if (data.includes("\x1b[c")) queueMicrotask(() => this.input?.("\x1b[?1;2c"));
	}
}

for (const kind of ["manual", "boundary"] as const) test(
	`${kind} compaction keeps display history while shrinking model context, including after resume`,
	async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-compaction-transcript-"));
		let captured: TUI | undefined;
		const rendered = () => stripTerminalSequences(captured?.children[0]?.render(120).join("\n") ?? "");
		const manager = SessionManager.create(root, join(root, "sessions"));
		const oldId = manager.appendMessage({ role: "user", content: "EARLIER USER REQUEST", timestamp: 0 });
		const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
		const answer: AssistantMessage = {
			role: "assistant",
			api: "openai-responses",
			provider: "transcript-fixture",
			model: "fixture",
			content: [{ type: "text", text: "LATEST ANSWER" }],
			stopReason: "stop",
			timestamp: 0,
			usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost },
		};
		manager.appendMessage({ ...answer, content: [{ type: "text", text: "EARLIER ANSWER" }] });
		const keepId = manager.appendMessage({ role: "user", content: "RECENT USER REQUEST", timestamp: 1 });
		manager.appendMessage(answer);
		const modelRuntime = await ModelRuntime.create({
			authPath: join(root, "auth.json"),
			modelsPath: null,
			modelsStorePath: join(root, "models.json"),
			refreshOnCreate: false,
		});
		modelRuntime.registerProvider("transcript-fixture", {
			baseUrl: "https://test.invalid",
			apiKey: "fixture",
			api: "openai-responses",
			models: [
				{
					id: "fixture",
					name: "Fixture",
					reasoning: false,
					input: ["text"],
					cost,
					contextWindow: 1_000_000,
					maxTokens: 1000,
				},
			],
			streamSimple() {
				const stream = createAssistantMessageEventStream();
				queueMicrotask(() => {
					stream.push({ type: "done", reason: "stop", message: answer });
					stream.end();
				});
				return stream;
			},
		});
		const settingsManager = SettingsManager.inMemory({
			quietStartup: true,
			showCacheMissNotices: false,
			compaction: { enabled: false, keepRecentTokens: 1 },
			retry: { enabled: false },
		});
		const resourceLoader = new DefaultResourceLoader({
			cwd: root,
			agentDir: root,
			settingsManager,
			noExtensions: true,
			noSkills: true,
			noThemes: true,
			noContextFiles: true,
			noPromptTemplates: true,
			extensionFactories: [
				transcriptExtension,
				(pi) => {
					pi.on("session_start", (_event, ctx) =>
						ctx.ui.setWidget("capture", (tui) => {
							captured = tui;
							return { render: () => [], invalidate() {} };
						}),
					);
					pi.on("session_before_compact", () => ({
						compaction: { summary: "SAVED SUMMARY", firstKeptEntryId: keepId, tokensBefore: 257_174 },
					}));
					if (kind === "boundary")
						pi.on("turn_end", () => ({
							entries: [
								{ type: "compaction", summary: "SAVED SUMMARY", firstKeptEntryId: null },
								{ type: "custom_message", customType: "fixture", content: "AFTER BOUNDARY", display: true },
							],
						}));
				},
			],
		});
		await resourceLoader.reload();
		const services = { cwd: root, agentDir: root, modelRuntime, settingsManager, resourceLoader, diagnostics: [] };
		const start = async () => {
			const runtime = await createAgentSessionRuntime(
				async ({ sessionManager }) => ({
					...(await createAgentSessionFromServices({
						services,
						sessionManager,
						model: modelRuntime.getModel("transcript-fixture", "fixture"),
					})),
					services,
					diagnostics: [],
				}),
				{ cwd: root, agentDir: root, sessionManager: manager },
			);
			const mode = new InteractiveMode(runtime, {
				terminal: new CapturedTerminal(),
				tuiMode: "fullscreen",
				initialThemeSetting: "dark",
			});
			await mode.init();
			return { runtime, mode };
		};
		let current: Awaited<ReturnType<typeof start>> | undefined;
		try {
			current = await start();
			assert.ok((rendered()).includes("EARLIER USER REQUEST"));
			if (kind === "manual") await current.runtime.session.compact();
			else await current.runtime.session.prompt("BOUNDARY REQUEST");
			const text = rendered();
			assert.ok((text).includes("EARLIER USER REQUEST"));
			assert.ok((text).includes("EARLIER ANSWER"));
			assert.ok((text).includes("RECENT USER REQUEST"));
			assert.ok((text).includes("LATEST ANSWER"));
			assert.equal((text.match(/Context compacted/gu)).length, 1);
			assert.ok(!(text).includes("SAVED SUMMARY"));
			if (kind === "boundary") assert.ok((text).includes("AFTER BOUNDARY"));
			assert.equal(manager.buildContextEntries().some((entry) => entry.id === oldId), false);
			assert.equal(manager.getBranch().some((entry) => entry.id === oldId), true);
			assert.equal(manager.buildSessionContext().messages.some((message) => message.role === "compactionSummary"), true);
			current.mode.stop();
			await current.runtime.dispose();
			current = undefined;
			// Reopen the same saved branch through a new native interactive mode.
			current = await start();
			assert.ok((rendered()).includes("EARLIER USER REQUEST"));
			assert.ok((rendered()).includes("EARLIER ANSWER"));
			assert.equal((rendered().match(/Context compacted/gu)).length, 1);
			assert.ok(!(rendered()).includes("SAVED SUMMARY"));
			const sessionFile = manager.getSessionFile();
			if (!sessionFile) throw new Error("Expected a saved session");
			await current.runtime.newSession();
			assert.ok(!(rendered()).includes("EARLIER USER REQUEST"));
			await current.runtime.switchSession(sessionFile);
			assert.ok((rendered()).includes("EARLIER USER REQUEST"));
			assert.equal((rendered().match(/Context compacted/gu)).length, 1);
		} finally {
			current?.mode.stop();
			await current?.runtime.dispose();
			await rm(root, { recursive: true, force: true });
		}
	},
);

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("test-collapse-compaction", {
		description: "Offline inherited folding contract assertions",
		handler: async (_args, ctx) => {
			try {
				for (const { name, run } of cases) {
					await run();
					console.log(`PASS ${name}`);
				}
				console.log("COLLAPSE_COMPACTION_TESTS_PASSED");
			} catch (error) {
				console.error(error);
				process.exitCode = 1;
			} finally {
				ctx.shutdown();
			}
		},
	});
}
