// Drives the real `/tier` command through Pi's agent loop against a loopback
// OpenAI endpoint and asserts the request the provider would have received.
// Only a loopback fake API is used; no credentials or network calls are needed.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import openaiServiceTier from "../../extensions/openai-service-tier.ts";

type RecordedRequest = { body: any; headers: Record<string, string | string[] | undefined> };

export default async function (pi: ExtensionAPI) {
	const requests: RecordedRequest[] = [];
	let replyOpen = true;
	const server = createServer(async (req, res) => {
		let raw = "";
		for await (const chunk of req) raw += chunk;
		const body = raw ? JSON.parse(raw) : {};
		if (replyOpen) requests.push({ body, headers: req.headers });
		res.writeHead(200, { "content-type": "text/event-stream" });
		const text = "ok";
		const item = { id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
		const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
		send({ type: "response.created", response: { id: "resp_test", status: "in_progress" } });
		send({ type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } });
		send({ type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
		send({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text });
		send({ type: "response.output_item.done", output_index: 0, item });
		send({ type: "response.completed", response: {
			id: "resp_test", status: "completed", output: [item], service_tier: body.service_tier,
			usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 } },
		} });
		res.end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as { port: number };
	pi.registerProvider("openai", {
		api: "openai-responses",
		baseUrl: `http://127.0.0.1:${port}/v1`,
		apiKey: "fake-local-test-key",
		models: [{
			id: "gpt-6-astra", name: "Test Astra", reasoning: true, input: ["text"],
			cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 872000, maxTokens: 128000,
			thinkingLevelMap: { max: "max" },
		}],
	});

	// The extension under test keeps its own command handler private, so capture
	// it through the registration it makes.
	let setTier: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	openaiServiceTier({
		on: (name: string, handler: any) => pi.on(name as never, handler),
		registerCommand: (name: string, definition: any) => {
			if (name === "tier") setTier = definition.handler;
			pi.registerCommand(name, definition);
		},
	} as ExtensionAPI);

	pi.registerCommand("tier-offline", {
		description: "Set a tier, run one turn, and assert the outgoing request",
		handler: async (args, ctx) => {
			try {
				assert.ok(setTier, "the extension did not register /tier");
				const tier = args.trim();
				// Assert on the command's own notice so an argument the command
				// refuses cannot pass this fixture as "no tier sent".
				const notices: string[] = [];
				await setTier(tier, {
					model: ctx.model,
					ui: { notify: (message: string) => notices.push(message), setStatus: () => {} },
				} as never);
				assert.deepEqual(notices, [tier === "fast" ? "Fast mode: on" : "Fast mode: off"]);
				await pi.sendUserMessage("Reply with the single word ok.", { triggerTurn: true });
				await ctx.waitForIdle();
				const request = requests.at(-1);
				assert.ok(request, "no provider request reached the loopback endpoint");
				assert.equal(request.body.model, "gpt-6-astra");
				assert.equal(request.body.service_tier, tier === "fast" ? "priority" : undefined);
				// Fast is a body field; the Ultrafast routing header is not part of this switch.
				assert.equal(request.headers["openai-service-tier"], undefined);
				console.log(`OPENAI_SERVICE_TIER_TESTS_PASSED ${tier}`);
			} catch (error) {
				console.error(error);
				process.exitCode = 1;
			} finally {
				replyOpen = false;
				server.closeAllConnections();
				await new Promise<void>((resolve) => server.close(() => resolve()));
			}
		},
	});
}
