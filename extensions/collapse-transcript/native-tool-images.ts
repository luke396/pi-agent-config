import { Container, Image, Spacer } from "@earendil-works/pi-tui";
import type { TranscriptEntry } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";

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
