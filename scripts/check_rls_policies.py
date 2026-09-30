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

A third, independent check (added after Decision Log C62 GAP 1): a
table with a PERMISSIVE policy covering ALL commands (the shape every
`_tenant_isolation` policy takes) may not also carry another PERMISSIVE
policy for INSERT/UPDATE/DELETE. Postgres ORs permissive policies
together, so a second one can never narrow access -- only widen it or
sit there as a no-op. This is exactly the shape that made five
accounting "restriction" policies on fee_heads/fee_structures/
fee_structure_items/fee_concessions/payments silent no-ops for months:
they were PERMISSIVE, riding alongside those same tables' own
PERMISSIVE, unconditional ALL-command tenant_isolation policy. The
allowlist above used to accept that shape by name -- which is exactly
why it never caught the bug -- so this check makes the *shape* itself
fail by default, with no allowlist escape hatch: the only fix is
making the overlay RESTRICTIVE, never re-permitting it here. It does
NOT fire on the self-scope exceptions (`memberships_self`, `users_self`,
`schools_visible_via_own_membership`) because all three are SELECT-only
-- they resolve identity before `app.current_tenant_id` is known, they
don't restrict writes, and this rule only looks at INSERT/UPDATE/DELETE
overlap with a blanket ALL-command policy.
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
    "retention_policy", "data_subject_requests",
    # Academic session/term modeling (Decision Log C68) -- plain
    # tenant-isolation-only, same precedent as classes/subjects: no
    # money or PII, no accounting-style overlay needed.
    "academic_sessions",
]

