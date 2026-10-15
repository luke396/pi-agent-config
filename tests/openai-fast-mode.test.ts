import assert from "node:assert/strict";
import { test } from "node:test";
import fastMode from "../extensions/openai-fast-mode.ts";

const astra = { provider: "openai", id: "gpt-6-astra" };

function fixture(model: { provider: string; id: string } = astra) {
	const notices: { message: string; type: string }[] = [];
	let payloadHook: any;
	let command: any;
	const ctx: any = {
		model,
		ui: { notify: (message: string, type: string) => notices.push({ message, type }) },
	};

	fastMode({
		on: (name: string, handler: any) => {
			if (name === "before_provider_request") payloadHook = handler;
			else throw new Error(`unexpected event: ${name}`);
		},
		registerCommand: (name: string, definition: any) => {
			assert.equal(name, "fast");
			command = definition.handler;
		},
	} as any);

	return {
		notices,
		messages: () => notices.map((notice: { message: string }) => notice.message),
		run: (args = "") => command(args, ctx),
		payload: (payload: unknown) => payloadHook({ type: "before_provider_request", payload }, ctx),
		selectModel: (next: { provider: string; id: string }) => {
			ctx.model = next;
		},
	};
}

test("fast stays off until the command turns it on", () => {
	const f = fixture();
	assert.equal(f.payload({ model: "gpt-6-astra", input: "hi" }), undefined);
	assert.deepEqual(f.messages(), []);
});

test("fast on requests the priority spelling in the body", () => {
	const f = fixture();
	f.run("on");
	assert.deepEqual(f.payload({ model: "gpt-6-astra", input: "hi" }), {
		model: "gpt-6-astra",
		input: "hi",
		service_tier: "priority",
	});
	assert.deepEqual(f.notices, [{ message: "Fast mode: on", type: "info" }]);
});

test("fast off clears it again", () => {
	const f = fixture();
	f.run("on");
	f.run("off");
	assert.equal(f.payload({ model: "gpt-6-astra" }), undefined);
	assert.deepEqual(f.messages(), ["Fast mode: on", "Fast mode: off"]);
});

test("a bare command reports the current state without switching", () => {
	const f = fixture();
	f.run();
	assert.deepEqual(f.messages(), ["Fast mode: off"]);
	assert.equal(f.payload({ model: "gpt-6-astra" }), undefined);
	f.run("on");
	f.run();
	assert.equal(f.payload({ model: "gpt-6-astra" })?.service_tier, "priority");
	assert.deepEqual(f.messages(), ["Fast mode: off", "Fast mode: on", "Fast mode: on"]);
});

test("fast reports itself inactive on another provider", () => {
	const f = fixture({ provider: "cubence", id: "claude-opus-5" });
	f.run("on");
	assert.deepEqual(f.notices, [{ message: "Fast mode: on (inactive on cubence)", type: "info" }]);
	assert.equal(f.payload({ model: "claude-opus-5" }), undefined);
});

test("request gating follows model changes", () => {
	const f = fixture();
	f.run("on");
	f.selectModel({ provider: "cubence", id: "claude-opus-5" });
	assert.equal(f.payload({ model: "claude-opus-5" }), undefined);
	f.selectModel({ provider: "openai", id: "gpt-6.1-sol" });
	assert.equal(f.payload({ model: "gpt-6.1-sol" })?.service_tier, "priority");
});

test("an unknown argument is reported and changes nothing", () => {
	const f = fixture();
	f.run("on");
	f.run("turbo");
	assert.deepEqual(f.notices.at(-1), { message: 'Unknown argument "turbo". Use on | off.', type: "error" });
	assert.equal(f.payload({ model: "gpt-6-astra" })?.service_tier, "priority");
});
