import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function image(value: unknown): value is Record<string, unknown> {
	return record(value) && value.type === "image";
}

// Infrawaves Opus recognizes top-level user images but ignores the same image
// inside tool_result.content. Adapt only the outgoing Anthropic payload; tools,
// stored history, other providers/models, and stream/retry handling stay native.
export default function (pi: ExtensionAPI): void {
	pi.on("before_provider_request", (event, ctx) => {
		if (ctx.model?.provider !== "infrawaves" || ctx.model.api !== "anthropic-messages" ||
			ctx.model.id !== "claude-opus-5.5") return;
		const payload = event.payload;
		if (!record(payload) || payload.model !== ctx.model.id || !Array.isArray(payload.messages)) return;

		let changed = false;
		const messages = payload.messages.map((message) => {
			if (!record(message) || message.role !== "user" || !Array.isArray(message.content)) return message;
			const attachments: Record<string, unknown>[] = [];
			const content = message.content.map((block) => {
				if (!record(block) || block.type !== "tool_result" || typeof block.tool_use_id !== "string" ||
					!Array.isArray(block.content)) return block;
				const images = block.content.filter(image);
				if (!images.length) return block;
				attachments.push({ type: "text", text: `Images from tool result ${block.tool_use_id}, in order:` }, ...images);
				const remaining = block.content.filter((part) => !image(part));
				return {
					...block,
					content: remaining.length ? remaining : [{ type: "text", text: "See attached images below." }],
				};
			});
			if (!attachments.length) return message;

			// Native error-image captions/attachments already follow the results;
			// insert before that tail so successful images do not move behind them.
			const afterResults = content.findLastIndex((block) => record(block) && block.type === "tool_result") + 1;
			// Move Pi\'s terminal cache marker only when appending past it. An
			// existing text/image tail stays last and keeps its own cache marker.
			const last = content.at(-1);
			if (afterResults === content.length && record(last) && last.cache_control !== undefined) {
				const { cache_control, ...withoutCache } = last;
				content[content.length - 1] = withoutCache;
				const end = attachments.length - 1;
				attachments[end] = { ...attachments[end], cache_control };
			}
			changed = true;
			// Anthropic requires all tool_result blocks before text/image siblings.
			return { ...message, content: [...content.slice(0, afterResults), ...attachments, ...content.slice(afterResults)] };
		});
		return changed ? { ...payload, messages } : undefined;
	});
}
