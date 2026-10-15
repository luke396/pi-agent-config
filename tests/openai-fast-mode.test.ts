import assert from "node:assert/strict";
import { test } from "node:test";
import fastMode from "../extensions/openai-fast-mode.ts";

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

	fastMode({
		on: (name: string, handler: any) => {
			if (name === "before_provider_request") payloadHook = handler;
			else if (name === "model_select") modelSelect = handler;
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
		lastStatus: () => statuses.at(-1)?.[1],
		run: (args = "") => command(args, ctx),
		payload: (payload: unknown) => payloadHook({ type: "before_provider_request", payload }, ctx),
		selectModel: (next: { provider: string; id: string }) => {
			ctx.model = next;
			modelSelect({ type: "model_select", model: next }, ctx);
		},
	};
}

test("fast stays off until the command turns it on", () => {
	const f = fixture();
	assert.equal(f.payload({ model: "gpt-6-astra", input: "hi" }), undefined);
	assert.equal(f.lastStatus(), undefined);
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
	assert.equal(f.lastStatus(), "fast");
	assert.deepEqual(f.notices, [{ message: "Fast mode: on", type: "info" }]);
});

test("fast off clears the request field and the status", () => {
	const f = fixture();
	f.run("on");
	f.run("off");
	assert.equal(f.payload({ model: "gpt-6-astra" }), undefined);
	assert.equal(f.lastStatus(), undefined);
	assert.deepEqual(f.messages(), ["Fast mode: on", "Fast mode: off"]);
});

test("a bare command reports the current state without switching", () => {
	const f = fixture();
	f.run();
	assert.deepEqual(f.messages(), ["Fast mode: off"]);
	assert.equal(f.lastStatus(), undefined);
	f.run("on");
	f.run();
	assert.equal(f.payload({ model: "gpt-6-astra" })?.service_tier, "priority");
	assert.equal(f.lastStatus(), "fast");
	assert.deepEqual(f.messages(), ["Fast mode: off", "Fast mode: on", "Fast mode: on"]);
});

test("fast shows itself inactive on another provider", () => {
	const f = fixture({ provider: "cubence", id: "claude-opus-5" });
	f.run("on");
	assert.equal(f.lastStatus(), "fast (inactive)");
	assert.deepEqual(f.notices, [{ message: "Fast mode: on", type: "info" }]);
	assert.equal(f.payload({ model: "claude-opus-5" }), undefined);
});

test("the status and the request gate follow model changes", () => {
	const f = fixture();
	f.run("on");
	assert.equal(f.lastStatus(), "fast");
	f.selectModel({ provider: "cubence", id: "claude-opus-5" });
	assert.equal(f.lastStatus(), "fast (inactive)");
	assert.equal(f.payload({ model: "claude-opus-5" }), undefined);
	f.selectModel({ provider: "openai", id: "gpt-6.1-sol" });
	assert.equal(f.lastStatus(), "fast");
	assert.equal(f.payload({ model: "gpt-6.1-sol" })?.service_tier, "priority");
});

test("an unknown argument is reported and changes nothing", () => {
	const f = fixture();
	f.run("on");
	f.run("turbo");
	assert.deepEqual(f.notices.at(-1), { message: 'Unknown argument "turbo". Use on | off.', type: "error" });
	assert.equal(f.payload({ model: "gpt-6-astra" })?.service_tier, "priority");
	assert.equal(f.lastStatus(), "fast");
});
