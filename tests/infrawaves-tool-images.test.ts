import assert from "node:assert/strict";
import { test } from "node:test";
import toolImages from "../extensions/infrawaves-tool-images.ts";

const opus = { provider: "infrawaves", api: "anthropic-messages", id: "claude-opus-5.5" };
const image = (data: string) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });
const text = (value: string) => ({ type: "text", text: value });
const result = (id: string, content: unknown) => ({ type: "tool_result", tool_use_id: id, content, is_error: false });
const payload = (content: unknown[]) => ({ model: opus.id, messages: [{ role: "user", content }] });

function freeze<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) freeze(child);
		Object.freeze(value);
	}
	return value;
}

function fixture(model: typeof opus | undefined = opus) {
	let hook: any;
	const ctx: any = { model };
	toolImages({
		on: (name: string, handler: any) => {
			assert.equal(name, "before_provider_request");
			hook = handler;
		},
	} as any);
	return {
		hook: (body: unknown) => hook({ type: "before_provider_request", payload: body }, ctx),
		send: (body: unknown) => hook({ type: "before_provider_request", payload: body }, ctx) ?? body,
		select: (model: typeof opus | undefined) => { ctx.model = model; },
	};
}

test("promotes a tool image without changing its bytes, result metadata or source payload", () => {
	const picture = image("original-image-bytes");
	const tool = { ...result("read_one", [text("original note"), picture]), extra: "keep" };
	const body = freeze(payload([tool]));
	const before = JSON.stringify(body);
	const outgoing = fixture().send(body);
	const blocks = outgoing.messages[0].content;
	assert.deepEqual(blocks[0], { ...tool, content: [text("original note")] });
	assert.equal(blocks[1].type, "text");
	assert.match(blocks[1].text, /read_one/);
	assert.deepEqual(blocks[2], picture);
	assert.equal(JSON.stringify(body), before);
});

test("promoted successful images stay before native error-image captions and attachments", () => {
	const success = image("success-first");
	const failed = { ...image("partial-error-second"), cache_control: { type: "ephemeral" } };
	const errorCaption = text("Image from failed tool result failed_read:");
	const body = freeze(payload([
		result("success_read", [text("success"), success]),
		{ ...result("failed_read", "partial failure"), is_error: true },
		errorCaption, failed,
	]));
	const outgoing = fixture().send(body);
	const blocks = outgoing.messages[0].content;
	assert.deepEqual(blocks.filter((b: any) => b.type === "image").map((b: any) => b.source.data),
		["success-first", "partial-error-second"]);
	assert.deepEqual(blocks.slice(0, 2).map((b: any) => b.tool_use_id), ["success_read", "failed_read"]);
	assert.deepEqual(blocks.slice(-2), [errorCaption, failed]);
	assert.equal(blocks[1].is_error, true);
	assert.equal(JSON.stringify(outgoing).match(/"cache_control"/g)?.length, 1);
});

test("parallel tool results stay first, with images attributed and ordered by result", () => {
	const a = image("first"), b = image("second"), c = image("third");
	const body = freeze(payload([
		result("read_a", [text("before"), a, text("between"), b]),
		result("read_b", [c]),
		result("no_image", "plain result"),
	]));
	const blocks = fixture().send(body).messages[0].content;
	assert.deepEqual(blocks.slice(0, 3).map((b: any) => b.tool_use_id), ["read_a", "read_b", "no_image"]);
	assert.deepEqual(blocks[0].content, [text("before"), text("between")]);
	assert.ok(blocks[1].content.some((b: any) => b.type === "text" && b.text.trim()), "image-only results retain a text placeholder");
	assert.deepEqual(blocks.filter((b: any) => b.type === "image"), [a, b, c]);
	const tail = blocks.slice(3);
	assert.equal(tail[0].type, "text");
	assert.match(tail[0].text, /read_a/);
	assert.deepEqual(tail.slice(1, 3), [a, b]);
	assert.equal(tail[3].type, "text");
	assert.match(tail[3].text, /read_b/);
	assert.deepEqual(tail[4], c);
});

test("preserves unrelated request fields, user attachments, assistant content and non-image tool blocks", () => {
	const attachment = image("user-attachment");
	const document = { type: "document", source: { type: "text", media_type: "text/plain", data: "document" } };
	const tool = result("mixed", [text("note"), document, image("tool-image")]);
	const body = freeze({
		...payload([tool, attachment]),
		system: [text("system")], tools: [{ name: "read" }], max_tokens: 2048,
		thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "max" },
		stream: true, metadata: { user_id: "test" },
	});
	const outgoing = fixture().send(body);
	const { messages: _before, ...settings } = body;
	const { messages: _after, ...actualSettings } = outgoing;
	assert.deepEqual(actualSettings, settings);
	assert.deepEqual(outgoing.messages[0].content[0].content, [text("note"), document]);
	assert.deepEqual(outgoing.messages[0].content.at(-1), attachment);
	assert.deepEqual(outgoing.messages[0].content.filter((b: any) => b.type === "image").map((b: any) => b.source.data),
		["tool-image", "user-attachment"]);
	assert.equal(outgoing.messages[0].content.filter((b: any) => b.type === "image").length, 2);
});

