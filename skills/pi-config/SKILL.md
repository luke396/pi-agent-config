---
name: pi-config
description: Changing pi's own configuration in ~/.pi/agent (packages, settings.json, models.json, extensions, skills, themes). Use when adding, removing, reordering or filtering a pi package, when hooking a UI slot, when changing or pinning a theme, and when an installed package appears to do nothing.
---

# Changing pi's own config

This directory is pi's live config and a synced git repo, so an edit here is a
decision every machine inherits. Prefer config over patching a package, and
prefer the smallest edit.

Worth weighing before changing something:

- **A package can be reduced to the parts worth having** rather than dropped.
- **Machine-bound state must stay untracked; a deliberate pin is a decision to
  record, not a default to inherit.**
- **The change is done when the effect is observed**, not when the file reads
  correctly. Sometimes the human is the only one who can see the effect.

## Read before acting

Before evaluating, adding or changing packages or configuration, read the relevant
decisions and traps in [reference.md](reference.md). Select topics by the resources
and files affected:

- **Packages and extensions:** For installation, removal, reordering or filtering,
  identify affected resources; include UI guidance when hooks are present or unknown.
- **File ownership and sync:** Before writing or staging configuration or skill
  files, read these traps even when the task concerns UI or models.
