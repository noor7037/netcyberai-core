#!/usr/bin/env python3
"""
Fails CI if any PERMISSIVE row-level-security policy on a tenant table,
as derived from supabase/migrations/*.sql, is not on the explicit
allowlist below. Restrictive policies narrow access and are not this
check's concern (Pre-F Architecture Hardening, Stage 2b) -- the risk
this defends against is the *next* permissive policy someone adds,
which silently ORs access wider (Postgres combines multiple permissive
policies for the same command with OR; a restrictive policy instead
ANDs, which is why the design already treats permissive as the
dangerous direction).

Migration-file parser, not a live-database snapshot: this project
already treats supabase/migrations/*.sql as the single source of truth
for schema (docs/10_DECISION_LOG.md, Part 5 -- "nobody edits
db/schema.sql directly once migrations exist; a change is a new
migration file"). A parser deriving policy state from these files can
never drift from what CI actually validates, and needs no separate
"did you remember to refresh the snapshot" step the way a committed
pg_policies dump would require. CI cannot reach the live database
(Decision Log C38) anyway, so a live query was never actually an
option, only a snapshot -- and a snapshot has the staleness failure
mode a parser doesn't.

This is a regex-based parser tuned to the handful of `create policy`
shapes actually used in this repo (a plain statement, or a `do $$ ...
for t in select unnest(array[...]) loop execute format('create policy
%I_SUFFIX on %I ...', t, t); end loop; end $$;` templated batch) -- not
a general SQL grammar parser. Same tradeoff check_choke_point.py and
check_claims.py already make in this repo: file-local, regex-based,
and says so.

What this does NOT cover: a templated (loop-generated) policy that is
restrictive rather than permissive -- every templated policy in this
repo today is permissive, so the parser hardcodes that. A future
templated restrictive policy would be misclassified. It also does not
inspect a policy's USING/WITH CHECK clause at all -- only its name,
table, and command -- so a policy that keeps an allowlisted name but
has its condition silently widened would not be caught here; that is
a code-review concern, not this check's.

Stage 2e adds a second, independent check: every table the app code
actually issues an UPDATE, DELETE, or upsert (INSERT ... ON CONFLICT
DO UPDATE) against through the RLS-subject path (withTenantContext,
not withBackendConnection -- `sessions` has no RLS at all by design and
is excluded explicitly) must have at least one PERMISSIVE policy
covering that command. Decision Log C40's actual bug -- a missing
UPDATE policy turning `impersonate/end`'s update into a silent 0-row
no-op -- is exactly the shape this catches at CI time instead of live.
"""
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
SRC_DIR = REPO_ROOT / "src"

# sessions carries no RLS at all, by design (src/lib/auth/db.ts's own
# comment on withBackendConnection: reachable only via app_backend's
# direct grants, never SET ROLE'd into app_user/nca_super). Its
# UPDATEs are correctly outside this check's concern.
TABLES_WITHOUT_RLS = {"sessions"}

# Every (table, policy_name) pair this repo's migrations are currently
# expected to create as PERMISSIVE. Anything PERMISSIVE found that is
# NOT here fails the check. Verified against a live
# `select tablename, policyname from pg_policies where permissive =
# 'PERMISSIVE'` snapshot at the time this allowlist was written
# (Pre-F Architecture Hardening) -- 58 policies, matched exactly.
_TENANT_ISOLATION_TABLES = [
    "users", "classes", "subjects", "students", "parents", "parent_student_map",
    "teachers", "teacher_subjects", "consent_ledger", "attendance", "syllabus_progress",
    "exams", "marks", "fees_ledger", "communication_log", "recognition_events",
    "teacher_impact_metrics", "parent_feedback", "certificate_requests", "system_config",
    "fee_heads", "fee_structures", "fee_structure_items", "fee_concessions", "payments",
    "compliance_config", "at_risk_flags", "pulse_messages", "pulse_response_log",
    "student_qr_tokens", "qr_scan_log", "captured_documents", "ocr_extractions",
    "webhook_events", "memberships", "csv_imports",
]
_ACCOUNTING_TABLES = ["fee_heads", "fee_structures", "fee_structure_items", "fee_concessions", "payments"]