for (const terminal of ["image-result", "text-result", "user-image"]) {
	test(`keeps the cache boundary after all moved images when it was on ${terminal}`, () => {
		const marker = { type: "ephemeral", ttl: "1h" };
		const content: any[] = [result("pictured", [text("note"), image("picture")])];
		if (terminal === "text-result") content.push(result("text_only", "done"));
		if (terminal === "user-image") content.push(image("existing user image"));
		content.at(-1).cache_control = marker;
		const body = freeze(payload(content));
		const outgoing = fixture().send(body);
		const blocks = outgoing.messages[0].content;
		assert.deepEqual(blocks.at(-1).cache_control, marker);
		assert.equal(blocks.at(-1).type, "image");
		assert.equal(JSON.stringify(outgoing).match(/"cache_control"/g)?.length, 1);
		assert.deepEqual(content.at(-1).cache_control, marker, "source cache marker was not removed");
	});
}

test("history is transformed per request, leaving message order and assistant/tool ids intact", () => {
	const body = freeze({
		model: opus.id,
		messages: [
			{ role: "assistant", content: [{ type: "tool_use", id: "first", name: "read", input: {} }] },
			{ role: "user", content: [result("first", [text("one"), image("old")])] },
			{ role: "assistant", content: [text("Intermediate answer")] },
			{ role: "user", content: [text("Next request")] },
			{ role: "assistant", content: [{ type: "tool_use", id: "second", name: "read", input: {} }] },
			{ role: "user", content: [result("second", [text("two"), image("new")])] },
		],
	});
	const before = JSON.stringify(body);
	const outgoing = fixture().send(body);
	assert.deepEqual(outgoing.messages.map((m: any) => m.role), body.messages.map((m) => m.role));
	for (const index of [0, 2, 3, 4]) assert.deepEqual(outgoing.messages[index], body.messages[index]);
	for (const [index, bytes] of [[1, "old"], [5, "new"]] as const) {
		assert.equal(outgoing.messages[index].content[0].content.some((b: any) => b.type === "image"), false);
		assert.equal(outgoing.messages[index].content.at(-1).source.data, bytes);
	}
	assert.equal(JSON.stringify(body), before);
});

test("repeated sends do not duplicate images or captions", () => {
	const f = fixture();
	const body = freeze(payload([result("read", [text("note"), image("bytes")])]));
	const once = f.send(body);
	assert.deepEqual(f.send(body), once);
	assert.equal(f.hook(freeze(once)), undefined, "already-compatible payloads pass through");
});

test("uses the current model on every request and is inert outside the tested provider/api/model", () => {
	const f = fixture();
	const body = freeze(payload([result("read", [image("bytes")])]));
	assert.notEqual(f.hook(body), undefined);
	for (const model of [
		{ ...opus, provider: "anthropic" },
		{ ...opus, id: "claude-sonnet-5" },
		{ ...opus, api: "openai-responses" },
		undefined,
	]) {
		f.select(model);
		assert.equal(f.hook(body), undefined);
	}
	f.select(opus);
	assert.notEqual(f.hook(body), undefined);
	assert.equal(f.hook({ ...body, model: "different-physical-model" }), undefined);
});

test("text-only, top-level images, native error-image placement and unknown shapes pass through", () => {
	const f = fixture();
	for (const body of [
		null, [], {}, { model: opus.id, messages: null },
		{ model: opus.id, messages: [{ role: "assistant", content: [image("do-not-touch")] }] },
		payload([text("ordinary text"), image("already top-level")]),
		payload([result("read", "ordinary tool text")]),
		payload([{ ...result("failed", [text("error")]), is_error: true }, text("error images"), image("already promoted")]),
		payload([null, { type: "unknown" }, { type: "tool_result", content: [image("missing id")] }]),
	]) assert.equal(f.hook(freeze(body)), undefined);
});

test("retains is_error if a preceding hook supplies an image in an error result", () => {
	const body = freeze(payload([{ ...result("failed_read", [text("partial failure"), image("partial screenshot")]), is_error: true }]));
	const blocks = fixture().send(body).messages[0].content;
	assert.equal(blocks[0].is_error, true);
	assert.deepEqual(blocks[0].content, [text("partial failure")]);
	assert.deepEqual(blocks.at(-1), image("partial screenshot"));
});
