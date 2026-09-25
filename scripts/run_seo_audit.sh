#!/usr/bin/env bash
# Build (unless --skip-build), start the production server, wait for it
# to be reachable, run scripts/seo_audit.py, then tear the server down
# either way. Used by both `npm run audit:seo` (local) and
# .github/workflows/checks.yml (CI) so the two never drift apart.
#
# --skip-build: skip the build step (CI already built earlier in the
# same job; rebuilding would just cost time against the same source).
set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_BUILD=0
if [ "${1:-}" = "--skip-build" ]; then
  SKIP_BUILD=1
fi

: "${NEXT_PUBLIC_WHATSAPP_NUMBER:=919817707037}"
export NEXT_PUBLIC_WHATSAPP_NUMBER

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "Building..."
  npm run build
fi

# Refuse to run against a server we did not start: if something already
# answers on :3000 (a local dev server, a stale next-server), `npm start`
# fails to bind but the reachability check below still passes, and the
# audit silently grades the wrong build.
if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
  echo "Port 3000 is already in use; stop that server first so the audit checks this build." >&2
  exit 1
fi

echo "Starting production server..."
npm start &
SERVER_PID=$!

# npm -> sh -> next start -> next-server: killing only npm's pid left the
# next-server child running and holding :3000 after the audit finished.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do
    kill_tree "$child"
  done
  kill "$1" >/dev/null 2>&1 || true
}

cleanup() {
  echo "Stopping server (pid $SERVER_PID and its children)..."
  kill_tree "$SERVER_PID"
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for the server to become reachable..."
ATTEMPTS=30
until curl -sf http://localhost:3000/ >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS - 1))
  if [ "$ATTEMPTS" -le 0 ]; then
    echo "Server did not become reachable within 30s." >&2
    exit 1
  fi
  sleep 1
done

echo "Running SEO audit..."
python3 scripts/seo_audit.py http://localhost:3000
