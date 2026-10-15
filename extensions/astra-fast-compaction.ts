import {
	compact,
	type CompactionDetails,
	type ExtensionAPI,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";

// Keep the persisted marker so sessions compacted before the Fast switch retain file lists.
type AstraCompactionDetails = CompactionDetails & { astraUltrafast: true };

export default function (pi: ExtensionAPI) {
	pi.on("session_before_compact", async (event, ctx) => {
		// Pi skips file lists from fromHook entries. Carry our native-format lists
		// forward, including when the next compaction uses another model.
		const previous = event.branchEntries.findLast((entry) => entry.type === "compaction");
		const details = previous?.details as AstraCompactionDetails | undefined;
		if (details?.astraUltrafast) {
			for (const file of details.readFiles) event.preparation.fileOps.read.add(file);
			for (const file of details.modifiedFiles) event.preparation.fileOps.edited.add(file);
		}

		const model = ctx.model;
		if (model?.provider !== "openai" || model.id !== "gpt-6-astra") return;

		try {
			event.signal.throwIfAborted();
			const settings = SettingsManager.inMemory(pi.getSettings());
			const providerRetry = settings.getProviderRetrySettings();
			const timeoutMs = providerRetry.timeoutMs ?? (settings.getHttpIdleTimeoutMs() || 2147483647);

			// Default compaction bypasses before_provider_request. Reuse its native
			// summarizer and set the tier on these requests only, after payload conversion.
			const result = await compact(
				event.preparation,
				model,
				undefined,
				undefined,
				event.customInstructions,
				event.signal,
				pi.getThinkingLevel(),
				(requestModel, context, options) => ctx.modelRegistry.streamSimple(requestModel, context, {
					...options,
					...providerRetry,
					timeoutMs,
					websocketConnectTimeoutMs: settings.getWebSocketConnectTimeoutMs(),
					// Fast uses the body only; OpenAI-Service-Tier is reserved for Ultrafast.
					onPayload: (payload) => ({ ...(payload as Record<string, unknown>), service_tier: "priority" }),
					onProviderStreamEvent: (data) => {
						const response = data as { type: string; response?: { service_tier?: string } };
						const tier = response.response?.service_tier;
						if (response.type === "response.completed" && tier && tier !== "priority" && tier !== "fast") {
							ctx.ui.notify(`Astra compaction requested Fast (priority); provider reported ${tier}.`, "warning");
						}
					},
				}),
				undefined,
				settings.getRetrySettings(),
			);
			event.signal.throwIfAborted();
			return {
				compaction: {
					...result,
					details: { ...(result.details as CompactionDetails), astraUltrafast: true },
				},
			};
		} catch (error) {
			if (!event.signal.aborted) {
				ctx.ui.notify(`Astra Fast compaction failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
			// Throwing from this hook makes Pi fall back to ordinary compaction.
			return { cancel: true };
		}
	});
}
