---
name: pi-config
description: Rules, mechanisms and pitfalls for changing pi's own configuration in ~/.pi/agent (the package list, settings.json, open-tui.json, models.json, extensions/, skills/, themes/). Use whenever a pi package is added, removed, reordered or its resources filtered, whenever an extension hooks a UI slot, whenever a pi theme is changed or pinned, whenever any tracked file in ~/.pi/agent is edited, and whenever a pi UI feature suddenly stops working or an installed package appears to do nothing.
---

# Changing pi's own config

`~/.pi/agent` is pi's live config **and** a git repo. Every change here is a
config change that other machines inherit, so it is never just an edit.

The iron rule (commit + push) lives in `AGENTS.md`; this skill is the procedure
behind it.

## Procedure

1. **Find out what the change actually touches.** For a package, grep it for
   `ctx.ui.set` before installing — the UI slots are single-owner, so a package
   that hooks an occupied slot silently disables either itself or the incumbent.
   The ownership map and the conflicts already resolved are in
   `reference/mechanisms.md`.
2. **Make the smallest edit.** Prefer config over patching a package: a theme
   override, a resource filter (`extensions: []`), a documented key. Note any
   key whose behaviour depends on an undocumented field, and prefer reading it
   defensively.
3. **Verify empirically, don't assume.** At minimum run the RPC smoke test and
   check for new startup warnings; for UI changes confirm the symptom is gone
   (or ask the human to look, since the agent cannot see the screen). Recipes:
   `reference/verification.md`.
4. **Check the blast radius.** Anything machine-bound must not be committed
   (`git status` should show only intended files); anything pinned by choice
   (a theme, a version) is a decision another machine will inherit.
5. **Record a new pitfall** in `reference/mechanisms.md` while it is fresh, then
   commit and push.

## Reference

- `reference/mechanisms.md` — how this setup is arranged and why: sync model,
  single-owner UI slots and current ownership, resource filtering, context-file
  layers, the theme pipeline, what is per-machine.
- `reference/verification.md` — how to prove a config change works without
  guessing: RPC smoke test, ad-hoc extension hooks, throwaway config dirs,
  prompt inspection, defensive field access.

Read them before a non-trivial change, not after.
