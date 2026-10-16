// Runs the local rules and manual-only extensions through Pi's real loader,
// runner, prompt builder, and skill-command expansion. No model calls.
// Prerequisite: an npm-installed `pi` on PATH exposing dist/core.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const agentDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
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
const { loadSkillsFromDir } = await import(path.join(piDist, "skills.js"));
const { AgentSession } = await import(path.join(piDist, "agent-session.js"));

const root = mkdtempSync(path.join(tmpdir(), "pi-skill-visibility-test-"));
const cwd = path.join(root, "project");
const skillDir = path.join(root, "skills");
mkdirSync(path.join(cwd, ".claude/rules"), { recursive: true });
writeFileSync(path.join(cwd, ".claude/rules/testing.md"), "# testing\n");
test.after(() => rmSync(root, { recursive: true, force: true }));

const manualNames = ["research", "writing-for-agents", "code-review", "grilling"];
for (const name of [...manualNames, "visible-skill", "research-notes", "already-manual"]) {
	const dir = path.join(skillDir, name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${name} description\n${name === "already-manual" ? "disable-model-invocation: true\n" : ""}---\nInstructions for ${name}.\n`);
}
const { skills, diagnostics } = loadSkillsFromDir({ dir: skillDir, source: "user" });
assert.deepEqual(diagnostics, []);
const originalSkills = structuredClone(skills);
const originalFiles = new Map(skills.map((skill) => [skill.filePath, readFileSync(skill.filePath, "utf8")]));

async function load(extensionPaths) {
	const { extensions, errors, runtime } = await loadExtensions(extensionPaths, cwd);
	assert.deepEqual(errors, []);
	const sessionManager = { getSessionId: () => "session-a", getEntries: () => [], getCwd: () => cwd };
	const runner = new ExtensionRunner(extensions, runtime, cwd, sessionManager, {});
	const extensionErrors = [];
	runner.onError((error) => extensionErrors.push(error));
	await runner.emit({ type: "session_start", reason: "startup" });
	return { runner, extensionErrors };
}

async function turn({ runner, extensionErrors }, codemodeOnly = false) {
	const { systemPromptOptions } = await runner.emitBeforeAgentStart({ messageType: "user", prompt: "hi", images: undefined }, {
		cwd,
		selectedTools: codemodeOnly ? ["codemode", "read", "bash"] : ["read", "bash"],
		hiddenTools: codemodeOnly ? ["read", "bash"] : [],
		toolSnippets: { codemode: "Run JavaScript" }, skills,
	});
	assert.deepEqual(extensionErrors, []);
	return { options: systemPromptOptions, prompt: buildSystemPrompt(systemPromptOptions) };
}

const claudeRules = path.join(agentDir, "extensions/claude-rules.ts");
const manualOnly = path.join(agentDir, "extensions/manual-only-skills.ts");

test("rules are listed in a structured section without forcing the prompt", async () => {
	const { options, prompt } = await turn(await load([claudeRules]));
	assert.equal(options.forceSystemPrompt, undefined);
	assert.match(prompt, /<project_rules>\n[^]*- \.claude\/rules\/testing\.md[^]*\n<\/project_rules>/);
	for (const name of manualNames) assert.ok(prompt.includes(`<name>${name}</name>`));
});

for (const order of [[claudeRules, manualOnly], [manualOnly, claudeRules]]) {
	test(`manual skills stay hidden with rules, ${path.basename(order[0])} first`, async () => {
		const loaded = await load(order);
		for (const codemodeOnly of [false, true]) {
			for (let turnNumber = 0; turnNumber < 2; turnNumber++) {
				const { options, prompt } = await turn(loaded, codemodeOnly);
				assert.equal(options.forceSystemPrompt, undefined);
				assert.match(prompt, /- \.claude\/rules\/testing\.md/);
				for (const name of [...manualNames, "already-manual"]) {
					assert.ok(!prompt.includes(`<name>${name}</name>`), `${name} must not be advertised`);
				}
				for (const name of ["visible-skill", "research-notes"]) {
					assert.ok(prompt.includes(`<name>${name}</name>`), `${name} must remain advertised`);
				}
				assert.deepEqual(skills, originalSkills, "resource catalog must remain intact");
			}
		}
	});
}

test("all four manual commands still expand their original files and arguments", async () => {
	await turn(await load([manualOnly]));
	// Exercise Pi's command expander against the unchanged resource catalog.
	const session = { resourceLoader: { getSkills: () => ({ skills }) } };
	for (const name of manualNames) {
		const text = AgentSession.prototype._expandSkillCommand.call(session, `/skill:${name} user request`);
		assert.ok(text.startsWith(`<skill name="${name}" location="`));
		assert.ok(text.includes(`Instructions for ${name}.`));
		assert.ok(text.endsWith("</skill>\n\nuser request"));
	}
	for (const [file, content] of originalFiles) assert.equal(readFileSync(file, "utf8"), content);
});
