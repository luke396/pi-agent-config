# Pi agent config

My day-to-day [Pi](https://pi.dev) configuration, shared across my Linux machines:
working principles, task-specific skills, local extensions, and package choices.

## Contents

| Area | Files |
| --- | --- |
| Working principles | [AGENTS.md](AGENTS.md): scope, delegation, code judgement, testing, and communication. |
| Reviewing changes | [minimal-diff](skills/minimal-diff/SKILL.md): question added mechanisms against the pre-feature baseline. |
| Improving the workflow | [history-retrospective](skills/history-retrospective/SKILL.md): learn from recurring problems in actual work. |
| Learning | [learn-from-work](skills/learn-from-work/SKILL.md): explore durable technical questions through conversation. |
| Research and recall | [community-research](skills/community-research/SKILL.md) and [agent-history](skills/agent-history/SKILL.md). |
| Visual explanations | [show-me](skills/show-me/SKILL.md), invoked explicitly and adapted from HumanLayer. |
| Session naming | [session-title](extensions/session-title/README.md): evolving titles with manual ownership and bounded extra requests to a dedicated chat model. |
| Project rules | [claude-rules.ts](extensions/claude-rules.ts): advertise `.claude/rules/**/*.md` for selective loading. |
| Skill invocation | [manual-only-skills.ts](extensions/manual-only-skills.ts): keep `research`, `writing-for-agents`, `code-review`, and `grilling` available through `/skill:name` while hiding them from automatic selection. |
| Thinking control | [thinking-toggle.ts](extensions/thinking-toggle.ts): model-aware two-stop Shift+Tab; clear the native thinking shortcut as in [keybindings.json](keybindings.json). |
| Quiet display | [quiet-tui.ts](extensions/quiet-tui.ts): disable pi-libtui's bubbles and animations. |
| Transcript folding | [collapse-transcript](extensions/collapse-transcript/README.md): locally maintained fork with native images below collapsed activity; expanded groups keep the original tool views. |
| Conversation Fast mode | [openai-fast-mode.ts](extensions/openai-fast-mode.ts): defaults on for `openai/gpt-6-astra`; `/fast on` and `/fast off` override it for the session. |
| Astra compaction | [astra-fast-compaction.ts](extensions/astra-fast-compaction.ts): request Fast (`priority`) only when compacting `openai/gpt-6-astra`. |
| Settings sync | [settings-sync.ts](extensions/settings-sync.ts), [setup.sh](setup.sh), and [.gitignore](.gitignore). |

[settings.json](settings.json) lists current packages and preferences;
[mcp.json](mcp.json) declares the DeepWiki server.
[Configuration notes](skills/pi-config/reference.md) explain past decisions and
traps, some of which concern settings that have since changed.

## Main choices

- Tools are exposed through codemode. Thinking defaults to `max`; the local
  shortcut switches between two model-appropriate levels.
- Pi keeps its native header/footer, with `pi-vim`'s editor and Catppuccin Mocha.
  `pi-catppuccin-tui` loads themes only; transcript grouping requires fullscreen.
  The local folding module keeps tool images visible below collapsed groups;
  regular scrollback is unchanged. It reuses pinned `pi-libtui`, including its
  codemode presentation, mouse and history bridge.
- Delegation and research use `pi-subagents`, `pi-web-access`, and selected
  upstream skills. `AGENTS.md` defines when delegation is authorized.

The session-title extension sends recent conversation text to a separate naming
model. Calls can consume allowance or API credit and are absent from Pi's session
token totals. Its [README](extensions/session-title/README.md) owns the model,
input limits, and controls. `/auto-title off` disables naming for the current
session; omit or disable the extension to avoid these calls altogether.

History-based skills require a separately configured `agent-history` CLI and
archive. Provider accounts, web search, and remote MCP have their own setup and
data flows; this repo does not provision them.

## OpenAI Fast mode

Fast (`service_tier: "priority"`) defaults on when `openai/gpt-6-astra` is
selected, for conversation requests including their cache-warming replays.
Other models default off. Until explicitly overridden, this default follows
model changes; the footer shows `fast` while active.

`/fast on` and `/fast off` override the default for the current session. A manual
choice survives model changes; on applies to all `openai` models and is inactive
on other providers. `/fast` reports the state without changing it. New, resumed,
forked, or reloaded sessions return to the selected model's default.

`/fast off` removes only this extension's override: a tier set in local
`models.json` remains in effect, so off does not guarantee Standard pricing.
Compaction and extension-initiated calls keep their own settings.

Fast can consume more allowance or cost more. Pi's displayed cost may not
reflect this override; check provider usage for billing.

## Astra compaction

The local extension requests Fast (`service_tier: "priority"`) for manual and
automatic compaction of `openai/gpt-6-astra`. It sends no
`OpenAI-Service-Tier` header; that header is reserved for Ultrafast.
Normal conversation (including its separate `/fast` choice), other models,
branch summaries, and the selected thinking level are unchanged. It reuses Pi's
native summarizer, retained-history boundary, file tracking, usage accounting,
and retry policy. The old `astraUltrafast` details marker is intentionally kept
so previously compacted sessions retain their cumulative file lists.

Fast has higher pricing/allowance consumption; see OpenAI's
[speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed).
The switch from Ultrafast followed account-specific catalog checks: both the
public API OAuth and Codex OAuth catalogs advertised only `priority` for Astra.
HTTP 200 does not prove acceleration, and an OAuth response echoing `default`
does not by itself prove a downgrade. The extension reports a differing echo
while keeping the completed summary. Request failures report an error and
cancel compaction instead of silently starting an ordinary-tier attempt.

Load it with `/reload` or a new Pi session. It changes neither `models.json`
nor the session's selected model. Pi 1.2.0 fake-API tests verify `priority` in
the body, absence of the Ultrafast header, and unchanged normal requests.

## Reuse

Copy skills as whole directories, keeping supporting files and license notices.
Copy chosen extensions into `~/.pi/agent/extensions/` and reload Pi, or try one
with `pi -e /path/to/extension.ts`. Keep `session-title` and `collapse-transcript`
as directories; the folding module also needs its documented libtui package
declaration. Adapt keybindings alongside the thinking toggle. Skills and non-sync extensions can be
reused without running this repository's setup script.

For this repository's settings-sync workflow, keep [.gitattributes](.gitattributes),
[.githooks/](.githooks/), [setup.sh](setup.sh), and [.gitignore](.gitignore) with the
extension and follow [Syncing my machines](#syncing-my-machines).

Review personal instructions before reusing them: the final section of
`AGENTS.md` names this repository and requires committing/pushing config edits.

## Syncing my machines

The agent directory is a normal Git checkout at `~/.pi/agent`. Run `setup.sh`
explicitly to initialize settings sync and install the Git hooks. It requires
Git, Bash, and Node.js >=22.19 on `PATH`, but does not launch Pi. It prepares the
settings filter and sets `core.hooksPath` to `.githooks`, replacing any previous
value. The hooks call `extensions/settings-sync.ts` directly after merges and
rewrites; they do not rerun setup. Pi also prepares the filter at session start.

Neither setup nor the Git hooks install or update packages. Normal online Pi
startup installs missing configured packages. Run `pi update --extensions`
explicitly to upgrade existing packages. Most package references are unpinned,
so installation and updates can fetch newer code and run dependency scripts.
`pi-libtui` is pinned to the version checked with the local folding fork.

New-machine steps and the first-login caveat are in the [setup header](setup.sh).
Back up existing configuration before replacement; do not force-checkout over
it. Run setup only in the intended agent directory, matching
`PI_CODING_AGENT_DIR` if set.

Credentials, sessions, trust decisions, and machine-local settings stay local;
see [.gitignore](.gitignore) and the sync extension. Local settings are saved at
session start/end, not continuously. Use ordinary Git for shared changes and
inspect staged content: missing filters or malformed input can pass through.
Ignoring a file does not remove its earlier Git history.

## Tests

Verified with Node.js 26.7.0 and Pi 1.3.0: **91 offline tests passed**. The suite
uses temporary Git fixtures, fake providers, and native transcript components:

```sh
node --test tests/settings-sync.test.mjs tests/*.test.ts \
  tests/astra-fast-compaction.test.mjs tests/openai-fast-mode-provider.test.mjs \
  tests/visible-tool-images.test.mjs tests/collapse-transcript.test.mjs
```

The Astra and Fast-switch provider tests use the installed `pi` on `PATH` and
loopback fake OpenAI APIs; they also work with the standalone distribution.
No live credentials are used. The folding and image tests also run inside the
installed Pi, using the local fork and managed libtui. They preserve the upstream
behavioral assertions for grouping, timing, queued requests and compaction/history,
and cover image visibility, conversion/settings, streaming, mouse interaction,
regular mode and widget lifecycle.

The rules integration test is separate from the 91-test run above. It needs an
npm-installed Pi on `PATH` exposing `dist/core`; the standalone Pi distribution
does not supply those importable modules.

```sh
node --test tests/claude-rules.test.mjs
```

These tests make no live model calls. They do not verify live naming quality,
fresh online package installation, or compatibility with all third-party
packages and platforms.

## License

Original contributions: [MIT](LICENSE). Incorporated material keeps its upstream
notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Installed packages
retain their own licenses.
