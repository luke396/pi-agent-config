// Runs claude-rules and the installed supi-skills through Pi's real extension loader,
// runner and prompt builder, in codemode-only shape (read/bash selected but hidden).
// Prerequisites: an npm-installed `pi` on PATH and npm/ populated by setup.sh.
// The supi-skills test asserts on the installed version's behavior and warning output.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const agentDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Test the Pi that the shell runs: resolve `pi` on PATH up to its package root.
function findPiPackageRoot() {
	for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
		const bin = path.join(dir, "pi");
		if (!dir || !existsSync(bin)) continue;
		for (let at = path.dirname(realpathSync(bin)); at !== path.dirname(at); at = path.dirname(at)) {
			const manifest = path.join(at, "package.json");
			if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "@earendil-works/pi-coding-agent") return at;
		}
	}
	throw new Error("pi-coding-agent package not found from `pi` on PATH");
}
const piDist = path.join(findPiPackageRoot(), "dist/core");
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

async function load(extensionPaths) {
	const { extensions, errors, runtime } = await loadExtensions(extensionPaths, cwd);
	assert.deepEqual(errors, []);
	// AgentSession binds runtime actions before session_start; supi-skills reads commands there.
	runtime.getCommands = () => [];
	const sessionManager = { getSessionId: () => "session-a", getEntries: () => [], getCwd: () => cwd };
	const runner = new ExtensionRunner(extensions, runtime, cwd, sessionManager, {});
	const extensionErrors = [];
	runner.onError((error) => extensionErrors.push(error));
	await runner.emit({ type: "session_start", reason: "startup" });
	return { runner, extensionErrors };
}

async function turn({ runner, extensionErrors }) {
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

const claudeRules = path.join(agentDir, "extensions/claude-rules.ts");
const run = async (extensionPaths) => turn(await load(extensionPaths));

test("rules are listed in a structured section without forcing the prompt", async () => {
	const { options, prompt, extensionErrors } = await run([claudeRules]);
	assert.deepEqual(extensionErrors, []);
	assert.equal(options.forceSystemPrompt, undefined);
	assert.match(prompt, /<project_rules>\n[^]*- \.claude\/rules\/testing\.md[^]*\n<\/project_rules>/);
});

test("supi-skills still hides model-disabled skills when project rules exist", async () => {
	const supiSkills = path.join(agentDir, "npm/node_modules/@mrclrchtr/supi-skills/src/extension.ts");
	const { prompt, warnings, extensionErrors } = await run([claudeRules, supiSkills]);
	assert.deepEqual(extensionErrors, []);
	assert.deepEqual(warnings, []);
	assert.match(prompt, /- \.claude\/rules\/testing\.md/);
	assert.match(prompt, /<name>visible-skill<\/name>/);
	assert.doesNotMatch(prompt, /<name>hidden-skill<\/name>/);
});

test("rule files added after session start appear on the next turn", async () => {
	const session = await load([claudeRules]);
	writeFileSync(path.join(cwd, ".claude/rules/added-later.md"), "# later\n");
	try {
		const { prompt } = await turn(session);
		assert.match(prompt, /- \.claude\/rules\/added-later\.md/);
	} finally {
		rmSync(path.join(cwd, ".claude/rules/added-later.md"));
	}
});
