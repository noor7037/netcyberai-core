#!/usr/bin/env bash
# Smoke test against a running server (dev or production build). Read-only:
# GET requests and page renders only, nothing is submitted or written.
#
#   bash .claude/skills/verify/smoke.sh [base_url]   # default http://localhost:3000
#
# 1. Public pages answer 200.
# 2. /app and /control, with no session, redirect to /login (route guards).
# 3. Playwright renders / and /login in headless Chromium and saves
#    screenshots, which proves the pages hydrate in a real browser, not just
#    that the server answered.
#
# Playwright is pinned to 1.59.1 and fetched by npx on first use; it is not a
# project dependency (Phase 1 adds committed e2e tests under scripts/e2e/).
# If its Chromium build is missing, run: npx --yes playwright@1.59.1 install chromium
set -euo pipefail

BASE="${1:-http://localhost:3000}"
PLAYWRIGHT_VERSION=1.59.1
OUT="$(mktemp -d "${TMPDIR:-/tmp}/netcyberai-smoke.XXXXXX")"
FAILS=0

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

if ! curl -s -o /dev/null --max-time 10 "$BASE/"; then
  echo "No server answering at $BASE. Start one first (see SKILL.md)." >&2
  exit 1
fi

echo "Public pages (expect 200):"
for path in / /login /pricing /contact /get-started /book-demo /free-tools /privacy /terms /sitemap.xml /robots.txt; do
  # `|| true`: a timeout or refused connection must be reported as a FAIL
  # line (curl still prints 000), not end the script under `set -e`.
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$BASE$path" || true)"
  if [ "$code" = 200 ]; then pass "$path -> $code"; else fail "$path -> $code"; fi
done

echo "Guarded areas with no session (expect a redirect to /login):"
for path in /app /control; do
  read -r code location < <(curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --max-time 60 "$BASE$path")
  case "$code" in
    30[1278])
      case "$location" in
        */login*) pass "$path -> $code $location" ;;
        *) fail "$path -> $code to $location, not /login" ;;
      esac
      ;;
    *) fail "$path -> $code (no redirect)" ;;
  esac
done

echo "Browser render (Playwright $PLAYWRIGHT_VERSION, headless Chromium):"
for page in home:/ login:/login; do
  name="${page%%:*}"
  path="${page#*:}"
  if npx --yes "playwright@$PLAYWRIGHT_VERSION" screenshot --browser chromium --wait-for-timeout 1500 \
      "$BASE$path" "$OUT/$name.png" >/dev/null 2>&1 && [ -s "$OUT/$name.png" ]; then
    pass "$path rendered -> $OUT/$name.png"
  else
    fail "$path did not render (see: npx --yes playwright@$PLAYWRIGHT_VERSION screenshot $BASE$path x.png)"
  fi
done

if [ "$FAILS" -gt 0 ]; then
  echo "smoke: $FAILS check(s) failed"
  exit 1
fi
echo "smoke: all checks passed (screenshots in $OUT)"
