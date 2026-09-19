---
name: pi-config
description: Changing pi's own configuration in ~/.pi/agent (packages, settings.json, open-tui.json, models.json, extensions, skills, themes). Use when adding, removing, reordering or filtering a pi package, when hooking a UI slot, when changing or pinning a theme, and when an installed package appears to do nothing.
---

# Changing pi's own config

This directory is pi's live config and a synced git repo, so an edit here is a
decision every machine inherits. Prefer config over patching a package, and
prefer the smallest edit.

Worth weighing before changing something:

- **The UI slots are single-owner.** Header, footer and editor are replacements,
  not layers: a second package hooking one takes it, and the incumbent's features
  go inert without an error. Load order is the `packages` array order. Know what
  a TUI package hooks before installing it, and do not "fix" features that are
  inert by design.
- **A feature that stops working after an edit is usually a slot handover**, not
  a bug. Confirm by asking which package registered last, not by debugging the
  loser.
- **A package can be reduced to the parts worth having** rather than dropped.
- **Machine-bound state must stay untracked; a deliberate pin is a decision to
  record, not a default to inherit.**
- **The change is done when the effect is observed**, not when the file reads
  correctly. Sometimes the human is the only one who can see the effect.

Decisions and traps from past changes: `reference.md`.
