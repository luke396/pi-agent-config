// Exercises the installed package in Pi's real extension runtime, without a model.
// All inputs, session files, and stores belong to the test's private temp agentDir.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import loadHermes from "../../extensions/hermes-memory.ts";

const ORIGINAL = "验收偏好：示例颜色使用青色。";
const UPDATED = "验收偏好：示例颜色改为紫色。";
const PROJECT_A = "验收项目甲专属约定：仅本项目使用纸鹤标记。";

export default async function (pi: ExtensionAPI) {
	const tools = new Map<string, any>();
	const beforeStart: any[] = [];
	await loadHermes({
		...pi,
		registerTool(tool) {
			tools.set(tool.name, tool);
			return pi.registerTool(tool);
		},
		on(event, handler) {
			if (event === "before_agent_start") beforeStart.push(handler);
			return pi.on(event as any, handler as any);
		},
	});

	pi.registerCommand("hermes-smoke", {
		description: "Run isolated synthetic memory acceptance checks",
		handler: async (phase, ctx) => {
			try {
				if (phase === "inactive") {
					assert.equal(tools.size, 0);
					assert.equal(beforeStart.length, 0);
					assert.ok(!existsSync(join(getAgentDir(), "pi-hermes-memory")));
				} else {
					for (const name of ["memory_add", "memory_replace", "memory_remove", "memory_search"]) {
						assert.ok(tools.has(name), `missing ${name}`);
					}
					const call = async (name: string, args: unknown) =>
						tools.get(name).execute("synthetic-check", args, new AbortController().signal, undefined, ctx);
					const mutate = async (name: string, args: unknown) => {
						const result = await call(name, args);
						assert.equal(result.details?.success, true, JSON.stringify(result));
						assert.ok(!result.details?.warning, JSON.stringify(result));
					};
					const injected = async () => {
						const event = {
							type: "before_agent_start", messageType: "user",
							prompt: "请遵循已记录的个人偏好回答。", systemPrompt: "base",
							systemPromptOptions: { sections: {}, appendSystemPrompt: "" },
						};
						for (const handler of beforeStart) {
							const result = await handler(event, ctx);
							assert.equal(result?.systemPrompt, undefined, "must not force the full prompt");
						}
						return event.systemPromptOptions.appendSystemPrompt;
					};
					const config = JSON.parse(readFileSync(join(getAgentDir(), "hermes-memory-config.json"), "utf8"));
					const userFile = join(config.memoryDir, "USER.md");

					if (phase === "write") {
						await mutate("memory_add", { target: "user", content: ORIGINAL });
						await mutate("memory_add", { target: "project", content: PROJECT_A });
						assert.ok(readFileSync(userFile, "utf8").includes(ORIGINAL));
						const rejected = await call("memory_add", {
							target: "user", content: "Synthetic credential: sk-" + "x".repeat(48),
						});
						assert.equal(rejected.details?.success, false, "secret-shaped input must be rejected");
						assert.ok(!readFileSync(userFile, "utf8").includes("x".repeat(48)));
					} else if (phase === "cross-project") {
						const context = await injected();
						assert.ok(context.includes(ORIGINAL), "global profile must cross projects");
						assert.ok(!context.includes(PROJECT_A), "project A must not leak into B's injected context");
						const search = await call("memory_search", { query: "验收偏好", target: "user" });
						assert.equal(search.details?.success, true);
						assert.ok(search.details?.count > 0, "Chinese trigram recall must find the saved preference");
						await mutate("memory_replace", { target: "user", old_text: ORIGINAL, content: UPDATED });
						const disk = readFileSync(userFile, "utf8");
						assert.ok(disk.includes(UPDATED));
						assert.ok(!disk.includes(ORIGINAL));
					} else if (phase === "corrected") {
						const context = await injected();
						assert.ok(context.includes(UPDATED), "replacement must survive restart");
						assert.ok(!context.includes(ORIGINAL));
						await mutate("memory_remove", { target: "user", old_text: UPDATED });
						assert.ok(!readFileSync(userFile, "utf8").includes(UPDATED));
					} else if (phase === "removed") {
						const context = await injected();
						assert.ok(!context.includes(ORIGINAL));
						assert.ok(!context.includes(UPDATED));
						const search = await call("memory_search", { query: "验收偏好", target: "user" });
						assert.equal(search.details?.count ?? 0, 0, "deleted preference must leave the search index");
					} else {
						assert.fail(`unknown phase: ${phase}`);
					}
				}
				console.log(`HERMES_SMOKE_OK:${phase}`);
			} catch (error) {
				process.exitCode = 1;
				console.error(error);
			}
		},
	});
}
