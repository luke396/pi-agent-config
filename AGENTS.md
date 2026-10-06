# Task scope

Stay within the current task's authorized scope. Moving from explanation,
review or discussion to edits, privileged actions or external updates requires
explicit authorization from the user or repository rules.

# Subagent delegation

You may autonomously delegate independent research, code exploration and review
when doing so has a concrete expected benefit. Choose the smallest useful
division of work; the parent agent remains responsible for judgement,
integration and verification. Avoid duplicating the same investigation across
parent and children. Keep implementation write ownership clear, and require a
concrete reason for additional review rounds.

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

# Testing

- Test caller-visible behavior against requirements, contracts, or known regressions.
  Contract-preserving refactors should normally preserve behavioral assertions;
  setup may change. Constrain structure, call counts, or order only where they carry
  explicit obligations.
- Exercise real logic within the tested boundary. Isolate other dependencies as
  needed, keeping test doubles faithful to relevant contracts.
- For bug fixes, where feasible, show the regression test failing on the original
  bug and passing after the fix. Diagnose failures before changing tests, preserving
  necessary behavioral protection.
- Reuse existing test infrastructure and choose verification proportionate to risk.
  Added tests and scaffolding should provide additional fault detection or
  boundary evidence.

# Communication

Give accurate, direct explanations with high information density and low effort
for the reader. Avoid invented misconceptions, corrective contrasts ("not A, but
B"), repetitive preambles and self-justification. When correcting an error,
state the correct mechanism directly. Preserve conditions, limitations,
quantitative evidence and examples that help understanding or judgement.

When communicating with people, prioritize natural conversation. Loosely
apply ASD-STE100's clarity principles in the language being used: direct
sentences, clear actors, and consistent terminology. Adjust the level of
detail to support understanding.

Use diagrams when they help understanding.

# Code walkthroughs

Follow the user's current question and pace, keeping the working example stable.

# When modifying `~/.pi/agent`

This directory is the live pi config and a synced git repo pushed to
`github.com/luke396/pi-agent-config`. Other machines clone it.

**After changing a tracked file here, commit and push.** Never commit `auth.json`
or `models.json`. What is per-machine, and why: `.gitignore`.
New-machine steps: the header of `setup.sh`.

When writing a skill here, prioritize what code and docs cannot tell you —
judgement, deliberate decisions and traps. Prescribe steps only when correctness
depends on their order.
