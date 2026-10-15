// Manual Fast mode switch for models on the `openai` provider.
//
// Fast travels in the request body as `service_tier`. OpenAI documents "fast"
// and "priority" as the same tier, and this endpoint rejects the literal "fast"
// with HTTP 400, so request the tested spelling.
//
// The switch only adds or removes this override; it never rewrites a tier that
// the model configuration already sets. That is why the command calls its off
// state "off" instead of claiming the request is Standard.
//
// The switch belongs to the extension runtime. Pi recreates that runtime for
// every new, resumed or forked session, which runs the factory below again, so
// fast starts off; silently inheriting a paid tier across sessions is the
// expensive mistake this avoids.
// Requests that Pi derives itself (compaction, nested model calls) do not pass
// this hook, so they keep their own tier.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Minimal model view: the hook and the command only read these two fields.
type ModelRef = { provider?: string; id?: string } | undefined;

const FAST_SERVICE_TIER = "priority";
const STATUS_KEY = "fast-mode";

export default function (pi: ExtensionAPI) {
	let fast = false;

	// The value a request for `model` should carry, or undefined to leave the
	// request alone.
	const serviceTierFor = (model: ModelRef): string | undefined =>
		fast && model?.provider === "openai" ? FAST_SERVICE_TIER : undefined;

	const updateStatus = (ctx: ExtensionContext) => {
		if (!fast) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, serviceTierFor(ctx.model) ? "fast" : "fast (inactive)");
	};

	pi.on("before_provider_request", (event, ctx) => {
		const serviceTier = serviceTierFor(ctx.model);
		const payload = event.payload;
		if (serviceTier === undefined) return;
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
		return { ...payload, service_tier: serviceTier };
	});

	pi.registerCommand("tier", {
		description: "Switch Fast mode for the openai provider",
		handler: async (args, ctx) => {
			const requested = args.trim();
			if (requested && requested !== "fast" && requested !== "off") {
				ctx.ui.notify(`Unknown service tier "${requested}". Use fast | off.`, "error");
				return;
			}

			fast = requested ? requested === "fast" : !fast;
			ctx.ui.notify(`Fast mode: ${fast ? "on" : "off"}`, "info");
			updateStatus(ctx);
		},
	});

	// The status follows the model, so a switch that no longer reaches the
	// current model is visible instead of silently inert.
	pi.on("model_select", (_event, ctx) => updateStatus(ctx));
}
