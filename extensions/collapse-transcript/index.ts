import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { installTranscriptHistory, mountTranscriptProjection, retainTranscriptHistory } from "../../npm/node_modules/@luan.sh/pi-libtui/src/tool/index.ts";
import { ActivityTimings } from "./activity-timing.ts";
import { ActivityTranscript } from "./activity-transcript.ts";
import { openImage, type ViewableImage } from "./image-viewer.ts";

export default function transcriptExtension(pi: ExtensionAPI): void {
	const releasePreparation = retainTranscriptHistory();
	let unmount: (() => void) | undefined;
	let transcript: ActivityTranscript | undefined;
	const viewImage = async (image: ViewableImage, ctx: ExtensionContext) => {
		try { await openImage(image, pi.exec.bind(pi)); }
		catch (error) { ctx.ui.notify(`Cannot open image: ${error instanceof Error ? error.message : String(error)}`, "error"); }
	};
	pi.registerCommand("images", {
		description: "Open a tool image in the desktop viewer for zooming",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			const images = ctx.sessionManager.getBranch().flatMap(entry => {
				if (entry.type !== "message" || entry.message.role !== "toolResult") return [];
				const toolName = entry.message.toolName;
				return entry.message.content.filter(block => block.type === "image")
					.map(image => ({ image, toolName }));
			}).reverse();
			if (!images.length) { ctx.ui.notify("No tool images in this branch.", "info"); return; }
			const choices = images.map(({ image, toolName }, index) => `${index + 1}. ${toolName} · ${image.mimeType}`);
			const selected = images.length === 1 ? choices[0] : await ctx.ui.select("Open image (newest first)", choices);
			if (selected) await viewImage(images[choices.indexOf(selected)]!.image, ctx);
		},
	});
	pi.on("agent_start", () => transcript?.beginTurn());
	pi.on("agent_settled", () => transcript?.finishTurn());
	pi.on("message_start", (event, ctx) => {
		if (event.message.role !== "user") return;
		const previous = ctx.sessionManager
			.getBranch()
			.filter(
				(entry) => entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "user"),
			)
			.at(-1);
		if (previous?.type !== "message" || previous.message.role !== "assistant" || previous.message.stopReason !== "stop")
			return;
		// Queued requests can follow a final answer without agent_settled between them.
		transcript?.finishTurn();
		transcript?.beginTurn();
	});
	pi.on("session_start", (_event, ctx) => {
		unmount?.();
		unmount = undefined;
		transcript = undefined;
		if (!ctx.hasUI || ctx.mode !== "tui") {
			releasePreparation();
			return;
		}
		ctx.ui.setWidget("pi-collapse-transcript.host", (tui, theme) => {
			unmount?.();
			const releaseHistory = installTranscriptHistory(tui);
			releasePreparation();
			const timings = new ActivityTimings();
			let previousLeaf: string | null | undefined;
			const release = mountTranscriptProjection(tui, (entries) => {
				transcript = new ActivityTranscript(
					() => {
						const leaf = ctx.sessionManager.getLeafId();
						if (leaf !== previousLeaf) {
							timings.load(ctx.sessionManager.getBranch());
							previousLeaf = leaf;
						}
						return entries();
					},
					theme,
					() => tui.requestRender(),
					timings,
					undefined,
					tui,
					(image) => { void viewImage(image, ctx); },
				);
				return transcript;
			});
			const dispose = () => {
				release?.();
				releaseHistory();
			};
			unmount = dispose;
			return {
				render: () => [],
				invalidate() {},
				dispose: () => {
					dispose();
					if (unmount === dispose) unmount = undefined;
				},
			};
		});
	});
	pi.on("session_shutdown", (_event, ctx) => {
		releasePreparation();
		unmount?.();
		unmount = undefined;
		transcript = undefined;
		if (ctx.hasUI && ctx.mode === "tui") ctx.ui.setWidget("pi-collapse-transcript.host", undefined);
	});
}
