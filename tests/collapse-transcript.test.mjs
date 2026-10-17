// Folding and image contracts, exercised through the installed Pi without model calls.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

for (const [name, fixture, command, marker] of [
	["native grouping, disclosure, timing and mouse contracts", "collapse-transcript", "test-collapse-transcript", "COLLAPSE_TRANSCRIPT_TESTS_PASSED"],
	["queued and steering request boundaries", "collapse-queued-request", "test-collapse-queued-request", "COLLAPSE_QUEUED_TESTS_PASSED"],
	["compaction retains display history across resume", "collapse-compaction", "test-collapse-compaction", "COLLAPSE_COMPACTION_TESTS_PASSED"],
	["tool images remain visible with collapsed activity", "visible-tool-images", "test-visible-images", "VISIBLE_TOOL_IMAGES_TESTS_PASSED"],
]) {
	test(name, () => {
		const root = mkdtempSync(path.join(tmpdir(), "pi-collapse-test-"));
		try {
			const result = spawnSync("pi", [
				"--offline", "--no-extensions", "--no-skills", "--no-prompt-templates",
				"--no-themes", "--no-context-files", "--no-session", "--no-tools", "--no-mcp",
				"-e", fileURLToPath(new URL(`./fixtures/${fixture}.ts`, import.meta.url)),
				"-p", `/${command}`,
			], {
				cwd: root,
				env: { ...process.env, PI_CODING_AGENT_DIR: root },
				encoding: "utf8",
				timeout: 60000,
			});
			const output = result.stdout + result.stderr;
			assert.ifError(result.error);
			assert.equal(result.status, 0, output);
			assert.ok(output.includes(marker), output);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}
