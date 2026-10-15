# Decisions and traps from past changes

Only things the code cannot tell you: what was chosen here on purpose, and what
it cost. Mechanism syntax and APIs belong to pi's own docs, not to this file.

## UI and display

- **The UI slots are single-owner.** Header, footer and editor are replacements,
  not layers: a second package hooking one takes it, and the incumbent's features
  go inert without an error. Load order is the `packages` array order. Know what
  a TUI package hooks before installing it, and do not "fix" features that are
  inert by design.
- **For header, footer or editor regressions after changing TUI packages, check
  the active slot owner and registration order first.**
- **`pi-open-tui` and its configuration have been removed.** Keep Pi's native
  header/footer, the current theme, and `pi-vim`'s editor. A metrics extension
  should add a native notification, status, or widget without replacing those
  UI components.
- **Metrics use `@arhen/pi-core-tps-stats`.** Post-response updates and a rolling
  median are accepted in exchange for not maintaining a custom statistics
  extension. The local `response-metrics` and `@monotykamary/pi-tps` were removed;
  keep the native footer, current theme, and pi-vim.
- **`pi-catppuccin-tui` is filtered to its themes** to preserve Pi's native footer.
- **`pi-powerline-footer` was removed rather than filtered:** it wanted all three
  slots.
- **Transcript grouping is owned by `@luan.sh/pi-collapse-transcript`.** It
  replaced `pi-collapse-tools` and `@xzzpig/pi-thinking-collapse`. Pi 1.1.0 was
  checked with pi-vim, restored thinking/codemode history, and mouse expansion
  both with open-tui and with the native header/footer. Grouping only
  activates in fullscreen; regular mode retains native rows. The bundled
  `pi-libtui` also changes user-message bubbles, Markdown tables, and codemode
  detail rendering; removing open-tui does not remove these changes.
- **`extensions/quiet-tui.ts` turns off libtui's bubbles and animations.** With
  the defaults, a long fullscreen session held one core at ~100% while only
  waiting on the model: animations repaint ~30 fps and every frame re-slices
  every user-message bubble (CPU profile, 2026-10-13). libtui has no settings
  store; `@luan.sh/pi-xsettings` was not installed for this because it also
  syncs `settings.json`, a second writer next to Omarchy and settings-sync.
- **pi is pinned to `catppuccin-tui-mocha`, so it no longer follows the desktop
  theme.** Matching the Catppuccin desktop today is a choice, not a
  consequence. Omarchy's install setup passes `--activate` to
  `omarchy-theme-set-pi`, selecting `omarchy-system`. Regular theme changes only
  refresh pi's generated theme file; an explicit `--activate` call can also
  change the setting later.
- **`tuiMode` is unset and follows Pi's default.** Regular mode preserves
  passive Herdr scrollback. A recorded check found no scrollback in fullscreen
  (`max_offset_from_bottom: 0`) versus 5408 lines in regular. Fullscreen reads
  exposed only the visible 49 rows; requesting older history while the agent
  was active failed with `agent_not_idle`. For sessions needing passive history
  reads, use `pi --tui-mode regular` rather than changing the shared setting.

## Models and local extensions

- **Fast is an opt-in per provider/model, not a global toggle.**
  `pi-codex-fast-mode` remains uninstalled. For `openai`, local `models.json`
  overrides can carry `samplingParams.service_tier`; no injection extension is
  needed. In a 2026-10-01 ChatGPT OAuth check, `"fast"` was rejected with HTTP
  400, while `"priority"` completed successfully. The response still reported
  `"default"`, so this verified the requested setting and compatibility, not
  actual acceleration. Keep that distinction when reporting success. Subagent
  children can also request priority through pi-subagents' own fast hook.
- **The OpenAI tier switch is manual and per session.**
  `extensions/openai-service-tier.ts` owns `/tier` (standard | fast |
  ultrafast) and replaces the "per provider/model, not a global toggle" answer
  for conversation turns; `samplingParams.service_tier` is no longer needed for
  them. Fast is the body field `service_tier: "priority"`; Ultrafast additionally
  needs the `OpenAI-Service-Tier` header, which returns HTTP 400 for any value
  but `ultrafast`, so the header is written for that tier only.
  Both hooks fire only for the session's own agent-loop requests: compaction and
  nested model calls build their own request options and keep the tier they set.
  Measured 2026-10-15 on the ChatGPT sign-in `openai` path with
  `openai/gpt-6-astra`: all three tiers returned HTTP 200 and every response
  reported `service_tier: "default"`, so such a run proves acceptance and
  routing, never acceleration. Pi's cost table knows only `flex` (0.5×) and
  `priority` (2×), so the footer shows the Fast surcharge and understates
  Ultrafast. The switch is not persisted: every new or resumed session starts on
  standard.
- **Tracked local extensions are deliberate, not accidents.**
  `keybindings.json` clears pi's built-in thinking cycle (`app.thinking.cycle`)
  so `extensions/thinking-toggle.ts` is the only thinking control: Shift+Tab
  alternates between two levels, and the extension refuses to land on a level
  the current model clamps instead of silently keeping a third state.
  Pi's native cycle visits all available levels. DeepSeek (V4 Flash / V4 Pro)
  maps `medium` to null, so its pair is high/max; other models use medium/max.
  A fixed medium/max pair made Shift+Tab a dead key on DeepSeek. Match the model
  id so DeepSeek behind another provider keeps the same pair.
  `extensions/claude-rules.ts` lists a project's `.claude/rules/*.md` in the
  system prompt and is inert in projects that have no such directory.
- Internal field names change between layers, and the documented name is not
  always the real one. Read such fields defensively rather than pinning them.

## File ownership and sync

- **The repo is cloned in place, not symlinked.** Omarchy can update
  `settings.json` through a temporary file followed by `mv`. If `settings.json`
  itself is a symlink, that replaces the link with a regular file while leaving
  its target unchanged. A symlinked parent directory survives this file
  replacement. Account for external writers that use this pattern.
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

## Where the rest of the truth lives

- Per-machine files and the reason for each: `.gitignore`.
- New-machine steps: the header of `setup.sh`.
- Everything mechanical (slot API, resource filtering, context-file loading,
  settings keys): pi's own docs.
