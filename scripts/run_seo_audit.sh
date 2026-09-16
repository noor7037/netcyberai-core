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

echo "Starting production server..."
npm start &
SERVER_PID=$!

cleanup() {
  echo "Stopping server (pid $SERVER_PID)..."
  kill "$SERVER_PID" >/dev/null 2>&1 || true
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
