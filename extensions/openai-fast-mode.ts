// Fast defaults on for OpenAI Astra, with a manual per-session override.
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
// Until /fast on|off is used, the default follows the selected model. Pi
// recreates the runtime for new, resumed or forked sessions, so those return
// to the model default rather than inheriting a manual override.
// Requests that Pi derives itself (compaction, nested model calls) do not pass
// this hook, so they keep their own tier.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "fast-mode";

export default function (pi: ExtensionAPI) {
	let fastOverride: boolean | undefined;
	const isFast = (ctx: ExtensionContext) =>
		fastOverride ?? (ctx.model?.provider === "openai" && ctx.model.id === "gpt-6-astra");

	const updateStatus = (ctx: ExtensionContext) => {
		if (!isFast(ctx)) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, ctx.model?.provider === "openai" ? "fast" : "fast (inactive)");
	};

	pi.on("before_provider_request", (event, ctx) => {
		if (!isFast(ctx) || ctx.model?.provider !== "openai") return;
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

			if (requested) fastOverride = requested === "on";
			ctx.ui.notify(isFast(ctx) ? "Fast mode: on" : "Fast mode: off", "info");
			updateStatus(ctx);
		},
	});

	// Show the default at startup and follow the selected model thereafter.
	pi.on("session_start", (_event, ctx) => updateStatus(ctx));
	pi.on("model_select", (_event, ctx) => updateStatus(ctx));
}
