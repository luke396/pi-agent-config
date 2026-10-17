import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import sessionTitle from "../extensions/session-title/index.ts";

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const response = (title: string) => ({ stopReason: "stop", content: [{ type: "text", text: JSON.stringify({ action: "rename", title }) }] });
const keep = () => ({ stopReason: "stop", content: [{ type: "text", text: '{"action":"keep"}' }] });
function deferred() {
	let resolve!: (value: any) => void;
	let reject!: (error: any) => void;
	const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

// Mirrors Pi 1.2.0: retained data references, file-global names, branch/projected
// context, and fire-and-forget name events delayed by earlier async handlers.
function fake(options: { entries?: any[]; mode?: string; delayNameEvents?: Promise<any> } = {}) {
	let sequence = 1000;
	let entries = structuredClone(options.entries ?? []);
	let messages: any[] = [];
	let id = "session-a";
	let handlers: Record<string, Function[]> = {};
	const commands: Record<string, any> = {};
	const notices: string[] = [];
	const calls: any[] = [];
	let provider: Function = () => Promise.resolve(response("首个主题"));
	let available = true;
	const append = (entry: any) => {
		const result = { id: String(++sequence), parentId: entries.at(-1)?.id ?? null, ...entry };
		entries.push(result);
		return result;
	};
	const getName = () => entries.findLast((e) => e.type === "session_info")?.name?.trim() || undefined;
	const ctx: any = {
		mode: options.mode ?? "tui", hasUI: options.mode !== "print", model: { provider: "expensive", id: "chat" },
		ui: { notify: (message: string) => notices.push(message) },
		sessionManager: {
			getEntries: () => [...entries], getSessionId: () => id,
			buildSessionProjection: () => ({ messages }),
		},
		modelRegistry: {
			find: (provider: string, id: string) => available ? { provider, id } : undefined,
			streamSimple: (model: any, context: any, config: any) => {
				calls.push({ model, context, config });
				return { result: () => provider() };
			},
		},
	};
	async function emit(event: string, data = {}) {
		for (const handler of handlers[event] ?? []) await handler({ type: event, ...data }, ctx);
	}
	const pi: any = {
		on: (event: string, handler: Function) => { (handlers[event] ??= []).push(handler); },
		registerCommand: (name: string, command: any) => { commands[name] = command; },
		appendEntry: (customType: string, data: any) => append({ type: "custom", customType, data }),
		getSessionName: getName,
		setSessionName: (name: string) => {
			append({ type: "session_info", name });
			void emit("session_info_changed", { name: getName() });
		},
	};
	function install() {
		handlers = {};
		if (options.delayNameEvents) pi.on("session_info_changed", () => options.delayNameEvents);
		sessionTitle(pi);
	}
	install();
	return {
		ctx, pi, calls, notices, emit, getName,
		entries: () => entries,
		state: () => entries.findLast((e) => e.customType === "session-title.v1")?.data,
		provider: (fn: Function) => { provider = fn; },
		available: (value: boolean) => { available = value; },
		messages: (value: any[]) => { messages = value; },
		turn: (user = "研究 Claude 账号和 IP", assistant = "分析账号与 IP 的关联") => {
			messages.push({ role: "user", content: user }, { role: "assistant", stopReason: "stop", content: [{ type: "text", text: assistant }] });
		},
		command: (args = "") => commands["auto-title"].handler(args, ctx),
		start: () => emit("session_start", { reason: "startup" }),
		reload: async () => { await emit("session_shutdown", { reason: "reload" }); install(); await emit("session_start", { reason: "reload" }); },
		replace: async () => { await emit("session_shutdown", { reason: "new" }); id = "session-b"; entries = []; messages = []; await emit("session_start", { reason: "new" }); },
	};
}

function clock(t: any) { t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 }); }

