import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import responseMetrics from "../extensions/response-metrics/index.ts";

function fixture(t: TestContext, mode = "tui", hasUI = mode !== "print" && mode !== "json") {
	t.mock.timers.enable({ apis: ["setInterval"] });
	let now = 1_000;
	t.mock.method(performance, "now", () => now);
	const handlers = new Map<string, ((event: any, ctx: any) => unknown)[]>();
	const statuses = new Map<string, string>([["another-extension", "unchanged"]]);
	const writes: (string | undefined)[] = [];
	const ctx = {
		mode, hasUI,
		ui: {
			setStatus(key: string, text: string | undefined) {
				assert.equal(mode, "tui", "no status UI in non-TUI modes");
				assert.equal(hasUI, true);
				if (text === undefined) statuses.delete(key);
				else statuses.set(key, text);
				writes.push(text);
			},
		},
	};
	responseMetrics({
		on(name: string, handler: (event: any, ctx: any) => unknown) {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
			return () => handlers.set(name, list.filter(h => h !== handler));
		},
	} as any);
	const message = (output: number | undefined, stopReason = "stop") => ({
		role: "assistant", content: [], usage: { input: 0, output }, stopReason,
	});
	const emit = (type: string, fields = {}) =>
		(handlers.get(type) ?? []).map(handler => handler({ type, ...fields }, ctx));
	const delta = (text: string, type = "text_delta") =>
		emit("message_update", { message: message(0), assistantMessageEvent: { type, delta: text, contentIndex: 0 } });
	const start = () => {
		emit("turn_start");
		emit("before_provider_request", { payload: { model: "fixture" } });
		emit("message_start", { message: message(0) });
	};
	const end = (output: number | undefined, stopReason = "stop") =>
		emit("message_end", { message: message(output, stopReason) });
	const advance = (ms: number) => { now += ms; t.mock.timers.tick(ms); };
	t.after(() => emit("session_shutdown"));
	return { emit, delta, start, end, advance, writes, statuses, ctx, text: () => statuses.get("response-metrics") };
}

test("live TPS keeps the complete output window through a 13-second silence; final usage replaces the estimate", (t) => {
	const f = fixture(t);
	f.start();
	f.advance(1_000);
	f.delta("x".repeat(400)); // 100 estimated tokens.
	f.advance(1_000);
	assert.equal(f.text(), "TTFT 1.0s · TPS ~100.0 tok/s · 耗时 2.0s");
	f.advance(13_000);
	assert.equal(f.text(), "TTFT 1.0s · TPS ~7.1 tok/s · 耗时 15.0s");
	f.end(425);
	assert.equal(f.text(), "TTFT 1.0s · TPS 30.4 tok/s · 耗时 15.0s");
	assert.equal(f.statuses.get("another-extension"), "unchanged");
});

test("start markers and empty deltas do not end TTFT; request timing excludes pre-request preparation", (t) => {
	const f = fixture(t);
	f.emit("turn_start");
	f.advance(5_000);
	f.emit("before_provider_request", { payload: {} });
	f.emit("message_start", { message: { role: "assistant" } });
	for (const type of ["text_start", "thinking_start", "toolcall_start", "text_delta", "thinking_delta", "toolcall_delta"]) {
		f.delta("", type);
	}
	f.advance(1_000);
	assert.equal(f.text(), "TTFT … · TPS — · 耗时 1.0s");
	f.delta("data");
	f.advance(1_000);
	f.end(10);
	assert.equal(f.text(), "TTFT 1.0s · TPS 10.0 tok/s · 耗时 2.0s");
});

for (const type of ["text_delta", "thinking_delta", "toolcall_delta"]) {
	test(`nonempty ${type} starts the same output clock`, (t) => {
		const f = fixture(t);
		f.start();
		f.advance(500);
		f.delta("abcd", type);
		f.advance(1_000);
		assert.equal(f.text(), "TTFT 0.5s · TPS ~1.0 tok/s · 耗时 1.5s");
	});
}

test("live estimate accumulates UTF-8 bytes without per-delta rounding", (t) => {
	const f = fixture(t);
	for (const chunks of [["中文"], ["中", "文"]]) {
		f.start();
		for (const chunk of chunks) f.delta(chunk);
		f.advance(1_000);
		assert.match(f.text()!, /TPS ~1.5 tok\/s/);
		f.end(undefined);
		assert.match(f.text()!, /TPS ~1.5 tok\/s/);
	}
	f.start();
	for (const char of "abcd") f.delta(char);
	f.advance(1_000);
	assert.match(f.text()!, /TPS ~1.0 tok\/s/);
});

test("timer refreshes at 250 ms without requiring another delta", (t) => {
	const f = fixture(t);
	f.start();
	f.delta("abcd");
	f.advance(250);
	assert.match(f.text()!, /TPS ~4.0 tok\/s/);
	const previous = f.text();
	f.advance(249);
	assert.equal(f.text(), previous);
	f.advance(1);
	assert.match(f.text()!, /TPS ~2.0 tok\/s/);
});

test("message end freezes the sample before tools; the next response starts independently", (t) => {
	const f = fixture(t);
	f.start();
	f.advance(1_000);
	f.delta("data");
	f.advance(2_000);
	f.end(100);
	const frozen = f.text();
	const writes = f.writes.length;
	f.emit("before_provider_request", { payload: { model: "nested-tool-request" } });
	f.emit("message_start", { message: { role: "toolResult" } });
	f.emit("message_end", { message: { role: "toolResult", usage: { output: 9999 } } });
	f.advance(60_000);
	f.emit("turn_end");
	f.emit("agent_end");
	assert.equal(f.text(), frozen);
	assert.equal(f.writes.length, writes);
	f.start();
	assert.equal(f.text(), "TTFT … · TPS — · 耗时 0.0s");
	f.advance(500);
	f.delta("next");
	f.advance(1_000);
	f.end(20);
	assert.equal(f.text(), "TTFT 0.5s · TPS 20.0 tok/s · 耗时 1.5s");
});

