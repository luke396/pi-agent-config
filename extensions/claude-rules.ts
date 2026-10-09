/**
 * Claude Rules Extension
 *
 * Scans the project's .claude/rules/ folder for rule files and lists them
 * in the system prompt on every turn. The agent can then load specific rules
 * when needed.
 *
 * Best practices for .claude/rules/:
 * - Keep rules focused: Each file should cover one topic (e.g., testing.md, api-design.md)
 * - Use descriptive filenames: The filename should indicate what the rules cover
 * - Use conditional rules sparingly: Only add paths frontmatter when rules truly apply to specific file types
 * - Organize with subdirectories: Group related rules (e.g., frontend/, backend/)
 *
 * Usage:
 * 1. Copy this file to ~/.pi/agent/extensions/ or your project's .pi/extensions/
 * 2. Create .claude/rules/ folder in your project root
 * 3. Add .md files with your rules
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Recursively find all .md files in a directory
 */
function findMarkdownFiles(dir: string, basePath: string = ""): string[] {
	const results: string[] = [];

	if (!fs.existsSync(dir)) {
		return results;
	}

	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			results.push(...findMarkdownFiles(path.join(dir, entry.name), relativePath));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(relativePath);
		}
	}

	return results;
}

export default function claudeRulesExtension(pi: ExtensionAPI) {
	const findRuleFiles = (cwd: string) => findMarkdownFiles(path.join(cwd, ".claude", "rules"));

	pi.on("session_start", async (_event, ctx) => {
		const ruleFiles = findRuleFiles(ctx.cwd);
		if (ruleFiles.length > 0) {
			ctx.ui.notify(`Found ${ruleFiles.length} rule(s) in .claude/rules/`, "info");
		}
	});

	// List available rules in a structured prompt section. Returning systemPrompt would
	// force an opaque prompt that later handlers (e.g. supi-skills) cannot restructure.
	// Pi rebuilds the options each turn, so the section is set (and rules rescanned) every
	// turn; rules added mid-session appear without /reload.
	pi.on("before_agent_start", async (event, ctx) => {
		const ruleFiles = findRuleFiles(ctx.cwd);
		if (ruleFiles.length === 0) {
			return;
		}

		const rulesList = ruleFiles.map((f) => `- .claude/rules/${f}`).join("\n");

		event.systemPromptOptions.sections.project_rules = `The following project rules are available in .claude/rules/:

${rulesList}

When working on tasks related to these rules, load the relevant rule files for guidance.`;
	});
}
