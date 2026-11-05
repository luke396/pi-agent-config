import { type Component, Container, Image, Spacer } from "@earendil-works/pi-tui";
import type { ComponentStackSpan } from "../../npm/node_modules/@luan.sh/pi-libtui/src/component-stack.ts";
import type { TuiMouseEvent } from "../../npm/node_modules/@luan.sh/pi-libtui/src/mouse.ts";
import type { TranscriptEntry } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";
import type { ViewableImage } from "./image-viewer.ts";

/** Borrow Pi's direct native image children and their spacers, read fresh each render. */
export function renderToolImages(entries: readonly TranscriptEntry[], width: number): string[] {
	const lines: string[] = [];
	for (const entry of entries) {
		if (entry.kind !== "tool" || !(entry.component instanceof Container)) continue;
		const children = entry.component.children;
		for (const [index, image] of children.entries()) {
			if (!(image instanceof Image)) continue;
			const spacer = children[index - 1];
			if (spacer instanceof Spacer) lines.push(...spacer.render(width));
			lines.push(...image.render(width));
		}
	}
	return lines;
}

/** Pi has no public image-source getter. Keep this guarded compatibility boundary here. */
function imageSource(image: Image): ViewableImage | undefined {
	const data: unknown = Reflect.get(image, "base64Data");
	const mimeType: unknown = Reflect.get(image, "mimeType");
	return typeof data === "string" && data.length > 0 && typeof mimeType === "string"
		? { data, mimeType } : undefined;
}

interface ImageHit {
	image: Image;
	row: number;
	height: number;
	width: number;
}

/** Add image clicks to either the folded previews or the original expanded tool views. */
export class ToolImageActions implements Component {
	private hits: ImageHit[] = [];
	private pressed: Image | undefined;

	constructor(
		private readonly content: Component,
		private readonly entries: () => readonly TranscriptEntry[],
		private readonly open: (image: ViewableImage) => void,
	) {}

	render(width: number): string[] {
		const lines = this.content.render(width);
		this.hits = [];
		if (!lines.length) { this.pressed = undefined; return lines; }
		const images = new Map<string, Omit<ImageHit, "row"> & { offset: number }>();
		for (const entry of this.entries()) {
			if (entry.kind !== "tool" || !(entry.component instanceof Container)) continue;
			for (const image of entry.component.children) {
				if (!(image instanceof Image)) continue;
				const rendered = image.render(width);
				const offset = rendered.findIndex(line => line.includes("\x1b_G") || line.includes("\x1b]1337;File="));
				if (offset < 0) continue;
				const line = rendered[offset]!;
				// Read placement columns from the native protocol header, never from the image payload.
				const header = line.slice(0, 160);
				const columns = Number(header.match(/(?:,c=|;width=)(\d+)(?:[,;:]|$)/)?.[1]);
				if (columns > 0) images.set(line, { image, offset, height: rendered.length, width: columns });
			}
		}
		for (const [row, line] of lines.entries()) {
			const hit = images.get(line);
			if (hit) this.hits.push({ ...hit, row: row - hit.offset });
		}
		if (!this.hits.some(hit => hit.image === this.pressed)) this.pressed = undefined;
		return lines;
	}

	onMouse(event: TuiMouseEvent): boolean {
		const hit = this.hits.find(hit => event.row >= hit.row && event.row < hit.row + hit.height
			&& event.col >= 0 && event.col < hit.width);
		if (event.type === "drag" || event.type === "leave" || event.type === "wheel") this.pressed = undefined;
		if (event.type === "press") {
			this.pressed = event.button === 0 && !event.shift && !event.alt && !event.ctrl ? hit?.image : undefined;
			if (this.pressed) return true;
		}
		if (event.type === "release") {
			const pressed = this.pressed;
			this.pressed = undefined;
			if (pressed && hit?.image === pressed && (event.button === 0 || event.button === undefined)) {
				const source = imageSource(pressed);
				if (source) this.open(source);
				return true;
			}
		}
		return (this.content as Component & { onMouse?(event: TuiMouseEvent): boolean }).onMouse?.(event) ?? false;
	}

	getSpans(): readonly ComponentStackSpan[] {
		return (this.content as Component & { getSpans?(): readonly ComponentStackSpan[] }).getSpans?.() ?? [];
	}

	handleInput(data: string): void { this.content.handleInput?.(data); }
	handleViewportInput(data: string): boolean {
		return (this.content as Component & { handleViewportInput?(data: string): boolean }).handleViewportInput?.(data) ?? false;
	}

	invalidate(): void {
		this.hits = [];
		this.pressed = undefined;
		this.content.invalidate();
	}
}
