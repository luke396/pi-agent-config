// Runs claude-rules and the installed supi-skills through Pi's real extension loader,
// runner and prompt builder, in codemode-only shape (read/bash selected but hidden).
// Prerequisites: Pi installed under ~/.local/lib/node_modules and npm/ populated by setup.sh.
// The supi-skills test asserts on the installed version's behavior and warning output.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const agentDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const piDist = path.join(process.env.HOME, ".local/lib/node_modules/@earendil-works/pi-coding-agent/dist/core");
const { loadExtensions } = await import(path.join(piDist, "extensions/loader.js"));
const { ExtensionRunner } = await import(path.join(piDist, "extensions/runner.js"));
const { buildSystemPrompt } = await import(path.join(piDist, "system-prompt.js"));

const root = mkdtempSync(path.join(tmpdir(), "claude-rules-test-"));
const home = path.join(root, "home");
const cwd = path.join(root, "project");
mkdirSync(path.join(home, ".pi/agent/supi"), { recursive: true });
mkdirSync(path.join(cwd, ".claude/rules"), { recursive: true });
writeFileSync(path.join(cwd, ".claude/rules/testing.md"), "# testing\n");
writeFileSync(
	path.join(home, ".pi/agent/supi/config.json"),
	JSON.stringify({ skills: { $schemaVersion: 2, "hidden-skill": { modelInvocation: "disabled" } } }),
);
// supi-core resolves its global config from os.homedir(), which follows HOME.
process.env.HOME = home;
test.after(() => rmSync(root, { recursive: true, force: true }));

const skill = (name) => ({
	name, description: `${name} description`, filePath: `/skills/${name}/SKILL.md`,
	baseDir: `/skills/${name}`, source: "user", disableModelInvocation: false,
});

async function run(extensionPaths) {
	const { extensions, errors, runtime } = await loadExtensions(extensionPaths, cwd);
	assert.deepEqual(errors, []);
	// AgentSession binds runtime actions before session_start; supi-skills reads commands there.
	runtime.getCommands = () => [];
	const sessionManager = { getSessionId: () => "session-a", getEntries: () => [], getCwd: () => cwd };
	const runner = new ExtensionRunner(extensions, runtime, cwd, sessionManager, {});
	const extensionErrors = [];
	runner.onError((error) => extensionErrors.push(error));
	await runner.emit({ type: "session_start", reason: "startup" });

	const warnings = [];
	const originalWarn = console.warn;
	console.warn = (...args) => warnings.push(args.join(" "));
	try {
		const { systemPromptOptions } = await runner.emitBeforeAgentStart("hi", undefined, {
			cwd, selectedTools: ["codemode", "read", "bash"], hiddenTools: ["read", "bash"],
			toolSnippets: { codemode: "Run JavaScript" }, skills: [skill("visible-skill"), skill("hidden-skill")],
		});
		return { options: systemPromptOptions, prompt: buildSystemPrompt(systemPromptOptions), warnings, extensionErrors };
	} finally {
		console.warn = originalWarn;
	}
}

test("rules are listed in a structured section without forcing the prompt", async () => {
	const { options, prompt, extensionErrors } = await run([path.join(agentDir, "extensions/claude-rules.ts")]);
	assert.deepEqual(extensionErrors, []);
	assert.equal(options.forceSystemPrompt, undefined);
	assert.match(prompt, /<project_rules>\n[^]*- \.claude\/rules\/testing\.md[^]*\n<\/project_rules>/);
});

test("supi-skills still hides model-disabled skills when project rules exist", async () => {
	const supiSkills = path.join(agentDir, "npm/node_modules/@mrclrchtr/supi-skills/src/extension.ts");
	const { prompt, warnings, extensionErrors } = await run([path.join(agentDir, "extensions/claude-rules.ts"), supiSkills]);
	assert.deepEqual(extensionErrors, []);
	assert.deepEqual(warnings, []);
	assert.match(prompt, /- \.claude\/rules\/testing\.md/);
	assert.match(prompt, /<name>visible-skill<\/name>/);
	assert.doesNotMatch(prompt, /<name>hidden-skill<\/name>/);
});
