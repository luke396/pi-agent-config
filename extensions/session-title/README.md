# Evolving session titles

Original, dependency-free Pi extension. It only changes the native session name
(`pi.setSessionName`); Pi keeps its native header and footer, and
pi-vim keeps the editor.

After a completed interactive conversation, an unnamed session gets a short
name. Subsequent completed activity can evaluate the current main topic with the
previous title. The naming prompt favors **KEEP** unless the topic materially
changes, and asks for the latest user's language, including concise Chinese.
Topic judgement is model-dependent; mocks do not establish real model quality.

## Model and limits

The checked-in [config.json](config.json) selects **`deepseek/deepseek-flash`**,
independent of the active chat model and the memory extension:

```json
{
  "model": "deepseek/deepseek-flash"
}
```

Edit `~/.pi/agent/extensions/session-title/config.json`, then run `/reload`.
Configuration is fixed for each extension runtime; editing the file does not
change an in-flight request. The file contains only the model selection and is
synced with this repo, not credentials.

An environment variable can override the file for one machine or invocation:

```sh
PI_AUTO_TITLE_MODEL=deepseek/deepseek-flash \
PI_AUTO_TITLE_COOLDOWN_MS=600000 pi
```

Model precedence: `PI_AUTO_TITLE_MODEL` → `config.json`'s `model` → the legacy
`openai/gpt-6-luna` default only if the file is absent. A present file must be
valid JSON with a string `model` in `provider/model-id` format (model IDs may
contain `/`). An unreadable/invalid file disables requests rather than silently
using another provider, unless the environment override is set. Cooldown remains
a finite nonnegative number of milliseconds; invalid values disable requests.
Use `/auto-title status` to inspect the selected model and configuration status.
Shell environment changes require starting Pi with the new environment.

The configured model must be a chat model. Pi's model registry resolves it and
its authentication; this extension never reads or writes credential files.
Depending on the provider and model, requests can consume subscription allowance
or API credit. Naming calls are currently **not included in Pi's footer or
`/session` token totals**; consult the provider's usage view.
Version-specific verification is recorded below.

- At most 8 recent user/assistant text messages, 1,200 UTF-16 code units each and
  6,000 total, from Pi's active projected context (honoring compaction/context
  edits). Tools, thinking, images, custom messages and summaries are excluded.
  This text and the previous title (capped at 120 UTF-16 code units) are sent to
  the dedicated naming provider.
- One request, low reasoning, 2,048 output tokens, 20-second deadline/abort,
  provider timeout and zero SDK retries. No provider/model fallback.
- Default cooldown is **10 minutes since the attempt**, including missing model,
  authentication/provider failure, invalid response and KEEP. Attempt time
  persists across resume. A later completed turn can be checked after cooldown,
  even when its bounded text matches the previous attempt.
- Only `agent_settled` in `ctx.mode === "tui"` triggers automatic work. No startup
  requests, polling or scheduling. The only timer bounds an active request.
  Print/JSON/RPC runs do not automatically name sessions.
- Only successful (`stopReason: "stop"`) formal text containing a JSON rename is
  accepted. Titles must be nonempty, trimmed, single-line, at most 60 Unicode
  code points, and free of control/format characters and terminal escapes.
  KEEP, truncation, thinking-only output and failures preserve the current name.

## Manual ownership and commands

`/name`, `--name`, picker renames, other extensions' renames, and clearing a name
have priority. A session with name metadata but no automatic-ownership evidence
is pinned. Manual changes pin even when the new text equals the old text.

| Command | Meaning |
| --- | --- |
| `/auto-title` or `/auto-title status` | Show auto/pinned state, model, cooldown and runtime result. |
| `/auto-title off` | Pin the current name (including an empty name); abort pending work. |
| `/auto-title on` | Explicitly opt back in and adopt the current title; do not request immediately or reset cooldown. |
| `/auto-title now` | While enabled, request once using completed text, bypassing cooldown. Does not unpin or overlap an existing request. Works in other modes too. |

Ownership and attempts use native `session-title.v1` custom entries, outside
model context. The marker identifies the exact owned `session_info` entry,
not merely its title text. State follows file order because Pi's session name is
session-global; branch navigation must not resurrect old automatic ownership.
Recent conversation data is branch/projected-context scoped.

Rename events cancel work; before applying any result the extension also checks
current name-entry identity, runtime/session lifetime and the input snapshot.
This covers delayed event handlers and providers that ignore abort. Session
replacement, shutdown, tree/fork navigation and new agent activity invalidate
pending results. A cancelled navigation may skip that attempt; the next completed
activity follows normal throttling. Automatic work never holds `agent_settled`.
If a provider ignores abort, its lane stays occupied until it settles: `/now`
will not launch overlapping work. Its late result cannot rename the session.
Shutdown clears the deadline timer; no scheduler remains.

## Verification

### Offline checks

From the repository root, using Node 26.7.0's native TypeScript support:

```sh
node --test tests/session-title.test.ts
```

All 53 tests passed. They wire the actual extension factory to a minimal Pi
fake, with deferred providers and mocked time, and make **no provider requests**.
Configuration checks cover the selected model, file reload, environment priority,
and missing, unreadable or invalid files.
The fake models Pi 1.2.0's retained entry-data references, session-global names,
projected context, and delayed name events.

A separate offline check with a clean Pi 1.2.0 agent directory resolved the
default `openai/gpt-6-luna` through `modelRegistry.find()` as `type: "chat"`,
`api: "openai-responses"`. This verifies catalog registration only. Live naming,
ChatGPT OAuth, and TUI behavior have not been rechecked on Pi 1.2.0.

### Current integration check — Pi 1.3.0

An isolated, in-memory RPC session loaded the real extension and checked-in
config without `PI_AUTO_TITLE_MODEL`. `/auto-title status` reported
`deepseek/deepseek-flash`; after a short synthetic Chinese conversation,
`/auto-title now` produced a Chinese native session title and reported
`Title updated`. This checks file loading, provider authentication and the
real naming request, not automatic TUI triggering or general model quality.

### Historical integration check — Pi 1.0.3

Original API contract checks used the installed 1.0.3 docs and official `v1.0.3`
source, especially `session_info_changed`, `agent_settled`, session-global names
and `ctx.modelRegistry.streamSimple(...).result()`.

A separate integration check on Pi 1.0.3 with GPT-6 Luna and existing ChatGPT
OAuth verified first Chinese naming, KEEP on the same topic, a Claude/IP to Pi
extension topic change, automatic ownership across resumes, and manual pinning
without extra requests. A real TUI run also verified automatic triggering and
name rendering with the installed pi-open-tui. Four naming requests completed in
3.2–3.6 seconds on those small synthetic inputs; this is not a general latency
or semantic-accuracy benchmark.
