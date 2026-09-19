# This directory is a synced git repo

`~/.pi/agent` is both pi's live config and a git repo pushed to
`github.com/luke396/pi-agent-config`. Other machines clone it.

**Commit and push after changing a tracked file.** The working tree *is* the
live config, so `git status` shows exactly what is uncommitted. Tracked set and
the per-machine rationale live in `.gitignore`; credentials (`auth.json`) and
provider definitions (`models.json`) are never committed. New machine: see the
header of `setup.sh`.

## Gotchas no config confesses

- pi's UI has **single-owner slots**: `ctx.ui.setHeader`, `setFooter`,
  `setEditorComponent`. Two packages hooking the same slot do not compose —
  whichever registers last wins and the loser's related features go inert.
  Grep a package for `ctx.ui.set*` before adding it.
- Load order is the `packages` array order in `settings.json`, so ordering is a
  meaningful knob there.
- A package shipping both a theme and a TUI extension can be reduced to its
  theme with `{"source": "npm:x", "extensions": []}`.
