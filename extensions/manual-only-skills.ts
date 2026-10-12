import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const manualOnlySkills = new Set([
	"research",
	"writing-for-agents",
	"code-review",
	"grilling",
]);

export default function manualOnlySkillsExtension(pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		const options = event.systemPromptOptions;
		// Change only prompt visibility; Pi retains the original skills for /skill:name.
		options.skills = options.skills?.map((skill) =>
			manualOnlySkills.has(skill.name) ? { ...skill, disableModelInvocation: true } : skill,
		);
	});
}
