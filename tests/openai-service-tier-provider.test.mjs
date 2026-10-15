// Runs inside the installed Pi so the /tier command, the request hooks, and Pi's
// provider serializer are exercised end to end. Only a loopback fake API is used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const fixture = fileURLToPath(new URL("./fixtures/openai-service-tier.ts", import.meta.url));

test("each tier reaches the provider request as documented", () => {
	const root = mkdtempSync(path.join(tmpdir(), "pi-service-tier-"));
	try {
		for (const tier of ["standard", "fast", "ultrafast"]) {
			const result = spawnSync("pi", [
				"--offline", "--no-extensions", "--no-skills", "--no-prompt-templates",
				"--no-themes", "--no-context-files", "--no-session", "--no-tools", "--no-mcp",
				"-e", fixture, "--model", "openai/gpt-6-astra", "-p", `/tier-offline ${tier}`,
			], {
				cwd: root,
				env: { ...process.env, PI_CODING_AGENT_DIR: root },
				encoding: "utf8",
				timeout: 60000,
			});
			const output = result.stdout + result.stderr;
			assert.ifError(result.error);
			assert.equal(result.status, 0, output);
			assert.match(output, new RegExp(`OPENAI_SERVICE_TIER_TESTS_PASSED ${tier}`), output);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
