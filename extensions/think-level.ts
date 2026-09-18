// Publishes the current thinking level as a bare, color-coded status value.
// powerline-footer's built-in `thinking` segment hardcodes a "think:" prefix;
// this extension feeds the same information through a custom status key so the
// value can be shown without one. Pair it with powerline.customItems.
// @ts-nocheck

const LABELS = {
  off: "off",
  minimal: "min",
  low: "low",
  medium: "med",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

const COLORS = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
  max: "thinkingMax",
};

const STATUS_KEY = "thinkLevel";

export default function (pi) {
  const publish = (ctx) => {
    const level = ctx.thinkingLevel || "off";
    const label = LABELS[level] || level;
    const color = COLORS[level] || "text";
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(color, label));
  };

  pi.on("session_start", async (_event, ctx) => publish(ctx));
  pi.on("thinking_level_select", async (_event, ctx) => publish(ctx));
  pi.on("model_select", async (_event, ctx) => publish(ctx));
}
