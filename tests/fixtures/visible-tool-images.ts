import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { openImage, type ViewableImage } from "../../extensions/collapse-transcript/image-viewer.ts";
import { collectImages, ImagePicker } from "../../extensions/collapse-transcript/image-picker.ts";
import { AssistantMessageComponent, initTheme, SessionManager, ToolExecutionComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, KeybindingsManager, ProcessTerminal, Text, TUI_KEYBINDINGS, TuiAltScreen, TuiMainScreen, getCapabilities, setCapabilities, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { ActivityTranscript } from "../../extensions/collapse-transcript/activity-transcript.ts";
import transcriptExtension from "../../extensions/collapse-transcript/index.ts";
import { configureTuiAppearance } from "../../npm/node_modules/@luan.sh/pi-libtui/src/index.ts";
import { mountTranscriptProjection } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";
import { ensureMouseRegistry } from "../../npm/node_modules/@luan.sh/pi-libtui/src/mouse.ts";
import { targetsAt } from "../../npm/node_modules/@luan.sh/pi-libtui/src/host/mouse-targets.ts";

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
					const opened: ViewableImage[] = [];
					const attach = () => {
						const unmount = mountTranscriptProjection(tui, entries => {
							projection = new ActivityTranscript(entries, ctx.ui.theme, () => {}, undefined, undefined, tui, image => opened.push(image));
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
						const row = render().findIndex(line => /Work(?:ed|ing)/.test(stripTerminalSequences(line)));
						const event = { type: "press" as const, row, col: 2, screenRow: row, screenCol: 2, button: 0 as const, wheel: undefined, shift: false, alt: false, ctrl: false };
						assert.equal(projection.onMouse(event), true);
						assert.equal(projection.onMouse({ ...event, type: "release" }), true);
					};
					const clickImage = (index = 0, width = 80) => {
						const lines = render(width);
						const row = lines.flatMap((line, row) => line.includes("\x1b_G") || line.includes("\x1b]1337;File=") ? [row] : [])[index];
						assert.notEqual(row, undefined);
						// Use the real host layout walk, including translated and clipped child geometry.
						const rect = { x: 4, y: 3, width, height: lines.length };
						const renderer = { currentLayout: { root: { component: document, rect, clip: rect, children: [] } } };
						const screenRow = row + rect.y;
						const screenCol = rect.x + 2;
						const event = { type: "press" as const, row, col: 2, screenRow, screenCol, button: 0 as const, wheel: undefined, shift: false, alt: false, ctrl: false };
						const target = targetsAt(ensureMouseRegistry(), renderer, screenCol, screenRow, true, () => false).find(target => {
							const bounds = target.getRect()!;
							return target.dispatch({ ...event, row: screenRow - bounds.y, col: screenCol - bounds.x });
						});
						assert.ok(target, "native mouse host finds an image action");
						const bounds = target.getRect()!;
						assert.equal(target.dispatch({ ...event, type: "release", row: screenRow - bounds.y, col: screenCol - bounds.x }), true);
					};
					return { tui, chat, opened, get projection() { return projection; }, render, click, clickImage, tool, attach, unmount };
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

				assert.deepEqual(f.opened, [{ data: png.data, mimeType: png.mimeType }], "click opens the displayed image bytes");

				// Dragging, modified clicks, right clicks and whitespace must not open a viewer.
				for (const event of [
					{ ...imagePress, button: 2 as const }, { ...imagePress, shift: true },
					{ ...imagePress, col: 70 }, { ...imagePress, row: imageRow - 1 },
				]) {
					f.projection.onMouse(event);
					f.projection.onMouse({ ...event, type: "release" });
				}
				f.projection.onMouse(imagePress);
				f.projection.onMouse({ ...imagePress, type: "drag", col: 3 });
				f.projection.onMouse({ ...imagePress, type: "release" });
				assert.equal(f.opened.length, 1);
				assert.equal(f.projection.onMouse({ ...imagePress, type: "wheel", wheel: "down" }), false);

				// Expanded images open too, while leaving tool details expanded.
				f.click();
				const expandedRow = f.render().findIndex(line => line.includes("\x1b_G"));
				const expandedPress = { ...imagePress, row: expandedRow, screenRow: expandedRow };
				assert.equal(f.projection.onMouse(expandedPress), true);
				assert.equal(f.projection.onMouse({ ...expandedPress, type: "release" }), true);
				assert.equal(f.opened.length, 2);
				assert.match(plain(f.render()), /private tool details/);
				f.click();

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

				// Native host routing works at different widths, in both fold states and protocols.
				for (const protocol of ["kitty", "iterm2"] as const) {
					setCapabilities({ ...capabilities, images: protocol });
					const routed = fixture();
					const native = routed.tool();
					native.updateResult(result());
					for (const width of [8, 80]) {
						routed.clickImage(0, width);
						routed.click();
						routed.clickImage(0, width);
						routed.click();
					}
					assert.equal(routed.opened.length, 4);
					assert.ok(routed.opened.every(image => image.data === png.data));
				}
				setCapabilities({ ...capabilities, images: "kitty" });

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

				conversion.clickImage();
				assert.equal(conversion.opened[0].mimeType, "image/gif", "viewer receives original GIF, not terminal PNG conversion");
				const originalGif = conversion.opened[0];
				gif.updateResult({ content: [png, { type: "image", ...originalGif }], isError: false }, true);
				conversion.click();
				conversion.clickImage(0);
				conversion.clickImage(1);
				assert.deepEqual(conversion.opened.slice(1), [{ data: png.data, mimeType: png.mimeType }, originalGif]);

				// A streamed replacement between press and release cannot open the previous image.
				const stale = fixture();
				const staleTool = stale.tool();
				staleTool.updateResult(result());
				const staleRow = stale.render().findIndex(line => line.includes("\x1b_G"));
				const stalePress = { ...imagePress, row: staleRow, screenRow: staleRow };
				stale.projection.onMouse(stalePress);
				staleTool.updateResult({ content: [{ type: "image", ...originalGif }], isError: false });
				stale.render();
				stale.projection.onMouse({ ...stalePress, type: "release" });
				assert.equal(stale.opened.length, 0);

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
				const commands = new Map<string, any>();
				const commandImages: string[] = [];
				let failOpen = false;
				transcriptExtension({
					on: (event: string, handler: Function) => hooks.set(event, handler),
					registerCommand: (name: string, command: any) => commands.set(name, command),
					exec: async (_command: string, args: string[]) => {
						commandImages.push((await readFile(args[0])).toString("base64"));
						await rm(dirname(args[0]), { recursive: true });
						return { code: failOpen ? 1 : 0, stdout: "", stderr: failOpen ? "Viewer unavailable" : "", killed: false };
					},
				} as unknown as ExtensionAPI);
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
				// The keyboard path previews even a single image and honors cancel/errors.
				const notices: string[] = [];
				const keys = new KeybindingsManager(TUI_KEYBINDINGS);
				let cancel = false;
				let pickerShown = 0;
				const commandContext = { ...context, ui: { ...context.ui,
					notify: (message: string) => notices.push(message),
					custom: async (factory: Function) => {
						let selected: ViewableImage | undefined;
						const picker = factory(lifecycle.tui, ctx.ui.theme, keys, (image: ViewableImage | undefined) => { selected = image; });
						const rows = picker.render(80);
						assert.equal(imageCount(rows), 1, "picker must display the actual selected image before confirmation");
						assert.match(plain(rows), /Image 1\//);
						pickerShown++;
						picker.handleInput(cancel ? "\x1b" : "\r");
						return selected;
					},
				} };
				const imagesCommand = commands.get("images");
				await imagesCommand.handler("", commandContext);
				assert.match(notices.pop()!, /No tool images/);
				context.sessionManager.appendMessage({ role: "toolResult", toolCallId: "saved", toolName: "read", content: [png], isError: false, timestamp: 0 });
				await imagesCommand.handler("", commandContext);
				assert.deepEqual(commandImages, [png.data]);
				assert.equal(pickerShown, 1, "one image still gets a visible preview");
				context.sessionManager.appendMessage({ role: "toolResult", toolCallId: "latest", toolName: "read", content: [{ type: "image", ...originalGif }], isError: false, timestamp: 1 });
				await imagesCommand.handler("", commandContext);
				assert.deepEqual(commandImages, [png.data, originalGif.data]);
				cancel = true;
				await imagesCommand.handler("", commandContext);
				assert.equal(commandImages.length, 2);
				cancel = false;
				failOpen = true;
				await imagesCommand.handler("", commandContext);
				assert.match(notices.pop()!, /Cannot open image: Viewer unavailable/);

				// Identical outputs merge; each distinct picture retains its newest source and request.
				const pictures = SessionManager.inMemory("/tmp");
				const red = { ...png, data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==" };
				for (const [index, picture] of [png, red, png].entries()) {
					pictures.appendMessage({ role: "user", content: `/tmp/input.png Plot request ${index + 1}`, timestamp: index * 1000 });
					pictures.appendMessage({ role: "toolResult", toolName: "codemode", toolCallId: `plot-${index}`, timestamp: index * 1000 + 1, isError: false,
						content: [{ type: "text", text: `[Image saved to /tmp/plot-${index + 1}.png (image/png, 100B)]` }, picture] });
				}
				const choices = collectImages(pictures.getBranch());
				assert.equal(choices.length, 2);
				assert.equal(choices[0].occurrences, 2);
				assert.equal(choices[0].source, "/tmp/plot-3.png");
				assert.equal(choices[0].context, "Plot request 3");
				assert.equal(choices[1].image.data, red.data);
				let terminalRows = 40;
				Object.defineProperty(lifecycle.tui.terminal, "rows", { get: () => terminalRows });
				let picked: ViewableImage | undefined;
				let finished = false;
				const picker = new ImagePicker(choices, lifecycle.tui, ctx.ui.theme, keys, image => { picked = image; finished = true; });
				const firstPreview = picker.render(80);
				assert.match(plain(firstPreview), /Image 1\/2/);
				assert.match(plain(firstPreview), /1 × 1/);
				assert.match(plain(firstPreview), /shown 2 times/);
				assert.match(plain(firstPreview), /plot-3.png/);
				assert.match(plain(firstPreview), /Request: Plot request 3/);
				assert.ok(firstPreview.some(line => line.includes(png.data)), "first preview contains the first picture");
				picker.handleInput("\x1b[B");
				assert.equal(finished, false, "browsing does not open the desktop viewer");
				const secondPreview = picker.render(80);
				assert.match(plain(secondPreview), /Image 2\/2/);
				assert.match(plain(secondPreview), /plot-2.png/);
				assert.ok(secondPreview.some(line => line.includes(red.data)), "switching replaces the picture itself");
				for (const width of [8, 30, 100]) {
					terminalRows = 18;
					const rows = picker.render(width);
					assert.ok(rows.length <= Math.floor(terminalRows * 0.7));
					assert.ok(rows.every(line => visibleWidth(line) <= width));
					assert.equal(imageCount(rows), 1);
				}
				picker.invalidate();
				assert.ok(picker.render(80).some(line => line.includes(red.data)));
				picker.handleInput("\r");
				assert.equal(picked?.data, red.data);

				// Opening writes exactly the original bytes and invokes the OS without a shell.
				let openedPath = "";
				await openImage(png, async (command, args) => {
					assert.equal(command, process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open");
					assert.equal(args?.length, 1);
					openedPath = args![0];
					assert.equal(extname(openedPath), ".png");
					assert.deepEqual(await readFile(openedPath), Buffer.from(png.data, "base64"));
					return { code: 0, stdout: "", stderr: "", killed: false };
				});
				await rm(dirname(openedPath), { recursive: true });
				await assert.rejects(openImage(png, async (_command, args) => {
					openedPath = args![0];
					return { code: 1, stdout: "", stderr: "No image viewer", killed: false };
				}), /No image viewer/);
				await rm(dirname(openedPath), { recursive: true });
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
