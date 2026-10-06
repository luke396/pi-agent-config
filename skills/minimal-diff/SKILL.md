---
name: minimal-diff
description: Ablate a task's cumulative diff from its pre-feature baseline, group by group, to test necessity and compare smaller designs. Use for redundancy audits, requests to simplify a change, questions about whether added code is necessary, or minimal-diff review. An audit request alone does not authorize edits.
---

# Ablate the cumulative diff from the baseline

The core work is to remove, restore or replace each group of additions relative
to the pre-feature baseline, then establish what needs to remain. Cover the whole
task's cumulative diff, including parts that look reasonable and have not yet
attracted suspicion. Seek fewer added contracts, state and caller responsibilities
while meeting the requirements; finding no worthwhile deletion is a valid result.

## Scope and baseline

The comparison is against the state before the feature, not just the last cleanup
commit. Account for relevant uncommitted work without treating unrelated user
changes as cleanup candidates. If the intended baseline or supported scope is
unclear and would change the verdict, clarify it before drawing conclusions.

Separate task requirements, inherited behavior and implementation-added assumptions.
A spec can contain the same scope creep as the code: an added requirement for an
ACK does not by itself justify a new ACK state machine. Surface that assumption
for a decision rather than silently relaxing an explicit requirement.

## Core method: group-by-group ablation

Group the cumulative diff by behavior with its own requirement or justification.
Policies with different justifications remain separate candidates even when they
share a helper. Consider each mechanism's supporting state, interfaces, branches
and tests together. Mutually supporting additions may be removable as a group even
when none can be removed alone.

For each group, first compare omitting it and continuing with the baseline. If that
breaks a requirement, identify the needed guarantee and compare smaller variants
that preserve it. A failed whole-group deletion establishes the broken guarantee's
necessity, not that of every bundled check, limit or branch. Continue examining
separable choices within retained mechanisms. Compare how the responsibility can be
implemented; a purpose for each component does not establish the whole design's necessity.

Run safe, feasible deletion or replacement experiments in memory or an isolated
copy, checking affected real interfaces, required behavior and relevant side effects.
A decisive counterexample grounded in a real call path and its required contract can
reject a candidate directly. Otherwise, test runnable alternatives rather than
settling for a plausible purpose. When an experiment fails, trace whether it broke
a required behavior, an internal dependency, or an assumption added by the implementation
and encoded in its tests. The latter two still need necessity review.

Compare the complete designs by contracts, state, branches, interfaces and caller
burden. Removing a field or parameter is not a simplification when it merely moves
complexity or hides its meaning elsewhere.

Consider restoring a baseline interface, lifecycle or code position before adding
helpers and flags to manage complexity introduced by this change. Keep a necessary
adaptation at the boundary that needs it, rather than changing upstream contracts
and passing extra state to reconstruct information lost along the way.

Small repeated computations may be cheaper than sharing results through new state
or changed interfaces. Weigh runtime savings against the contracts and lifecycle
coupling introduced to obtain them.

Check the provenance of proposed deletions. Restoring baseline behavior and tests
removed incidentally can simplify the feature diff even when it adds lines back.
Moving old checks, rewriting surrounding comments or reformatting untouched logic
also needs a task-specific reason.

## Evidence for the comparisons

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

For newly added bindings, distinguish a useful name from a forwarding alias.
Inline a single-use getter alias or trivial forwarding value when the use site
already makes its role clear, preserving relevant evaluation order and lifetime.
Named intermediate results, branch joins and protocol-field names can aid reasoning
even with one use; explain that benefit rather than treating either the name or
the use count as proof of necessity.

## What verification can establish

Keep confirmed requirements and baseline contracts fixed during ablation. Passing
tests after deletion need support from real call-path reasoning; a failing test also
needs its assertion traced to an independent requirement. Tests created only for an
implementation-added assumption cannot establish its necessity. With that evidence,
review the mechanism and tests serving only it together, while retaining required
failure handling and safety boundaries.

Revalidate the combination proposed for adoption: individually removable changes
may not be jointly removable.

Check preserved behavior through real interfaces and relevant side effects. Mocks,
static checks and baseline source comparisons provide different evidence from
integration or hardware execution. State the unverified boundary; CPU tests do not
establish GPU, concurrent transfer or failure-recovery correctness.

## Review outcome

For a read-only audit, use authorized in-memory or isolated-copy experiments and
leave the project worktree unchanged. Missing permissions or a safe test environment
leave an explicit unverified boundary. Applying changes to the project still needs
edit authorization. When changes are authorized, stay within that scope and inspect
the cumulative diff again for accidental baseline churn. Public defects and optional
optimizations can be reported separately without being bundled into the feature.

Before concluding, account for coverage of each added mechanism. Completed local
ablations do not stand in for comparisons of the remaining groups. Identify parts
not compared or verified, and limit the overall conclusion accordingly.

Stop when the groups' concrete comparisons offer no supported simplification or
further judgement is blocked by evidence. Do not chase a deletion quota or a proof
of global minimality. Keep the report proportional: what can go, what is retained,
why, and what was actually verified.
