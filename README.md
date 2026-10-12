# Pi agent config

My day-to-day [Pi](https://pi.dev) configuration: working principles, task-specific
skills, a few local extensions, and shared preferences across machines.

Maintained for personal use on Linux. Borrow individual pieces or adapt a fork;
compatibility with every Pi version, provider, terminal, and operating system
is not promised. Package choices change as the workflow changes.

## Start here

| Area | What to look at |
| --- | --- |
| Working principles | [AGENTS.md](AGENTS.md): task scope, delegation, code judgement, verification, and communication. |
| Reviewing changes | [minimal-diff](skills/minimal-diff/SKILL.md): test whether added mechanisms are necessary against the pre-feature baseline. |
| Improving the workflow | [history-retrospective](skills/history-retrospective/SKILL.md): look for recurring problems in real work; distinguish evidence from assumptions. |
| Learning from work | [learn-from-work](skills/learn-from-work/SKILL.md): find durable technical questions and explore them through conversation. |
| Research and recall | [community-research](skills/community-research/SKILL.md) and [agent-history](skills/agent-history/SKILL.md). History retrieval needs a separately configured `agent-history` CLI and archive. |
| Visual explanations | [show-me](skills/show-me/SKILL.md), adapted from HumanLayer and available by explicit invocation. |
| Session naming | [session-title](extensions/session-title/README.md): evolving titles, manual ownership, bounded requests, and offline tests. |
| Project rules | [claude-rules.ts](extensions/claude-rules.ts): list `.claude/rules/**/*.md` in a structured prompt section so the agent can load relevant files. |
| Thinking control | [thinking-toggle.ts](extensions/thinking-toggle.ts): a model-aware two-stop Shift+Tab toggle, paired with [keybindings.json](keybindings.json). |
| Multi-machine settings | [settings-sync.ts](extensions/settings-sync.ts), [setup.sh](setup.sh), and [.gitignore](.gitignore). |

[Pi configuration notes](skills/pi-config/reference.md) record past decisions and
traps. [settings.json](settings.json) is the source of truth for current package
choices; historical notes can describe settings that have since changed.

## Deliberate defaults

- **Tools through codemode:** the built-in tools remain available through
  `codemode`, with `codemode.mode` set to `only`.
- **Thinking:** default `max`; Shift+Tab uses medium/max for the catch-all model
  rule and high/max for DeepSeek. Unsupported levels are rejected with a notice.
  Built-in model cycling shortcuts are also cleared in `keybindings.json`.
- **UI:** Pi's native header/footer, `pi-vim`'s editor, and Catppuccin Mocha.
  `pi-catppuccin-tui` loads themes only. Transcript grouping from
  `@luan.sh/pi-collapse-transcript` requires fullscreen mode.
- **Delegation and research:** `pi-subagents`, `pi-web-access`, and the engineering
  and productivity collections from `mattpocock/skills`. Delegation policy lives
  in `AGENTS.md`; installing the extension alone does not authorize delegation.
- **Other packages:** Supi settings/skill/context helpers, response statistics,
  and structured questions. See the package list for exact sources and filters.
- **MCP:** [mcp.json](mcp.json) declares the remote DeepWiki server.
- **Terminal:** Kitty image protocol is selected. Change `terminal.images` to
  `auto` or a protocol your terminal supports if needed.

### Model calls and data

The session-title extension can send recent user/assistant text to a **separate
naming model**, defaulting to `openai/gpt-6-luna`. The bounded input is up to eight
messages and 6,000 UTF-16 code units, plus the previous title. These requests can
consume subscription allowance or API credit and are not included in Pi's
session token totals. See its [README](extensions/session-title/README.md) for
exact limits, environment variables, and `/auto-title` controls.

If you do not want these calls, omit the extension when copying components or
disable it with `pi config` before your first conversation. `/auto-title off`
pins the current session. Provider/model availability and authentication are
machine-local; this repository does not supply accounts or credentials.

Remote MCP, web search, and delegated model calls have their own data flows and
setup requirements. Review the selected packages before enabling them.

## Use individual pieces

Most skills can be copied as whole directories into `~/.pi/agent/skills/`, keeping
supporting files and license notices. Read each skill's prerequisites first.
`agent-history`, history retrospectives, and history-based topic discovery need
your own history service; this repo does not provision one.

Extensions can be tried for a single invocation, for example:

```sh
pi -e /path/to/pi-agent-config/extensions/claude-rules.ts
```

For persistent use, copy the chosen extension into `~/.pi/agent/extensions/` and
reload Pi. Copy `session-title` as a directory. Adapt keybindings alongside the
thinking toggle to avoid two handlers owning Shift+Tab.

`settings-sync.ts` is tied to a Git-managed agent directory. Use it with the sync
files below rather than treating it as an isolated utility. This repository is
an agent-directory layout, not a published npm package.

## Adopt the whole configuration

### Prerequisites

- Pi on `PATH`; this configuration was reviewed with **Pi 1.1.0**.
- **Node.js 22.19 or newer** on `PATH` for the setup script's native TypeScript
  execution. The tests below were run with **Node.js 26.7.0**.
- Git, Bash, and network access to install the declared packages.
- Your own provider authentication. Search and other integrations may require
  additional machine-local setup; `setup.sh` does not provision these services.

Package references are currently **unpinned**. Setup and package updates can
resolve newer versions, so a new installation is not a reproducible copy of a
previous machine. Review upstream changes; pin versions in your fork if needed.
Extensions execute code, and package installation may run dependency scripts.

### Fresh agent directory

Fork this repo if you intend to change or sync it. Review `AGENTS.md`, especially
its final section: it directs agents to commit and push edits to the author's
repository. **Replace that repository identity and policy in your fork before
using it as global agent instructions.** Review the model-call defaults above.

The following is for an absent or empty `~/.pi/agent`. Substitute your fork URL;
`git clone` will refuse a nonempty destination.

```sh
git clone https://github.com/YOUR-USER/pi-agent-config.git "$HOME/.pi/agent"
cd "$HOME/.pi/agent"
./setup.sh
pi
```

Authenticate with `/login`, then select and save your local default model using
`/model` (Ctrl+S). After the first ChatGPT login attempt on a machine without a
`deviceId`, exit Pi normally and reopen it before pulling configuration—even if
the login was cancelled. This lets the sync extension save newly created local
fields.

### Existing agent directory

**Back up first; do not force-checkout this repository over a live setup.**
Tracked files replace preferences, instructions, keybindings, and extensions;
`.gitignore` does not protect an existing `settings.json` from replacement.

1. Stop Pi sessions that use the directory. Make a complete private backup,
   including hidden files, outside any repository or Pi auto-discovery directory.
   The backup contains credentials and conversations: restrict access to it.
2. Prefer selecting individual components. For a full replacement, move the old
   agent directory aside and clone your fork into the now-absent destination.
3. Before setup, restore only the machine-local files you need from the backup
   (see `.gitignore`) and merge the settings you want to keep. In particular,
   restore local model defaults, device fields, and per-model compaction overrides
   into the new `settings.json` before setup captures them. Do not copy an old
   `.git` directory or overwrite the new shared configuration wholesale.
4. Run `./setup.sh`, review `git diff` and `git diff --cached`, then start Pi and
   verify authentication, model selection, and loaded resources. Keep the backup
   until the new setup works.

This is a manual migration, not a lossless automatic merge. `trust.json` records
local directory approvals; do not carry it to a different machine indiscriminately.

### What setup and sync change

`setup.sh`:

1. Saves machine fields in ignored `.git-sync/settings.machine.json` and installs
   a local Git clean/smudge filter for `settings.json`.
2. Sets this checkout's `core.hooksPath` to `.githooks`, replacing any existing
   hooks-path setting. Review/integrate your own hooks before adopting it.
3. Runs `pi update --extensions` when Pi is available. This installs/reconciles
   packages and may use the network. It does not install Pi or log in for you.

The post-merge and post-rewrite hooks rerun setup, so pulls and rebases can also
update packages. A package-update failure prints a warning; `done.` alone is
not proof that dependencies installed successfully.

Run setup from the intended agent directory. `PI_CODING_AGENT_DIR`, when set,
must point to that same directory: the Git filter follows the checkout, while
Pi's package command follows its configured agent directory.

The filter keeps `deviceId`, `lastChangelogVersion`, `defaultProvider`,
`defaultModel`, and `compaction.modelOverrides` local. Pi saves these at session
start/end, not continuously after every edit. Credentials, sessions, trust,
package checkouts, generated themes, and runtime state remain untracked; see
[.gitignore](.gitignore) for the individual boundaries.

Use ordinary Git to review, commit, push, and pull shared settings. The sync
extension does not do those operations automatically. **The filter is a
convenience, not a secret scanner:** missing filters and malformed input can
pass through. Inspect staged content before committing; ignoring a file now
does not remove earlier versions from history.

## Verification

Self-contained offline tests (temporary Git fixtures; no provider calls):

```sh
node --test tests/settings-sync.test.mjs tests/session-title.test.ts
```

The rules/Supi integration test additionally needs an **npm-installed Pi on
`PATH`** exposing `dist/core`, plus `@mrclrchtr/supi-skills` installed under this
checkout's `npm/` by setup. The bundled standalone CLI does not provide those
importable test modules.

```sh
node --test tests/claude-rules.test.mjs
```

These checks cover the tested sync and extension behavior, not every third-party
package, real naming-model quality, or terminal/platform combination. The
session-title README distinguishes its earlier live checks from offline tests.

## License and publication review

Original contributions are available under the [MIT License](LICENSE).
Incorporated third-party material retains its own copyright and license notices;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Referenced packages remain
under their respective upstream licenses.

The dated [publication review](docs/publication-review.md) records the checked
Git history, privacy findings, validation, and remaining owner decisions. A clean
secret scan is not a guarantee that every historical detail is suitable to publish.