test("first name uses dedicated model, stable topic KEEP, then material topic change", async (t) => {
	clock(t);
	const f = fake(); await f.start();
	assert.equal(f.calls.length, 0);
	f.turn(); await f.emit("agent_settled"); await flush();
	assert.equal(f.getName(), "首个主题");
	assert.deepEqual(f.calls[0].model, { provider: "deepseek", id: "deepseek-flash" });
	assert.equal(f.calls[0].config.maxRetries, 0);
	assert.equal(f.calls[0].config.maxTokens, 2048);
	assert.equal(f.calls[0].config.reasoning, "low");
	assert.match(f.calls[0].context.systemPrompt, /untrusted/);
	const firstMarker = f.state();
	const firstSnapshot = structuredClone(firstMarker);
	t.mock.timers.tick(600_000);
	f.provider(keep); f.turn("继续分析 IP", "进一步分析");
	await f.emit("agent_settled"); await flush();
	assert.equal(f.getName(), "首个主题");
	assert.equal(JSON.parse(f.calls[1].context.messages[0].content).previousTitle, "首个主题");
	assert.deepEqual(firstMarker, firstSnapshot, "later attempts must not mutate earlier state entries");
	f.provider(() => response("Pi 配置"));
	f.turn("转到 Pi 配置", "配置已说明");
	await f.emit("agent_settled"); assert.equal(f.calls.length, 2, "KEEP consumes cooldown");
	t.mock.timers.tick(600_000); await f.emit("agent_settled"); await flush();
	assert.equal(f.getName(), "Pi 配置");
	t.mock.timers.tick(600_000); f.turn("实现 Pi 动态会话命名", "实现与测试");
	f.provider(() => response("Pi 动态会话命名")); await f.emit("agent_settled"); await flush();
	assert.equal(f.getName(), "Pi 动态会话命名");
});

test("cooldown survives reload; unchanged input can be checked again without idle polling", async (t) => {
	clock(t); const f = fake(); await f.start(); f.turn();
	await f.emit("agent_settled"); await flush();
	f.turn("配置 Pi", "好的"); await f.emit("agent_settled"); assert.equal(f.calls.length, 1);
	t.mock.timers.tick(600_000); assert.equal(f.calls.length, 1, "elapsed time does not trigger requests");
	await f.emit("agent_settled"); await flush(); assert.equal(f.calls.length, 2);
	t.mock.timers.tick(600_000); await f.emit("agent_settled"); await flush();
	assert.equal(f.calls.length, 3, "same input is eligible after cooldown");
	await f.reload(); await f.emit("agent_settled"); assert.equal(f.calls.length, 3, "cooldown survives reload");
	t.mock.timers.tick(600_000); assert.equal(f.calls.length, 3, "still no idle polling");
	await f.emit("agent_settled"); await flush(); assert.equal(f.calls.length, 4);
});

test("legacy hash state restores ownership and cooldown without rewriting the obsolete field", async (t) => {
	clock(t); const f = fake(); await f.start(); f.turn();
	await f.emit("agent_settled"); await flush();
	f.state().inputHash = "legacy hash";
	await f.reload(); await f.emit("agent_settled"); assert.equal(f.calls.length, 1);
	t.mock.timers.tick(600_000); await f.emit("agent_settled"); await flush();
	assert.equal(f.calls.length, 2);
	assert.equal(f.state().mode, "auto");
	assert.equal(f.getName(), "首个主题");
	assert.equal("inputHash" in f.state(), false);
});

test("failure preserves good title and attempt cooldown across reload", async (t) => {
	clock(t); const f = fake(); await f.start(); f.turn(); await f.emit("agent_settled"); await flush();
	t.mock.timers.tick(600_000); f.provider(() => Promise.reject(new Error("missing auth/provider failure")));
	f.turn("新话题", "讨论"); await f.emit("agent_settled"); await flush();
	assert.equal(f.getName(), "首个主题");
	await f.reload(); f.turn("还有一个话题", "更多讨论"); await f.emit("agent_settled");
	assert.equal(f.calls.length, 2);
	t.mock.timers.tick(600_000); await f.emit("agent_settled"); await flush(); assert.equal(f.calls.length, 3);
	assert.equal(f.getName(), "首个主题");
});

test("bounded recent projected text excludes tools, thinking, images and old topic", async () => {
	const f = fake(); await f.start();
	f.turn("OLD TOPIC", "OLD ANSWER");
	for (let i = 0; i < 12; i++) f.turn(`recent-${i}:` + "用".repeat(2000), "答".repeat(2000));
	// Replace projection to exercise mixed block filtering without exposing raw entries.
	const extra = [
		{ role: "user", content: [{ type: "image", data: "IMAGE SECRET" }, { type: "text", text: "最近的问题" }] },
		{ role: "toolResult", content: [{ type: "text", text: "TOOL SECRET" }] },
		{ role: "assistant", stopReason: "stop", content: [{ type: "thinking", thinking: "THINKING SECRET" }, { type: "text", text: "最近的回答" }] },
	];
	f.messages([...f.ctx.sessionManager.buildSessionProjection().messages, ...extra]);
	await f.emit("agent_settled"); await flush();
	const data = JSON.parse(f.calls[0].context.messages[0].content);
	assert.ok(data.recentMessages.length <= 8);
	assert.ok(data.recentMessages.reduce((n: number, m: any) => n + m.text.length, 0) <= 6000);
	assert.ok(data.recentMessages.every((m: any) => m.text.length <= 1200));
	assert.doesNotMatch(JSON.stringify(data), /SECRET|OLD TOPIC|OLD ANSWER/);
	assert.equal(data.recentMessages.at(-2).text, "最近的问题");
});