test("repeated request hooks reset the attempt and preserve the payload", (t) => {
	const f = fixture(t);
	f.emit("before_provider_request", { payload: {} });
	assert.equal(f.text(), undefined, "idle/background request has no sample");
	f.start();
	f.advance(1_000);
	f.delta("x".repeat(400));
	f.advance(1_000);
	const payload = Object.freeze({ model: "fixture", temperature: 0.7 });
	assert.deepEqual(f.emit("before_provider_request", { payload }), [undefined]);
	assert.deepEqual(payload, { model: "fixture", temperature: 0.7 });
	assert.equal(f.text(), "TTFT … · TPS — · 耗时 0.0s");
	f.advance(1_000);
	f.delta("abcd");
	f.advance(1_000);
	f.end(10);
	assert.equal(f.text(), "TTFT 1.0s · TPS 10.0 tok/s · 耗时 2.0s");
});

test("request hook also works after message_start, without a second clock or timer", (t) => {
	const f = fixture(t);
	f.emit("turn_start");
	f.emit("message_start", { message: { role: "assistant" } });
	f.advance(1_000);
	f.emit("before_provider_request", { payload: {} });
	f.advance(500);
	f.delta("abcd");
	f.advance(1_000);
	f.end(10);
	assert.equal(f.text(), "TTFT 0.5s · TPS 10.0 tok/s · 耗时 1.5s");
});

test("missing request hook leaves latency and total unavailable, while output TPS keeps its defined window", (t) => {
	const f = fixture(t);
	f.emit("turn_start");
	f.emit("message_start", { message: { role: "assistant" } });
	assert.equal(f.text(), "TTFT — · TPS — · 耗时 —");
	f.advance(500);
	assert.equal(f.text(), "TTFT — · TPS — · 耗时 —");
	f.delta("abcd");
	f.advance(1_000);
	f.end(10);
	assert.equal(f.text(), "TTFT — · TPS 10.0 tok/s · 耗时 —");
});

test("missing, zero or nonfinite final usage keeps the estimate visibly approximate", (t) => {
	const f = fixture(t);
	for (const usage of [undefined, 0, -1, NaN, Infinity]) {
		f.start();
		f.delta("abcd");
		f.advance(1_000);
		f.end(usage);
		assert.match(f.text()!, /TPS ~1.0 tok\/s/);
	}
	f.start();
	f.delta("abcd");
	f.advance(1_000);
	f.emit("message_end", { message: { role: "assistant", stopReason: "stop" } });
	assert.match(f.text()!, /TPS ~1.0 tok\/s/);
});

test("no streamed output or zero output interval is unavailable; positive short intervals are not capped", (t) => {
	const f = fixture(t);
	f.start();
	f.advance(2_000);
	f.end(100);
	assert.equal(f.text(), "TTFT — · TPS — · 耗时 2.0s");
	f.start();
	f.delta("data");
	f.end(100);
	assert.match(f.text()!, /TPS —/);
	f.start();
	f.delta("data");
	f.advance(1);
	f.end(100);
	assert.match(f.text()!, /TPS 100000.0 tok\/s/);
});

for (const [reason, label] of [["aborted", "已中断"], ["error", "错误"]]) {
	test(`${reason} labels the partial result and stops the timer`, (t) => {
		const f = fixture(t);
		f.start();
		f.delta("data");
		f.advance(1_000);
		f.end(0, reason);
		assert.match(f.text()!, new RegExp(`TPS ~1.0 tok/s.*${label}$`));
		const frozen = f.text(), writes = f.writes.length;
		f.advance(30_000);
		assert.equal(f.text(), frozen);
		assert.equal(f.writes.length, writes);
	});
}

for (const event of ["session_start", "session_tree", "model_select", "session_shutdown", "turn_end", "agent_end"]) {
	test(`${event} cleans up an unfinished response`, (t) => {
		const f = fixture(t);
		f.start();
		f.delta("data");
		f.advance(1_000);
		f.emit(event);
		assert.equal(f.text(), undefined);
		const writes = f.writes.length;
		f.advance(30_000);
		assert.equal(f.writes.length, writes);
		assert.equal(f.statuses.get("another-extension"), "unchanged");
	});
}

for (const [mode, hasUI] of [["rpc", true], ["json", false], ["print", false], ["tui", false]] as const) {
	test(`${mode}/hasUI=${hasUI} remains inert`, (t) => {
		const f = fixture(t, mode, hasUI);
		f.start();
		f.delta("data");
		f.advance(1_000);
		f.end(100);
		f.emit("agent_end");
		f.emit("session_shutdown");
		assert.equal(f.writes.length, 0);
	});
}

test("observing a frozen assistant event never mutates its content", (t) => {
	const f = fixture(t);
	f.start();
	const message = Object.freeze({
		role: "assistant",
		content: Object.freeze([Object.freeze({ type: "thinking", thinking: "keep this" })]),
	});
	const update = Object.freeze({ type: "thinking_delta", delta: "keep this", contentIndex: 0 });
	f.emit("message_update", { message, assistantMessageEvent: update });
	f.advance(1_000);
	assert.equal(message.content[0].thinking, "keep this");
	assert.match(f.text()!, /TPS ~/);
});
