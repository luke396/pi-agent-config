---
name: minimal-diff
description: Ablate a task's cumulative diff from its pre-feature baseline. Use when assessing whether added code is necessary or simplifying a change.
---

# Baseline-driven ablation

Review every added mechanism, including those that look reasonable, by trying to
remove, restore or replace it while preserving the task's requirements.

## Establish scope and baseline

Compare against the state before the feature, including relevant uncommitted work.
Keep unrelated user changes and repository-wide cleanup outside the task. Clarify
an uncertain baseline or supported scope when it would change the verdict.

Before ablation, establish acceptance criteria from the original task and baseline
contracts. Distinguish confirmed requirements and inherited behavior from assumptions
added by the implementation, specs or tests. Verify facts from available evidence;
ask the user only about unresolved requirements or tradeoffs that would change the
verdict, obtaining a decision before relaxing confirmed requirements.

A read-only audit leaves the project worktree unchanged and uses only authorized
in-memory or isolated-copy experiments. Applying changes requires edit authorization.

## Ablate each group

Group a mechanism's state, interfaces, branches and tests together; mutually
supporting additions may need joint removal. Policies with different justifications
remain separate candidates even when they share a helper.

For each group, first compare omission or restoration of the baseline. If that
breaks a required guarantee, try smaller adaptations that preserve it. Rejecting
whole-group deletion does not justify every bundled check, limit or branch:
continue comparing separable choices within retained mechanisms.

Run safe, feasible deletion or replacement experiments. A decisive counterexample
from a real call path and its required contract can reject a candidate directly;
otherwise, execute runnable alternatives rather than settling for a plausible purpose.

Compare complete designs by contracts, state, branches, interfaces and caller burden,
including complexity moved elsewhere or hidden in an encoding. Prefer restoring
baseline interfaces, lifecycles and code positions; keep necessary adaptations at
the boundary that owns them. Check whether extra state merely reconstructs information
this change discarded.

Small repeated computations may cost less than sharing results through new state
or changed interfaces. Weigh runtime savings against lifecycle and contract coupling.

## Ground necessity in evidence

Trace real callers, inputs and owning boundaries. For a check or fallback, identify
a reachable violating input, its consequence and the responsible layer. Preserve
independently required input validation, memory safety and failure handling.

Judge abstractions by what callers stop knowing or doing, including isolation of
real dependencies. Similar formulas or use counts alone do not establish necessity.
Keep names that explain results or contracts; inline single-use forwarding aliases
when the use site is already clear, preserving evaluation order and lifetime.

Check the provenance of deletions. Baseline code, validation, tests and their placement
need a task-specific reason to change. Restoring incidental deletions can simplify
the feature diff even when it adds lines.

## Validate the evidence, including tests

Judge test results against confirmed requirements and baseline contracts. Trace
affected assertions to independent requirements; passing tests alone do not prove
redundancy. Rewrite implementation-coupled tests to protect the same behavior as
the implementation changes.

Before relying on a mock or fake, check the relevant return, error, state and
lifecycle contracts of the real dependency. Repair deviations in the double
rather than adding production obligations to accommodate them.

Judge overlapping tests by the distinct faults and boundaries they cover. When
removing assertions, explain how required behavior and regression protection remain covered.

Revalidate the proposed combination: individually removable changes may not be
jointly removable.

Check behavior through real interfaces and relevant side effects. Distinguish mock,
static and baseline-source evidence from integration or hardware execution; CPU
checks do not establish GPU, concurrent-transfer or failure-recovery correctness.

## Conclude within the evidence

Account for each group's comparison or blocker, including missing permissions or
test environments. Mark unexamined or unverified scope and limit the overall verdict
accordingly. After authorized edits, inspect the cumulative diff again for baseline churn.

Stop when concrete comparisons offer no supported further simplification or evidence
is insufficient to choose. No worthwhile deletion is a valid outcome; avoid deletion
quotas and claims of global minimality.

Report supported simplifications and their smaller alternatives, retained choices
and reasons, and what was actually verified. Include constraints or assumptions that
materially limit simplification, distinguishing confirmed grounds from provisional
choices and stating which conclusions depend on them. Keep public defects and
optional optimizations separate.
