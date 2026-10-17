// Runs inside the installed Pi so the /fast command, the request hook, and Pi's
// provider serializer are exercised end to end. Only a loopback fake API is used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const fixture = fileURLToPath(new URL("./fixtures/openai-fast-mode.ts", import.meta.url));

test("each switch state reaches the provider request as documented", () => {
	const root = mkdtempSync(path.join(tmpdir(), "pi-fast-mode-"));
	try {
		for (const state of ["default", "off", "on"]) {
			const result = spawnSync("pi", [
				"--offline", "--no-extensions", "--no-skills", "--no-prompt-templates",
				"--no-themes", "--no-context-files", "--no-session", "--no-tools", "--no-mcp",
				"-e", fixture, "--model", "openai/gpt-6-astra", "-p", `/fast-offline ${state}`,
			], {
				cwd: root,
				env: { ...process.env, PI_CODING_AGENT_DIR: root },
				encoding: "utf8",
				timeout: 60000,
			});
			const output = result.stdout + result.stderr;
			assert.ifError(result.error);
			assert.equal(result.status, 0, output);
			assert.match(output, new RegExp(`OPENAI_FAST_MODE_TESTS_PASSED ${state}`), output);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
