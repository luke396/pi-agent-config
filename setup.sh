#!/usr/bin/env bash
# Bootstrap a new machine, and re-sync after every pull. Idempotent.
#
#   New machine:
#     mv ~/.pi/agent ~/.pi/agent.bak
#     git clone <url> ~/.pi/agent
#     cd ~/.pi/agent && ./setup.sh
#
# Credentials are out of scope: auth.json is not tracked, authenticate per machine.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

# Re-run this script automatically after a pull.
git config core.hooksPath .githooks

if ! command -v pi >/dev/null 2>&1; then
    echo "warning: pi not on PATH, skipping package sync; re-run after installing pi."
else
    # Materializes the npm:/git: packages declared in settings.json.
    pi update --extensions || echo "warning: pi update --extensions failed, re-run manually later."
fi

# Files owned by third-party tools are neither tracked nor distributed by this repo.
if [[ ! -f extensions/herdr-agent-state.ts ]]; then
    echo "note: extensions/herdr-agent-state.ts is managed by herdr and is not shipped here."
    echo "      Re-install the herdr integration on this machine if you use herdr."
fi

echo "done."
