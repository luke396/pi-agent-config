---
name: minimal-diff
description: Audit and simplify a task's cumulative diff for unnecessary design, defensive code and baseline churn. Use for redundancy audits, requests to simplify a change, questions about whether added code is necessary, or minimal-diff review. An audit request alone does not authorize edits.
---

# Minimal necessary change

Judge whether the change needs to exist, not merely whether its implementation
is internally consistent. This is a necessity review of the current task, not a
repository-wide cleanup or a requirement to produce findings.

## Scope and baseline

The comparison is against the state before the feature, not just the last cleanup
commit. Account for relevant uncommitted work without treating unrelated user
changes as cleanup candidates. If the intended baseline or supported scope is
unclear and would change the verdict, clarify it before drawing conclusions.

Separate task requirements, inherited behavior and implementation-added assumptions.
A spec can contain the same scope creep as the code: an added requirement for an
ACK does not by itself justify a new ACK state machine. Surface that assumption
for a decision rather than silently relaxing an explicit requirement.

## Evidence for necessity

A suspicious pattern is a question, not a finding. Trace enough of the real caller,
input and owning boundary to distinguish a missing guarantee from one already
established elsewhere. A useful finding names the added burden, the evidence that
it is unnecessary, and the smaller alternative. Uncertainty stays uncertainty.

For a check or fallback, identify a reachable violating input, its consequence,
and the layer responsible for rejecting it. A required field missing from a mock
is a reason to repair the mock, not add a production default. External-input
validation, memory-safety masks and reachable failure handling can be essential;
"defensive" is not a deletion criterion.

For an abstraction, ask what callers stop knowing or doing. A helper does not earn
its place merely because callers were rewritten to use it. Conversely, a small
wrapper can earn its place by expressing meaningful results or isolating a real
dependency. Similar formulas or two call sites alone do not settle the question.

## Prefer restoration over another layer

Consider restoring a baseline interface, lifecycle or code position before adding
helpers and flags to manage complexity introduced by this change. Keep a necessary
adaptation at the boundary that needs it, rather than changing upstream contracts
and passing extra state to reconstruct information lost along the way.

A little inherited duplication may be preferable to an incidental optimization
that changes several callers. In Page DCP, keeping two per-step length calculations
allowed the original global-length interface to survive. This is a tradeoff, not
a rule that optimization is bad.

Check the provenance of proposed deletions. A Page DCP cleanup mistakenly removed
upstream pack validation and tests; restoring them was the correct simplification
of the feature diff. Moving old checks, rewriting surrounding comments or
reformatting untouched logic also needs a task-specific reason.

## What verification can establish

Use contract reasoning and controlled ablation together: deletion experiments can
reveal dependencies and challenge assumptions. Passing tests after deletion are
evidence, not proof of redundancy under the supported contract. Tests invented only
to exercise an added guard cannot, by themselves, justify that guard; independently
required invalid-input behavior can.

Mutually supporting additions may be unnecessary as a group even when none can be
removed alone. Keep acceptance criteria fixed during ablation and revalidate combined
removals: individually removable changes may not be jointly removable.

Check preserved behavior through real interfaces and relevant side effects. Mocks,
static checks and baseline source comparisons provide different evidence from
integration or hardware execution. State the unverified boundary; CPU tests do not
establish GPU, concurrent transfer or failure-recovery correctness.

## Review outcome

For an audit, report supported findings and unresolved questions without editing.
When changes are authorized, stay within that scope and inspect the cumulative diff
again for accidental baseline churn. Public defects and optional optimizations can
be reported separately without being bundled into the feature.

No findings is a valid result. Stop when remaining complexity has a concrete purpose
or insufficient evidence to remove it, not when a deletion quota is met. Keep the
report proportional: what can go, what must stay, why, and what was actually verified.
