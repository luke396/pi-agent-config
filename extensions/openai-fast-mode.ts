// Manual Fast mode switch for models on the `openai` provider.
//
// Fast travels in the request body as `service_tier`. OpenAI documents "fast"
// and "priority" as the same tier, and this endpoint rejects the literal "fast"
// with HTTP 400, so request the tested spelling.
//
// The switch never edits the model configuration. While fast is on it overrides
// the request value; while it is off, whatever the configuration sets stays in
// effect. That is why the command asks for on/off instead of claiming the
// request is Standard.
//
// Pi recreates the extension runtime for every new, resumed or forked session,
// which runs the factory below again, so fast starts off; silently inheriting a
// paid tier across sessions is the expensive mistake this avoids.
// Requests that Pi derives itself (compaction, nested model calls) do not pass
// this hook, so they keep their own tier.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let fast = false;

	pi.on("before_provider_request", (event, ctx) => {
		if (!fast || ctx.model?.provider !== "openai") return;
		return { ...(event.payload as Record<string, unknown>), service_tier: "priority" };
	});

	pi.registerCommand("fast", {
		description: "Switch Fast mode for the openai provider (on | off)",
		handler: async (args, ctx) => {
			const requested = args.trim();
			if (requested && requested !== "on" && requested !== "off") {
				ctx.ui.notify(`Unknown argument "${requested}". Use on | off.`, "error");
				return;
			}

			if (requested) fast = requested === "on";

			// The notification is this extension's only feedback, so it also has to
			// say when the switch cannot reach the current provider.
			const reaches = ctx.model?.provider === "openai";
			ctx.ui.notify(
				!fast ? "Fast mode: off" : reaches ? "Fast mode: on" : `Fast mode: on (inactive on ${ctx.model?.provider ?? "no provider"})`,
				"info",
			);
		},
	});
}
