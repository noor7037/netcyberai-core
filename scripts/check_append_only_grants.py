#!/usr/bin/env python3
"""Fails CI if a non-privileged, app-facing role holds UPDATE/DELETE on a
table this project's own design says is append-only.

Raised by Prompt H Stage 0b: the exact same bug -- a table meant to be
append-only silently holding UPDATE/DELETE for `app_user` -- had already
been found and fixed live TWICE by accident (`sessions`, Pre-F Hardening;
`consent_ledger`, Prompt G/C51), each time only because someone happened
to run a live drift scan for an unrelated reason, not because any CI
check would have caught it. Generalizing it here surfaced a THIRD, real,
previously-uncaught instance in the same live scan that built this
script: `webhook_events` also held `app_user` UPDATE/DELETE, and
`audit_log`/`consent_ledger`/`webhook_events` all separately held
UPDATE/DELETE for `anon`, `authenticated` (Supabase's own default
per-project PostgREST grants), and `nca_super` (this app's own
super_admin bypass role) -- fixed live in migration
20260922050000_fix_append_only_grants_drift_audit_consent_webhook.sql,
Decision Log <TBD, filled in when this prompt's PR report is written>.

Migration-file parser, not a live-database snapshot -- same reasoning
as check_rls_policies.py and check_choke_point.py: CI cannot reach the
live database (Decision Log C38), and supabase/migrations/*.sql is this
project's own single source of truth for schema (Decision Log Part 5).

The one piece this project's migration history genuinely cannot answer
on its own: neither `anon` nor `authenticated` is ever the target of an
explicit GRANT anywhere in supabase/migrations/*.sql (confirmed: zero
matches for either role name as a GRANT target across the whole
directory) -- both get their initial UPDATE/DELETE from Supabase's own
per-project default privileges, set up outside anything a migration
file can see. `app_user`/`nca_super`'s initial UPDATE/DELETE similarly
comes from role_grants.sql's *blanket* `grant ... on all tables in
schema public` plus its `alter default privileges ... on tables` (both
apply to a table by not naming it, so a table-name parser can't attach
either statement to any one table). Since none of these four
originating grants is table-specific, the only correct, conservative
assumption this check can make is: every non-privileged role starts out
WITH UPDATE/DELETE on every append-only table, and only a later,
table-specific `revoke` (or self-tested `grant`) actually moves the
needle -- which is exactly the mechanism real fixes in this project have
always used.

Usage:
    python3 scripts/check_append_only_grants.py             # scans supabase/migrations/
    python3 scripts/check_append_only_grants.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"

# Every table this project's own design treats as append-only history/
# proof, as opposed to ordinary mutable operational state. Confirmed
# against the live schema (Prompt H Stage 0b) rather than assumed --
# add a table here the moment a new append-only design is introduced; do
# not wait for the next accidental live drift scan to notice it.
#
# `payments` joined this set in the pre-Prompt-I hardening PR (Decision
# Log C62): Prompt I's own first non-negotiable ("No physical deletion
# of a successful payment. Ever.") was violated live -- anon,
# authenticated, app_user, and nca_super all held UPDATE/DELETE on
# payments since migration 2, never narrowed. Fixed in
# supabase/migrations/20260922070000_fee_engine_restrictive_accounting_and_payments_append_only.sql,
# the same shape as audit_log/consent_ledger/webhook_events.
APPEND_ONLY_TABLES = {"audit_log", "consent_ledger", "payments", "sessions", "webhook_events"}

# "Non-privileged, app-facing": any role a real request -- ordinary or
# this app's own super_admin bypass -- can run as, or any role
# Supabase's PostgREST layer exposes to the public anon key. Per this
# project's own precedent (Decision Log C44's sessions fix explicitly
# revoked nca_super alongside app_user/anon/authenticated, not just
# app_user): nca_super is NOT exempt just because it's privileged
# *within* the app's own permission model -- the entire point of an
# append-only table is that nothing reachable through the app, not even
# a super admin, can retroactively edit history via SQL. Deliberately
# excludes `postgres` (table owner), `service_role` (Supabase's
# server-side master credential, never client-exposed --
# check_service_role.py's own concern), and `app_backend` (the LOGIN
# role app code SET ROLEs *from*, never something external authenticates
# as directly; its own narrow, intentional UPDATE on `sessions` --
# migration 20260917090000 -- is a different, already-reviewed grant).
NON_PRIVILEGED_ROLES = {"app_user", "anon", "authenticated", "nca_super"}

WATCHED_PRIVS = {"UPDATE", "DELETE"}

GRANT_RE = re.compile(
    r"\bgrant\s+(?P<privs>[a-z_,\s]+?)\s+on\s+(?P<tables>[\w\"',\s]+?)\s+to\s+(?P<roles>[\w\"',\s]+?);",
    re.IGNORECASE,
)
REVOKE_RE = re.compile(
    r"\brevoke\s+(?P<privs>[a-z_,\s]+?)\s+on\s+(?P<tables>[\w\"',\s]+?)\s+from\s+(?P<roles>[\w\"',\s]+?);",
    re.IGNORECASE,
)
# Matches the blanket forms this project's own migrations use --
# `on all tables in schema public` and (from `alter default privileges`)
# a bare `on tables` -- neither of which names a specific table, so
# neither can be attributed to one; both are already the starting
# assumption this check makes (see module docstring).
BLANKET_TABLES_RE = re.compile(r"^\s*(all\s+tables\s+in\s+schema\b|tables)\s*$", re.IGNORECASE)


def _split_list(raw: str) -> list[str]:
    return [item.strip(" \"'\n\t") for item in raw.split(",") if item.strip(" \"'\n\t")]


def _privs_of_interest(raw: str) -> set[str]:
    return {p.strip().upper() for p in raw.split(",")} & WATCHED_PRIVS


def parse_grant_state(migrations_dir: Path) -> dict[tuple[str, str], set[str]]:
    """Replay every migration file in filename (== chronological) order;
    return {(table, role): currently-granted privileges among
    UPDATE/DELETE} for every watched (table, role) pair. See module
    docstring for why every pair starts out granted."""
    state: dict[tuple[str, str], set[str]] = {
        (t, r): set(WATCHED_PRIVS) for t in APPEND_ONLY_TABLES for r in NON_PRIVILEGED_ROLES
    }

    for path in sorted(migrations_dir.glob("*.sql")):
        text = path.read_text()

        events: list[tuple[int, str, re.Match]] = []
        for m in REVOKE_RE.finditer(text):
            events.append((m.start(), "revoke", m))
        for m in GRANT_RE.finditer(text):
            events.append((m.start(), "grant", m))
        events.sort(key=lambda e: e[0])  # statement order within the file matters

        for _, kind, m in events:
            tables_raw = m.group("tables").strip()
            if BLANKET_TABLES_RE.match(tables_raw):
                continue
            privs = _privs_of_interest(m.group("privs"))
            if not privs:
                continue
            tables = {t.lower() for t in _split_list(tables_raw)} & APPEND_ONLY_TABLES
            roles = {r.lower() for r in _split_list(m.group("roles"))} & NON_PRIVILEGED_ROLES
            for t in tables:
                for r in roles:
                    if kind == "revoke":
                        state[(t, r)] -= privs
                    else:
                        state[(t, r)] |= privs

    return state


def find_violations(migrations_dir: Path) -> list[str]:
    state = parse_grant_state(migrations_dir)
    return [
        f"{table}: {role} still holds {'/'.join(sorted(privs))}"
        for (table, role), privs in sorted(state.items())
        if privs
    ]


def main() -> int:
    violations = find_violations(MIGRATIONS_DIR)
    if violations:
        print("FAIL: a non-privileged, app-facing role holds UPDATE/DELETE on an append-only table:")
        for v in violations:
            print(f"  {v}")
        print(
            "\nAppend-only tables ("
            + ", ".join(sorted(APPEND_ONLY_TABLES))
            + ") exist specifically so nothing reachable through the app -- not even a super "
            "admin -- can retroactively edit history. Add a migration:\n"
            "  revoke update, delete on <table> from <role>;"
        )
        return 1
    print(
        f"PASS: none of {', '.join(sorted(NON_PRIVILEGED_ROLES))} hold UPDATE/DELETE on any of "
        f"{', '.join(sorted(APPEND_ONLY_TABLES))}."
    )
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        # Fully clean fixture: every watched table/role pair explicitly
        # revoked, mirroring the shape this repo's real migrations use.
        clean_dir = tmp / "clean"
        clean_dir.mkdir()
        (clean_dir / "0001_baseline.sql").write_text(
            "revoke update, delete on audit_log, consent_ledger, payments, sessions, webhook_events "
            "from app_user, anon, authenticated, nca_super;\n"
        )
        if find_violations(clean_dir):
            print("SELF-TEST FAILED: a fully-revoked fixture was still flagged")
            print(find_violations(clean_dir))
            return 1

        # A table left unmentioned must still fail -- the default
        # assumption is "granted until proven otherwise", not the reverse.
        partial_dir = tmp / "partial"
        partial_dir.mkdir()
        (partial_dir / "0001_baseline.sql").write_text(
            "revoke update, delete on audit_log from app_user, anon, authenticated, nca_super;\n"
        )
        partial_violations = find_violations(partial_dir)
        if any(v.startswith("audit_log:") for v in partial_violations):
            print("SELF-TEST FAILED: a real revoke on audit_log was not recognized as closing the gap")
            return 1
        if not any(v.startswith("webhook_events:") for v in partial_violations):
            print("SELF-TEST FAILED: a table never mentioned in any migration was wrongly treated as clean")
            return 1

        # The exact negative test this check exists to prove: grant
        # UPDATE back on a dummy append-only table after it was revoked
        # -- must be caught -- then revoke it again -- must go clean.
        dirty_dir = tmp / "dirty"
        dirty_dir.mkdir()
        (dirty_dir / "0001_baseline.sql").write_text(
            "revoke update, delete on audit_log, consent_ledger, payments, sessions, webhook_events "
            "from app_user, anon, authenticated, nca_super;\n"
        )
        (dirty_dir / "0002_drift.sql").write_text("grant update on webhook_events to app_user;\n")
        dirty_violations = find_violations(dirty_dir)
        if not any(v.startswith("webhook_events: app_user") for v in dirty_violations):
            print("SELF-TEST FAILED: a planted re-grant of UPDATE on webhook_events to app_user was NOT caught")
            print(dirty_violations)
            return 1

        (dirty_dir / "0003_fix.sql").write_text("revoke update on webhook_events from app_user;\n")
        if find_violations(dirty_dir):
            print("SELF-TEST FAILED: re-revoking the planted drift did not clear the violation")
            print(find_violations(dirty_dir))
            return 1

        # The real repo's own blanket-grant shape (role_grants.sql) must
        # never be mistaken for a table-specific grant that re-opens
        # something already revoked.
        blanket_dir = tmp / "blanket"
        blanket_dir.mkdir()
        (blanket_dir / "0001_baseline.sql").write_text(
            "revoke update, delete on audit_log, consent_ledger, payments, sessions, webhook_events "
            "from app_user, anon, authenticated, nca_super;\n"
        )
        (blanket_dir / "0002_blanket.sql").write_text(
            "grant select, insert, update, delete on all tables in schema public to app_user;\n"
            "alter default privileges in schema public\n"
            "  grant select, insert, update, delete on tables to app_user, nca_super;\n"
        )
        if find_violations(blanket_dir):
            print("SELF-TEST FAILED: a blanket 'all tables in schema public' grant was misread as table-specific")
            print(find_violations(blanket_dir))
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main())
