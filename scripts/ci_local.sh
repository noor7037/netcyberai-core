#!/usr/bin/env bash
# Local mirror of .github/workflows/checks.yml: the same steps, in the same
# order, running the same commands (docs/14_BACKEND_BUILD_PLAN.md B10). Run
# this instead of re-deriving the check list:
#
#   bash scripts/ci_local.sh               # every step, exactly as CI runs it
#   bash scripts/ci_local.sh --no-install  # same, but skip `npm ci` (node_modules already current)
#   bash scripts/ci_local.sh --list        # print the steps and exit
#
# Each run_step body below is the workflow's `run:` block verbatim, and each
# uses_step carries the action's `with:` values. scripts/check_ci_mirror.py
# (itself one of the steps, in CI too) fails when the two drift, so a change
# to a check is made in checks.yml and copied here.
#
# Like CI, it stops at the first failing step. Each body runs under `bash -e`,
# which is what GitHub uses for a `run:` step with no `shell:`, and CI=true is
# exported because GitHub sets it for every step. The `uses:` steps cannot run
# locally: checkout is this working tree, and the two setup actions become a
# note when the local Node or Python version differs from CI's.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE=run
case "${1:-}" in
  "") ;;
  --no-install) MODE=no-install ;;
  --list) MODE=list ;;
  *) echo "usage: bash scripts/ci_local.sh [--no-install | --list]" >&2; exit 2 ;;
esac

export CI=true
STEP_NO=0

uses_step() {
  local action="$1"; shift
  STEP_NO=$((STEP_NO + 1))
  if [ "$MODE" = list ]; then
    printf '%2d. uses %s %s\n' "$STEP_NO" "$action" "$*"
    return
  fi
  local want have
  case "$action" in
    actions/setup-node@*)
      want="$(printf '%s\n' "$@" | sed -n 's/^node-version=//p')"
      have="$(node -p 'process.versions.node.split(".")[0]')"
      [ "$have" = "$want" ] || printf 'note: CI runs Node %s; this machine has Node %s\n' "$want" "$have"
      ;;
    actions/setup-python@*)
      want="$(printf '%s\n' "$@" | sed -n 's/^python-version=//p')"
      have="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
      [ "$have" = "$want" ] || printf 'note: CI runs Python %s for the next step; this machine has Python %s\n' "$want" "$have"
      ;;
  esac
}

run_step() {
  local name="$1"; shift
  local body
  body="$(cat)"
  STEP_NO=$((STEP_NO + 1))
  if [ "$MODE" = list ]; then
    printf '%2d. %s\n' "$STEP_NO" "$name"
    return
  fi
  if [ "$MODE" = no-install ] && [ "$body" = "npm ci" ]; then
    printf '\n==> [%d] %s (skipped: --no-install)\n' "$STEP_NO" "$name"
    return
  fi
  printf '\n==> [%d] %s\n' "$STEP_NO" "$name"
  if ! env "$@" bash -e -c "$body"; then
    printf '\nci_local: FAILED at step %d: %s\n' "$STEP_NO" "$name" >&2
    exit 1
  fi
}

uses_step actions/checkout@v4

uses_step actions/setup-node@v4 node-version=20 cache=npm

run_step "npm ci" <<'STEP'
npm ci
STEP

run_step "scripts/ci_local.sh still mirrors this workflow" <<'STEP'
python3 scripts/check_ci_mirror.py
STEP

run_step "No fabricated numeric claims outside the demo fixture" <<'STEP'
python3 scripts/check_claims.py
STEP

run_step "No mock/dummy/fake/sample data outside the demo fixture" <<'STEP'
# src/lib/recognition.ts is also excluded: it uses "sample-size" in
# its normal statistical sense (a comment on the minimum-assessments
# guard), not as placeholder/dummy data.
#
# src/lib/whatsapp/ is also excluded: MockWhatsAppProvider (Prompt H
# Task 2) is a real, permanent WhatsAppProviderSPI implementation --
# the prompt's own explicit design, not unfinished placeholder data.
# It's what every school resolves to today, since no real WhatsApp
# Business API credentials exist anywhere in this project (Task 0).
# src/components/settings/WhatsAppConfigPanel.tsx only mentions it in
# a comment explaining the same thing.
if grep -rn 'mock\|dummy\|fake\|sample' src/ --include='*.ts' --include='*.tsx' \
    | grep -v 'src/demo-fixture/' | grep -v 'src/lib/recognition.ts' \
    | grep -v 'src/lib/whatsapp/' | grep -v 'src/components/settings/WhatsAppConfigPanel.tsx'; then
  echo "::error::Found a mock/dummy/fake/sample reference outside the allowlisted exceptions."
  exit 1
fi
STEP

run_step "Tenant-context choke point stays singular" <<'STEP'
python3 scripts/check_choke_point.py
STEP

run_step "Service-role Supabase client stays a single allowlisted choke point" <<'STEP'
python3 scripts/check_service_role.py
STEP

run_step "No unallowlisted permissive RLS policy" <<'STEP'
python3 scripts/check_rls_policies.py
STEP

run_step "No non-privileged role holds UPDATE/DELETE on an append-only table" <<'STEP'
python3 scripts/check_append_only_grants.py
STEP

run_step "No function/trigger body references a renamed or dropped column" <<'STEP'
python3 scripts/check_stale_column_refs.py
STEP

run_step "WhatsApp send-gate stays a single allowlisted choke point" <<'STEP'
python3 scripts/check_whatsapp_send_gate.py
STEP

run_step "Text-color contrast meets WCAG floors" <<'STEP'
python3 scripts/check_contrast.py
STEP

run_step "Every /control and /app route goes through its guard" <<'STEP'
python3 scripts/check_route_guards.py
STEP

run_step "Every /app and /control screen renders through ModulePage" <<'STEP'
python3 scripts/check_module_pages.py
STEP

run_step "No secrets committed" <<'STEP'
# required('SOME_ENV_VAR_NAME') (src/lib/auth/env.ts) looks up an
# env var by NAME via process.env[name] -- it's a reference to a
# variable, never the secret value itself, so it's excluded here
# the same way src/lib/recognition.ts's "sample-size" is excluded
# from the mock/dummy check above: a real non-match, not a path
# carve-out for a genuine risk. process.env.SOME_SECRET_NAME is the
# same kind of reference, for optional settings (C99).
if grep -rn 'sk_\|api_key\|SECRET\|PRIVATE_KEY' src/ \
    | grep -v "required('[A-Z0-9_]\+')" \
    | grep -v "process\.env\.[A-Z0-9_]*\(SECRET\|PRIVATE_KEY\)[A-Z0-9_]*"; then
  echo "::error::Possible secret found in src/."
  exit 1
fi
STEP

run_step "Typecheck" <<'STEP'
npx tsc --noEmit
STEP

run_step "Unit tests (kept regression suite, Decision Log C70)" <<'STEP'
npm test
STEP

run_step "Build" NEXT_PUBLIC_WHATSAPP_NUMBER=919817707037 <<'STEP'
npm run build
STEP

uses_step actions/setup-python@v5 python-version=3.12

run_step "SEO/AEO audit" NEXT_PUBLIC_WHATSAPP_NUMBER=919817707037 <<'STEP'
bash scripts/run_seo_audit.sh --skip-build
STEP

if [ "$MODE" != list ]; then
  printf '\nci_local: all %d steps passed.\n' "$STEP_NO"
fi
