# How this pi config is arranged, and why

Everything here was learned by reading pi's source and the installed packages,
and by testing. When a fact matters, cite where it came from rather than
restating it as opinion.

## Sync model

`~/.pi/agent` is both pi's live config and a git repo
(`github.com/luke396/pi-agent-config`). The working tree *is* the live config,
so `git status` reports exactly what has not been pushed.

The repo is cloned in place rather than symlinked, because Omarchy rewrites
`settings.json` by writing a temp file and `mv`-ing it over the original — that
replaces the inode, which would break a symlink. Assume any external writer may
do this.

- Per-machine files, and the reason for each: `.gitignore` (source of truth —
  do not restate its list elsewhere).
- New-machine steps: the header comment of `setup.sh`.
- `.githooks/post-merge` re-runs `setup.sh` after every pull.

## Single-owner UI slots

Three slots, each owned by exactly one extension (`docs/extensions.md`):

| Slot | Area |
|---|---|
| `ctx.ui.setHeader` | block above the editor |
| `ctx.ui.setFooter` | footer |
| `ctx.ui.setEditorComponent` | input box |

These are **replacements, not layers**. Two packages hooking the same slot do
not compose: the last to register wins and the loser's features go inert with no
error. Registration order follows the `packages` array order in `settings.json`,
so that order is a knob.

The docs recommend wrapping with `ctx.ui.getEditorComponent()` to compose; both
packages here that touch the editor call `setEditorComponent` with a fresh
component and never read the incumbent, so they genuinely collide.

Current ownership, and what it cost:

| Slot | Owner | Consequence |
|---|---|---|
| header, footer | `pi-open-tui` | — |
| editor | `pi-vim` (registers last) | open-tui's editor features are inert: rounded frame, cursor style, fullscreen wheel-scroll setting, and the thinking peek |

Resolved conflicts, and why each solution was chosen:

- `pi-powerline-footer` was removed outright: it hooked all three slots, exactly
  like `pi-open-tui`.
- `pi-catppuccin-tui` ships a theme **and** an extension that hooks
  `setFooter`, so only its themes load: `{"source": "npm:pi-catppuccin-tui",
  "extensions": []}`.
- The thinking peek is switched off (`thinkingPeek.lines: 0` in
  `open-tui.json`). It would otherwise call into a TUI handle that pi-vim's
  editor never mounted, throwing `Open TUI editor is not mounted` while the model
  thinks. Disabling it is the fix, not an aesthetic choice.
- After any package change, re-check the map above: flipping the order of
  `pi-vim` and `pi-open-tui` hands the editor to open-tui instead.

## Resource filtering

A package entry can select what loads: `extensions`, `skills`, `prompts`,
`themes`. Omitted = load all; `[]` = load none; `!pattern` excludes; `+path` /
`-path` select exact paths relative to the package root. Canonical syntax:
pi's own `docs/packages.md` — cite it instead of copying it.

This is the mechanism that lets a "theme-only" install be safe: filter the
extension, keep the theme.

## Context-file layers

pi loads, at startup: `~/.pi/agent/AGENTS.md` (global, this repo) plus
`AGENTS.md` or `CLAUDE.md` from the current directory and its ancestors. An
`AGENTS.override.md` in a directory *replaces* the other two in that directory.
There is **no include/import syntax** (`docs/quickstart.md`), so a file can only
be pulled in by the agent choosing to read it.

That gives three tiers with different costs:

| Tier | In context | Cost |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` | always, guaranteed | tokens every session, forever |
| a skill's `description` | always (model-invoked skills) | one line every session |
| on-demand file (this one, a doc, a skill body) | only when reached | zero until read |

Consequences worth keeping: rules that must always hold stay in `AGENTS.md`;
material reached only by a pointer is probabilistic, so a must-have behind a weak
pointer is a bug in the pointer's wording, not in the reader. Do not let a
pointer duplicate its target — one home per fact.

## Theme pipeline

Omarchy owns the desktop theme and renders pi's theme file from
`$OMARCHY_PATH/default/themed/pi.json.tpl` into
`~/.pi/agent/themes/omarchy-system.json`, rewriting it on each theme change (so
that file is gitignored, and shipping it would fight the generator).

pi is instead pinned to `catppuccin-tui-mocha`, so **pi no longer follows the
desktop theme** — it matches Catppuccin Mocha by choice, not construction.
`omarchy-theme-set-pi --activate` writes `theme: "omarchy-system"` back into
`settings.json`, but only at install time; later theme switches leave the
setting alone.

`pi-open-tui` renders entirely from pi's theme tokens (no hardcoded colours), so
a theme change moves pi and open-tui together. A TUI package with its own theme
or hardcoded colours would not.

## Pitfalls that cost real time here

- **A gitignore pattern without a leading slash matches at any depth.** `dir/`
  silently ignored a nested `extensions/dir/theme.json`. Anchor patterns with
  `/` when the intent is repo-root-only.
- **Symlinked directories in `skills/`** (Omarchy installs two) would commit as
  mode `120000` — i.e. a dangling pointer on another machine, not a skill. Check
  mode before staging content that is not a plain file.
- **Regenerated and machine-bound files look like config.** `sessions/`, `npm/`,
  `git/`, `models-store.json`, `missions/`, `run-history.jsonl` all carry
  host-local state or path hashes; `auth.json`, `models.json` and `trust.json`
  are per-machine by security (credentials, provider endpoints, pre-approved
  directories — syncing the last one would auto-approve unknown paths).
- **pi writes a 2-byte `{}` `auth.json` on startup**, so its appearance in a
  fresh clone proves nothing about whether credentials leaked; check
  `git ls-files` and history instead.
- **Undocumented internal field names change between layers.** Powerline's own
  `context-usage.ts` uses `contextTokens`/`contextPercent`, while the public
  `ctx.getContextUsage()` returns `{tokens, contextWindow, percent}`. Only
  `tokens` is documented. Read such fields defensively.
