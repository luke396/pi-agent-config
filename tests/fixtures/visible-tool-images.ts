import assert from "node:assert/strict";
import { AssistantMessageComponent, initTheme, ToolExecutionComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, ProcessTerminal, Text, TuiAltScreen, TuiMainScreen, getCapabilities, setCapabilities, stripTerminalSequences } from "@earendil-works/pi-tui";
import { ActivityTranscript } from "../../npm/node_modules/@luan.sh/pi-collapse-transcript/src/activity-transcript.ts";
import { configureTuiAppearance } from "../../npm/node_modules/@luan.sh/pi-collapse-transcript/node_modules/@luan.sh/pi-libtui/src/index.ts";
import { mountTranscriptProjection } from "../../npm/node_modules/@luan.sh/pi-collapse-transcript/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";

const png = { type: "image" as const, mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=" };
const result = () => ({ content: [{ type: "text" as const, text: "private tool details" }, png], isError: false });
const imageCount = (lines: string[]) => lines.filter(line => line.includes("\x1b_G")).length;
const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

export default function (pi: ExtensionAPI) {
	pi.registerCommand("test-visible-images", {
		description: "Offline native transcript image assertions",
		handler: async (args, ctx) => {
			const capabilities = getCapabilities();
			const releases: (() => void)[] = [];
			try {
				initTheme("dark", false);
				setCapabilities({ ...capabilities, images: "kitty" });
				configureTuiAppearance({ activityIndicator: "static", textEffect: "off", pulseEffect: "off" });
				const adapter = args.trim() === "baseline" ? undefined : await import("../../extensions/visible-tool-images.ts");
				const install = adapter?.installImagePreviews ?? (() => () => {});
				function fixture(mode = "fullscreen", adapt = true) {
					const tui = mode === "fullscreen" ? new TuiAltScreen(new ProcessTerminal()) : new TuiMainScreen(new ProcessTerminal());
					tui.requestRender = () => {};
					const document = new Container();
					const chat = new Container();
					document.addChild(new Container());
					document.addChild(new Container());
					document.addChild(chat);
					tui.addChild(document);
					let projection!: ActivityTranscript;
					const unmount = mountTranscriptProjection(tui, entries => {
						projection = new ActivityTranscript(entries, ctx.ui.theme, () => {});
						return projection;
					});
					assert.ok(unmount);
					releases.push(unmount);
					const release = adapt ? install(tui) : () => {};
					assert.equal(typeof release, "function");
					releases.push(release!);
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
					return { tui, chat, document, projection, render, click, tool, release, unmount };
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

				// Native settings and widths may change without a new result/entry.
				const nativeImage = (tool as any).imageComponents[0];
				for (const width of [8, 30, 120]) {
					assert.equal(imageCount(f.render(width)), 1);
					assert.equal((tool as any).imageComponents[0], nativeImage, "borrow, do not recreate the native image");
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

				// Detach restores the original collapse; reattach/reload reads saved native rows.
				f.release!();
				assert.equal(imageCount(f.render()), 0);
				const reattach = install(f.tui)!;
				releases.push(reattach);
				assert.equal(imageCount(f.render()), 2);
				reattach();
				assert.equal(imageCount(f.render()), 0);
				const resumed = fixture();
				const historical = resumed.tool();
				historical.updateResult(result());
				assert.equal(imageCount(resumed.render()), 1);

				// Regular scrollback is byte-for-byte native; unsupported hosts fail open.
				const regular = fixture("regular", false);
				regular.tool().updateResult(result());
				const regularBefore = regular.render();
				releases.push(install(regular.tui)!);
				assert.deepEqual(regular.render(), regularBefore);
				assert.equal(install(new TuiAltScreen(new ProcessTerminal())), undefined);

				// Actual extension widget lifecycle: repeat startup/disposal without stacking.
				const lifecycle = fixture("fullscreen", false);
				lifecycle.tool().updateResult(result());
				const hooks = new Map<string, Function>();
				adapter!.default({ on: (event: string, handler: Function) => hooks.set(event, handler) } as unknown as ExtensionAPI);
				let widget: any;
				const context = { hasUI: true, mode: "tui", ui: {
					setWidget(_key: string, factory: any) {
						widget?.dispose();
						widget = factory?.(lifecycle.tui, ctx.ui.theme);
					},
				} };
				for (let reload = 0; reload < 2; reload++) {
					hooks.get("session_start")!({}, context);
					assert.equal(imageCount(lifecycle.render()), 1);
					assert.deepEqual(widget.render(), [], "host widget itself must stay invisible");
				}
				hooks.get("session_shutdown")!({}, context);
				assert.equal(imageCount(lifecycle.render()), 0);
				hooks.get("session_start")!({}, { ...context, mode: "json", hasUI: false });
				assert.equal(imageCount(lifecycle.render()), 0);

				// Local extensions can start before package extensions mount the fold.
				const delayed = fixture("fullscreen", false);
				delayed.tool().updateResult(result());
				delayed.unmount!();
				const delayedContext = { ...context, ui: {
					setWidget(_key: string, factory: any) {
						widget?.dispose();
						widget = factory?.(delayed.tui, ctx.ui.theme);
					},
				} };
				hooks.get("session_start")!({}, delayedContext);
				const delayedUnmount = mountTranscriptProjection(delayed.tui, entries => new ActivityTranscript(entries, ctx.ui.theme, () => {}));
				assert.ok(delayedUnmount);
				releases.push(delayedUnmount);
				widget.render();
				assert.equal(imageCount(delayed.render()), 1, "attach even when the projection mounts after session_start");
				hooks.get("session_shutdown")!({}, delayedContext);
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
