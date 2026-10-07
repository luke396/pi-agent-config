#!/usr/bin/env bash
# Save current machine fields before Git replaces settings.json.
# Package reconciliation remains in the existing post-merge hook.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$REPO_DIR/scripts/prepare-settings-sync.mjs"
git -C "$REPO_DIR" pull --ff-only
