# Decisions and traps from past changes

Only things the code cannot tell you: what was chosen here on purpose, and what
it cost. Mechanism syntax and APIs belong to pi's own docs, not to this file.

## Chosen on purpose

- **The repo is cloned in place, not symlinked.** Omarchy rewrites
  `settings.json` by writing a temp file and moving it over the original, which
  replaces the inode; a symlink would be left dangling. Assume external writers
  may do this.
- **pi is pinned to `catppuccin-tui-mocha`, so it no longer follows the desktop
  theme.** Matching the Catppuccin desktop today is a choice, not a
  consequence. `omarchy-theme-set-pi --activate` rewrites the setting to
  `omarchy-system`, but only at install time.
- **`pi-open-tui` owns header and footer, `pi-vim` owns the editor.** Expected
  consequence: open-tui's editor frame, cursor style and thinking peek are inert.
  A follow-up change made the peek throw rather than stay quiet, so it is off.
- **`pi-catppuccin-tui` is filtered to its themes** because its extension would
  otherwise take the footer from open-tui.
- **open-tui's `icons.mode` is pinned to `nerd`, not left on `auto`.** `auto`
  keys off `TERM_PROGRAM`/`LC_TERMINAL`, which Alacritty never sets (and Herdr
  passes through), so Linux silently fell back to ASCII (`@` `*` `#`) while the
  Mac showed real glyphs. Every terminal here is already configured with
  JetBrainsMono Nerd Font, so the pin costs nothing.
- **`pi-powerline-footer` was removed rather than filtered:** it wanted all three
  slots.
- **`pi-codex-fast-mode` was uninstalled, not replaced.** pi core forwards
  `serviceTier` into the request and prices the response by tier (priority ×2,
  flex ×0.5), but exposes no switch — no flag, no settings key, nothing in the
  docs; upstream treats tiers as too provider-specific for core. So no
  interactive session asks for Codex priority tier any more, while subagent
  children still can through pi-subagents' own fast hook. Its preference
  (`state/pi-codex-fast-mode.json`) was off.
- **Tracked local extensions are deliberate, not accidents.**
  `keybindings.json` clears pi's built-in thinking cycle (`app.thinking.cycle`)
  so `extensions/thinking-toggle.ts` is the only thinking control: Shift+Tab
  alternates between two levels, and the extension refuses to land on a level
  the current model clamps instead of silently keeping a third state.
  **The two levels are per-model in that file's `TABLE`.** pi's own cycle is
  model-aware too, but not two-stop; narrowing it is only safe if the pair
  respects each model's `thinkingLevelMap`. DeepSeek (V4 Flash / V4 Pro) sets
  `medium` to null, so its pair is high/max while Codex uses medium/max — a
  hardcoded medium/max pair made Shift+Tab a dead key on DeepSeek, which is why
  the table exists. Entries match on model id, so the proxy copy of DeepSeek
  under another provider is covered by the same row.
  `extensions/claude-rules.ts` lists a project's `.claude/rules/*.md` in the
  system prompt and is inert in projects that have no such directory.
- **`tuiMode` is pinned to `regular`, reversed from a `fullscreen` pin.**
  Fullscreen renders the transcript in the alternate screen, so the pane's
  Herdr scrollback is empty: `herdr pane list` reports
  `max_offset_from_bottom: 0` for that pane against 5408 lines for the same pi
  in regular. Copy mode then has nothing to page, and `herdr pane read
  --lines N` returns only the visible screen (49 rows) or, once it needs real
  history, fails `agent_not_idle` — alternate-screen history can only be
  captured by scrolling an idle agent, after waiting for one. Regular keeps
  history in Herdr, where reads are passive at any agent state and cost
  microseconds. For fullscreen in one session use `pi --tui-mode fullscreen`
  rather than flipping this key, so the repo stays unpinned to one machine.

## Traps that cost time

- **`web-search.json` resolves into this repo on some machines.** pi-web-access
  reads `$XDG_CONFIG_HOME/pi/web-search.json`, but with `XDG_CONFIG_HOME` unset
  it reads `~/.pi/agent/web-search.json` — a credential store inside the synced
  repo. The ignore rule is root-anchored for that reason.
- **Machine state can look like config.** `state/pi-codex-fast-mode.json` stayed
  tracked, carrying one machine's toggle to every other. `state/` is not pi's
  convention — the package picked it (`join(agentDir, "state", …)`) and versions
  the format itself (`version: 1`), so a synced copy is a private file format in
  git that nobody reviews. `state/` is ignored now.
- A `.gitignore` pattern without a leading slash matches at **any depth**, so
  `dir/` silently swallowed a nested `extensions/dir/theme.json`.
- Omarchy and `lark-cli install` both install their skills as **symlinked
  directories**; staged as content they would enter history as mode `120000` —
  a dangling pointer on the next machine. Treat any `skills/` entry nobody here
  wrote as installer-owned.
- pi creates a 2-byte `auth.json` on startup, so finding one in a fresh clone
  says nothing about whether credentials leaked. Check what is tracked instead.
- Regenerated files look like config (`themes/omarchy-system.json`) and local
  path hashes look like content (`missions/`, `models-store.json`).
- `open-tui.json` is read **once** into a module-level variable at startup
  (`index.ts`), so an external edit needs a pi restart; the `/open-tui` settings
  screen is the only path that takes effect live.
- Internal field names change between layers, and the documented name is not
  always the real one. Read such fields defensively rather than pinning them.

## Where the rest of the truth lives

- Per-machine files and the reason for each: `.gitignore`.
- New-machine steps: the header of `setup.sh`.
- Everything mechanical (slot API, resource filtering, context-file loading,
  settings keys): pi's own docs.
