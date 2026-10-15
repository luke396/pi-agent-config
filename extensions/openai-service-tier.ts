// Manual Fast / Ultrafast switch for models on the `openai` provider.
//
// Fast travels in the request body as `service_tier`. OpenAI documents "fast"
// and "priority" as the same tier, and the recorded 2026-10-01 check on this
// provider rejected the literal "fast" with HTTP 400, so request the tested
// spelling.
// Ultrafast is routed by the `OpenAI-Service-Tier` header, which accepts only
// "ultrafast" while the alpha lasts, plus the matching body field.
//
// The switch lives in this process only. Every session starts on "standard",
// because silently inheriting a paid tier is the expensive mistake.
// Requests that Pi derives itself (compaction, nested model calls) do not pass
// these hooks, so they keep their own tier.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type ServiceTier = "standard" | "fast" | "ultrafast";

// Minimal model view: the hooks and the command only read these two fields.
type ModelRef = { provider?: string; id?: string } | undefined;

const CYCLE: ServiceTier[] = ["standard", "fast", "ultrafast"];
const FAST_SERVICE_TIER = "priority";
const ULTRAFAST_HEADER = "OpenAI-Service-Tier";
const ULTRAFAST_MODELS = new Set(["gpt-6-astra", "gpt-6.1-sol"]);
const STATUS_KEY = "service-tier";

export default function (pi: ExtensionAPI) {
	let tier: ServiceTier = "standard";

	// The value a request for `model` should carry, or undefined to leave the
	// request alone because the armed tier cannot reach this model.
	const serviceTierFor = (model: ModelRef): string | undefined => {
		if (tier === "standard" || model?.provider !== "openai") return undefined;
		if (tier === "fast") return FAST_SERVICE_TIER;
		return ULTRAFAST_MODELS.has(model.id ?? "") ? "ultrafast" : undefined;
	};

	const updateStatus = (ctx: ExtensionContext) => {
		if (tier === "standard") {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, serviceTierFor(ctx.model) ? `tier:${tier}` : `tier:${tier} (inactive)`);
	};

	pi.on("before_provider_request", (event, ctx) => {
		const serviceTier = serviceTierFor(ctx.model);
		const payload = event.payload;
		if (serviceTier === undefined) return;
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
		return { ...payload, service_tier: serviceTier };
	});

	pi.on("before_provider_headers", (event, ctx) => {
		if (serviceTierFor(ctx.model) === "ultrafast") event.headers[ULTRAFAST_HEADER] = "ultrafast";
	});

	pi.registerCommand("tier", {
		description: `OpenAI service tier: ${CYCLE.join(" | ")}`,
		handler: async (args, ctx) => {
			const requested = args.trim() as ServiceTier;
			if (requested && !CYCLE.includes(requested)) {
				ctx.ui.notify(`Unknown service tier "${requested}". Use ${CYCLE.join(" | ")}.`, "error");
				return;
			}

			const previous = tier;
			tier = requested || CYCLE[(CYCLE.indexOf(tier) + 1) % CYCLE.length];

			// Ultrafast exists only for these OpenAI models. Refuse instead of
			// arming a tier that the request layer would drop.
			if (tier === "ultrafast" && serviceTierFor(ctx.model) !== "ultrafast") {
				tier = previous;
				ctx.ui.notify("Ultrafast needs gpt-6-astra or gpt-6.1-sol on the openai provider.", "warning");
				return;
			}

			ctx.ui.notify(`Service tier: ${tier}`, "info");
			updateStatus(ctx);
		},
	});

	// The status follows the model, so an armed tier that no longer reaches the
	// current model is visible instead of silently inert.
	pi.on("model_select", (_event, ctx) => updateStatus(ctx));
	pi.on("session_start", (_event, ctx) => {
		tier = "standard";
		updateStatus(ctx);
	});
}
