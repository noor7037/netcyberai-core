#!/usr/bin/env bash
# SessionStart hook (docs/14_BACKEND_BUILD_PLAN.md Phase 0 step 3): a new
# Claude Code session starts with node_modules matching package-lock.json, so
# `bash scripts/ci_local.sh --no-install`, `npm run dev` and `npm test` work
# straight away.
#
# `npm ci` deletes and reinstalls node_modules, so it runs only when that is
# needed: node_modules was never installed, or package-lock.json changed
# after the last install (npm rewrites node_modules/.package-lock.json on
# every install, so a lockfile newer than it means the tree is stale).
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "session-start: node_modules is missing or older than package-lock.json; running npm ci"
  npm ci --no-audit --no-fund
else
  echo "session-start: node_modules matches package-lock.json; npm ci not needed"
fi
