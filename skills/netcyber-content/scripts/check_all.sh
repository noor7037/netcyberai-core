#!/usr/bin/env bash
# Every gate for one chapter in the inbox, in one command.
#   bash skills/netcyber-content/scripts/check_all.sh <inbox subject folder> <chapter key> [<image plan csv>] [<new template id> …]
# e.g. bash skills/netcyber-content/scripts/check_all.sh content-inbox/c10-mathematics u.c10.mathematics.jemh1.ch01 data/content/universal/image-plans/Class-10-Mathematics-images.csv compass
set -u
cd "$(dirname "$0")/../../.."
DIR="$1"; KEY="$2"; PLAN="${3:-}"; shift 2; [ $# -gt 0 ] && shift
FAIL=0
echo "== labs checker"; node labs/scripts/check.mjs "$DIR/labs/$KEY.json" || FAIL=1
echo "== templates"; node labs/scripts/check.mjs --templates-only || FAIL=1
for T in "$@"; do echo "== smoke $T"; node labs/scripts/smoke.mjs "$T" || FAIL=1; done
echo "== reader checker"
if [ -n "$PLAN" ]; then node reader/scripts/check.mjs "$DIR/$KEY.json" --labs "$DIR/labs/$KEY.json" --plan "$PLAN" || FAIL=1
else node reader/scripts/check.mjs "$DIR/$KEY.json" --labs "$DIR/labs/$KEY.json" || FAIL=1; fi
echo "== digest"; node skills/netcyber-content/scripts/digest.mjs "$DIR/$KEY.json" > "$DIR/$KEY.digest.md" && echo "written $DIR/$KEY.digest.md"
[ $FAIL -eq 0 ] && echo "ALL GATES PASS" || { echo "SOME GATES FAIL — fix and run again"; exit 1; }
