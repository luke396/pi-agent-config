import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { TranscriptEntry } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";

type Message = Parameters<AssistantMessageComponent["updateContent"]>[0];
type Options = ConstructorParameters<typeof AssistantMessageComponent>;
interface NativeAssistant {
	lastMessage?: Message;
	contentContainer?: { children: Component[] };
	markdownTheme: NonNullable<Options[2]>;
	outputPad: number;
	markdownTransformers: NonNullable<Options[5]>;
}

/** libtui leaves interrupted messages whole; split thoughts from their native notice locally. */
export class InterruptedThinking {
	private readonly cache = new WeakMap<object, {
		children: Component[];
		views: AssistantMessageComponent[];
		entries: TranscriptEntry[];
	}>();

	read(entries: readonly TranscriptEntry[]): readonly TranscriptEntry[] {
		return entries.flatMap((entry) => {
			if (entry.kind !== "content" || !(entry.component instanceof AssistantMessageComponent)) return [entry];
			const native = entry.component as unknown as NativeAssistant;
			const message = native.lastMessage;
			const children = native.contentContainer?.children;
			if (!message || !["error", "aborted", "length"].includes(message.stopReason) ||
				!Array.isArray(message.content) || !message.content.some((part) => part.type === "thinking" && part.thinking.trim()) ||
				!Array.isArray(children) || typeof native.outputPad !== "number" ||
				!native.markdownTheme || !Array.isArray(native.markdownTransformers)) return [entry];
			const previous = this.cache.get(entry.key);
			if (previous?.children === children) return previous.entries;
			const views = previous?.views ?? [];
			const entries: TranscriptEntry[] = [];
			const add = (content: Message["content"], thought?: string, notice = false) => {
				const index = entries.length;
				const view = views[index] ??= new AssistantMessageComponent(
					undefined, false, native.markdownTheme, undefined, native.outputPad, native.markdownTransformers,
				);
				view.updateContent({ ...message, content, stopReason: notice ? message.stopReason : "toolUse" }, false);
				entries.push(thought === undefined
					? { kind: "content", key: view, component: view }
					: {
						kind: "thinking", key: view, component: view, summary: thought,
						timestamp: message.timestamp, running: false, failed: true,
					});
			};
			// Keep text in order, and group adjacent thoughts just as the native view does.
			let thoughts: Message["content"] = [];
			const flush = () => {
				if (!thoughts.length) return;
				add(thoughts, thoughts.map((part) => part.type === "thinking" ? part.thinking : "").join("\n\n"));
				thoughts = [];
			};
			for (const part of message.content) {
				if (part.type === "thinking") {
					if (part.thinking.trim()) thoughts.push(part);
				} else {
					flush();
					if (part.type === "text" && part.text.trim()) add([part]);
				}
			}
			flush();
			// Preserve Pi's own error/abort/length rendering, including its tool-call suppression.
			add(message.content.filter((part) => part.type === "toolCall"), undefined, true);
			views.length = entries.length;
			this.cache.set(entry.key, { children, views, entries });
			return entries;
		});
	}
}
