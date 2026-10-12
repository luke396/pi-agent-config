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
| Session naming | [session-title](extensions/session-title/README.md): evolving titles with manual ownership and bounded requests. |
| Project rules | [claude-rules.ts](extensions/claude-rules.ts): advertise `.claude/rules/**/*.md` for selective loading. |
| Skill invocation | [manual-only-skills.ts](extensions/manual-only-skills.ts): keep `research`, `writing-for-agents`, `code-review`, and `grilling` available through `/skill:name` while hiding them from automatic selection. |
| Thinking control | [thinking-toggle.ts](extensions/thinking-toggle.ts): model-aware two-stop Shift+Tab, paired with [keybindings.json](keybindings.json). |
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

## Reuse

Copy skills as whole directories, keeping supporting files and license notices.
Copy chosen extensions into `~/.pi/agent/extensions/` and reload Pi, or try one
with `pi -e /path/to/extension.ts`. Keep `session-title` as a directory and adapt
keybindings alongside the thinking toggle. Individual components do not require
running this repository's setup script.

Review personal instructions before reusing them: the final section of
`AGENTS.md` names this repository and requires committing/pushing config edits.

## Syncing my machines

The agent directory is a normal Git checkout at `~/.pi/agent`. `setup.sh` is a
bootstrap convenience requiring Git, Bash, Node.js >=22.19, and Pi on `PATH` for
package updates. It prepares the settings filter, sets `core.hooksPath` to
`.githooks` (replacing any previous value), and runs `pi update --extensions`.
Pi also prepares the filter at session start; the Git hooks rerun setup after
merges and rebases. Package references are unpinned, and updates can install
newer code and run dependency scripts. Check warnings even when setup says done.

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

Verified with Node.js 26.7.0 and Pi 1.1.0. Offline tests use temporary Git fixtures
and fake providers:

```sh
node --test tests/settings-sync.test.mjs tests/*.test.ts
```

The integration test additionally needs an npm-installed Pi on `PATH` exposing
`dist/core`. The standalone Pi distribution does not supply those importable
modules.

```sh
node --test tests/claude-rules.test.mjs
```

These tests make no model calls and do not verify live naming quality or all
third-party packages and platforms.

## License

Original contributions: [MIT](LICENSE). Incorporated material keeps its upstream
notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Installed packages
retain their own licenses.
