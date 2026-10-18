import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import type { TranscriptEntry } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";

type Message = Parameters<AssistantMessageComponent["updateContent"]>[0];
type Options = ConstructorParameters<typeof AssistantMessageComponent>;

// Pi 1.3's display-only assistant views, supplied by libtui's transcript bridge.
// Retain their native presentation options when splitting prose from tool source.
interface NativeAssistant {
	lastMessage?: Message;
	isStreaming: boolean;
	markdownTheme: NonNullable<Options[2]>;
	outputPad: number;
	markdownTransformers: NonNullable<Options[5]>;
}
interface Part { text: string; workflow: boolean }
interface NativeView { text: string; component: AssistantMessageComponent }

/** Match pi-subagents' explicit source fences, without interpreting nested examples. */
function parts(text: string, streaming: boolean): Part[] {
	const lines = text.split("\n");
	const result: Part[] = [];
	let start = 0;
	let fence: { marker: string; workflow: boolean; start: number } | undefined;
	const take = (end: number, workflow: boolean) => {
		const text = lines.slice(start, end).join("\n");
		// Empty prose slots keep a workflow view stable when a transformer adds a prefix/footer.
		result.push({ text, workflow });
		start = end;
	};
	for (const [index, raw] of lines.entries()) {
		const line = raw.replace(/\r$/, "");
		if (!fence) {
			const open = /^(`{3,}|~{3,})/.exec(line);
			if (open) fence = {
				marker: open[1]!,
				workflow: /^```(?:js|javascript) workflow[ \t]*$/.test(line),
				start: index,
			};
			continue;
		}
		const close = /^(`{3,}|~{3,})[ \t]*$/.exec(line);
		if (!close || close[1]![0] !== fence.marker[0] || close[1]!.length < fence.marker.length) continue;
		if (fence.workflow) {
			take(fence.start, false);
			take(index + 1, true);
		}
		fence = undefined;
	}
	// Source is already tool preparation while streaming. An unfinished final
	// block stays visible, as do the native error/abort/truncation notices below.
	if (streaming && fence?.workflow) {
		take(fence.start, false);
		take(lines.length, true);
	} else take(lines.length, false);
	return result;
}

/** Project workflow tool inputs without changing messages or the original views. */
export class WorkflowSources {
	private revision = 0;
	private readonly cache = new WeakMap<object, {
		message: Message;
		width: number;
		revision: number;
		views: NativeView[];
		entries: TranscriptEntry[];
	}>();

	invalidate(): void { this.revision++; }

	read(entries: readonly TranscriptEntry[], mode: "regular" | "fullscreen", width: number): readonly TranscriptEntry[] {
		return mode === "fullscreen" ? entries.flatMap((entry) => this.readEntry(entry, width)) : entries;
	}

	private readEntry(entry: TranscriptEntry, width: number): TranscriptEntry[] {
		if (entry.kind !== "content" || !(entry.component instanceof AssistantMessageComponent)) return [entry];
		const native = entry.component as unknown as NativeAssistant;
		const message = native.lastMessage;
		if (!message || ["error", "aborted", "length"].includes(message.stopReason) ||
			!Array.isArray(message.content) || message.content.length !== 1 || message.content[0]?.type !== "text" ||
			typeof native.isStreaming !== "boolean" || typeof native.outputPad !== "number" ||
			!native.markdownTheme || !Array.isArray(native.markdownTransformers)) return [entry];
		const previous = this.cache.get(entry.key);
		if (previous?.message === message &&
			previous.width === width && previous.revision === this.revision) return previous.entries;
		const text = message.content[0];
		let split = parts(text.text, native.isStreaming);
		const views = previous?.views ?? [];
		let entries: TranscriptEntry[] = [entry];
		if (split.some((part) => part.workflow)) {
			// Match native Markdown's whole-source transform boundary. Pi includes
			// its Mermaid transformer even when no extension registers one.
			let markdown = text.text.trim();
			const context = {
				messageType: "assistant" as const,
				isStreaming: native.isStreaming,
				availableWidth: Math.max(1, width - native.outputPad * 2),
			};
			for (const transform of native.markdownTransformers) {
				try {
					const transformed = transform(markdown, context);
					if (typeof transformed === "string") markdown = transformed;
				} catch {
					// Native Markdown keeps the preceding text after a transformer error.
				}
			}
			split = parts(markdown, native.isStreaming);
			const prose = split.filter((part) => !part.workflow && part.text.trim());
			// Definitions can bind links across prose spans; keep that complete
			// Markdown context instead of splitting it into independent parsers.
			if (prose.length > 1 && prose.some((part) => part.text.includes("]:")))
				split = [{ text: markdown, workflow: false }];
			entries = split.flatMap((part, index): TranscriptEntry[] => {
				if (!part.text.trim()) return [];
				let view = views[index];
				if (!view) {
					view = {
						text: part.text,
						component: new AssistantMessageComponent(
							undefined, false, native.markdownTheme, undefined, native.outputPad, [() => view!.text],
						),
					};
					views[index] = view;
				}
				// Feed already-transformed text after native source trimming, retaining
				// formatter-added indentation without reapplying whole-message hooks.
				view.text = part.text;
				view.component.updateContent({ ...message, content: [{ ...text, text: part.text }] }, native.isStreaming);
				return [part.workflow
					? {
						kind: "tool", key: view.component, component: view.component, summary: "Workflow source",
						running: native.isStreaming, failed: false,
					}
					: { kind: "content", key: view.component, component: view.component }];
			});
		}
		views.length = split.length;
		this.cache.set(entry.key, {
			message, width, revision: this.revision, views, entries,
		});
		return entries;
	}
}
