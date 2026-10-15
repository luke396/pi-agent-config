import assert from "node:assert/strict";
import { test } from "node:test";
import serviceTier from "../extensions/openai-service-tier.ts";

const astra = { provider: "openai", id: "gpt-6-astra" };

function fixture(model: { provider: string; id: string } = astra) {
	const notices: { message: string; type: string }[] = [];
	const statuses: [string, string | undefined][] = [];
	let payloadHook: any;
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
		selectModel: (next: { provider: string; id: string }) => {
			ctx.model = next;
			modelSelect({ type: "model_select", model: next }, ctx);
		},
	};
}

test("fast stays off until the command asks for it", () => {
	const f = fixture();
	assert.equal(f.payload({ model: "gpt-6-astra", input: "hi" }), undefined);
	assert.equal(f.lastStatus(), undefined);
});

test("fast requests the priority spelling in the body", () => {
	const f = fixture();
	f.set("fast");
	assert.deepEqual(f.payload({ model: "gpt-6-astra", input: "hi" }), {
		model: "gpt-6-astra",
		input: "hi",
		service_tier: "priority",
	});
	assert.equal(f.lastStatus(), "fast");
	assert.deepEqual(f.notices, [{ message: "Fast mode: on", type: "info" }]);
});

test("the bare command toggles off again", () => {
	const f = fixture();
	f.set();
	assert.equal(f.payload({ model: "gpt-6-astra" })?.service_tier, "priority");
	f.set();
	assert.equal(f.payload({ model: "gpt-6-astra" }), undefined);
	assert.equal(f.lastStatus(), undefined);
	assert.deepEqual(f.notices.map((n: { message: string }) => n.message), ["Fast mode: on", "Fast mode: off"]);
});

test("off turns fast off explicitly", () => {
	const f = fixture();
	f.set("fast");
	f.set("off");
	assert.equal(f.payload({ model: "gpt-6-astra" }), undefined);
	assert.equal(f.lastStatus(), undefined);
});

test("fast never reaches another provider", () => {
	const f = fixture({ provider: "cubence", id: "claude-opus-5" });
	f.set("fast");
	assert.equal(f.lastStatus(), "fast (inactive)");
	assert.equal(f.payload({ model: "claude-opus-5" }), undefined);
});

test("request gating follows model changes", () => {
	const f = fixture();
	f.set("fast");
	f.selectModel({ provider: "cubence", id: "claude-opus-5" });
	assert.equal(f.lastStatus(), "fast (inactive)");
	assert.equal(f.payload({ model: "claude-opus-5" }), undefined);
	f.selectModel({ provider: "openai", id: "gpt-6.1-sol" });
	assert.equal(f.lastStatus(), "fast");
	assert.equal(f.payload({ model: "gpt-6.1-sol" })?.service_tier, "priority");
});

test("an unknown tier is reported and changes nothing", () => {
	const f = fixture();
	f.set("turbo");
	assert.deepEqual(f.notices, [{
		message: 'Unknown service tier "turbo". Use fast | off.',
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
