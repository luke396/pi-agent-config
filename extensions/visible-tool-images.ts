/**
 * Keep native tool images visible while pi-collapse-transcript folds the details.
 *
 * The package has no image-preview setting/API. This display-only adapter uses
 * its versioned projection slot and ActivitySection shape (0.3.6), plus Pi 1.3's
 * native image arrays. Unsupported hosts are left alone; npm files and messages
 * are never changed. Expanded groups use their original tool renderers.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Component, Container, type TUI } from "@earendil-works/pi-tui";

const PROJECTION = Symbol.for("pi-libtui/transcript-projection/v1");
const WIDGET = "visible-tool-images.host";

type ActivitySection = Component & {
	entries: readonly { kind: string; component: Component }[];
	activity: { region: { isFolded(): boolean } };
};
type Projection = Component & {
	beginTurn(): void;
	finishTurn(): void;
	setChildren(children: readonly Component[]): void;
};

function record(value: unknown): value is Record<PropertyKey, unknown> {
	return value !== null && typeof value === "object";
}

function component(value: unknown): value is Component {
	return record(value) && typeof value.render === "function" && typeof value.invalidate === "function";
}

function activitySection(value: Component): value is ActivitySection {
	const section = value as unknown as Record<string, unknown>;
	return Array.isArray(section.entries) &&
		section.entries.every(entry => record(entry) && typeof entry.kind === "string" && component(entry.component)) &&
		record(section.activity) && record(section.activity.region) &&
		typeof section.activity.region.isFolded === "function";
}

/** Borrow the native images: Pi still owns settings, conversion, IDs and lifetime. */
class FoldedImages extends Container {
	constructor(private readonly section: ActivitySection) {
		super();
	}

	render(width: number): string[] {
		this.children = [];
		if (!this.section.activity.region.isFolded()) return [];
		for (const entry of this.section.entries) {
			if (entry.kind !== "tool") continue;
			const tool = entry.component as unknown as Record<string, unknown>;
			if (tool.hideComponent !== false ||
				!Array.isArray(tool.imageComponents) || !tool.imageComponents.every(component) ||
				!Array.isArray(tool.imageSpacers) || !tool.imageSpacers.every(component)) continue;
			// Read live arrays: toggles, width changes and async PNG conversion can
			// update them without changing the transcript entry or result object.
			for (const [index, image] of tool.imageComponents.entries()) {
				const spacer = tool.imageSpacers[index];
				if (spacer) this.children.push(spacer);
				this.children.push(image);
			}
		}
		return super.render(width);
	}

	// The original tool remains in the fold and owns image invalidation.
	invalidate(): void {}
}

/** Add siblings through the existing stack, retaining its layout and mouse routing. */
export function installImagePreviews(tui: TUI): (() => void) | undefined {
	const document = tui.children[0];
	if (!record(document)) return;
	const candidate = document[PROJECTION];
	if (!record(candidate) || !component(candidate) ||
		typeof candidate.beginTurn !== "function" || typeof candidate.finishTurn !== "function" ||
		typeof candidate.setChildren !== "function") return;
	const projection = candidate as Projection;
	const original = projection.setChildren;
	const descriptor = Object.getOwnPropertyDescriptor(projection, "setChildren");
	const previews = new WeakMap<ActivitySection, FoldedImages>();
	const setChildren = function (this: Projection, children: readonly Component[]): void {
		const visible: Component[] = [];
		for (const child of children) {
			visible.push(child);
			if (!activitySection(child)) continue;
			let preview = previews.get(child);
			if (!preview) {
				preview = new FoldedImages(child);
				previews.set(child, preview);
			}
			visible.push(preview);
		}
		original.call(this, visible);
	};
	projection.setChildren = setChildren;
	tui.requestRender();
	return () => {
		if (projection.setChildren !== setChildren) return;
		if (descriptor) Object.defineProperty(projection, "setChildren", descriptor);
		else Reflect.deleteProperty(projection, "setChildren");
		tui.requestRender();
	};
}

export default function visibleToolImages(pi: ExtensionAPI): void {
	let release: (() => void) | undefined;
	pi.on("session_start", (_event, ctx) => {
		release?.();
		release = undefined;
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		ctx.ui.setWidget(WIDGET, tui => {
			release?.();
			let unmount = installImagePreviews(tui);
			const dispose = () => {
				unmount?.();
				unmount = undefined;
				if (release === dispose) release = undefined;
			};
			release = dispose;
			return {
				render() {
					// Local session_start can precede the package's projection mount.
					// Retry on normal frames, without timers or changing load order.
					unmount ??= installImagePreviews(tui);
					return [];
				},
				invalidate() {},
				dispose,
			};
		});
	});
	pi.on("session_shutdown", (_event, ctx) => {
		release?.();
		release = undefined;
		if (ctx.hasUI && ctx.mode === "tui") ctx.ui.setWidget(WIDGET, undefined);
	});
}
