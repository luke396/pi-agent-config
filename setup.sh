#!/usr/bin/env bash
# Initialize this checkout's settings filter and Git hooks. Run explicitly once
# on a new machine (Git, Bash and Node.js >=22.19 on PATH).
# Git hooks call extensions/settings-sync.ts directly after merges/rewrites.
# Package upgrades are explicit: pi update --extensions.
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
# Setup replaces core.hooksPath.
#
# A conflict in settings.json is resolved by taking one side and finishing the
# pull (git rebase --continue); the post-rewrite hook refreshes settings sync.
# Credentials are out of scope: authenticate per machine with /login.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

node "$REPO_DIR/extensions/settings-sync.ts"

# Install the maintenance hooks for this checkout.
git config core.hooksPath .githooks

echo "done."
