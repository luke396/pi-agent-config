import assert from "node:assert/strict";
import { AssistantMessageComponent, initTheme, SessionManager, ToolExecutionComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, ProcessTerminal, Text, TuiAltScreen, TuiMainScreen, getCapabilities, setCapabilities, stripTerminalSequences } from "@earendil-works/pi-tui";
import { ActivityTranscript } from "../../extensions/collapse-transcript/activity-transcript.ts";
import transcriptExtension from "../../extensions/collapse-transcript/index.ts";
import { configureTuiAppearance } from "../../npm/node_modules/@luan.sh/pi-libtui/src/index.ts";
import { mountTranscriptProjection } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";

const png = { type: "image" as const, mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=" };
const result = () => ({ content: [{ type: "text" as const, text: "private tool details" }, png], isError: false });
const imageCount = (lines: string[]) => lines.filter(line => line.includes("\x1b_G")).length;
const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

export default function (pi: ExtensionAPI) {
	pi.registerCommand("test-visible-images", {
		description: "Offline native transcript image assertions",
		handler: async (_args, ctx) => {
			const capabilities = getCapabilities();
			const releases: (() => void)[] = [];
			try {
				initTheme("dark", false);
				setCapabilities({ ...capabilities, images: "kitty" });
				configureTuiAppearance({ activityIndicator: "static", textEffect: "off", pulseEffect: "off" });
				function fixture(mode = "fullscreen", project = true) {
					const tui = mode === "fullscreen" ? new TuiAltScreen(new ProcessTerminal()) : new TuiMainScreen(new ProcessTerminal());
					tui.requestRender = () => {};
					const document = new Container();
					const chat = new Container();
					document.addChild(new Container());
					document.addChild(new Container());
					document.addChild(chat);
					tui.addChild(document);
					let projection!: ActivityTranscript;
					const attach = () => {
						const unmount = mountTranscriptProjection(tui, entries => {
							projection = new ActivityTranscript(entries, ctx.ui.theme, () => {});
							return projection;
						});
						assert.ok(unmount);
						releases.push(unmount);
						return unmount;
					};
					const unmount = project ? attach() : () => {};
					const tool = (name = "codemode", shell?: "self") => {
						const native = new ToolExecutionComponent(name, name + chat.children.length, {}, { imageWidthCells: 12 }, shell ? {
							renderShell: shell,
							renderCall: () => new Container(),
							renderResult: () => new Text("private tool details", 0, 0),
						} : undefined, tui, "/tmp");
						chat.addChild(native);
						return native;
					};
					const render = (width = 80) => document.render(width);
					const click = () => {
						const row = render().findIndex(line => stripTerminalSequences(line).includes("Worked"));
						const event = { type: "press" as const, row, col: 2, screenRow: row, screenCol: 2, button: 0 as const, wheel: undefined, shift: false, alt: false, ctrl: false };
						assert.equal(projection.onMouse(event), true);
						assert.equal(projection.onMouse({ ...event, type: "release" }), true);
					};
					return { tui, chat, get projection() { return projection; }, render, click, tool, attach, unmount };
				}

				// Baseline regression: the native image is present, but the fold hides it.
				const f = fixture();
				const tool = f.tool("codemode", "self");
				const output = result();
				tool.updateResult(output);
				assert.equal(imageCount(tool.render(80)), 1, "native renderer must already contain the image");
				assert.equal(imageCount(f.render()), 1, "image must be visible without expanding the activity");
				assert.doesNotMatch(plain(f.render()), /private tool details/);
				f.click();
				assert.equal(imageCount(f.render()), 1, "expansion must not duplicate the image");
				assert.match(plain(f.render()), /private tool details/);
				f.click();
				assert.equal(imageCount(f.render()), 1);
				assert.equal((tool as any).result, output, "presentation must not rewrite the model-visible result");

				// Images are outside the clickable fold body.
				const imageRow = f.render().findIndex(line => line.includes("\x1b_G"));
				const imagePress = { type: "press" as const, row: imageRow, col: 2, screenRow: imageRow, screenCol: 2, button: 0 as const, wheel: undefined, shift: false, alt: false, ctrl: false };
				f.projection.onMouse(imagePress);
				f.projection.onMouse({ ...imagePress, type: "release" });
				assert.doesNotMatch(plain(f.render()), /private tool details/);
				assert.equal(imageCount(f.render()), 1);

				// Stable section/image views preserve mouse leave across a repaint.
				const hoverBefore = f.render();
				const hoverRow = hoverBefore.findIndex(line => stripTerminalSequences(line).includes("Worked"));
				const move = { type: "move" as const, row: hoverRow, col: 2, screenRow: hoverRow, screenCol: 2, button: undefined, wheel: undefined, shift: false, alt: false, ctrl: false };
				assert.equal(f.projection.onMouse(move), true);
				assert.notEqual(f.render()[hoverRow], hoverBefore[hoverRow]);
				f.projection.onMouse({ ...move, row: -1, screenRow: -1 });
				assert.equal(f.render()[hoverRow], hoverBefore[hoverRow]);

				// An existing activity section must pick up images from later tools.
				const growing = fixture();
				growing.tool("read").updateResult({ content: [{ type: "text", text: "private earlier output" }], isError: false });
				assert.equal(imageCount(growing.render()), 0);
				growing.tool("codemode").updateResult(result());
				assert.equal(imageCount(growing.render()), 1);
				assert.match(plain(growing.render()), /2 steps/);
				assert.doesNotMatch(plain(growing.render()), /private earlier output|private tool details/);

				// Native settings and widths may change without a new result/entry.
				const kittyId = (rows: string[]) => rows.join("\n").match(/\x1b_G[^;]*\bi=(\d+)/)?.[1];
				const nativeImageId = kittyId(tool.render(80));
				assert.ok(nativeImageId, "native image has a Kitty ID");
				for (const width of [8, 30, 120]) {
					const rows = f.render(width);
					assert.equal(imageCount(rows), 1);
					assert.equal(kittyId(rows), nativeImageId, "folded preview must retain the native image ID");
				}
				tool.setShowImages(false);
				assert.equal(imageCount(f.render()), 0);
				tool.setShowImages(true);
				assert.equal(imageCount(f.render()), 1);
				tool.setImageWidthCells(8);
				assert.equal(imageCount(f.render()), 1);
				f.projection.invalidate();
				assert.equal(imageCount(f.render()), 1);

				// Replace streamed results, including multiple images and failed tools.
				tool.updateResult({ ...result(), content: [...result().content, png] }, true);
				assert.equal(imageCount(f.render()), 2);
				tool.updateResult({ ...result(), isError: true });
				assert.equal(imageCount(f.render()), 1);
				assert.doesNotMatch(plain(f.render()), /private tool details/);
				tool.updateResult({ content: [{ type: "text", text: "private replacement" }], isError: false });
				assert.equal(imageCount(f.render()), 0);
				assert.doesNotMatch(plain(f.render()), /private replacement/);
				tool.updateResult(output);

				// Prose still separates groups; default-shell read images work too.
				f.chat.addChild(new Text("Visible answer between tools", 0, 0));
				const read = f.tool("read");
				read.updateResult(result());
				const grouped = f.render();
				const imageRows = grouped.map((line, index) => line.includes("\x1b_G") ? index : -1).filter(index => index >= 0);
				const proseRow = grouped.findIndex(line => line.includes("Visible answer between tools"));
				assert.equal(imageRows.length, 2);
				assert.ok(imageRows[0] < proseRow && proseRow < imageRows[1]);
				assert.doesNotMatch(plain(grouped), /private tool details/);

				// Thinking remains folded and native errors/unknown content remain visible.
				const thinking = fixture();
				thinking.chat.addChild(new AssistantMessageComponent({
					role: "assistant",
					content: [{ type: "thinking", thinking: "**Drawing**\n\nprivate reasoning" }],
					api: "openai-responses", provider: "openai", model: "test",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: "toolUse", timestamp: 0,
				}));
				const drawing = thinking.tool();
				drawing.updateResult(result());
				thinking.chat.addChild(new Text("Native error notice", 0, 0));
				assert.equal(imageCount(thinking.render()), 1);
				assert.match(plain(thinking.render()), /Drawing/);
				assert.match(plain(thinking.render()), /Native error notice/);
				assert.doesNotMatch(plain(thinking.render()), /private reasoning|private tool details/);
				thinking.click();
				assert.equal(imageCount(thinking.render()), 1);
				assert.match(plain(thinking.render()), /private reasoning/);
				thinking.click();

				// Non-PNG images retain the native async converter and repaint path.
				const conversion = fixture();
				const gif = conversion.tool();
				gif.updateResult({ content: [{ type: "image", mimeType: "image/gif", data: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" }], isError: false });
				for (let attempt = 0; attempt < 100 && imageCount(conversion.render()) === 0; attempt++)
					await new Promise(resolve => setTimeout(resolve, 10));
				assert.equal(imageCount(conversion.render()), 1, "converted image must appear without unfolding or a new tool result");
				conversion.click();
				assert.equal(imageCount(conversion.render()), 1);

				// Regression: folded images must not inherit ToolActivity's 520-row clip.
				const many = fixture();
				const manyTool = many.tool();
				manyTool.updateResult({ content: Array.from({ length: 270 }, () => png), isError: false });
				assert.equal(imageCount(manyTool.render(80)), 270, "native many-image setup");
				assert.equal(imageCount(many.render()), 270, "all 270 original images remain visible while folded");
				assert.match(plain(many.render()), /1 step/);

				// Removing the projection restores native tool rows, including their images.
				f.unmount();
				assert.equal(imageCount(f.render()), 2);
				assert.match(plain(f.render()), /private tool details/);
				f.attach();
				assert.equal(imageCount(f.render()), 2);
				assert.doesNotMatch(plain(f.render()), /private tool details/);

				// Regular scrollback is byte-for-byte native.
				const regular = fixture("regular", false);
				regular.tool().updateResult(result());
				const regularBefore = regular.render();
				regular.attach();
				assert.deepEqual(regular.render(), regularBefore);

				// The fork owns the projection; images need no second installer or late-mount hook.
				const lifecycle = fixture("fullscreen", false);
				const hooks = new Map<string, Function>();
				transcriptExtension({ on: (event: string, handler: Function) => hooks.set(event, handler) } as unknown as ExtensionAPI);
				let widget: any;
				const context = { hasUI: true, mode: "tui", sessionManager: SessionManager.inMemory("/tmp"), ui: {
					setWidget(_key: string, factory: any) {
						widget?.dispose();
						widget = factory?.(lifecycle.tui, ctx.ui.theme);
					},
				} };
				hooks.get("session_start")!({}, context);
				assert.deepEqual(widget.render(), [], "host widget itself must stay invisible");
				// Native restored history is populated after session_start.
				lifecycle.tool().updateResult(result());
				assert.equal(imageCount(lifecycle.render()), 1);
				assert.doesNotMatch(plain(lifecycle.render()), /private tool details/);
				hooks.get("session_start")!({}, context);
				assert.equal(imageCount(lifecycle.render()), 1, "restarting the widget must not duplicate images");
				hooks.get("session_shutdown")!({}, context);
				assert.equal(imageCount(lifecycle.render()), 1);
				assert.match(plain(lifecycle.render()), /private tool details/);
				hooks.get("session_start")!({}, { ...context, mode: "json", hasUI: false });
				assert.match(plain(lifecycle.render()), /private tool details/);
				console.log("VISIBLE_TOOL_IMAGES_TESTS_PASSED");
			} catch (error) {
				console.error(error);
				process.exitCode = 1;
			} finally {
				for (const release of releases.reverse()) release();
				setCapabilities(capabilities);
				ctx.shutdown();
			}
		},
	});
}
