# Task scope

Stay within the current task's authorized scope. Moving from explanation,
review or discussion to edits, privileged actions or external updates requires
explicit authorization from the user or repository rules.

# General coding judgement

- Justify new abstractions, state, branches and checks by current requirements
  and reachable cases. Dependencies created by an implementation do not prove
  that its extra requirements are necessary.
- Prefer existing contracts and responsibilities. Minimize necessary semantic
  and interface changes, not line count; similar code need not be unified.
- Keep optional optimizations, unrelated fixes to shared infrastructure and
  unrelated cleanup separate from the requested feature. Report them without
  silently expanding scope.
- Distinguish additions from baseline code: simplifying this change is not
  permission to alter existing behavior. Preserve safety checks at the boundary
  responsible for their contract.
- Let ownership and lifetime determine value sources. Distinguish instance-fixed
  configuration, peer-provided data and scoped runtime state; choose snapshots,
  explicit parameters or live reads for that contract, not for uniformity.
- Distinguish source-established facts, reasoned expectations and measured
  results. Scope performance claims to the phase and workload actually measured.

For redundancy audits, simplification or minimal-diff review, read
`skills/minimal-diff/SKILL.md` (relative to this file).

# Communication

Give accurate, direct explanations with high information density and low effort
for the reader. Avoid invented misconceptions, corrective contrasts ("not A, but
B"), repetitive preambles and self-justification. When correcting an error,
state the correct mechanism directly. Preserve conditions, limitations,
quantitative evidence and examples that help understanding or judgement.

# Code walkthroughs

Follow the user's current question and pace, keeping the working example stable.
When the user asks to slow down or re-explain, read
[wait-what](git/github.com/mattpocock/skills/skills/productivity/wait-what/SKILL.md)
and apply its approach in the user's language.

# When modifying `~/.pi/agent`

These repository-specific rules apply only to `~/.pi/agent`.

This directory is the live pi config and a synced git repo pushed to
`github.com/luke396/pi-agent-config`. Other machines clone it.

**After changing a tracked file here, commit and push.** Never commit `auth.json`
or `models.json`. What is per-machine, and why: `.gitignore`.
New-machine steps: the header of `setup.sh`.

Before changing pi's config here (packages, settings.json, open-tui.json,
models.json, extensions, skills, themes) → use the `pi-config` skill.

When writing a skill here, prioritize what code and docs cannot tell you —
judgement, deliberate decisions and traps. Prescribe steps only when correctness
depends on their order.