test("existing manual title is pinned, including --name/picker entries without marker", async () => {
	const f = fake({ entries: [{ id: "manual", type: "session_info", name: "用户标题" }] });
	await f.start(); f.turn(); await f.emit("agent_settled"); await f.command("now");
	assert.equal(f.calls.length, 0); assert.equal(f.getName(), "用户标题");
	assert.match(f.notices.at(-1)!, /Pinned/);
});

test("manual rename during abort-ignoring completion wins and pin persists on resume", async () => {
	const f = fake(); const d = deferred(); f.provider(() => d.promise);
	await f.start(); f.turn(); await f.emit("agent_settled");
	f.pi.setSessionName("我的名字");
	assert.equal(f.calls[0].config.signal.aborted, true);
	d.resolve(response("不应该生效")); await flush();
	assert.equal(f.getName(), "我的名字"); assert.equal(f.state().mode, "pinned");
	await f.reload(); f.turn("新的话题", "回答"); await f.command("now");
	assert.equal(f.calls.length, 1);
});

test("manual rename detected even when session_info_changed handler is delayed", async () => {
	const gate = deferred(); const f = fake({ delayNameEvents: gate.promise }); const d = deferred();
	await f.start(); f.provider(() => d.promise); f.turn(); await f.emit("agent_settled");
	f.pi.setSessionName("手动优先"); d.resolve(response("stale")); await flush();
	assert.equal(f.getName(), "手动优先"); assert.equal(f.state().mode, "pinned");
	gate.resolve(undefined); await flush();
});

test("delayed self-notification does not pin an automatic title", async () => {
	const gate = deferred(); const f = fake({ delayNameEvents: gate.promise });
	await f.start(); f.turn(); await f.emit("agent_settled"); await flush();
	assert.equal(f.state().mode, "auto"); gate.resolve(undefined); await flush();
	assert.equal(f.state().mode, "auto");
});

test("identical manual rename and clearing pin by entry identity, never silently re-adopt", async () => {
	const f = fake(); await f.start(); f.turn(); await f.command("now"); await flush();
	f.pi.setSessionName("首个主题"); await flush(); assert.equal(f.state().mode, "pinned");
	await f.reload(); await f.command("now"); assert.equal(f.calls.length, 1);
	await f.command("on"); f.pi.setSessionName(""); await flush();
	await f.command("now"); assert.equal(f.calls.length, 1); assert.equal(f.getName(), undefined);
});

test("auto ownership survives reload; later offline/picker rename overrides ownership", async () => {
	const f = fake(); await f.start(); f.turn(); await f.command("now"); await flush();
	await f.reload(); f.turn("新主题", "新答案"); f.provider(() => response("新主题"));
	await f.command("now"); await flush(); assert.equal(f.getName(), "新主题");
	// Picker or --name can append without this extension runtime observing an event.
	f.entries().push({ type: "session_info", id: "picker", name: "新主题" });
	await f.reload(); await f.command("now"); assert.equal(f.calls.length, 2);
	assert.equal(f.state().mode, "pinned");
});

for (const event of ["session_before_switch", "session_before_fork", "session_before_tree", "session_tree", "session_shutdown", "agent_start"]) {
	test(`${event} invalidates an outstanding request without awaiting it`, async () => {
		const f = fake(); const d = deferred(); await f.start(); f.provider(() => d.promise); f.turn();
		await f.emit("agent_settled"); assert.equal(f.calls.length, 1);
		await f.emit(event); assert.equal(f.calls[0].config.signal.aborted, true);
		d.resolve(response("stale")); await flush(); assert.equal(f.getName(), undefined);
	});
}

test("shutdown skips late naming events and commands before touching invalidated context", async () => {
	const f = fake(); await f.start(); f.turn();
	await f.emit("session_shutdown");
	Object.defineProperty(f.ctx, "sessionManager", {
		get() { throw new Error("Pi context is no longer active"); },
	});
	await f.emit("session_info_changed");
	await f.command("status");
	await f.command("now");
	assert.equal(f.calls.length, 0);
	assert.equal(f.notices.length, 0);
});

test("session replacement drops old result and permits new session work", async () => {
	const f = fake(); const old = deferred(); await f.start(); f.provider(() => old.promise); f.turn();
	await f.emit("agent_settled"); await f.replace();
	f.provider(() => response("新会话")); f.turn(); await f.emit("agent_settled"); await flush();
	old.resolve(response("旧会话")); await flush(); assert.equal(f.getName(), "新会话");
});

