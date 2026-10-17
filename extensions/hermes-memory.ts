import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function hermesMemory(pi: ExtensionAPI) {
	// Delegated task instructions are not the human user's preferences.
	if (process.env.PI_SUBAGENT_CHILD) return;
	// This public config syncs to other machines; memory is a per-machine opt-in.
	if (!existsSync(join(getAgentDir(), "hermes-memory-config.json"))) return;

	// The package's own extension is filtered out to avoid a second registration.
	const { default: loadHermes } = await import("../npm/node_modules/pi-hermes-memory/src/index.ts");
	loadHermes(pi);
}
