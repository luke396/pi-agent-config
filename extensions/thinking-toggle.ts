// Two-stop thinking cycle on Shift+Tab.
//
// pi's built-in cycle walks every level the model exposes. This keeps two stops
// instead — but *which* two is model-specific. DeepSeek's thinkingLevelMap marks
// `medium` as unsupported (null), so its pair is high/max; Codex exposes
// medium/max. The TABLE below is the single place to change that.
//
// `keybindings.json` clears `app.thinking.cycle` so this handler owns Shift+Tab.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Level = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

interface Stop {
  /** Match against ctx.model.provider. Omit to match any provider. */
  provider?: string;
  /** Match against ctx.model.id. */
  model: RegExp;
  /** The two levels Shift+Tab alternates between, low first. */
  levels: readonly [Level, Level];
}

// First match wins, so keep specific entries above the catch-all.
const TABLE: readonly Stop[] = [
  // DeepSeek V4 Flash / V4 Pro expose high and max, but not medium. Matched on
  // the id so this also covers the proxy copy under the `openai` provider.
  { model: /^deepseek-/i, levels: ["high", "max"] },
  // Codex, and any model with a standard map.
  { model: /.*/, levels: ["medium", "max"] },
];

function stopsFor(ctx: ExtensionContext): readonly [Level, Level] {
  const model = ctx.model;
  const hit = TABLE.find(
    (entry) =>
      (!entry.provider || entry.provider === model?.provider) &&
      entry.model.test(model?.id ?? ""),
  );
  return hit?.levels ?? ["medium", "max"];
}

export default function (pi: ExtensionAPI) {
  pi.registerShortcut("shift+tab", {
    description: "Toggle thinking level",
    handler: async (ctx) => {
      const [low, high] = stopsFor(ctx);
      const previous = pi.getThinkingLevel();
      const next: Level = previous === low ? high : low;

      pi.setThinkingLevel(next);

      // pi clamps unsupported levels. Report the miss instead of silently
      // leaving the user on a level this model does not have.
      if (pi.getThinkingLevel() !== next) {
        pi.setThinkingLevel(previous);
        ctx.ui.notify(`Current model does not support thinking level: ${next}`, "warning");
        return;
      }

      ctx.ui.notify(`Thinking: ${next}`, "info");
    },
  });
}