ALLOWED_PERMISSIVE = (
    {("schools", "schools_tenant_isolation")}  # bespoke: super_admin bypass baked into its own USING clause
    | {(t, f"{t}_tenant_isolation") for t in _TENANT_ISOLATION_TABLES}
    | {(t, f"{t}_accounting_{suffix}") for t in _ACCOUNTING_TABLES for suffix in ("write", "update", "delete")}
    | {
        # Self-scoped exceptions -- resolving "which schools/memberships
        # can this user see" BEFORE app.current_tenant_id can be known
        # (src/lib/auth/db.ts's withSelfContext). Three of these exist,
        # not the two named in the prompt that asked for this checker --
        # users_self is the identical pattern; found while building
        # this allowlist against the live database, not assumed.
        ("memberships", "memberships_self"),
        ("schools", "schools_visible_via_own_membership"),
        ("users", "users_self"),
        # Audit log: append-only INSERT gate, and read-your-own-school SELECT.
        ("audit_log", "audit_insert_only"),
        ("audit_log", "audit_read_own_school"),
        # Impersonation: visible to the impersonated school; self-end
        # (Decision Log C40 -- the missing UPDATE policy that silently
        # broke impersonate/end).
        ("impersonation_sessions", "impersonation_visible_to_target_school"),
        ("impersonation_sessions", "impersonation_self_end"),
        # Platform-level reference table, readable by every role.
        ("message_rate_table", "message_rate_table_read_all"),
    }
)

CREATE_POLICY_RE = re.compile(r"create\s+policy\s+\"?(?P<name>\w+)\"?\s+on\s+\"?(?P<table>\w+)\"?", re.IGNORECASE)
TEMPLATED_RE = re.compile(r"create\s+policy\s+%I_(?P<suffix>\w+)\s+on\s+%I", re.IGNORECASE)
UNNEST_ARRAY_RE = re.compile(r"unnest\(array\[(?P<items>.*?)\]\)", re.IGNORECASE | re.DOTALL)
QUOTED_ITEM_RE = re.compile(r"'([^']+)'")
DO_BLOCK_RE = re.compile(r"do\s*\$\$.*?end\s*\$\$\s*;", re.IGNORECASE | re.DOTALL)
DROP_POLICY_RE = re.compile(
    r"drop\s+policy\s+(?:if\s+exists\s+)?\"?(?P<name>\w+)\"?\s+on\s+\"?(?P<table>\w+)\"?", re.IGNORECASE
)
FOR_CMD_RE = re.compile(r"\bfor\s+(select|insert|update|delete|all)\b", re.IGNORECASE)

# Templated policy suffix -> command it grants, for suffixes whose name
# doesn't literally say (tenant_isolation has no FOR clause -> ALL).
_TEMPLATED_SUFFIX_CMD = {"tenant_isolation": "ALL", "accounting_write": "INSERT", "accounting_update": "UPDATE", "accounting_delete": "DELETE"}


def parse_migrations(migrations_dir: Path) -> dict:
    """Replay every migration file in order; return
    {(table, policy_name): (is_permissive, cmd)}, cmd in
    SELECT/INSERT/UPDATE/DELETE/ALL."""
    policies: dict[tuple[str, str], tuple[bool, str]] = {}

    for path in sorted(migrations_dir.glob("*.sql")):
        text = path.read_text()

        # Templated (loop) policies: every do-block that both unnests an
        # array of table names AND contains a %I_SUFFIX create-policy
        # template applies that template to every table in the array.
        for block in DO_BLOCK_RE.findall(text):
            suffixes = TEMPLATED_RE.findall(block)
            if not suffixes:
                continue
            array_match = UNNEST_ARRAY_RE.search(block)
            if not array_match:
                continue
            tables = QUOTED_ITEM_RE.findall(array_match.group("items"))
            for suffix in suffixes:
                cmd = _TEMPLATED_SUFFIX_CMD.get(suffix, "ALL")
                for t in tables:
                    policies[(t, f"{t}_{suffix}")] = (True, cmd)  # every templated policy in this repo is permissive

        # Static (non-templated) create policy statements.
        for m in CREATE_POLICY_RE.finditer(text):
            name, table = m.group("name"), m.group("table")
            if "%" in name:
                continue  # templated form (%I_...), already handled above
            tail = text[m.end() : m.end() + 200]
            is_permissive = "restrictive" not in tail[:40].lower()
            cmd_match = FOR_CMD_RE.search(tail)
            cmd = cmd_match.group(1).upper() if cmd_match else "ALL"
            policies[(table, name)] = (is_permissive, cmd)

        # Dropped policies stop existing, whichever form created them.
        for m in DROP_POLICY_RE.finditer(text):
            policies.pop((m.group("table"), m.group("name")), None)

    return policies


