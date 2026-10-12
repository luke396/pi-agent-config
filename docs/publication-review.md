# Publication preparation review — 2026-10-12

## Status

Prepared for owner review. **Repository visibility remains private.** No Git
history was rewritten, no credentials were rotated, and no publication was
performed. The remaining privacy choices below need owner approval before a
visibility change.

This is a point-in-time technical review, not a guarantee of secrecy or legal
clearance. It does not certify future commits or third-party packages.

## Scope and method

Baseline: `7bbd6d4948658d7d58403e58f54232ba71ed7c26` (`main`). The checkout was
not shallow. After fetching remote branches/tags:

- All local refs together reached **116 commits and 197 unique file blobs**.
  The local documentation branch was already contained in `main`.
- GitHub advertised only `main`, with no tags or pull-request refs. The API
  reported no issues, pull requests, releases, Actions runs, or Actions artifacts;
  Wiki and Pages were disabled.
- Current tracked files, all historical file blobs, and commit messages/author
  metadata were checked. Ignored credential/session files on the live machine
  were not copied into the audit or opened for this review.

[Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) was
run locally with its default rules and full output redaction. The release binary
was checked against its published SHA-256 checksum. No repository content was
uploaded to a scanning service.

| Scan | Result |
| --- | --- |
| `gitleaks git` with `--log-opts='--all --full-history'` | No detections; scanner reported 113 commits with scanned patches. |
| `gitleaks dir` over all 197 unique historical blobs | No detections; also covers snapshots omitted from patch scanning. |
| `gitleaks dir` over the tracked baseline snapshot | No detections. |
| `gitleaks dir` over exported commit metadata/messages | No detections. |
| `gitleaks dir` over the prepared staged snapshot, including new documentation/notices | No detections. |

A separate pattern inventory covered URLs, email addresses, absolute home
paths, IP literals, UUIDs, and credential/device fields in historical JSON.
Historical `models.json` and the two deleted research notes were manually read.
Current ignore boundaries were checked with `git check-ignore`.

The baseline Git paths contained no committed `auth.json`, `mcp-auth.json`,
`web-search.json`, or session archive. Historical `models.json` contained provider
endpoints/model definitions, with no credential fields found. No embedded access
credential was identified in this review. These are scoped findings, not proof
that pattern-based tools detect every kind of private information.

## Retained disclosures requiring an owner decision

These details still exist in history even though the current tree excludes the
old files. Their values are deliberately not repeated here.

| Detail | Where to inspect | Decision |
| --- | --- | --- |
| Author name and personal email | Git author/committer metadata | Accept public attribution/contact disclosure, or authorize a separate history rewrite before publication. |
| Previous model gateway hostname and model choices | `b59fcf5:models.json`; untracked in `28c31a6` | Confirm these former service details may be public. |
| Home-directory paths, an open-source checkout path, and another project name | Historical `research/matt-skills-git-package-management.md`; removed in `ad7a2cd` | Confirm project names and workflow context are shareable. The review cannot establish permission to publish work-related references. |
| Local session-artifact path and run identifier | Historical `research/subagent-alternatives-2026-09-05.md`; removed in `ad7a2cd` | Confirm this machine/workflow metadata may be public. The session contents themselves were not committed. |

To inspect the deleted notes locally, use `git show ad7a2cd^:research/<filename>`.
Changing `.gitignore` or deleting a file in a new commit does not remove its old
versions. A clean-snapshot public repository is another option if retaining this
history is undesirable. Neither history rewriting nor a separate publication
repository was created during this preparation.

## Licensing and documentation

A separate read-only provenance review inspected current files and historical
copying indicators. Two missing notices were identified and supplied:

- Pi's MIT notice for the derivative `extensions/claude-rules.ts`, now inline so
  it survives copying the extension on its own.
- Omarchy's MIT notice for the generated theme retained in history, now in
  `THIRD_PARTY_NOTICES.md`.

Existing Diogo Dias and HumanLayer notices were checked against their cited
upstream revisions and retained. `LICENSE` adds MIT terms for repository-original
contributions under the repository owner's `luke396` handle. The third-party
index distinguishes those contributions from incorporated material and separately
installed packages.

No additional concrete third-party origin was established for the remaining
historical local extensions. In particular, the initial `bar-stats.ts` and
`think-level.ts` do not record their origin. Absence of a source declaration is
not proof of original authorship; the owner should flag any additional copied
material they know about before publication.

The new README documents component reuse, dependencies, model-call data/billing,
install side effects, backup/migration boundaries, unpinned package updates,
sync limitations, tests, and personal-use support expectations. The destructive
force-checkout example was removed from `setup.sh` comments; executable setup
and extension behavior were left unchanged.

## Verification and limits

Environment: Linux, Node.js **26.7.0**, Pi **1.1.0**.

- Settings-sync and session-title tests: **63 passed**, no provider requests.
- Claude-rules/Supi integration tests: **2 passed** against an isolated
  npm-installed Pi 1.1.0 and the existing Supi dependency. No provider requests.
  The first attempt with the standalone Pi distribution failed because its
  `dist/core` modules were absent; that installation requirement is now explicit
  in the README. No test was weakened or skipped to hide the failure.
- The combined suite passed **65/65** after the documentation/notice changes.
- Shell syntax, Git whitespace checks, relative documentation links, tracked
  JSON parsing, and exact upstream license-text comparisons passed.

The local tests do not establish fresh online installation success for all
unpinned packages, cross-platform support, live naming-model quality, or the
absence of vulnerabilities in dependencies. The setup migration instructions
were reviewed against the code and existing temporary-Git tests; no live config
migration was performed.

## Before changing visibility

- Accept or resolve the retained historical disclosures and any known additional
  third-party provenance.
- Review the README, MIT license, and third-party notices.
- Rescan the exact publication state if commits or refs change after this review.
- Change repository visibility only with a separate owner decision.
