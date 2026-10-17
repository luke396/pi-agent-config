import type { Component } from "@earendil-works/pi-tui";
import type { TranscriptEntry } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";

function component(value: unknown): value is Component {
	return value !== null && typeof value === "object" &&
		typeof (value as Component).render === "function" && typeof (value as Component).invalidate === "function";
}

/**
 * Pi 1.3's native tool-image boundary. Borrow existing Image/spacer instances so
 * Pi retains image settings, Kitty IDs, async conversion and invalidation.
 * Read live arrays: these can change without a new result or transcript entry.
 * Unknown native shapes retain the ordinary expanded tool renderer.
 */
export function renderToolImages(entries: readonly TranscriptEntry[], width: number): string[] {
	const lines: string[] = [];
	for (const entry of entries) {
		if (entry.kind !== "tool") continue;
		const tool = entry.component as unknown as Record<string, unknown>;
		if (!Array.isArray(tool.imageComponents) || !tool.imageComponents.every(component) ||
			!Array.isArray(tool.imageSpacers) || !tool.imageSpacers.every(component)) continue;
		for (const [index, image] of tool.imageComponents.entries()) {
			const spacer = tool.imageSpacers[index];
			if (spacer) lines.push(...spacer.render(width));
			lines.push(...image.render(width));
		}
	}
	return lines;
}
