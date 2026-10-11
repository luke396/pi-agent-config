import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "response-metrics";
const REFRESH_MS = 250;
const encoder = new TextEncoder();

type Measurement = {
	requestAt?: number;
	firstOutputAt?: number;
	bytes: number;
};

export default function responseMetrics(pi: ExtensionAPI) {
	let current: Measurement | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;

	const stopTimer = () => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};

	const clear = (_event: unknown, ctx: ExtensionContext) => {
		stopTimer();
		current = undefined;
		if (ctx.mode === "tui" && ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	};

	const render = (
		ctx: ExtensionContext,
		final?: { output: number | undefined; stopReason: string },
	) => {
		if (!current) return;
		const now = performance.now();
		const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
		const ttft = current.requestAt === undefined ? "—"
			: current.firstOutputAt === undefined ? (final ? "—" : "…")
			: seconds(current.firstOutputAt - current.requestAt);
		const elapsed = current.requestAt === undefined ? "—" : seconds(now - current.requestAt);
		const reported = final?.output;
		const exact = typeof reported === "number" && Number.isFinite(reported) && reported > 0;
		// UTF-8 bytes / 4 is deliberately only an estimate. Do not round each delta.
		const tokens = exact ? reported : current.bytes / 4;
		const duration = current.firstOutputAt === undefined ? 0 : now - current.firstOutputAt;
		const tps = duration > 0
			? `${exact ? "" : "~"}${(tokens / (duration / 1000)).toFixed(1)} tok/s`
			: "—";
		const outcome = final?.stopReason === "aborted" ? " · 已中断"
			: final?.stopReason === "error" ? " · 错误" : "";
		// Keep metrics readable next to the dim native usage lines.
		const text = `TTFT ${ttft} · TPS ${tps} · 耗时 ${elapsed}${outcome}`;
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("text", text));
	};

	const startTimer = (ctx: ExtensionContext) => {
		render(ctx);
		if (timer !== undefined) return;
		timer = setInterval(() => render(ctx), REFRESH_MS);
		timer.unref();
	};

	pi.on("turn_start", (event, ctx) => {
		clear(event, ctx);
		if (ctx.mode === "tui" && ctx.hasUI) current = { bytes: 0 };
	});

	pi.on("before_provider_request", (_event, ctx) => {
		// Only observe an active main-loop response, not idle/background requests.
		if (!current) return;
		// A new request attempt must not inherit the previous attempt's output.
		current = { requestAt: performance.now(), bytes: 0 };
		startTimer(ctx);
	});

	pi.on("message_start", (event, ctx) => {
		if (current && event.message.role === "assistant") startTimer(ctx);
	});

	pi.on("message_update", (event) => {
		if (!current || event.message.role !== "assistant") return;
		const update = event.assistantMessageEvent;
		if (update.type !== "text_delta" && update.type !== "thinking_delta" && update.type !== "toolcall_delta") return;
		if (update.delta.length === 0) return;
		current.firstOutputAt ??= performance.now();
		current.bytes += encoder.encode(update.delta).byteLength;
	});

	pi.on("message_end", (event, ctx) => {
		if (!current || event.message.role !== "assistant") return;
		stopTimer();
		render(ctx, { output: event.message.usage?.output, stopReason: event.message.stopReason });
		current = undefined;
	});

	pi.on("session_start", clear);
	pi.on("session_tree", clear);
	pi.on("model_select", clear);
	pi.on("session_shutdown", clear);
}
