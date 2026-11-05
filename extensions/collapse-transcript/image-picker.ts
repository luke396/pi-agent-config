import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { SessionEntry, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type KeybindingsManager, type TUI, Image, allocateImageId, getImageDimensions, stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui";
import type { ViewableImage } from "./image-viewer.ts";

export interface ImageChoice {
	image: ViewableImage;
	source?: string;
	context: string;
	timestamp: number;
	occurrences: number;
}

const singleLine = (text: string) => stripTerminalSequences(text).replace(/\s+/gu, " ").trim();

/** Use actual source paths and surrounding user requests; never infer a picture title from tool names. */
export function collectImages(branch: readonly SessionEntry[]): ImageChoice[] {
	const images: ImageChoice[] = [];
	const readPaths = new Map<string, string>();
	let context = "";
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role === "user") {
			const text = typeof message.content === "string" ? message.content
				: message.content.filter(block => block.type === "text").map(block => block.text).join(" ");
			context = singleLine(text.replace(/^\/\S+\.(?:png|jpe?g|webp|gif)\s+/iu, "")).slice(0, 240);
		} else if (message.role === "assistant") {
			for (const block of message.content) {
				if (block.type === "toolCall" && block.name === "read" && typeof block.arguments.path === "string")
					readPaths.set(block.id, block.arguments.path);
			}
		} else if (message.role === "toolResult") {
			const blocks = message.content.filter(block => block.type === "image");
			const text = message.content.filter(block => block.type === "text").map(block => block.text).join("\n");
			const savedPaths = [...text.matchAll(/\[Image saved to (.+?) \([^\n]*?\)\]/gu)].map(match => match[1]!);
			for (const [index, image] of blocks.entries()) {
				const source = savedPaths.length === blocks.length ? savedPaths[index]
					: blocks.length === 1 ? readPaths.get(message.toolCallId) : undefined;
				images.push({ image, source: source ? singleLine(source) : undefined, context, timestamp: message.timestamp, occurrences: 1 });
			}
		}
	}
	const unique = new Map<string, ImageChoice>();
	for (const choice of images.reverse()) {
		const key = createHash("sha256").update(choice.image.mimeType).update("\0").update(choice.image.data).digest("hex");
		const existing = unique.get(key);
		if (existing) existing.occurrences++;
		else unique.set(key, choice);
	}
	return [...unique.values()];
}

/** A bounded preview browser: identify the picture before opening the desktop viewer. */
export class ImagePicker implements Component {
	readonly capturesViewportInput = true;
	private selected = 0;
	private preview: Image | undefined;
	private previewWidth = 0;
	private previewHeight = 0;
	private readonly imageId = allocateImageId();

	constructor(
		private readonly images: readonly ImageChoice[],
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly done: (image: ViewableImage | undefined) => void,
	) {}

	render(width: number): string[] {
		const choice = this.images[this.selected]!;
		const dimensions = getImageDimensions(choice.image.data, choice.image.mimeType);
		const size = dimensions ? `${dimensions.widthPx} × ${dimensions.heightPx}` : choice.image.mimeType;
		const time = new Date(choice.timestamp).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
		const repeated = choice.occurrences > 1 ? ` · shown ${choice.occurrences} times` : "";
		const header = [
			this.theme.fg("accent", this.theme.bold(`Image ${this.selected + 1}/${this.images.length} · newest first`)),
			this.theme.fg("muted", `${time} · ${size}${repeated}`),
		];
		const filename = choice.source ? basename(choice.source) : undefined;
		if (filename && !/^pi-(?:codemode|clipboard)-/u.test(filename)) header.push(this.theme.fg("text", filename));
		if (choice.context) header.push(this.theme.fg("dim", `Request: ${choice.context}`));
		header.push("");
		const height = Math.max(1, Math.floor(this.tui.terminal.rows * 0.7) - header.length - 2);
		if (!this.preview || width !== this.previewWidth || height !== this.previewHeight) {
			this.preview = new Image(choice.image.data, choice.image.mimeType, { fallbackColor: text => this.theme.fg("muted", text) }, {
				maxWidthCells: Math.max(1, width - 2), maxHeightCells: height, imageId: this.imageId, filename: choice.source,
			});
			this.previewWidth = width;
			this.previewHeight = height;
		}
		const up = this.keybindings.getKeys("tui.select.up")[0] ?? "";
		const down = this.keybindings.getKeys("tui.select.down")[0] ?? "";
		const confirm = this.keybindings.getKeys("tui.select.confirm")[0] ?? "";
		const cancel = this.keybindings.getKeys("tui.select.cancel")[0] ?? "";
		return [
			...header.map(line => truncateToWidth(line, width)),
			...this.preview.render(width), "",
			truncateToWidth(this.theme.fg("dim", `${up}/${down} preview · ${confirm} open full size · ${cancel} cancel`), width),
		];
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.confirm")) { this.done(this.images[this.selected]!.image); return; }
		if (this.keybindings.matches(data, "tui.select.cancel")) { this.done(undefined); return; }
		if (this.keybindings.matches(data, "tui.select.up"))
			this.selected = (this.selected - 1 + this.images.length) % this.images.length;
		else if (this.keybindings.matches(data, "tui.select.down"))
			this.selected = (this.selected + 1) % this.images.length;
		else return;
		this.preview = undefined;
		this.tui.requestRender();
	}

	invalidate(): void { this.preview?.invalidate(); }
}
