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
- **Transcript grouping and image visibility have one local owner.**
  `extensions/collapse-transcript/` is a small fork of
  `@luan.sh/pi-collapse-transcript` 0.3.6. The upstream folding registration and
  the `visible-tool-images.ts` monkeypatch addon are removed. Earlier
  `pi-collapse-tools` and `@xzzpig/pi-thinking-collapse` remain removed too.
  Keep image policy inside the group instead of inspecting another extension's
  private section state. Images are visible while folded; expansion retains the
  original tool views. Explicit `js workflow` / `javascript workflow` source
  fences join the activity fold without changing execution input; ordinary code
  and nested examples stay visible. Top-level `<thinking>` text also folds;
  code examples and unfinished final tags remain visible. Failed native replies
  fold their thinking separately from their still-visible partial answers and
  error/abort/truncation notices. Neither path rewrites stored messages or provider
  inputs. Grouping remains fullscreen-only.
- **`@luan.sh/pi-libtui@0.3.15` remains an upstream dependency, deliberately pinned.**
  The standalone source matched the previously bundled library. Keep its extension
  enabled for codemode presentation, mouse/scrolling and the native history bridge;
  its themes are filtered out to preserve the old resource selection. Local folding
  imports it from Pi's managed npm tree: bare third-party imports from a local
  extension do not search `agent/npm/node_modules`. No local dependency install
  script or second copy of the TUI library is needed.
- **Native image selection is isolated.**
  The fork borrows direct Image children and preceding spacers from the native
  Container, without inspecting private image arrays. Pi owns settings, IDs and
  conversion. Other shapes retain the expanded native view. After upgrading
  Pi/libtui, run the folding/image tests and check actual history restoration,
  `/reload`, mouse expansion and pi-vim; component-only tests do not establish
  extension startup ordering. Fork provenance and maintenance notes live in
  `extensions/collapse-transcript/README.md`.
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

- **Fast defaults on for OpenAI Astra; manual overrides are per-session.**
  `extensions/openai-fast-mode.ts` owns `/fast` (`on` | `off`; a bare `/fast`
  reports the state without switching) for conversation requests on `openai`.
  A footer status (`fast` / `fast (inactive)`) carries the state between commands,
  which is why the `model_select` refresh has to stay with it. The switch only
  adds or removes its own override: with `samplingParams.service_tier` set in
  machine-local `models.json`, that configured tier remains in effect when the
  switch is off. The command never promises a Standard-priced request.
  Fast is the body field `service_tier: "priority"`. Session requests pass the
  hook, cache-warming replays included, because the warmer reuses the session's
  request options; compaction and extension-initiated nested calls build their
  own options and keep the tier they set. The Astra compaction extension
  independently requests Fast (`priority`); neither local extension adds the
  Ultrafast `OpenAI-Service-Tier` header. Subagent children can also request
  priority through pi-subagents' own fast hook.
  Pi's cost display does not reflect the override on the checked endpoint: the
  tier it multiplies comes from pi's own stream option or the server echo —
  `buildBaseOptions` never sets `serviceTier`, and this endpoint echoes
  `default` — so the shown amount is computed as if the tier were unset; if the
  server does bill Fast, it is low.
  Without a manual override, Fast follows the selected model: on only for
  `openai/gpt-6-astra`, off otherwise. `/fast on|off` overrides that default for
  the session and survives model changes. New, resumed, forked, or reloaded
  sessions return to the model default because pi recreates the extension
  runtime. The `session_start` status refresh makes the default visible before
  the first command. `pi-codex-fast-mode` remains uninstalled.
- **Tier spelling was checked on this account.** In a 2026-10-01 ChatGPT OAuth
  check, `"fast"` was rejected with HTTP 400, while `"priority"` completed
  successfully. The response still reported `"default"`, so this verified the
  requested setting and compatibility, not actual acceleration. The literal
  `"fast"` rejection was re-measured on 2026-10-15. Keep those conditions when
  reporting success.
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