UPDATE_TABLE_RE = re.compile(r"\bupdate\s+\"?(?P<table>\w+)\"?\s+set\b", re.IGNORECASE)
DELETE_TABLE_RE = re.compile(r"\bdelete\s+from\s+\"?(?P<table>\w+)\"?", re.IGNORECASE)
UPSERT_TABLE_RE = re.compile(
    r"\binsert\s+into\s+\"?(?P<table>\w+)\"?.*?\bon\s+conflict\b.*?\bdo\s+update\b", re.IGNORECASE | re.DOTALL
)
TEMPLATE_LITERAL_RE = re.compile(r"`([^`]*)`", re.DOTALL)


def find_app_mutations(src_dir: Path) -> set[tuple[str, str]]:
    """Scan app source for (table, cmd) pairs the app issues an UPDATE
    or DELETE (including upsert-triggered UPDATE) against. Only looks
    inside backtick template literals, where this codebase's SQL text
    lives -- not a general SQL extractor, the same tradeoff as the rest
    of this file."""
    mutations: set[tuple[str, str]] = set()
    for path in src_dir.rglob("*.ts"):
        text = path.read_text()
        for literal in TEMPLATE_LITERAL_RE.findall(text):
            for m in UPDATE_TABLE_RE.finditer(literal):
                mutations.add((m.group("table"), "UPDATE"))
            for m in DELETE_TABLE_RE.finditer(literal):
                mutations.add((m.group("table"), "DELETE"))
            for m in UPSERT_TABLE_RE.finditer(literal):
                mutations.add((m.group("table"), "UPDATE"))
    return {(t, c) for t, c in mutations if t not in TABLES_WITHOUT_RLS}


def main() -> int:
    policies = parse_migrations(MIGRATIONS_DIR)
    permissive = {k for k, (is_permissive, _cmd) in policies.items() if is_permissive}

    unexpected = sorted(permissive - ALLOWED_PERMISSIVE)
    stale = sorted(ALLOWED_PERMISSIVE - permissive)
    ok = True

    if stale:
        print("NOTE: allowlist entries no longer found as permissive policies (harmless -- update the allowlist when convenient):")
        for table, name in stale:
            print(f"  {table}.{name}")

    if unexpected:
        ok = False
        print("FAIL: permissive polic(y/ies) not on the allowlist -- a new permissive policy silently ORs access wider:")
        for table, name in unexpected:
            print(f"  {table}.{name}")
        print("\nIf deliberate, add the (table, policy_name) pair to ALLOWED_PERMISSIVE in this file with a comment explaining why.")
    else:
        print(f"PASS: {len(permissive)} permissive policies across {len({t for t, _ in permissive})} tables, all on the allowlist.")

    # Stage 2e: every table the app mutates via UPDATE/DELETE/upsert
    # through the RLS-subject path must have a PERMISSIVE policy
    # covering that command -- otherwise it's Decision Log C40's exact
    # bug waiting to happen again (silent 0-row no-op, not an error).
    permissive_cmd_coverage: dict[str, set[str]] = {}
    for (table, _name), (is_permissive, cmd) in policies.items():
        if not is_permissive:
            continue
        cmds = {"SELECT", "INSERT", "UPDATE", "DELETE"} if cmd == "ALL" else {cmd}
        permissive_cmd_coverage.setdefault(table, set()).update(cmds)

    mutations = find_app_mutations(SRC_DIR)
    uncovered = sorted(
        (table, cmd) for table, cmd in mutations if cmd not in permissive_cmd_coverage.get(table, set())
    )
    if uncovered:
        ok = False
        print("FAIL: app code mutates a table with no permissive RLS policy covering that command:")
        for table, cmd in uncovered:
            print(f"  {table}: {cmd} -- app_user would silently affect 0 rows here, not error")
    else:
        print(f"PASS: {len(mutations)} app-level UPDATE/DELETE/upsert targets all have a covering permissive policy.")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
