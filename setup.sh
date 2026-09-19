#!/usr/bin/env bash
# Bring this config's packages in line with settings.json. Run once on a new
# machine; after that .githooks/ runs it automatically after every pull.
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

# Git already runs hooks from the worktree root, so this matters for manual runs.
git config core.hooksPath .githooks

if ! command -v pi >/dev/null 2>&1; then
    echo "warning: pi not on PATH, skipping package sync; re-run after installing pi."
else
    # Materializes and reconciles the npm:/git: packages declared in settings.json.
    pi update --extensions || echo "warning: pi update --extensions failed, re-run manually later."
fi

echo "done."
