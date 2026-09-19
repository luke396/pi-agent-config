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
- **`pi-powerline-footer` was removed rather than filtered:** it wanted all three
  slots.

## Traps that cost time

- A `.gitignore` pattern without a leading slash matches at **any depth**, so
  `dir/` silently swallowed a nested `extensions/dir/theme.json`.
- Omarchy installs its skills as **symlinked directories**; staged as content
  they would enter history as mode `120000` — a dangling pointer on the next
  machine.
- pi creates a 2-byte `auth.json` on startup, so finding one in a fresh clone
  says nothing about whether credentials leaked. Check what is tracked instead.
- Regenerated files look like config (`themes/omarchy-system.json`) and local
  path hashes look like content (`missions/`, `models-store.json`).
- Internal field names change between layers, and the documented name is not
  always the real one. Read such fields defensively rather than pinning them.

## Where the rest of the truth lives

- Per-machine files and the reason for each: `.gitignore`.
- New-machine steps: the header of `setup.sh`.
- Everything mechanical (slot API, resource filtering, context-file loading,
  settings keys): pi's own docs.
