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
interface Part { text: string; kind: "content" | "tool" | "thinking" }
interface NativeView { text: string; component: AssistantMessageComponent }

/** Backtick spans use matching run lengths and may cross lines within a paragraph. */
function inlineCodeEnd(text: string, from: number, length: number, streaming: boolean): number {
	const boundary = /\r?\n(?:[ \t]*\r?\n| {0,3}(?:`{3,}|~{3,}))/.exec(text.slice(from));
	const paragraphEnd = boundary ? from + boundary.index : text.length;
	const ticks = /`+/g;
	ticks.lastIndex = from;
	for (let match; (match = ticks.exec(text)) && match.index < paragraphEnd;) {
		if (match[0].length === length) return match.index + length;
	}
	// A final unmatched delimiter is literal Markdown. While its paragraph is
	// still streaming, keep a possible quoted closing tag inside the live fold.
	return streaming && paragraphEnd === text.length ? text.length : from;
}

/** Select top-level thinking tags and explicit workflow fences, leaving examples alone. */
function parts(text: string, streaming: boolean): Part[] {
	const result: Part[] = [];
	let start = 0;
	let offset = 0;
	let thinking: number | undefined;
	let codeUntil = 0;
	let fence: { marker: string; workflow: boolean; start: number } | undefined;
	const take = (end: number, kind: Part["kind"]) => {
		// Empty prose slots retain disclosure when a transformer adds a prefix/footer.
		result.push({ text: text.slice(start, end), kind });
		start = end;
	};
	for (const raw of text.split("\n")) {
		const lineStart = offset;
		offset += raw.length + 1;
		const line = raw.replace(/\r$/, "");
		if (fence) {
			const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
			if (!close || close[1]![0] !== fence.marker[0] || close[1]!.length < fence.marker.length) continue;
			if (fence.workflow) {
				take(fence.start, "content");
				take(lineStart + raw.length, "tool");
			}
			fence = undefined;
			continue;
		}
		const open = codeUntil <= lineStart ? /^ {0,3}(`{3,}|~{3,})/.exec(line) : null;
		if (open) {
			fence = {
				marker: open[1]!,
				workflow: thinking === undefined && /^```(?:js|javascript) workflow[ \t]*$/.test(line),
				start: lineStart,
			};
			continue;
		}
		for (const token of line.matchAll(/\\[\s\S]|`+|<\/?thinking>/g)) {
			const position = lineStart + token.index;
			if (position < codeUntil || token[0].startsWith("\\")) continue;
			if (token[0].startsWith("`")) {
				codeUntil = inlineCodeEnd(text, position + token[0].length, token[0].length, streaming);
			} else if (token[0] === "<thinking>" && thinking === undefined && token.index === 0) {
				thinking = lineStart;
			} else if (token[0] === "</thinking>" && thinking !== undefined) {
				take(thinking, "content");
				take(position + token[0].length, "thinking");
				thinking = undefined;
			}
		}
	}
	// An unfinished final block stays native; a live block can already be folded.
	if (streaming && thinking !== undefined) {
		take(thinking, "content");
		take(text.length, "thinking");
	} else if (streaming && fence?.workflow) {
		take(fence.start, "content");
		take(text.length, "tool");
	} else take(text.length, "content");
	return result;
}

/** Project tagged thinking and workflow source without rewriting messages or original views. */
export class AssistantSources {
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
		if (split.some((part) => part.kind !== "content")) {
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
			const prose = split.filter((part) => part.kind === "content" && part.text.trim());
			// Definitions can bind links across prose spans; keep that complete
			// Markdown context instead of splitting it into independent parsers.
			if (prose.length > 1 && prose.some((part) => part.text.includes("]:")))
				split = [{ text: markdown, kind: "content" }];
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
				if (part.kind === "content")
					return [{ kind: "content", key: view.component, component: view.component }];
				return [{
					kind: part.kind, key: view.component, component: view.component,
					summary: part.kind === "tool" ? "Workflow source" : part.text.replace(/^<thinking>|<\/thinking>$/g, "").trim(),
					timestamp: part.kind === "thinking" ? message.timestamp : undefined,
					running: native.isStreaming, failed: false,
				}];
			});
		}
		views.length = split.length;
		this.cache.set(entry.key, {
			message, width, revision: this.revision, views, entries,
		});
		return entries;
	}
}
