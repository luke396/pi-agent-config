// Adapted from @luan.sh/pi-collapse-transcript 0.3.6 test/queued-request.test.ts.
// MIT (c) 2026 Luan Santos; see ../../extensions/collapse-transcript/LICENSE.
// Assertions run inside the installed Pi to use its actual native components.
import assert from "node:assert/strict";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

const cases: { name: string; run: () => void | Promise<void> }[] = [];
function test(name: string, run: () => void | Promise<void>): void { cases.push({ name, run }); }
let theme: Theme;

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
	type AgentSession,
	createAgentSession,
	createReadToolDefinition,
	DefaultResourceLoader,
	initTheme,
	ModelRuntime,
	SessionManager,
	SettingsManager,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { Container, ProcessTerminal, Text, TuiAltScreen } from "@earendil-works/pi-tui";
import transcriptExtension from "../../extensions/collapse-transcript/index.ts";

class TestTui extends TuiAltScreen {
	requestRender(): void {}
}

for (const queue of ["followUp", "steer"] as const) test(
	`${queue} keeps requests compact and live without agent settlement`,
	async () => {
		initTheme("dark", false);
		const root = await mkdtemp(join(tmpdir(), "pi-queued-transcript-"));
		const tui = new TestTui(new ProcessTerminal());
		const document = new Container();
		const chat = new Container();
		document.addChild(new Container());
		document.addChild(new Container());
		document.addChild(chat);
		tui.addChild(document);
		const rendered = () => stripTerminalSequences(document.render(100).join("\n"));
		const append = (id: string, text: string) => {
			const tool = new ToolExecutionComponent("read", id, {}, {}, undefined, tui, root);
			tool.updateResult({ content: [{ type: "text", text }], isError: false });
			chat.addChild(tool);
		};
		const runtime = await ModelRuntime.create({
			authPath: join(root, "auth.json"),
			modelsPath: null,
			modelsStorePath: join(root, "models.json"),
			refreshOnCreate: false,
		});
		const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
		let session: AgentSession;
		let step = 0;
		const observations: string[] = [];
		runtime.registerProvider("queued-transcript", {
			baseUrl: "https://test.invalid",
			apiKey: "fixture",
			api: "openai-responses",
			models: [
				{
					id: "fixture",
					name: "Fixture",
					reasoning: false,
					input: ["text"],
					cost,
					contextWindow: 10000,
					maxTokens: 1000,
				},
			],
			streamSimple(model) {
				const stream = createAssistantMessageEventStream();
				queueMicrotask(async () => {
					const first = step++ === 0;
					if (first) {
						append("first", "FIRST REQUEST OUTPUT");
						observations.push(rendered());
						await session[queue]("Second request");
					} else {
						append("second", "SECOND REQUEST OUTPUT");
						observations.push(rendered());
					}
					const stopReason = first && queue === "steer" ? "toolUse" : "stop";
					const message: AssistantMessage = {
						role: "assistant",
						api: model.api,
						provider: model.provider,
						model: model.id,
						content:
							stopReason === "toolUse"
								? [{ type: "toolCall", id: "fixture-call", name: "fixture", arguments: { path: "example" } }]
								: [{ type: "text", text: "Answered" }],
						stopReason,
						usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { ...cost, total: 0 } },
						timestamp: 0,
					};
					stream.push({ type: "done", reason: stopReason, message });
					stream.end();
				});
				return stream;
			},
		});
		const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
		const loader = new DefaultResourceLoader({
			cwd: root,
			agentDir: root,
			settingsManager: settings,
			noExtensions: true,
			noSkills: true,
			noThemes: true,
			noContextFiles: true,
			noPromptTemplates: true,
			extensionFactories: [
				transcriptExtension,
				(pi) => {
					pi.on("message_start", (event) => {
						if (event.message.role === "user") chat.addChild(new Text("User request", 0, 0));
					});
					pi.registerTool({
						name: "fixture",
						label: "Fixture",
						description: "Queue boundary fixture",
						parameters: createReadToolDefinition(root).parameters,
						execute: async () => ({ content: [{ type: "text", text: "Completed step" }], details: {} }),
					});
				},
			],
		});
		await loader.reload();
		({ session } = await createAgentSession({
			cwd: root,
			agentDir: root,
			modelRuntime: runtime,
			settingsManager: settings,
			resourceLoader: loader,
			sessionManager: SessionManager.inMemory(root),
			model: runtime.getModel("queued-transcript", "fixture"),
		}));
		try {
			await session.bindExtensions({
				mode: "tui",
				uiContext: {
					...session.extensionRunner.getUIContext(),
					setWidget(_key, content) {
						if (typeof content === "function") content(tui, theme);
					},
				},
			});
			await session.prompt("First request");
			assert.equal((observations).length, 2);
			for (const observation of observations) {
				assert.ok((observation).includes("Working · read · 1 step"));
				assert.ok(!(observation).includes("FIRST REQUEST OUTPUT"));
				assert.ok(!(observation).includes("SECOND REQUEST OUTPUT"));
			}
			assert.ok((observations[1]).includes("Worked · read · 1 step"));
			assert.ok(!(rendered()).includes("Working"));
		} finally {
			await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
			session.dispose();
			await rm(root, { recursive: true, force: true });
		}
	},
);

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("test-collapse-queued-request", {
		description: "Offline inherited folding contract assertions",
		handler: async (_args, ctx) => {
			theme = ctx.ui.theme;
			try {
				for (const { name, run } of cases) {
					await run();
					console.log(`PASS ${name}`);
				}
				console.log("COLLAPSE_QUEUED_TESTS_PASSED");
			} catch (error) {
				console.error(error);
				process.exitCode = 1;
			} finally {
				ctx.shutdown();
			}
		},
	});
}