test("branch changes cannot resurrect older auto ownership after a manual pin", async () => {
	const f = fake(); await f.start(); f.turn(); await f.command("now"); await flush();
	f.pi.setSessionName("已固定"); await f.emit("session_before_tree");
	f.messages([]); await f.emit("session_tree"); await f.reload(); f.turn(); await f.command("now");
	assert.equal(f.calls.length, 1); assert.equal(f.getName(), "已固定");
});

test("deadline aborts; ignored abort cannot land or allow overlapping calls", async (t) => {
	clock(t); const f = fake(); const d = deferred(); await f.start(); f.provider(() => d.promise); f.turn();
	await f.emit("agent_settled"); await f.command("now"); assert.equal(f.calls.length, 1);
	t.mock.timers.tick(20_000); assert.equal(f.calls[0].config.signal.aborted, true);
	await f.command("now"); assert.equal(f.calls.length, 1);
	d.resolve(response("too late")); await flush(); assert.equal(f.getName(), undefined);
	f.turn("下一话题", "回答"); await f.emit("agent_settled"); assert.equal(f.calls.length, 1, "deadline consumes cooldown");
});

const badResults = [
	{ stopReason: "length", content: response("截断").content },
	{ stopReason: "error", content: response("错误").content },
	{ stopReason: "aborted", content: response("取消").content },
	{ stopReason: "toolUse", content: response("工具").content },
	{ stopReason: "stop", content: [{ type: "thinking", thinking: '{"action":"rename","title":"推理"}' }] },
	{ stopReason: "stop", content: [{ type: "text", text: "raw conversation text" }] },
	{ stopReason: "stop", content: [{ type: "text", text: '```json\n{"action":"rename","title":"title"}\n```' }] },
	...['', ' ', 'one\ntwo', 'tab\ttitle', '\x1b[31mred', 'bad\u202Etext', 'long'.repeat(25), ' padded '].map(response),
];
for (const [index, result] of badResults.entries()) {
	test(`invalid/non-success response ${index} never sets a name`, async () => {
		const f = fake(); await f.start(); f.turn(); f.provider(() => result);
		await f.emit("agent_settled"); await flush();
		assert.equal(f.getName(), undefined); assert.ok(f.state().lastAttempt !== null);
	});
}

test("unavailable model has no fallback and throttles later availability", async (t) => {
	clock(t); const f = fake(); await f.start(); f.available(false); f.turn();
	await f.emit("agent_settled"); assert.equal(f.calls.length, 0);
	f.available(true); f.turn("再次讨论", "好的"); await f.emit("agent_settled"); assert.equal(f.calls.length, 0);
	t.mock.timers.tick(600_000); await f.emit("agent_settled"); await flush(); assert.equal(f.calls.length, 1);
});

for (const mode of ["print", "json", "rpc"]) {
	test(`${mode} has no automatic calls; explicit command works`, async () => {
		const f = fake({ mode }); await f.start(); f.turn(); await f.emit("agent_settled");
		assert.equal(f.calls.length, 0); await f.command("now"); await flush(); assert.equal(f.calls.length, 1);
	});
}

test("commands status/on/off/now: explicit opt-in and forced retries, no implicit rename on on", async () => {
	const f = fake({ entries: [{ id: "manual", type: "session_info", name: "Manual" }] });
	await f.start(); f.turn(); await f.command(); assert.match(f.notices.at(-1)!, /pinned/);
	await f.command("on"); assert.equal(f.calls.length, 0);
	await f.command("now"); await flush(); assert.equal(f.getName(), "首个主题");
	await f.command("now"); await flush(); assert.equal(f.calls.length, 2, "now bypasses cooldown intentionally");
	const d = deferred(); f.provider(() => d.promise); await f.command("now");
	await f.command("off"); assert.equal(f.calls[2].config.signal.aborted, true);
	d.resolve(response("unwanted")); await flush(); assert.equal(f.getName(), "首个主题");
	await f.reload(); await f.command("now"); assert.equal(f.calls.length, 3);
	await f.command("bogus"); assert.match(f.notices.at(-1)!, /Usage/);
});

