import assert from "node:assert/strict";
import { test } from "node:test";
import serviceTier from "../extensions/openai-service-tier.ts";

const astra = { provider: "openai", id: "gpt-6-astra" };

function fixture(model: { provider: string; id: string } = astra) {
	const notices: { message: string; type: string }[] = [];
	const statuses: [string, string | undefined][] = [];
	let payloadHook: any;
	let headerHook: any;
	let modelSelect: any;
	let command: any;
	const ctx: any = {
		model,
		ui: {
			notify: (message: string, type: string) => notices.push({ message, type }),
			setStatus: (key: string, value: string | undefined) => statuses.push([key, value]),
		},
	};

	serviceTier({
		on: (name: string, handler: any) => {
			if (name === "before_provider_request") payloadHook = handler;
			else if (name === "before_provider_headers") headerHook = handler;
			else if (name === "model_select") modelSelect = handler;
			else throw new Error(`unexpected event: ${name}`);
		},
		registerCommand: (name: string, definition: any) => {
			assert.equal(name, "tier");
			command = definition.handler;
		},
	} as any);

	return {
		notices,
		lastStatus: () => statuses.at(-1)?.[1],
		set: (args = "") => command(args, ctx),
		payload: (payload: unknown) => payloadHook({ type: "before_provider_request", payload }, ctx),
		headers: (headers: Record<string, string> = {}) => {
			headerHook({ type: "before_provider_headers", headers }, ctx);
			return headers;
		},
		selectModel: (next: { provider: string; id: string }) => {
			ctx.model = next;
			modelSelect({ type: "model_select", model: next }, ctx);
		},
	};
}

test("standard leaves requests, headers, and status alone", () => {
	const f = fixture();
	assert.equal(f.payload({ model: "gpt-6-astra", input: "hi" }), undefined);
	assert.deepEqual(f.headers({}), {});
	assert.equal(f.lastStatus(), undefined);
});

test("fast requests the priority spelling in the body only", () => {
	const f = fixture();
	f.set("fast");
	assert.deepEqual(f.payload({ model: "gpt-6-astra" }), { model: "gpt-6-astra", service_tier: "priority" });
	assert.deepEqual(f.headers({ existing: "keep" }), { existing: "keep" });
	assert.equal(f.lastStatus(), "tier:fast");
	assert.deepEqual(f.notices, [{ message: "Service tier: fast", type: "info" }]);
});

test("ultrafast sets the routing header beside the body field", () => {
	const f = fixture({ provider: "openai", id: "gpt-6.1-sol" });
	f.set("ultrafast");
	assert.deepEqual(f.payload({ model: "gpt-6.1-sol" }), { model: "gpt-6.1-sol", service_tier: "ultrafast" });
	assert.deepEqual(f.headers({ existing: "keep" }), { existing: "keep", "OpenAI-Service-Tier": "ultrafast" });
	assert.equal(f.lastStatus(), "tier:ultrafast");
});

test("ultrafast is refused where it cannot apply", () => {
	for (const model of [
		{ provider: "openai", id: "gpt-6-luna" },
		{ provider: "cubence", id: "gpt-6-astra" },
	]) {
		const f = fixture(model);
		f.set("ultrafast");
		assert.deepEqual(f.notices, [{
			message: "Ultrafast needs gpt-6-astra or gpt-6.1-sol on the openai provider.",
			type: "warning",
		}]);
		assert.equal(f.payload({ model: model.id }), undefined);
		assert.deepEqual(f.headers({}), {});
		assert.equal(f.lastStatus(), undefined);
	}
});

test("an armed tier never leaks to another provider", () => {
	const f = fixture({ provider: "cubence", id: "claude-opus-5" });
	f.set("fast");
	assert.equal(f.lastStatus(), "tier:fast (inactive)");
	assert.equal(f.payload({ model: "claude-opus-5" }), undefined);
	assert.deepEqual(f.headers({}), {});
});

test("the command cycles standard, fast, ultrafast", () => {
	const f = fixture();
	const tiers = [];
	for (let i = 0; i < 4; i++) {
		f.set();
		tiers.push(f.payload({ model: "gpt-6-astra" })?.service_tier ?? "standard");
	}
	assert.deepEqual(tiers, ["priority", "ultrafast", "standard", "priority"]);
});

test("the status follows model changes", () => {
	const f = fixture();
	f.set("ultrafast");
	assert.equal(f.lastStatus(), "tier:ultrafast");
	f.selectModel({ provider: "openai", id: "gpt-6-luna" });
	assert.equal(f.lastStatus(), "tier:ultrafast (inactive)");
	assert.equal(f.payload({ model: "gpt-6-luna" }), undefined);
	f.selectModel({ provider: "openai", id: "gpt-6.1-sol" });
	assert.equal(f.lastStatus(), "tier:ultrafast");
	assert.equal(f.payload({ model: "gpt-6.1-sol" })?.service_tier, "ultrafast");
});

test("an unknown tier is reported and changes nothing", () => {
	const f = fixture();
	f.set("fastest");
	assert.deepEqual(f.notices, [{
		message: 'Unknown service tier "fastest". Use standard | fast | ultrafast.',
		type: "error",
	}]);
	assert.equal(f.payload({ model: "gpt-6-astra" }), undefined);
});

test("a payload that is not a request object is left alone", () => {
	const f = fixture();
	f.set("fast");
	for (const payload of [undefined, null, "text", [1, 2]]) {
		assert.equal(f.payload(payload), undefined);
	}
});
