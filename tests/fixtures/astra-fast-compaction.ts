import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import astraFast from "../../extensions/astra-fast-compaction.ts";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("test-astra-compaction", {
		description: "Offline compaction integration assertions",
		handler: async (_args, realCtx) => {
			const requests: any[] = [];
			const statuses: number[] = [];
			let returnedTier: string | undefined;
			let onRequest: (() => void) | undefined;
			const server = createServer(async (req, res) => {
				let body = "";
				for await (const chunk of req) body += chunk;
				const payload = JSON.parse(body);
				requests.push({ ...payload, requestHeaders: req.headers });
				onRequest?.();
				const status = statuses.shift() ?? 200;
				if (status !== 200) {
					res.writeHead(status, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: { message: status === 400 ? "Unsupported service_tier" : "Server error", type: "api_error" } }));
					return;
				}
				res.writeHead(200, { "content-type": "text/event-stream" });
				const text = "## Goal\nPreserve the project decisions.";
				const item = { id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
				const send = (event: any) => res.write(`data: ${JSON.stringify(event)}\n\n`);
				send({ type: "response.created", response: { id: "resp_test", status: "in_progress" } });
				send({ type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } });
				send({ type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
				send({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text });
				send({ type: "response.output_item.done", output_index: 0, item });
				send({ type: "response.completed", response: {
					id: "resp_test", status: "completed", output: [item], service_tier: returnedTier ?? payload.service_tier,
					usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 } },
				} });
				res.end();
			});
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			try {
				const address = server.address() as { port: number };
				realCtx.modelRegistry.registerProvider("openai", {
					api: "openai-responses",
					baseUrl: `http://127.0.0.1:${address.port}/v1`,
					apiKey: "fake-local-test-key",
					models: [{
						id: "gpt-6-astra", name: "Test Astra", reasoning: true, input: ["text"],
						cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 872000, maxTokens: 128000,
						samplingParams: { service_tier: "priority" },
						samplingParamsByThinkingLevel: { max: { service_tier: "default" } },
						thinkingLevelMap: { max: "max" },
					}],
				});
				const model = realCtx.modelRegistry.find("openai", "gpt-6-astra")!;
				const originalModel = structuredClone(model);
				const notices: any[] = [];
				const streamOptions: any[] = [];
				const settings = {
					retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, provider: { maxRetries: 0, maxRetryDelayMs: 25 } },
					httpIdleTimeoutMs: 10000, websocketConnectTimeoutMs: 2000,
				};
				let hook: any;
				astraFast({
					on: (name, handler) => {
						assert.equal(name, "session_before_compact");
						hook = handler;
					},
					getThinkingLevel: () => "max",
					getSettings: () => structuredClone(settings),
				} as ExtensionAPI);
				const ctx: any = {
					model,
					modelRegistry: {
						streamSimple: (m: any, context: any, options: any) => {
							streamOptions.push(options);
							return realCtx.modelRegistry.streamSimple(m, context, options);
						},
					},
					ui: { notify: (message: string, type: string) => notices.push({ message, type }) },
				};
				const message = (text: string) => ({ role: "user", content: text, timestamp: Date.now() });
				const preparation = () => ({
					firstKeptEntryId: "kept-entry", tokensBefore: 90000,
					messagesToSummarize: [message("Use the existing build system.")],
					turnPrefixMessages: [], isSplitTurn: false,
					fileOps: { read: new Set(["src/read.ts"]), written: new Set(), edited: new Set(["src/edited.ts"]) },
					settings: { enabled: true, reserveTokens: 4000, keepRecentTokens: 20000 },
				});
				const event = (reason = "manual") => ({
					type: "session_before_compact", preparation: preparation(), branchEntries: [],
					customInstructions: "Keep the test command.", reason, willRetry: reason === "overflow",
					signal: new AbortController().signal,
				});
				const ordinary = async () => {
					const response = await realCtx.modelRegistry.streamSimple(model, {
						messages: [message("Ordinary conversation.")],
					}, { reasoning: "max", maxTokens: 500 }).result();
					assert.equal(response.stopReason, "stop", response.errorMessage);
					assert.equal(requests.at(-1).service_tier, "default");
					assert.equal(requests.at(-1).requestHeaders["openai-service-tier"], undefined);
					assert.equal(requests.at(-1).reasoning.effort, "max");
				};

				// Existing conversation-level tier and effort remain intact on both sides.
				await ordinary();
				for (const reason of ["manual", "threshold", "overflow"]) {
					const input = event(reason);
					const result = await hook(input, ctx);
					assert.ok(result.compaction, JSON.stringify(notices));
					assert.equal(requests.at(-1).service_tier, "priority");
					assert.equal(requests.at(-1).requestHeaders["openai-service-tier"], undefined);
					assert.equal(requests.at(-1).reasoning.effort, "max");
					assert.match(JSON.stringify(requests.at(-1)), /Keep the test command/);
					assert.equal(result.compaction.firstKeptEntryId, input.preparation.firstKeptEntryId);
					assert.equal(result.compaction.tokensBefore, input.preparation.tokensBefore);
					assert.equal(result.compaction.usage.totalTokens, 15);
					assert.deepEqual(result.compaction.details, {
						readFiles: ["src/read.ts"], modifiedFiles: ["src/edited.ts"], astraUltrafast: true,
					});
					assert.equal(streamOptions.at(-1).signal, input.signal);
					assert.equal(streamOptions.at(-1).cacheRetention, "none");
					assert.equal(streamOptions.at(-1).timeoutMs, 10000);
					assert.equal(streamOptions.at(-1).maxRetryDelayMs, 25);
					assert.equal(streamOptions.at(-1).websocketConnectTimeoutMs, 2000);
					assert.match(result.compaction.summary, /<modified-files>\nsrc\/edited.ts/);
					await ordinary();
				}

				// Native split-turn summaries, previous summary and combined usage survive.
				const split = event();
				split.preparation.previousSummary = "Previous decision: use Node.";
				split.preparation.isSplitTurn = true;
				split.preparation.turnPrefixMessages = [message("Now implement the feature.")];
				const start = requests.length;
				const splitResult = await hook(split, ctx);
				assert.equal(requests.length - start, 2);
				assert.ok(requests.slice(start).every((r) => r.service_tier === "priority" && r.requestHeaders["openai-service-tier"] === undefined));
				assert.match(JSON.stringify(requests[start]), /Previous decision: use Node/);
				assert.match(splitResult.compaction.summary, /Turn Context \(split turn\)/);
				assert.equal(splitResult.compaction.usage.totalTokens, 30);

				// Restored sessions carry file lists from our hook entry, even after a model switch.
				for (const nextModel of [model, { ...model, id: "gpt-6.1-sol" }, { ...model, provider: "proxy" }, undefined]) {
					const next: any = event();
					next.branchEntries = [{ type: "compaction", fromHook: true, details: {
						astraUltrafast: true, readFiles: ["old/read.ts"], modifiedFiles: ["old/edited.ts"],
					} }];
					const before = requests.length;
					const result = await hook(next, { ...ctx, model: nextModel });
					assert.ok(next.preparation.fileOps.read.has("old/read.ts"));
					assert.ok(next.preparation.fileOps.edited.has("old/edited.ts"));
					if (nextModel === model) {
						assert.ok(result.compaction.details.readFiles.includes("old/read.ts"));
						assert.ok(result.compaction.details.modifiedFiles.includes("old/edited.ts"));
					} else {
						assert.equal(result, undefined);
						assert.equal(requests.length, before);
					}
				}
				const unrelated: any = event();
				unrelated.branchEntries = [{ type: "compaction", fromHook: true, details: { otherExtension: true } }];
				assert.ok((await hook(unrelated, ctx)).compaction);

				// Transient failures still retry, and every attempt retains the tier.
				const retryStart = requests.length;
				statuses.push(503, 200);
				assert.ok((await hook(event(), ctx)).compaction);
				assert.equal(requests.length - retryStart, 2);
				assert.ok(requests.slice(retryStart).every((r) => r.service_tier === "priority" && r.requestHeaders["openai-service-tier"] === undefined));

				// Fast and priority are equivalent service-tier names.
				const priorNotices = notices.length;
				returnedTier = "fast";
				assert.ok((await hook(event(), ctx)).compaction);
				assert.equal(notices.length, priorNotices);

				// Preserve the summary and report a differing tier echo; this alone does not prove a downgrade.
				returnedTier = "default";
				assert.ok((await hook(event(), ctx)).compaction);
				assert.deepEqual(notices.at(-1), {
					message: "Astra compaction requested Fast (priority); provider reported default.", type: "warning",
				});
				returnedTier = undefined;

				// Rejections must not silently fall through to ordinary-tier compaction.
				statuses.push(400);
				assert.deepEqual(await hook(event(), ctx), { cancel: true });
				assert.match(notices.at(-1).message, /Unsupported service_tier/);
				assert.equal(notices.at(-1).type, "error");
				await ordinary();

				// Both already-aborted and in-flight cancellation suppress fallback/notices.
				const abort = new AbortController();
				abort.abort();
				const count = requests.length;
				const noticeCount = notices.length;
				assert.deepEqual(await hook({ ...event(), signal: abort.signal }, ctx), { cancel: true });
				assert.equal(requests.length, count);
				const inFlight = new AbortController();
				onRequest = () => inFlight.abort();
				assert.deepEqual(await hook({ ...event(), signal: inFlight.signal }, ctx), { cancel: true });
				onRequest = undefined;
				assert.equal(notices.length, noticeCount);
				await ordinary();
				assert.deepEqual(model, originalModel);
				console.log("ASTRA_COMPACTION_TESTS_PASSED");
			} catch (error) {
				console.error(error);
				process.exitCode = 1;
			} finally {
				server.closeAllConnections();
				await new Promise<void>((resolve) => server.close(() => resolve()));
				realCtx.shutdown();
			}
		},
	});
}
