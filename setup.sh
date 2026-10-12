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
# New machine: clone this repo into an absent/empty ~/.pi/agent, then run ./setup.sh.
# Stop Pi and privately back up an existing agent directory before replacement.
# Restore needed machine-local files/settings before setup; do not force-checkout
# over existing settings. PI_CODING_AGENT_DIR, if set, must point to this checkout.
# Setup replaces core.hooksPath; check package-update warnings even if it says done.
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