ALLOWED_PERMISSIVE = (
    {("schools", "schools_tenant_isolation")}  # bespoke: super_admin bypass baked into its own USING clause
    | {(t, f"{t}_tenant_isolation") for t in _TENANT_ISOLATION_TABLES}
    # NOTE: fee_heads/fee_structures/fee_structure_items/fee_concessions/
    # payments' own accounting_write/update/delete overlays used to be
    # here, PERMISSIVE, on the theory that role-scoping was a separate
    # concern from tenant isolation. It wasn't: PERMISSIVE policies OR
    # together, and tenant_isolation's own unconditional ALL-command
    # permissive check meant the accounting overlay never actually
    # narrowed anything -- any role in the correct tenant could write
    # fee data (pre-Prompt-I hardening PR, Decision Log C62). Converted
    # to RESTRICTIVE (supabase/migrations/20260922070000_...), so they no
    # longer belong on this PERMISSIVE allowlist at all -- this allowlist
    # having accepted them here in the first place, rather than treating
    # "permissive AND role-scoped-without-tenant-scoping" as itself
    # suspicious, is exactly why this check never caught the bug.
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
        # Users holding a membership of the current tenant (C89: principals
        # and school admins send password-reset codes). Tenant-scoped through
        # memberships, no role clause; who may list accounts is enforced in
        # the API routes.
        ("users", "users_school_staff_read"),
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
        # Prompt H Task 2: WhatsApp send-gate schema. Tenant-isolated
        # SELECT (routing metadata only, never a credential); the
        # actual write restriction to school_admin/principal is a
        # RESTRICTIVE overlay (school_whatsapp_configs_admin_write/
        # update/delete), out of this check's scope by design.
        ("school_whatsapp_configs", "school_whatsapp_configs_tenant_isolation"),
        # Platform-default (school_id null) rows readable by every
        # school; a school's own override row readable only by that
        # school. Write restriction is the RESTRICTIVE
        # whatsapp_templates_admin_write overlay, same as above.
        ("whatsapp_templates", "whatsapp_templates_read"),
        # `leads` is the one genuinely pre-tenant table (public Get
        # Started/Book Demo intake, reached via withBackendConnection,
        # never withTenantContext -- there is no school_id yet). Public
        # insert; app_backend's own duplicate-check read (bounded by its
        # narrow grant, not a row condition); super_admin read/write for
        # the Control Plane pipeline. None of these is an ALL-command
        # policy, so this table can never trigger find_double_permissive_
        # writes below regardless.
        ("leads", "leads_public_insert"),
        ("leads", "leads_backend_duplicate_check"),
        ("leads", "leads_super_admin_read"),
        ("leads", "leads_super_admin_write"),
        # B2 (Decision Log C97, C98): platform tables. Every policy is
        # scoped `to nca_super` (BYPASSRLS anyway; the policies state the
        # intended access), app_user/app_backend/anon/authenticated hold no
        # grant on them at all (test/onboarding/rls.test.ts, and the live
        # proof in C98). The one school-side entry is jobs_enqueue: INSERT
        # only, for app_user limited to type invite.send of its own school.
        ("jobs", "jobs_platform_read"),
        ("jobs", "jobs_platform_update"),
        ("jobs", "jobs_enqueue"),
        ("school_applications", "school_applications_platform_read"),
        ("school_applications", "school_applications_platform_insert"),
        ("school_applications", "school_applications_platform_update"),
        ("intake_rate_events", "intake_rate_events_platform_read"),
        ("intake_rate_events", "intake_rate_events_platform_insert"),
        ("intake_rate_events", "intake_rate_events_platform_delete"),
        ("platform_settings", "platform_settings_platform_read"),
        ("platform_settings", "platform_settings_platform_update"),
        # Tenant table: the usual tenant isolation, narrowed by the
        # RESTRICTIVE staff_invitations_admin_only overlay (principal,
        # school admin, platform admin).
        ("staff_invitations", "staff_invitations_tenant_isolation"),
        # P1-b frameworks (Decision Log C112). Entitlements: schools read
        # their own (SELECT only; app_user holds no write grant), the
        # founder writes (scoped `to nca_super`).
        ("school_entitlements", "school_entitlements_tenant_read"),
        ("school_entitlements", "school_entitlements_platform_write"),
        ("school_module_entitlements", "school_module_entitlements_tenant_read"),
        ("school_module_entitlements", "school_module_entitlements_platform_write"),
        # Tenant isolation, each narrowed by a RESTRICTIVE role overlay
        # (school_settings_no_teacher_write, custom_field_definitions_office_write,
        # custom_field_values_office_only, saved_views_visible / _insert_own /
        # _manage / _delete, bulk_runs_owner_or_office).
        ("school_settings", "school_settings_tenant_isolation"),
        ("custom_field_definitions", "custom_field_definitions_tenant_isolation"),
        ("custom_field_values", "custom_field_values_tenant_isolation"),
        ("saved_views", "saved_views_tenant_isolation"),
        ("bulk_runs", "bulk_runs_tenant_isolation"),
        # Settings history is append-only: tenant read and tenant insert,
        # no update or delete grant (check_append_only_grants.py).
        ("school_setting_changes", "school_setting_changes_tenant_read"),
        ("school_setting_changes", "school_setting_changes_tenant_insert"),
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


DANGEROUS_WRITE_CMDS = {"INSERT", "UPDATE", "DELETE"}


def find_double_permissive_writes(policies: dict) -> list[tuple[str, str, str]]:
    """Return sorted (table, blanket_policy_name, overlay_policy_name)
    triples where a table has a PERMISSIVE ALL-command policy AND
    another PERMISSIVE policy covering INSERT/UPDATE/DELETE -- the
    overlay is structurally incapable of narrowing anything (Decision
    Log C62 GAP 1's exact bug shape). No allowlist for this one:
    the only real fix is converting the overlay to RESTRICTIVE."""
    by_table: dict[str, list[tuple[str, bool, str]]] = {}
    for (table, name), (is_permissive, cmd) in policies.items():
        by_table.setdefault(table, []).append((name, is_permissive, cmd))

    findings = []
    for table, entries in by_table.items():
        blanket_names = [name for name, is_p, cmd in entries if is_p and cmd == "ALL"]
        if not blanket_names:
            continue
        for name, is_p, cmd in entries:
            if is_p and cmd in DANGEROUS_WRITE_CMDS and name not in blanket_names:
                for blanket in blanket_names:
                    findings.append((table, blanket, name))
    return sorted(set(findings))


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

    double_permissive = find_double_permissive_writes(policies)
    if double_permissive:
        ok = False
        print(
            "FAIL: a PERMISSIVE ALL-command policy coexists with another PERMISSIVE "
            "INSERT/UPDATE/DELETE policy on the same table -- the second one cannot "
            "narrow access, only widen it or no-op (Decision Log C62 GAP 1's exact bug shape):"
        )
        for table, blanket, overlay in double_permissive:
            print(f"  {table}: {blanket} (PERMISSIVE, ALL) + {overlay} (PERMISSIVE) -- make {overlay} RESTRICTIVE")
    else:
        print("PASS: no PERMISSIVE write-restricting overlay rides alongside a PERMISSIVE ALL-command policy on the same table.")

    return 0 if ok else 1


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        # The exact C62 GAP 1 bug shape: a blanket ALL-permissive
        # tenant_isolation policy (real repo shape: the templated
        # do-block, not a static statement) plus a PERMISSIVE write
        # overlay that can never actually narrow anything -- must be
        # caught.
        bug_dir = tmp / "bug"
        bug_dir.mkdir()
        (bug_dir / "0001_bug.sql").write_text(
            "do $$\n"
            "declare t text;\n"
            "begin\n"
            "  for t in select unnest(array['fee_heads']) loop\n"
            "    execute format('create policy %I_tenant_isolation on %I using "
            "(school_id = current_setting(''app.current_tenant_id'', true)::uuid)', t, t);\n"
            "  end loop;\n"
            "end $$;\n"
            "create policy fee_heads_accounting_write on fee_heads\n"
            "  for insert with check (current_setting('app.current_role', true) = 'accountant');\n"
        )
        bug_policies = parse_migrations(bug_dir)
        bug_findings = find_double_permissive_writes(bug_policies)
        if not any(f == ("fee_heads", "fee_heads_tenant_isolation", "fee_heads_accounting_write") for f in bug_findings):
            print("SELF-TEST FAILED: the exact C62 GAP 1 shape (permissive overlay beside a permissive ALL policy) was not caught")
            print(bug_findings)
            return 1

        # The real fix: making the overlay RESTRICTIVE must clear it.
        fixed_dir = tmp / "fixed"
        fixed_dir.mkdir()
        (fixed_dir / "0001_fixed.sql").write_text(
            "do $$\n"
            "declare t text;\n"
            "begin\n"
            "  for t in select unnest(array['fee_heads']) loop\n"
            "    execute format('create policy %I_tenant_isolation on %I using "
            "(school_id = current_setting(''app.current_tenant_id'', true)::uuid)', t, t);\n"
            "  end loop;\n"
            "end $$;\n"
            "create policy fee_heads_accounting_write on fee_heads\n"
            "  as restrictive for insert with check (current_setting('app.current_role', true) = 'accountant');\n"
        )
        fixed_findings = find_double_permissive_writes(parse_migrations(fixed_dir))
        if fixed_findings:
            print("SELF-TEST FAILED: converting the overlay to RESTRICTIVE did not clear the finding")
            print(fixed_findings)
            return 1

        # Must NOT false-positive on the real self-scope shape
        # (SELECT-only permissive policy beside a blanket ALL policy) --
        # this is the legitimate memberships_self/users_self/
        # schools_visible_via_own_membership pattern, not the bug.
        selfscope_dir = tmp / "selfscope"
        selfscope_dir.mkdir()
        (selfscope_dir / "0001_selfscope.sql").write_text(
            "create policy memberships_self on memberships\n"
            "  for select using (user_id = current_setting('app.current_user_id', true)::uuid);\n"
            "do $$\n"
            "declare t text;\n"
            "begin\n"
            "  for t in select unnest(array['memberships']) loop\n"
            "    execute format('create policy %I_tenant_isolation on %I using "
            "(school_id = current_setting(''app.current_tenant_id'', true)::uuid)', t, t);\n"
            "  end loop;\n"
            "end $$;\n"
        )
        selfscope_findings = find_double_permissive_writes(parse_migrations(selfscope_dir))
        if selfscope_findings:
            print("SELF-TEST FAILED: the legitimate SELECT-only self-scope shape was flagged as if it were the C62 bug")
            print(selfscope_findings)
            return 1

        # A single ALL-permissive policy alone (no overlay at all) is
        # the normal, common case and must never be flagged.
        clean_dir = tmp / "clean"
        clean_dir.mkdir()
        (clean_dir / "0001_clean.sql").write_text(
            "create policy classes_tenant_isolation on classes\n"
            "  using (school_id = current_setting('app.current_tenant_id', true)::uuid);\n"
        )
        if find_double_permissive_writes(parse_migrations(clean_dir)):
            print("SELF-TEST FAILED: a table with only a single ALL-permissive policy was wrongly flagged")
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main())
