// Two-stop thinking cycle on Shift+Tab.
// DeepSeek V4 Flash/Pro lack medium, so use high/max; other models use medium/max.
// Match model ids to cover DeepSeek behind a proxy too.
// keybindings.json clears app.thinking.cycle so this handler owns Shift+Tab.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerShortcut("shift+tab", {
    description: "Toggle thinking level",
    handler: async (ctx) => {
      const low = /^deepseek-/i.test(ctx.model?.id ?? "") ? "high" : "medium";
      const previous = pi.getThinkingLevel();
      const next = previous === low ? "max" : low;

      pi.setThinkingLevel(next);

      // Pi clamps unsupported levels. Preserve the previous level on a miss.
      if (pi.getThinkingLevel() !== next) {
        pi.setThinkingLevel(previous);
        ctx.ui.notify(`Current model does not support thinking level: ${next}`, "warning");
        return;
      }

      ctx.ui.notify(`Thinking: ${next}`, "info");
    },
  });
}
