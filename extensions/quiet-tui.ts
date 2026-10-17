/**
 * Quiet TUI
 *
 * The managed @luan.sh/pi-libtui package's defaults
 * (user-message bubbles plus animated working/thinking indicators) made a long
 * session repaint its whole transcript ~30 times a second: one pi process sat
 * at ~100% CPU while only waiting on the model. Bubbles re-measure and re-slice
 * every user message per frame; the animations are what drive the frames.
 *
 * libtui keeps appearance in a process-wide registry on globalThis under
 * Symbol.for("pi-libtui/appearance/v<N>"), so that copies loaded by different
 * extensions share it; it is normally fed by @luan.sh/pi-xsettings. This sets
 * the few keys we care about through that registry, without depending on where
 * the package is installed. Transcript folding is untouched. With static
 * indicators and no text/pulse effects libtui mounts no animation timer.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

const REGISTRY_PREFIX = "pi-libtui/appearance/";

interface AppearanceRegistry {
	configure(next: Record<string, unknown>): void;
}

/** Every libtui appearance registry in this process; matching by prefix survives protocol bumps. */
function appearanceRegistries(): AppearanceRegistry[] {
	const slots = globalThis as Record<PropertyKey, unknown>;
	return Object.getOwnPropertySymbols(globalThis)
		.filter((key) => Symbol.keyFor(key)?.startsWith(REGISTRY_PREFIX))
		.map((key) => slots[key])
		.filter((value): value is AppearanceRegistry => typeof (value as AppearanceRegistry)?.configure === "function");
}

export default function quietTui(pi: ExtensionAPI): void {
	// libtui creates its registry while its own extension loads, so by
	// session_start it exists; without libtui this finds nothing and does nothing.
	pi.on("session_start", () => {
		for (const registry of appearanceRegistries()) registry.configure(QUIET_APPEARANCE);
	});
}
