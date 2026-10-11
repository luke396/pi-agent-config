# Response metrics

A local, dependency-free status extension for Pi 1.0.4. It leaves the native
footer, theme and pi-vim editor in control.

```text
TTFT 1.2s · TPS ~42.3 tok/s · 耗时 12.4s
```

One assistant response is one sample. The live value is its cumulative average,
refreshed every 250 ms, including while no new output arrives.

- **TTFT:** `before_provider_request` → first nonempty text, thinking or
  tool-argument delta. Start/metadata events do not stop the clock.
- **TPS:** output tokens / seconds from that first delta to now, or to
  `message_end` when finished. All time inside that window stays in the
  denominator. No stall subtraction, caps, smoothing or alternative windows.
- **Live counts:** accumulated UTF-8 delta bytes / 4, with no per-delta
  rounding. The `~` marks this language/model-dependent estimate.
- **Finished counts:** positive finite provider `usage.output` replaces the
  estimate. Missing/zero/invalid usage leaves the estimate marked `~`.
  Reported usage can include reasoning that was not visible in the stream.
- **Elapsed:** `before_provider_request` → now/message end, including TTFT.
  These are client-observed hook boundaries, not server decode timestamps.

The display freezes at assistant `message_end`, before tool execution. The
next turn starts a new sample. Repeated request hooks reset the attempt;
provider-internal retries that do not emit a new hook stay within the current
measurement.

Without a request hook, TTFT and elapsed are unavailable rather than timed from
another boundary. Without a nonempty delta or positive output interval, TPS is
unavailable. Cancelled and failed messages are labelled. No partial-message
content is modified.

Only TUI sessions collect/display metrics. The timer stops at message/run end,
session changes, model selection, and shutdown. The last result is kept in the
status line until the next response or reset. There are no commands, history
entries, files written, or extra model requests.

## Verification

```sh
node --test tests/response-metrics.test.ts
```
