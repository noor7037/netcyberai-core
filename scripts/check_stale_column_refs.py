#!/usr/bin/env python3
"""Fails CI if a live function/trigger body still references a column
name that a later migration renamed or dropped.

Raised by the pre-Prompt-I hardening PR (Decision Log C62): the
`recompute_fee_status()` trigger (migration 2, `fee_engine.sql`)
queried `fees_ledger.amount_paise`/`payments.amount_paise`, and was
never touched when `20260921085859_jurisdiction_timezone_currency_
statutory_label.sql` (Pre-F Architecture Hardening) renamed both
columns to `amount_minor` months later. The trigger fired
unconditionally on every `payments` write, so no row was insertable,
updatable, or deletable in `payments` at all from that rename onward --
found entirely by accident, while building negative-test evidence for
an unrelated RLS/grant fix. This check exists so the same bug class is
caught mechanically instead of by accident: Prompt I is about to add
several new trigger functions on these same fee tables.

Migration-file parser, not a live-database query -- same reasoning as
every other checker in this repo (`check_rls_policies.py`,
`check_append_only_grants.py`, `check_choke_point.py`): CI cannot reach
the live database (Decision Log C38), and `supabase/migrations/*.sql`
is this project's own single source of truth for schema. A function
querying `pg_proc`/`pg_get_functiondef` against the real database would
be strictly live, but nothing in this repo's CI has (or, per C38, can
have) live database credentials -- so this check reconstructs the same
answer by replaying every `create [or replace] function` statement in
migration-file order (last definition for a given function name wins,
mirroring `check_rls_policies.py`'s policy-replay approach) and
checking each FINAL body against every column rename/drop this
project's migration history records. Because every fix in this
project's history has been applied live and then recorded as a
migration file in the same breath (Decision Log's own standing
discipline since C39), migration-file replay and live `pg_proc` state
should never actually diverge -- and this session cross-checked that
by hand against the live database when this checker was first built
(see the PR/Decision Log entry for the real evidence).

Detection is intentionally table-scoped to hold down false positives: a
function body is only flagged for a given (table, old_column) pair if
the body ALSO contains the table's own name as a token -- not just the
bare old column name, which could otherwise coincidentally collide with
an unrelated table's still-valid column of the same name (e.g. a
generic `status` or `amount` column). This mirrors
`check_whatsapp_send_gate.py`'s own "narrow by requiring a second,
correlated signal in the same text" tradeoff.

What this does NOT cover: a rename/drop expressed any way other than a
literal `alter table <table> rename column <old> to <new>` / `alter
table <table> drop column <old>` statement (e.g. a `alter table ...
add column <new> ...` followed by a separate backfill-and-drop spread
across statements) -- every rename in this project's history so far
uses the single-statement form, so that is what is parsed. It also
only inspects PL/pgSQL function bodies defined via `create [or
replace] function ... as $$ ... $$` -- the only form this repo uses;
a body quoted with a named dollar-tag (`$body$ ... $body$`) is also
supported, since the regex captures whatever tag follows the first `$`
and requires the same tag to close.

Usage:
    python3 scripts/check_stale_column_refs.py             # scans supabase/migrations/
    python3 scripts/check_stale_column_refs.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"

RENAME_RE = re.compile(
    r"\balter\s+table\s+\"?(?P<table>\w+)\"?\s+rename\s+column\s+\"?(?P<old>\w+)\"?\s+to\s+\"?(?P<new>\w+)\"?\s*;",
    re.IGNORECASE,
)
DROP_COLUMN_RE = re.compile(
    r"\balter\s+table\s+\"?(?P<table>\w+)\"?\s+drop\s+column\s+(?:if\s+exists\s+)?\"?(?P<col>\w+)\"?\s*;",
    re.IGNORECASE,
)
FUNCTION_RE = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+\"?(?P<name>\w+)\"?\s*\([^)]*\)[^$]*?"
    r"\$(?P<tag>\w*)\$(?P<body>.*?)\$(?P=tag)\$",
    re.IGNORECASE | re.DOTALL,
)
WORD_RE = lambda token: re.compile(rf"\b{re.escape(token)}\b", re.IGNORECASE)


def parse_rename_history(migrations_dir: Path) -> list[tuple[str, str, str | None]]:
    """Replay every migration file in filename (== chronological) order;
    return a list of (table, old_name, new_name_or_None) events in the
    order they occurred. new_name is None for an outright drop."""
    events: list[tuple[int, str, str, str | None]] = []
    for path in sorted(migrations_dir.glob("*.sql")):
        text = path.read_text()
        for m in RENAME_RE.finditer(text):
            events.append((m.start(), m.group("table").lower(), m.group("old").lower(), m.group("new").lower()))
        for m in DROP_COLUMN_RE.finditer(text):
            events.append((m.start(), m.group("table").lower(), m.group("col").lower(), None))
    # Order within a single file matters too, but cross-file order (the
    # thing that actually matters for "was this renamed before or after
    # this function was last defined") is already given by sorted().
    # Stable-sort by position only distinguishes events within one file.
    return [(t, o, n) for _pos, t, o, n in events]


def parse_final_functions(migrations_dir: Path) -> dict[str, tuple[str, str]]:
    """Replay every `create [or replace] function` in migration-file
    order; return {function_name: (body, source_file)} using the LAST
    definition of each name, the same "last one replayed wins" rule
    `check_rls_policies.py` uses for policies."""
    functions: dict[str, tuple[str, str]] = {}
    for path in sorted(migrations_dir.glob("*.sql")):
        text = path.read_text()
        for m in FUNCTION_RE.finditer(text):
            functions[m.group("name").lower()] = (m.group("body"), path.name)
    return functions


def find_violations(migrations_dir: Path) -> list[str]:
    rename_events = parse_rename_history(migrations_dir)
    functions = parse_final_functions(migrations_dir)

    violations: list[str] = []
    for table, old_name, new_name in rename_events:
        table_re = WORD_RE(table)
        old_re = WORD_RE(old_name)
        for fn_name, (body, source_file) in functions.items():
            if not table_re.search(body):
                continue  # function doesn't touch this table at all
            if not old_re.search(body):
                continue  # function doesn't reference the stale name
            fate = f"renamed to '{new_name}'" if new_name else "dropped"
            violations.append(
                f"{fn_name}() ({source_file}) still references {table}.{old_name}, {fate}"
            )
    return sorted(violations)


def main() -> int:
    violations = find_violations(MIGRATIONS_DIR)
    if violations:
        print("FAIL: a function/trigger body still references a renamed or dropped column:")
        for v in violations:
            print(f"  {v}")
        print(
            "\nThis is exactly the recompute_fee_status()/amount_paise bug (Decision Log "
            "C62): the column changed, the function that reads/writes it did not, and "
            "every call has been silently (or not so silently) broken since. Fix the "
            "function body to use the new column name, or drop the function if it is "
            "genuinely dead."
        )
        return 1
    print("PASS: no live function/trigger body references a column this project's migration history has renamed or dropped.")
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        # Clean fixture: a rename, and a function correctly using the
        # NEW name, and referencing the table -- must not be flagged.
        clean_dir = tmp / "clean"
        clean_dir.mkdir()
        (clean_dir / "0001_baseline.sql").write_text(
            "create table foo (id uuid primary key, bar bigint);\n"
        )
        (clean_dir / "0002_rename.sql").write_text(
            "alter table foo rename column bar to baz;\n"
        )
        (clean_dir / "0003_fn.sql").write_text(
            "create or replace function f() returns trigger as $$\n"
            "begin\n"
            "  update foo set baz = 1;\n"
            "  return null;\n"
            "end;\n"
            "$$ language plpgsql;\n"
        )
        if find_violations(clean_dir):
            print("SELF-TEST FAILED: a function correctly using the post-rename column name was flagged")
            print(find_violations(clean_dir))
            return 1

        # Dirty fixture: same rename, function still uses the OLD name
        # -- must be caught. This is the exact recompute_fee_status() shape.
        dirty_dir = tmp / "dirty"
        dirty_dir.mkdir()
        (dirty_dir / "0001_baseline.sql").write_text(
            "create table foo (id uuid primary key, bar bigint);\n"
        )
        (dirty_dir / "0002_rename.sql").write_text(
            "alter table foo rename column bar to baz;\n"
        )
        (dirty_dir / "0003_fn.sql").write_text(
            "create or replace function f() returns trigger as $$\n"
            "begin\n"
            "  update foo set bar = 1;\n"
            "  return null;\n"
            "end;\n"
            "$$ language plpgsql;\n"
        )
        dirty_violations = find_violations(dirty_dir)
        if not any("f()" in v and "foo.bar" in v for v in dirty_violations):
            print("SELF-TEST FAILED: a function still referencing a renamed column was NOT caught")
            print(dirty_violations)
            return 1

        # Fix it in place (a later migration re-creates the function) --
        # must go clean again, the same "re-revoke clears it" shape as
        # check_append_only_grants.py's own self-test.
        (dirty_dir / "0004_fix.sql").write_text(
            "create or replace function f() returns trigger as $$\n"
            "begin\n"
            "  update foo set baz = 1;\n"
            "  return null;\n"
            "end;\n"
            "$$ language plpgsql;\n"
        )
        if find_violations(dirty_dir):
            print("SELF-TEST FAILED: re-defining the function with the correct column name did not clear the violation")
            print(find_violations(dirty_dir))
            return 1

        # Cross-table false-positive guard: a second table has its OWN
        # column named `bar` that was never renamed. A function touching
        # ONLY that second table, still using ITS OWN `bar`, must not be
        # flagged just because `foo.bar` was renamed elsewhere.
        scoped_dir = tmp / "scoped"
        scoped_dir.mkdir()
        (scoped_dir / "0001_baseline.sql").write_text(
            "create table foo (id uuid primary key, bar bigint);\n"
            "create table other (id uuid primary key, bar bigint);\n"
        )
        (scoped_dir / "0002_rename.sql").write_text(
            "alter table foo rename column bar to baz;\n"
        )
        (scoped_dir / "0003_fn.sql").write_text(
            "create or replace function g() returns trigger as $$\n"
            "begin\n"
            "  update other set bar = 1;\n"
            "  return null;\n"
            "end;\n"
            "$$ language plpgsql;\n"
        )
        if find_violations(scoped_dir):
            print("SELF-TEST FAILED: a function touching an unrelated table's own same-named column was wrongly flagged")
            print(find_violations(scoped_dir))
            return 1

        # Dropped column (no replacement name), still referenced -- must
        # be caught too, not just renames.
        dropped_dir = tmp / "dropped"
        dropped_dir.mkdir()
        (dropped_dir / "0001_baseline.sql").write_text(
            "create table foo (id uuid primary key, legacy_flag boolean);\n"
        )
        (dropped_dir / "0002_drop.sql").write_text(
            "alter table foo drop column legacy_flag;\n"
        )
        (dropped_dir / "0003_fn.sql").write_text(
            "create or replace function h() returns trigger as $$\n"
            "begin\n"
            "  update foo set legacy_flag = true;\n"
            "  return null;\n"
            "end;\n"
            "$$ language plpgsql;\n"
        )
        dropped_violations = find_violations(dropped_dir)
        if not any("h()" in v and "foo.legacy_flag" in v and "dropped" in v for v in dropped_violations):
            print("SELF-TEST FAILED: a function referencing a dropped column was NOT caught")
            print(dropped_violations)
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main())
