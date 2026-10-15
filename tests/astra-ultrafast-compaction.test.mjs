// Runs inside the installed Pi so its real summarizer and OpenAI serializer are
// exercised on both standalone and npm builds. Only a loopback fake API is used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("Astra Ultrafast compaction through Pi's native summarizer and provider", () => {
	const root = mkdtempSync(path.join(tmpdir(), "pi-astra-compaction-"));
	try {
		const fixture = fileURLToPath(new URL("./fixtures/astra-ultrafast-compaction.ts", import.meta.url));
		const result = spawnSync("pi", [
			"--offline", "--no-extensions", "--no-skills", "--no-prompt-templates",
			"--no-themes", "--no-context-files", "--no-session", "--no-tools",
			"-e", fixture, "-p", "/test-astra-compaction",
		], {
			cwd: root,
			env: { ...process.env, PI_CODING_AGENT_DIR: root },
			encoding: "utf8",
			timeout: 45000,
		});
		const output = result.stdout + result.stderr;
		assert.ifError(result.error);
		assert.equal(result.status, 0, output);
		assert.match(output, /ASTRA_COMPACTION_TESTS_PASSED/, output);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
