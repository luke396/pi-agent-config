#!/usr/bin/env bash
# Bring this config's packages in line with settings.json. Run once on a new
# machine (Node.js >=22.19 on PATH); .githooks/ runs it after pulls.
# Sync in Pi with /settings-sync, or from a shell:
#   node ~/.pi/agent/extensions/settings-sync.ts pull
# Before other Git rewrites, use /settings-sync prepare (or the same CLI action).
# Keep local settings backed up during first adoption; implementation and MIT
# notice are in extensions/settings-sync.ts. Machine fields never belong in Git.
# Idempotent.
#
# Adopting an existing config: tracked files come from the repo, while the
# machine-local ones (auth.json, models.json, trust.json, sessions/, ...) are
# untracked and therefore stay put.
#
#   cd ~/.pi/agent
#   git init -b main
#   git remote add origin <url>
#   git fetch origin
#   git checkout -f -B main origin/main
#   ./setup.sh
#
# A conflict in settings.json is resolved by taking one side and finishing the
# pull (git rebase --continue); the post-rewrite hook re-runs this script.
# Credentials are out of scope: authenticate per machine with /login.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

node "$REPO_DIR/extensions/settings-sync.ts" prepare

# Git already runs hooks from the worktree root, so this matters for manual runs.
git config core.hooksPath .githooks

if ! command -v pi >/dev/null 2>&1; then
    echo "warning: pi not on PATH, skipping package sync; re-run after installing pi."
else
    # Materializes and reconciles the npm:/git: packages declared in settings.json.
    pi update --extensions || echo "warning: pi update --extensions failed, re-run manually later."
fi

echo "done."
