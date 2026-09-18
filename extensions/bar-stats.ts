// Publishes context usage + cache hit rate as ONE powerline status value so
// they render inside a single segment instead of two separate chips.
// Pair with powerline.customItems (statusKey "barStats").
// @ts-nocheck

const STATUS_KEY = "barStats";
const CTX_ICON = "\u25EB"; // ◫

function sessionUsage(ctx) {
  let input = 0;
  let cacheRead = 0;
  try {
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const message = entry.message;
      if (!message || message.role !== "assistant" || !message.usage) continue;
      input += message.usage.input || 0;
      cacheRead += message.usage.cacheRead || 0;
    }
  } catch {
    // Session state unavailable (early startup / shutdown): fall back to unknown.
  }
  return { input, cacheRead };
}

export default function (pi) {
  const publish = (ctx) => {
    if (!ctx.hasUI) return;
    const theme = ctx.ui.theme;

    // Only `tokens` is a documented field of ctx.getContextUsage(). `contextWindow`
    // and `percent` are read defensively: if either disappears, derive the ratio
    // from the documented value instead of going blank.
    const usage = ctx.getContextUsage?.();
    const tokens = usage && typeof usage.tokens === "number" ? usage.tokens : null;
    const window = usage && typeof usage.contextWindow === "number" && usage.contextWindow > 0
      ? usage.contextWindow
      : null;
    const percent =
      tokens === null || window === null
        ? null
        : typeof usage.percent === "number"
          ? usage.percent
          : (tokens / window) * 100;

    const { input, cacheRead } = sessionUsage(ctx);
    const hitRate = input + cacheRead > 0 ? Math.round((cacheRead / (input + cacheRead)) * 100) : null;

    const contextColor = percent === null ? "dim" : percent > 90 ? "error" : percent > 70 ? "warning" : "dim";
    const contextText = percent === null ? "--" : `${percent.toFixed(0)}%`;

    const parts = [theme.fg(contextColor, `${CTX_ICON} ${contextText}`)];
    if (hitRate !== null && cacheRead > 0) {
      parts.push(theme.fg("muted", `cache ${hitRate}%`));
    }

    ctx.ui.setStatus(STATUS_KEY, parts.join(theme.fg("dim", " \u00B7 ")));
  };

  pi.on("session_start", async (_event, ctx) => publish(ctx));
  pi.on("message_end", async (_event, ctx) => publish(ctx));
  pi.on("agent_end", async (_event, ctx) => publish(ctx));
  pi.on("model_select", async (_event, ctx) => publish(ctx));
}