test("file model configuration is fixed until reload and appears in status", async (t) => {
	let config = '{"model":"local/small/model"}';
	t.mock.method(fs, "readFileSync", () => config);
	const f = fake(); await f.start(); f.turn(); await f.command("now"); await flush();
	assert.deepEqual(f.calls[0].model, { provider: "local", id: "small/model" });
	await f.command("status"); assert.match(f.notices.at(-1)!, /local\/small\/model/);

	config = '{"model":"other/new-model"}';
	await f.command("now"); await flush();
	assert.deepEqual(f.calls[1].model, { provider: "local", id: "small/model" });
	await f.reload(); await f.command("now"); await flush();
	assert.deepEqual(f.calls[2].model, { provider: "other", id: "new-model" });
});

test("missing model config preserves the legacy default", async (t) => {
	t.mock.method(fs, "readFileSync", () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); });
	const f = fake(); await f.start(); f.turn(); await f.command("now"); await flush();
	assert.deepEqual(f.calls[0].model, { provider: "openai", id: "gpt-6-luna" });
});

for (const config of ["{", "{}", "null", '{"model":42}', '{"model":"no-provider"}']) {
	test(`invalid model config ${config} disables naming without a fallback`, async (t) => {
		t.mock.method(fs, "readFileSync", () => config);
		const f = fake(); await f.start(); f.turn(); await f.command("now"); await flush();
		assert.equal(f.calls.length, 0);
		assert.match(f.notices.at(-1)!, /Invalid/);
		await f.command("status"); assert.match(f.notices.at(-1)!, /invalid configuration/);
	});
}

test("unreadable model config disables naming without a fallback", async (t) => {
	t.mock.method(fs, "readFileSync", () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
	const f = fake(); await f.start(); f.turn(); await f.command("now"); await flush();
	assert.equal(f.calls.length, 0);
	assert.match(f.notices.at(-1)!, /Invalid/);
});

test("environment overrides file config, supports cooldown, and invalid values fail closed", async (t) => {
	t.mock.method(fs, "readFileSync", () => "{");
	const oldModel = process.env.PI_AUTO_TITLE_MODEL;
	const oldCooldown = process.env.PI_AUTO_TITLE_COOLDOWN_MS;
	t.after(() => {
		if (oldModel === undefined) delete process.env.PI_AUTO_TITLE_MODEL;
		else process.env.PI_AUTO_TITLE_MODEL = oldModel;
		if (oldCooldown === undefined) delete process.env.PI_AUTO_TITLE_COOLDOWN_MS;
		else process.env.PI_AUTO_TITLE_COOLDOWN_MS = oldCooldown;
	});
	process.env.PI_AUTO_TITLE_MODEL = "local/small/model";
	process.env.PI_AUTO_TITLE_COOLDOWN_MS = "0";
	const f = fake(); await f.start(); f.turn(); await f.emit("agent_settled"); await flush();
	assert.deepEqual(f.calls[0].model, { provider: "local", id: "small/model" });
	f.turn("新主题", "讨论"); await f.emit("agent_settled"); await flush(); assert.equal(f.calls.length, 2);
	process.env.PI_AUTO_TITLE_COOLDOWN_MS = "invalid";
	const broken = fake(); await broken.start(); broken.turn(); await broken.command("now");
	assert.equal(broken.calls.length, 0); assert.match(broken.notices.at(-1)!, /Invalid/);
});

test("no requests for empty, user-only, tool-only, or failed assistant activity", async () => {
	const f = fake(); await f.start();
	for (const messages of [
		[],
		[{ role: "user", content: "question" }],
		[{ role: "toolResult", content: [{ type: "text", text: "tool output" }] }],
		[{ role: "user", content: "question" }, { role: "assistant", stopReason: "error", content: [{ type: "text", text: "failed" }] }],
	]) {
		f.messages(messages); await f.emit("agent_settled"); await f.command("now");
	}
	assert.equal(f.calls.length, 0);
});

test("preexisting manual clear is pinned, and rejected abort leaves no unhandled rejection", async () => {
	const empty = fake({ entries: [{ id: "cleared", type: "session_info", name: "" }] });
	await empty.start(); empty.turn(); await empty.command("now"); assert.equal(empty.calls.length, 0);
	const f = fake(); const d = deferred(); await f.start(); f.turn(); f.provider(() => d.promise);
	await f.emit("agent_settled"); await f.emit("session_shutdown");
	d.reject(new Error("aborted")); await flush(); assert.equal(f.getName(), undefined);
});

test("explicit adoption of a long manual title still produces a bounded request", async () => {
	const f = fake({ entries: [{ id: "long-manual", type: "session_info", name: "长".repeat(10_000) }] });
	await f.start(); f.turn(); await f.command("on"); await f.command("now"); await flush();
	assert.equal(JSON.parse(f.calls[0].context.messages[0].content).previousTitle.length, 120);
});
