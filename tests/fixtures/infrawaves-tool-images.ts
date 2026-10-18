import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import toolImages from "../../extensions/infrawaves-tool-images.ts";

const modelId = "claude-opus-5.5";
// Valid 2×2 RGB PNG: exercise native image decoding, not just TUI image framing.
const png = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==";
const errorPng = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGNg+M8AQhAKABvyA/1tVLjHAAAAAElFTkSuQmCC";

export default async function (pi: ExtensionAPI) {
	const requests: any[] = [];
	let imagePath = "";
	let errorImagePath = "";
	const server = createServer(async (req, res) => {
		let raw = "";
		for await (const chunk of req) raw += chunk;
		const body = JSON.parse(raw);
		const turn = requests.length;
		requests.push(body);
		res.writeHead(200, { "content-type": "text/event-stream" });
		const send = (event: any) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
		send({ type: "message_start", message: {
			id: `msg_${turn}`, type: "message", role: "assistant", model: body.model, content: [],
			stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 },
		} });
		const read = (id: string) => ({ type: "tool_use", id, name: "read", input: { path: imagePath } });
		const content = turn === 0 ? [
			read("read_one"),
			{ type: "tool_use", id: "code_one", name: "codemode", input: {
				code: `image(await tools.read({path: ${JSON.stringify(imagePath)}})); image(await tools.read({path: ${JSON.stringify(imagePath)}}));`,
			} },
			{ type: "tool_use", id: "code_error", name: "codemode", input: {
				code: `image(await tools.read({path: ${JSON.stringify(errorImagePath)}})); throw new Error("fixture partial failure");`,
			} },
		] : turn === 1 ? [read("read_next")] : [{ type: "text", text: "fixture complete" }];
		for (const [index, block] of content.entries()) {
			send({ type: "content_block_start", index, content_block: block.type === "tool_use"
				? { ...block, input: {} } : { type: "text", text: "" } });
			send({ type: "content_block_delta", index, delta: block.type === "tool_use"
				? { type: "input_json_delta", partial_json: JSON.stringify(block.input) }
				: { type: "text_delta", text: block.text } });
			send({ type: "content_block_stop", index });
		}
		send({ type: "message_delta", delta: { stop_reason: turn < 2 ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
		send({ type: "message_stop" });
		res.end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as { port: number };
	for (const provider of ["infrawaves", "other-infrawaves-test"]) {
		pi.registerProvider(provider, {
			api: "anthropic-messages", baseUrl: `http://127.0.0.1:${port}`, apiKey: "fake-local-test-key",
			models: [{
				id: modelId, name: "Offline image fixture", reasoning: false, input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 200000, maxTokens: 1024,
			}],
		});
	}
	toolImages(pi);
	const close = () => {
		server.closeAllConnections();
		server.close();
	};
	pi.on("session_shutdown", close);

	function checkImages(body: any, top: number, nested: number) {
		const userBlocks = body.messages.filter((m: any) => m.role === "user")
			.flatMap((m: any) => Array.isArray(m.content) ? m.content : []);
		const topImages = userBlocks.filter((b: any) => b.type === "image");
		const results = userBlocks.filter((b: any) => b.type === "tool_result");
		const nestedImages = results.flatMap((r: any) => Array.isArray(r.content) ? r.content : [])
			.filter((b: any) => b.type === "image");
		assert.equal(topImages.length, top, JSON.stringify(results.map((r: any) => ({
			id: r.tool_use_id, error: r.is_error, content: r.content,
		})), (key, value) => key === "data" ? "[image bytes]" : value));
		assert.equal(nestedImages.length, nested);
		for (const img of [...topImages, ...nestedImages]) {
			assert.equal(img.source.type, "base64");
			assert.equal(img.source.media_type, "image/png");
			assert.ok([png, errorPng].includes(img.source.data));
		}
		if (nested === 0 && top >= 4)
			assert.deepEqual(topImages.slice(0, 4).map((img: any) => img.source.data), [png, png, png, errorPng]);
		return results;
	}

	pi.registerCommand("test-infrawaves-images", {
		description: "Offline Anthropic image request compatibility assertions",
		handler: async (_args, ctx) => {
			try {
				imagePath = path.join(ctx.cwd, "fixture.png");
				writeFileSync(imagePath, Buffer.from(png, "base64"));
				errorImagePath = path.join(ctx.cwd, "error-fixture.png");
				writeFileSync(errorImagePath, Buffer.from(errorPng, "base64"));
				await pi.sendUserMessage("Inspect the image fixture.", { triggerTurn: true });
				await ctx.waitForIdle();
				assert.equal(requests.length, 3, "expected two tool rounds and a final answer");
				const firstResults = checkImages(requests[1], 4, 0);
				assert.deepEqual(firstResults.map((r: any) => r.tool_use_id), ["read_one", "code_one", "code_error"]);
				assert.deepEqual(firstResults.map((r: any) => r.is_error), [false, false, true]);
				assert.deepEqual(checkImages(requests[2], 5, 0).map((r: any) => r.tool_use_id), ["read_one", "code_one", "code_error", "read_next"]);
				for (const body of requests.slice(1, 3)) {
					const last = body.messages.at(-1).content;
					assert.equal(last[0].type, "tool_result");
					assert.equal(last.at(-1).type, "image");
					assert.equal(last.at(-1).cache_control.type, "ephemeral");
				}
				const savedResults = ctx.sessionManager.getBranch().flatMap((e) =>
					e.type === "message" && e.message.role === "toolResult" ? [e.message] : []);
				assert.deepEqual(savedResults.map((r) => r.content.filter((b) => b.type === "image").length), [1, 2, 1, 1]);
				const saved = JSON.stringify(savedResults);

				const other = ctx.modelRegistry.find("other-infrawaves-test", modelId);
				assert.ok(other);
				assert.equal(await pi.setModel(other), true);
				await pi.sendUserMessage("Continue without tools.", { triggerTurn: true });
				await ctx.waitForIdle();
				assert.equal(requests.length, 4);
				checkImages(requests[3], 1, 4);

				const target = ctx.modelRegistry.find("infrawaves", modelId);
				assert.ok(target);
				assert.equal(await pi.setModel(target), true);
				await pi.sendUserMessage("Continue without tools.", { triggerTurn: true });
				await ctx.waitForIdle();
				assert.equal(requests.length, 5);
				checkImages(requests[4], 5, 0);
				assert.equal(JSON.stringify(savedResults), saved);
				assert.equal(ctx.sessionManager.getBranch().some((e) =>
					e.type === "message" && JSON.stringify(e.message.content).includes("Images from tool result")), false);
				console.log("INFRAWAVES_IMAGE_TESTS_PASSED");
			} catch (error) {
				console.error(error);
				process.exitCode = 1;
			} finally {
				close();
			}
		},
	});
}
