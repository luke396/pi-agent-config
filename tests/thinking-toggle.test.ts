import assert from "node:assert/strict";
import { test } from "node:test";
import thinkingToggle from "../extensions/thinking-toggle.ts";

function fixture(id: string | undefined, initial: string, clamp = (level: string) => level) {
	let level = initial;
	let handler: (ctx: any) => Promise<void>;
	const notices: { message: string; type: string }[] = [];
	const ctx = {
		model: id === undefined ? undefined : { provider: "proxy", id },
		ui: { notify: (message: string, type: string) => notices.push({ message, type }) },
	};
	thinkingToggle({
		registerShortcut: (key: string, options: any) => {
			assert.equal(key, "shift+tab");
			handler = options.handler;
		},
		getThinkingLevel: () => level,
		// Pi's setter exposes the effective (possibly clamped) level to its getter.
		setThinkingLevel: (requested: string) => { level = clamp(requested); },
	} as any);
	return { ctx, notices, level: () => level, press: () => handler(ctx) };
}

for (const [id, low] of [
	["gpt-6-astra", "medium"],
	["deepseek-v4-flash", "high"],
	["DEEPSEEK-v4-pro", "high"],
	[undefined, "medium"],
]) {
	test(`${id ?? "no model"}: two-stop cycle from every current level`, async () => {
		for (const initial of ["off", "minimal", "low", "medium", "high", "xhigh", "max"]) {
			const f = fixture(id, initial);
			const next = initial === low ? "max" : low;
			await f.press(); assert.equal(f.level(), next);
			await f.press(); assert.equal(f.level(), next === low ? "max" : low);
			assert.equal(f.notices.at(-1)?.type, "info");
		}
	});
}

test("the shortcut follows model changes within the same session", async () => {
	const f = fixture("gpt-6-astra", "medium");
	await f.press(); assert.equal(f.level(), "max");
	f.ctx.model = { provider: "another-proxy", id: "deepseek-v4-pro" };
	await f.press(); assert.equal(f.level(), "high");
	await f.press(); assert.equal(f.level(), "max");
});

for (const [initial, unsupported] of [["max", "medium"], ["medium", "max"]]) {
	test(`clamped ${unsupported} preserves the previous level and warns`, async () => {
		const f = fixture("limited-model", initial, level => level === unsupported ? "high" : level);
		await f.press();
		assert.equal(f.level(), initial);
		assert.deepEqual(f.notices, [{ message: `Current model does not support thinking level: ${unsupported}`, type: "warning" }]);
	});
}
