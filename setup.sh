#!/usr/bin/env bash
# Bring this config's packages in line with settings.json. Run once on a new
# machine (Node.js >=22.19 on PATH); .githooks/ runs it after pulls.
# Use ordinary Git commands. Pi saves machine fields on session start/end.
# Default provider/model are machine-local; save them with /model (Ctrl+S).
# When upgrading from synced defaults, reselect once after the first pull.
# On a machine without deviceId, after the first ChatGPT login attempt (even if
# cancelled), exit Pi normally and reopen it before pulling configuration.
# Keep local settings backed up during first adoption; implementation and MIT
# notice are in extensions/settings-sync.ts. Machine fields never belong in Git.
# Idempotent.
#
# First adoption and migration: see README.md, "Adopt the whole configuration".
# Stop Pi and make a private backup before replacing an existing agent directory.
# Do not force-checkout over it: tracked files (including settings.json) would
# overwrite local preferences; ignore rules do not protect those files.
# Run from the intended agent directory. If PI_CODING_AGENT_DIR is set, it must
# point here too: the filter follows this checkout, but package updates follow
# Pi's agent directory. Setup replaces this repo's core.hooksPath; review existing
# hooks first. Package-update warnings require attention even if setup says done.
#
# A conflict in settings.json is resolved by taking one side and finishing the
# pull (git rebase --continue); the post-rewrite hook re-runs this script.
# Credentials are out of scope: authenticate per machine with /login.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

node "$REPO_DIR/extensions/settings-sync.ts"

# Git already runs hooks from the worktree root, so this matters for manual runs.
git config core.hooksPath .githooks

if ! command -v pi >/dev/null 2>&1; then
    echo "warning: pi not on PATH, skipping package sync; re-run after installing pi."
else
    # Materializes and reconciles the npm:/git: packages declared in settings.json.
    pi update --extensions || echo "warning: pi update --extensions failed, re-run manually later."
fi

echo "done."
