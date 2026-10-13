/**
 * Quiet TUI
 *
 * @luan.sh/pi-collapse-transcript bundles @luan.sh/pi-libtui, whose defaults
 * (user-message bubbles plus animated working/thinking indicators) made a long
 * session repaint its whole transcript ~30 times a second: one pi process sat
 * at ~100% CPU while only waiting on the model. Bubbles re-measure and re-slice
 * every user message per frame; the animations are what drive the frames.
 *
 * libtui's appearance is a process-wide registry with no settings store of its
 * own (normally fed by @luan.sh/pi-xsettings). This sets the few keys we care
 * about directly, keeping the package's transcript folding intact. With static
 * indicators and no text/pulse effects libtui mounts no animation timer.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LIBTUI_ENTRY = join(
	homedir(),
	".pi/agent/npm/node_modules/@luan.sh/pi-collapse-transcript/node_modules/@luan.sh/pi-libtui/src/appearance.ts",
);

const QUIET_APPEARANCE = {
	userMessageBubbles: false,
	activityIndicator: "static",
	textEffect: "off",
	pulseEffect: "off",
	thinkingIndicator: "static",
	thinkingTextEffect: "off",
	thinkingPulseEffect: "off",
	workingIndicator: "static",
	workingTextEffect: "off",
	workingPulseEffect: "off",
} as const;

export default async function quietTui(pi: ExtensionAPI): Promise<void> {
	// Inert on machines without the package.
	if (!existsSync(LIBTUI_ENTRY)) return;
	const { configureTuiAppearance } = await import(LIBTUI_ENTRY);
	configureTuiAppearance(QUIET_APPEARANCE);
	// Re-apply in case anything republished defaults before the session started.
	pi.on("session_start", () => configureTuiAppearance(QUIET_APPEARANCE));
}
