import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Limit Shift+Tab cycling; leave startup defaults and /thinking unchanged. */
export default function (pi: ExtensionAPI) {
  pi.registerShortcut("shift+tab", {
    description: "Toggle thinking: medium / max",
    handler: async (ctx) => {
      const previous = pi.getThinkingLevel();
      const next = previous === "medium" ? "max" : "medium";
      pi.setThinkingLevel(next);

      // Pi clamps unsupported levels. Do not silently select a third level.
      if (pi.getThinkingLevel() !== next) {
        pi.setThinkingLevel(previous);
        ctx.ui.notify(`Current model does not support thinking level: ${next}`, "warning");
        return;
      }
      ctx.ui.notify(`Thinking: ${next}`, "info");
    },
  });
}
