// Use the installed Pi's actual component classes; no model calls or SDK install.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("tool images remain visible with collapsed activity", () => {
	const root = mkdtempSync(path.join(tmpdir(), "pi-visible-images-"));
	try {
		const result = spawnSync("pi", [
			"--offline", "--no-extensions", "--no-skills", "--no-prompt-templates",
			"--no-themes", "--no-context-files", "--no-session", "--no-tools", "--no-mcp",
			"-e", fileURLToPath(new URL("./fixtures/visible-tool-images.ts", import.meta.url)),
			"-p", "/test-visible-images",
		], {
			cwd: root,
			env: { ...process.env, PI_CODING_AGENT_DIR: root },
			encoding: "utf8",
			timeout: 30000,
		});
		const output = result.stdout + result.stderr;
		assert.ifError(result.error);
		assert.equal(result.status, 0, output);
		assert.match(output, /VISIBLE_TOOL_IMAGES_TESTS_PASSED/, output);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
