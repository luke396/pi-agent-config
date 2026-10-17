// PI_BINARY=/path/to/pi node --test tests/hermes-memory.test.mjs
// Uses the installed, pinned package via Pi's real loader; no model or network.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const binary = process.env.PI_BINARY || "pi";
const fixture = path.join(repo, "tests/fixtures/hermes-memory-smoke.ts");
const root = mkdtempSync(path.join(tmpdir(), "pi-hermes-acceptance-"));
const agentDir = path.join(root, "agent");
const dataDir = path.join(root, "private-data");
const projectA = path.join(root, "project-a");
const projectB = path.join(root, "project-b");
for (const dir of [agentDir, dataDir, projectA, projectB, path.join(dataDir, "global"), path.join(dataDir, "projects")]) {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
}
symlinkSync(path.join(dataDir, "projects"), path.join(agentDir, "projects-memory"));
writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ enableInstallTelemetry: false, enableAnalytics: false }));
const configPath = path.join(agentDir, "hermes-memory-config.json");
const config = {
	memoryDir: path.join(dataDir, "global"),
	projectsMemoryDir: "projects-memory",
	memoryMode: "legacy-inject",
	// Persistence and injection tests must never call a model.
	reviewEnabled: false, correctionDetection: false,
	flushOnCompact: false, flushOnShutdown: false,
	memoryOverflowStrategy: "reject",
	sessionRetentionDays: 7,
};
test.after(() => rmSync(root, { recursive: true, force: true }));

function run(phase, cwd, child = false) {
	const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" };
	delete env.PI_CODING_AGENT_SESSION_DIR;
	delete env.PI_SUBAGENT_CHILD;
	if (child) env.PI_SUBAGENT_CHILD = "1";
	const result = spawnSync(binary, [
		"--offline", "--no-extensions", "--no-skills", "--no-prompt-templates",
		"--no-themes", "--no-context-files", "--no-session",
		"-e", fixture, "--print", "/hermes-smoke " + phase,
	], { cwd, env, encoding: "utf8", timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
	const output = (result.stdout || "") + (result.stderr || "");
	assert.ifError(result.error);
	assert.equal(result.status, 0, output);
	assert.ok(output.includes("HERMES_SMOKE_OK:" + phase), output);
	assert.ok(!output.includes("Failed to load extension"), output);
}

test("private fallback paths, symlinks and config are ignored and untracked", () => {
	for (const entry of ["memory", "pi-hermes-memory", "projects-memory", "hermes-memory-config.json"]) {
		assert.equal(spawnSync("git", ["check-ignore", "--no-index", "-q", entry], { cwd: repo }).status, 0, entry);
		assert.equal(execFileSync("git", ["ls-files", "--", entry], { cwd: repo, encoding: "utf8" }).trim(), "", entry);
	}
	// Test the directory cases separately: Git intentionally rejects paths below a symlink.
	const guard = path.join(root, "ignore-check");
	mkdirSync(guard);
	execFileSync("git", ["init", "--quiet", guard]);
	writeFileSync(path.join(guard, ".gitignore"), readFileSync(path.join(repo, ".gitignore")));
	for (const entry of ["memory/MEMORY.md", "pi-hermes-memory/sessions.db-wal", "projects-memory/demo/skills/example/SKILL.md"]) {
		assert.equal(spawnSync("git", ["check-ignore", "--no-index", "-q", entry], { cwd: guard }).status, 0, entry);
	}
});

test("package cannot bypass the opt-in and child guard", () => {
	const settings = JSON.parse(readFileSync(path.join(repo, "settings.json"), "utf8"));
	const pkg = settings.packages.find((entry) => typeof entry === "object" && entry.source === "npm:pi-hermes-memory@0.9.10");
	assert.ok(pkg);
	assert.deepEqual(pkg.extensions, []);
});

test("real runtime: opt-in, child exclusion, Chinese recall, scope, correction and deletion", { timeout: 180000 }, () => {
	run("inactive", projectA);
	assert.ok(!existsSync(path.join(dataDir, "global", "sessions.db")));
	writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
	chmodSync(configPath, 0o600);
	run("inactive", projectA, true);
	assert.ok(!existsSync(path.join(dataDir, "global", "sessions.db")));
	run("write", projectA);
	run("cross-project", projectB);
	run("corrected", projectB);
	run("removed", projectB);
});
