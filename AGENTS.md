# `~/.pi/agent` is a synced git repo

This file sits in pi's global config directory, which is also a git repo pushed
to `github.com/luke396/pi-agent-config`. Other machines clone it.

**After changing a tracked file here, commit and push.** The working tree is the
live config, so `git status` shows exactly what is uncommitted. Never commit
`auth.json` or `models.json`. What is per-machine, and why: `.gitignore`.
New-machine steps: the header of `setup.sh`.

Before changing pi's config here (packages, settings.json, open-tui.json,
models.json, extensions, skills, themes) → use the `pi-config` skill.

When writing a skill here, record only what code and docs cannot tell you —
judgement, deliberate decisions, traps — as guidance, not as prescribed steps.

# Coding judgement

- Justify new abstractions, state, branches and checks by current requirements
  and reachable cases. Dependencies created by an implementation do not prove
  that its extra requirements are necessary.
- Prefer existing contracts and responsibilities. Minimize necessary semantic
  and interface changes, not line count; similar code need not be unified.
- Keep optional optimizations, public infrastructure fixes and unrelated cleanup
  separate from the requested feature. Report them without silently expanding scope.
- Distinguish additions from baseline code: simplifying this change is not
  permission to alter existing behavior. Preserve safety checks at the boundary
  responsible for their contract.

For redundancy audits, simplification or minimal-diff review, read
`skills/minimal-diff/SKILL.md` (relative to this file).
