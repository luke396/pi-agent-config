// Exercise real Pi tools, request hooks, serialization and model switching.
// Only a loopback fake Anthropic endpoint is contacted.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("tool images survive native read/codemode turns without changing saved history or other providers", () => {
	const root = mkdtempSync(path.join(tmpdir(), "pi-infrawaves-images-"));
	try {
		const result = spawnSync("pi", [
			"--offline", "--no-extensions", "--no-skills", "--no-prompt-templates",
			"--no-themes", "--no-context-files", "--no-session", "--tools", "read,codemode", "--no-mcp",
			"-e", "builtin:codemode",
			"-e", fileURLToPath(new URL("./fixtures/infrawaves-tool-images.ts", import.meta.url)),
			"--model", "infrawaves/claude-opus-5.5", "-p", "/test-infrawaves-images",
		], {
			cwd: root,
			env: { ...process.env, PI_CODING_AGENT_DIR: root },
			encoding: "utf8",
			timeout: 60000,
		});
		const output = result.stdout + result.stderr;
		assert.ifError(result.error);
		assert.equal(result.status, 0, output);
		assert.match(output, /INFRAWAVES_IMAGE_TESTS_PASSED/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
