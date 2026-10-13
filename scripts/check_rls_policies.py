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
        # C184: the platform's own templates are decided by NetCyberAI staff as the
        # platform role; scoped `to nca_super`, so no school role gains anything.
        ("whatsapp_templates", "whatsapp_templates_platform_decide"),
        # C186: the platform's WhatsApp account; scoped `to nca_super`; no school role holds any grant on it.
        ("whatsapp_credentials", "whatsapp_credentials_platform"),
        # C190: held messages, encrypted; scoped `to nca_super`; no school role holds any grant.
        ("held_inbound", "held_inbound_platform"),
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
        # Sibling mapping (Decision Log C116): tenant isolation, narrowed by
        # the RESTRICTIVE families_office_write / teacher_scope_families /
        # school_sequences_office_write / guardian_merges_office_only.
        # guardian_merges is append-only: tenant read and tenant insert.
        ("school_sequences", "school_sequences_tenant_isolation"),
        ("families", "families_tenant_isolation"),
        ("guardian_merges", "guardian_merges_tenant_read"),
        ("guardian_merges", "guardian_merges_tenant_insert"),
        # Founder reasons (Decision Log C124): scoped `to nca_super`; every
        # other role holds no grant on the table at all.
        ("entitlement_change_reasons", "entitlement_change_reasons_platform_read"),
        ("entitlement_change_reasons", "entitlement_change_reasons_platform_insert"),
        # Raise Ticket (Decision Log C126): tenant isolation, narrowed by the
        # RESTRICTIVE support_tickets_own_or_office / _raise_as_self and the
        # *_visible_ticket overlays. Replies and screenshots are append-only:
        # tenant read and tenant insert.
        ("support_tickets", "support_tickets_tenant_isolation"),
        # P2 5b (C144): tenant isolation only. What narrows them is RESTRICTIVE
        # and required below: client_operations_own (a person's own
        # operations) and usage_events_read_leadership.
        ("client_operations", "client_operations_tenant_isolation"),
        ("usage_events", "usage_events_tenant_isolation"),
        # P2 5c (C145): tenant isolation only; narrowed by the RESTRICTIVE
        # staff_read and office_insert/update/delete, required below.
        ("timetable_entries", "timetable_entries_tenant_isolation"),
        # C146: tenant isolation only; narrowed by the RESTRICTIVE read,
        # make_own and office_decide, required below.
        ("attendance_correction_requests", "attendance_correction_requests_tenant_isolation"),
        # P2 5d (C147): tenant isolation only; narrowed by the RESTRICTIVE
        # teacher_scope and staff_insert/delete, required below.
        ("syllabus_units", "syllabus_units_tenant_isolation"),
        # C148: tenant isolation only; narrowed by the RESTRICTIVE staff and teacher_scope, required below.
        ("pulse_followups", "pulse_followups_tenant_isolation"),
        # P2 5e (C150): tenant isolation only; narrowed by the RESTRICTIVE *_staff and *_teacher_scope, required below.
        ("homework", "homework_tenant_isolation"),
        ("homework_targets", "homework_targets_tenant_isolation"),
        ("homework_status", "homework_status_tenant_isolation"),
        ("homework_attachments", "homework_attachments_tenant_isolation"),
        # C152: tenant isolation only; narrowed by the RESTRICTIVE staff, teacher_scope and decide_as_self, required below.
        ("recovery_plans", "recovery_plans_tenant_isolation"),
        # C160: tenant isolation only; narrowed by the RESTRICTIVE receipts_finance and receipts_issue_as_self, required below.
        ("receipts", "receipts_tenant_isolation"),
        # C163: tenant isolation only; narrowed by the RESTRICTIVE fee_status_runs_finance, required below. app_user holds SELECT only.
        ("fee_status_runs", "fee_status_runs_tenant_isolation"),
        # C168: tenant isolation only; narrowed by the RESTRICTIVE finance policies (and made-as-self on links), required below.
        ("payment_links", "payment_links_tenant_isolation"),
        # C169: tenant isolation only; narrowed by the RESTRICTIVE payment_events_finance, required below. app_user holds SELECT only.
        ("payment_events", "payment_events_tenant_isolation"),
        # C171: tenant isolation only; each narrowed by RESTRICTIVE policies required below. payment_credentials has no grant for app_user at all.
        ("payment_methods", "payment_methods_tenant_isolation"),
        ("payment_gateway_access", "payment_gateway_access_tenant_isolation"),
        ("payment_credentials", "payment_credentials_tenant_isolation"),
        ("payment_evidence", "payment_evidence_tenant_isolation"),
        # C174: tenant isolation only; narrowed by the RESTRICTIVE payment_reports_finance, required below.
        ("payment_reports", "payment_reports_tenant_isolation"),
        # C176: tenant isolation only; each narrowed by the RESTRICTIVE policies required below.
        # C187: tenant isolation only; each narrowed to the right staff by the RESTRICTIVE policies required below.
        ("class_notices", "class_notices_tenant_isolation"),
        ("ptm_events", "ptm_events_tenant_isolation"),  # C193: narrowed by the RESTRICTIVE policies below
        ("ptm_slots", "ptm_slots_tenant_isolation"),
        ("ptm_bookings", "ptm_bookings_tenant_isolation"),
        ("school_events", "school_events_tenant_isolation"),  # C194: narrowed by the RESTRICTIVE policies below
        ("event_replies", "event_replies_tenant_isolation"),
        ("complaints", "complaints_tenant_isolation"),  # C195: narrowed by the RESTRICTIVE policies below
        ("complaint_events", "complaint_events_tenant_isolation"),
        ("parent_ai_answers", "parent_ai_answers_tenant_isolation"),  # C196: narrowed by the RESTRICTIVE policies below  # C191: narrowed by the RESTRICTIVE policies below
        ("message_threads", "message_threads_tenant_isolation"),
        ("inbound_messages", "inbound_messages_tenant_isolation"),
        ("whatsapp_opt_outs", "whatsapp_opt_outs_tenant_isolation"),
        ("fee_followups", "fee_followups_tenant_isolation"),  # C178: narrowed to the finance roles below
        ("fee_refunds", "fee_refunds_tenant_isolation"),
        ("fee_reminders", "fee_reminders_tenant_isolation"),  # C179
        ("fee_clearance_overrides", "fee_clearance_overrides_tenant_isolation"),
        ("school_holidays", "school_holidays_tenant_isolation"),
        ("bank_accounts", "bank_accounts_tenant_isolation"),
        ("bank_statement_imports", "bank_statement_imports_tenant_isolation"),
        ("bank_credit_rows", "bank_credit_rows_tenant_isolation"),
        ("payment_link_lines", "payment_link_lines_tenant_isolation"),
        # C154: tenant isolation only; narrowed by the RESTRICTIVE policies required below.
        ("ai_usage", "ai_usage_tenant_isolation"),
        ("teaching_notes", "teaching_notes_tenant_isolation"),
        ("support_ticket_messages", "support_ticket_messages_tenant_read"),
        ("support_ticket_messages", "support_ticket_messages_tenant_insert"),
        ("support_ticket_attachments", "support_ticket_attachments_tenant_read"),
        ("support_ticket_attachments", "support_ticket_attachments_tenant_insert"),
        # --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
        # p5-8a begin
        # p5-8a end
        # p5-8b begin
        # p5-8b end
        # p5-8c begin
        # p5-8c end
        # p5-8d begin
        # p5-8d end
        # p5-8e begin
        # p5-8e end
        # p5-8f begin
        # p5-8f end
        # p5-8g begin
        # p5-8g end
        # p5-8h begin
        # p5-8h end
        # p5-8i begin
        # p5-8i end
        # p5-8j begin
        # p5-8j end
    }
)

# The role-narrowing policies the tenant model depends on (Decision Log
# C112): each must exist and stay RESTRICTIVE. This list is the opposite of
# ALLOWED_PERMISSIVE: dropping one, or recreating it as PERMISSIVE (which
# would OR access wider instead of narrowing it), fails the check.
# teacher_scope_*: a teacher reads only their own classes' students,
# guardians and guardian links, attendance and syllabus progress (17 §5).
REQUIRED_RESTRICTIVE = {
    ("students", "teacher_scope_students"),
    ("parents", "teacher_scope_parents"),
    ("parent_student_map", "teacher_scope_parent_student_map"),
    ("attendance", "teacher_scope_attendance"),
    ("syllabus_progress", "teacher_scope_syllabus_progress"),
    ("students", "consent_gate_students"),
    ("custom_field_values", "custom_field_values_office_only"),
    ("families", "teacher_scope_families"),
    ("families", "families_office_write"),
    ("guardian_merges", "guardian_merges_office_only"),
    # C124: hides the older 'entitlement.%' audit rows that carry the
    # founder's reason from every role subject to row level security.
    ("audit_log", "audit_founder_reason_hidden"),
    # C126: inside a school, tickets are the raiser's or the office's.
    ("support_tickets", "support_tickets_own_or_office"),
    ("support_tickets", "support_tickets_raise_as_self"),
    # C144: an operation id belongs to the person who made it; measurements
    # are read by the school's leadership only.
    ("client_operations", "client_operations_own"),
    ("usage_events", "usage_events_read_leadership"),
    # C145: a teacher reads their own periods and classes; only the office writes.
    ("timetable_entries", "timetable_entries_staff_read"),
    ("timetable_entries", "timetable_entries_office_insert"),
    ("timetable_entries", "timetable_entries_office_update"),
    ("timetable_entries", "timetable_entries_office_delete"),
    # C146: the office reads the queue and decides; a request is made in one's own name.
    ("attendance_correction_requests", "attendance_correction_requests_read"),
    ("attendance_correction_requests", "attendance_correction_requests_make_own"),
    ("attendance_correction_requests", "attendance_correction_requests_office_decide"),
    # C147: a teacher reads and writes only their own classes' map and Pulse messages.
    ("syllabus_units", "syllabus_units_teacher_scope"),
    ("syllabus_units", "syllabus_units_staff_insert"),
    ("syllabus_units", "syllabus_units_staff_delete"),
    ("pulse_messages", "teacher_scope_pulse_messages"),
    # C148: the needs-help queue is for those who teach or run the school; a teacher, their own classes.
    ("pulse_followups", "pulse_followups_staff"),
    ("pulse_followups", "pulse_followups_teacher_scope"),
    # C150: homework is for those who teach or run the school; a teacher, their own classes.
    ("homework", "homework_staff"),
    ("homework", "homework_teacher_scope"),
    ("homework_targets", "homework_targets_staff"),
    ("homework_targets", "homework_targets_teacher_scope"),
    ("homework_status", "homework_status_staff"),
    ("homework_status", "homework_status_teacher_scope"),
    ("homework_attachments", "homework_attachments_staff"),
    ("homework_attachments", "homework_attachments_teacher_scope"),
    # C152: catch-up plans: staff only; a teacher, their own classes; decided in one's own name.
    ("recovery_plans", "recovery_plans_staff"),
    ("recovery_plans", "recovery_plans_teacher_scope"),
    ("recovery_plans", "recovery_plans_decide_as_self"),
    # C154: usage is written as oneself and read by leadership or its owner; notes are staff-only, a teacher's own classes, approved as oneself.
    ("ai_usage", "ai_usage_write_as_self"),
    ("ai_usage", "ai_usage_read"),
    ("teaching_notes", "teaching_notes_staff"),
    ("teaching_notes", "teaching_notes_teacher_scope"),
    ("teaching_notes", "teaching_notes_approve_as_self"),
    # C157: only the principal, the school admin and the accountant read fee rules.
    ("fee_heads", "fee_heads_finance_read"),
    ("fee_structures", "fee_structures_finance_read"),
    ("fee_structure_items", "fee_structure_items_finance_read"),
    # C159: dues, payments and concessions are read by the finance roles (dues also by a parent, their own children's).
    ("fees_ledger", "fees_ledger_finance_read"),
    ("fees_ledger", "fees_ledger_finance_write"),
    ("payments", "payments_finance_read"),
    ("fee_concessions", "fee_concessions_finance_read"),
    # C160: receipts are the finance roles', issued in one's own name.
    ("receipts", "receipts_finance"),
    # C163: the nightly fee results are the finance roles'.
    ("fee_status_runs", "fee_status_runs_finance"),
    # C168: payment links and their lines are the finance roles'; a link is made in one's own name.
    ("payment_links", "payment_links_finance"),
    ("payment_events", "payment_events_finance"),
    # C171: payment rails.
    ("payment_methods", "payment_methods_finance_read"),
    ("payment_methods", "payment_methods_office_insert"),
    ("payment_methods", "payment_methods_office_update"),
    ("payment_gateway_access", "payment_gateway_access_finance"),
    ("payment_credentials", "payment_credentials_nobody"),
    ("whatsapp_credentials", "whatsapp_credentials_nobody"),
    ("held_inbound", "held_inbound_nobody"),
    ("payment_evidence", "payment_evidence_finance"),
    ("payment_reports", "payment_reports_finance"),
    # C176: holidays are the office's to change; bank accounts, statements and rows are the finance roles'.
    ("class_notices", "class_notices_staff"),
    ("ptm_events", "ptm_events_staff"),
    ("ptm_events", "ptm_events_office_makes"),
    ("ptm_events", "ptm_events_office_changes"),
    ("ptm_slots", "ptm_slots_staff"),
    ("ptm_slots", "ptm_slots_office_makes"),
    ("ptm_bookings", "ptm_bookings_staff"),
    ("school_events", "school_events_staff"),
    ("school_events", "school_events_office_makes"),
    ("school_events", "school_events_office_changes"),
    ("event_replies", "event_replies_staff"),
    ("complaints", "complaints_staff"),
    ("complaints", "complaints_as_self"),
    ("complaint_events", "complaint_events_with_complaint"),
    ("parent_ai_answers", "parent_ai_answers_staff"),
    ("parent_ai_answers", "parent_ai_answers_as_self"),
    ("class_notices", "class_notices_as_self"),
    ("class_notices", "class_notices_principal_decides"),
    ("message_threads", "message_threads_staff"),
    ("inbound_messages", "inbound_messages_staff"),
    ("whatsapp_opt_outs", "whatsapp_opt_outs_staff"),
    ("whatsapp_opt_outs", "whatsapp_opt_outs_office"),
    ("fee_followups", "fee_followups_finance"),
    ("fee_followups", "fee_followups_as_self"),
    ("fee_refunds", "fee_refunds_finance"),
    ("fee_refunds", "fee_refunds_as_self"),
    ("fee_reminders", "fee_reminders_finance"),
    ("fee_clearance_overrides", "fee_clearance_overrides_office"),
    ("fee_clearance_overrides", "fee_clearance_overrides_finance"),
    ("school_holidays", "school_holidays_office_insert"),
    ("school_holidays", "school_holidays_office_delete"),
    ("bank_accounts", "bank_accounts_finance"),
    ("bank_accounts", "bank_accounts_office_insert"),
    ("bank_statement_imports", "bank_statement_imports_finance"),
    ("bank_statement_imports", "bank_statement_imports_as_self"),
    ("bank_credit_rows", "bank_credit_rows_finance"),
    ("payment_links", "payment_links_made_as_self"),
    ("payment_link_lines", "payment_link_lines_finance"),
    ("receipts", "receipts_issue_as_self"),
    ("support_ticket_messages", "support_ticket_messages_visible_ticket"),
    ("support_ticket_attachments", "support_ticket_attachments_visible_ticket"),
    ("audit_log", "audit_ticket_rows_own_or_office"),
    # --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
    # p5-8a begin
    # p5-8a end
    # p5-8b begin
    # p5-8b end
    # p5-8c begin
    # p5-8c end
    # p5-8d begin
    # p5-8d end
    # p5-8e begin
    # p5-8e end
    # p5-8f begin
    # p5-8f end
    # p5-8g begin
    # p5-8g end
    # p5-8h begin
    # p5-8h end
    # p5-8i begin
    # p5-8i end
    # p5-8j begin
    # p5-8j end
}

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
        # Every create/drop in this file, applied in the order it appears
        # (C112): a file that drops a policy and recreates it (for example
        # as RESTRICTIVE) must end with the policy present. Applying all
        # creates before all drops recorded such policies as dropped.
        events: list[tuple[int, str, tuple[str, str], tuple[bool, str] | None]] = []

        # Templated (loop) policies: every do-block that both unnests an
        # array of table names AND contains a %I_SUFFIX create-policy
        # template applies that template to every table in the array.
        for block_match in DO_BLOCK_RE.finditer(text):
            block = block_match.group(0)
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
                    # every templated policy in this repo is permissive
                    events.append((block_match.start(), "create", (t, f"{t}_{suffix}"), (True, cmd)))

        # Static (non-templated) create policy statements.
        for m in CREATE_POLICY_RE.finditer(text):
            name, table = m.group("name"), m.group("table")
            if "%" in name:
                continue  # templated form (%I_...), already handled above
            # Only this statement: a short policy must not be read with the next statement's FOR clause (C171).
            tail = text[m.end() : m.end() + 200].split(";")[0]
            is_permissive = "restrictive" not in tail[:40].lower()
            cmd_match = FOR_CMD_RE.search(tail)
            cmd = cmd_match.group(1).upper() if cmd_match else "ALL"
            events.append((m.start(), "create", (table, name), (is_permissive, cmd)))

        # Dropped policies stop existing, whichever form created them.
        for m in DROP_POLICY_RE.finditer(text):
            events.append((m.start(), "drop", (m.group("table"), m.group("name")), None))

        for _pos, kind, key, value in sorted(events, key=lambda e: e[0]):
            if kind == "create":
                policies[key] = value  # type: ignore[assignment]
            else:
                policies.pop(key, None)

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


SQL_COMMENT_RE = re.compile(r"--[^\n]*")
CREATE_TABLE_RE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?\"?(?P<table>\w+)\"?\s*\(", re.IGNORECASE)
DROP_TABLE_RE = re.compile(r"drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?\"?(?P<table>\w+)\"?", re.IGNORECASE)
RLS_SWITCH_RE = re.compile(
    r"alter\s+table\s+(?:only\s+)?(?:public\.)?\"?(?P<table>\w+)\"?\s+(?P<kind>enable|force|disable|no\s+force)\s+row\s+level\s+security",
    re.IGNORECASE,
)
TEMPLATED_RLS_RE = re.compile(r"alter\s+table\s+%I\s+(?P<kind>enable|force)\s+row\s+level\s+security", re.IGNORECASE)


def find_tables_without_rls(migrations_dir: Path) -> list[tuple[str, str]]:
    """A fourth, independent check (Decision Log C127): every table a
    migration creates must have row level security both ENABLED and FORCED
    (forced, so the table's owner is subject to it too) by the end of the
    replay. Without it the policies on the table do nothing, and the checks
    above would still pass. Returns [(table, what is missing)].

    Reads plain `alter table <t> enable|force row level security` and the
    templated do-block form the first migrations use (`execute
    format('alter table %I enable ...', t)` over `unnest(array[...])`).
    A later `disable` / `no force` switches it back off. Tables in
    TABLES_WITHOUT_RLS are exempt by design; a dropped table is ignored."""
    created: dict[str, None] = {}
    state: dict[str, set[str]] = {}
    for path in sorted(migrations_dir.glob("*.sql")):
        text = SQL_COMMENT_RE.sub("", path.read_text())
        events: list[tuple[int, str, str]] = []
        for m in CREATE_TABLE_RE.finditer(text):
            events.append((m.start(), "create", m.group("table").lower()))
        for m in DROP_TABLE_RE.finditer(text):
            events.append((m.start(), "drop", m.group("table").lower()))
        for m in RLS_SWITCH_RE.finditer(text):
            events.append((m.start(), re.sub(r"\s+", " ", m.group("kind").lower()), m.group("table").lower()))
        for block in DO_BLOCK_RE.finditer(text):
            kinds = {m.group("kind").lower() for m in TEMPLATED_RLS_RE.finditer(block.group(0))}
            tables = [t.lower() for arr in UNNEST_ARRAY_RE.finditer(block.group(0)) for t in QUOTED_ITEM_RE.findall(arr.group("items"))]
            for kind in kinds:
                for t in tables:
                    events.append((block.start(), kind, t))
        for _, kind, table in sorted(events, key=lambda e: e[0]):
            if kind == "create":
                created[table] = None
                state.setdefault(table, set())
            elif kind == "drop":
                created.pop(table, None)
                state.pop(table, None)
            elif kind in ("enable", "force"):
                state.setdefault(table, set()).add(kind)
            elif kind == "disable":
                state.setdefault(table, set()).discard("enable")
            elif kind == "no force":
                state.setdefault(table, set()).discard("force")
    missing = []
    for table in created:
        if table in TABLES_WITHOUT_RLS:
            continue
        lacks = [k.upper() for k in ("enable", "force") if k not in state.get(table, set())]
        if lacks:
            missing.append((table, " and ".join(lacks)))
    return sorted(missing)


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

    missing_restrictive = sorted(k for k in REQUIRED_RESTRICTIVE if policies.get(k, (True, ""))[0])
    if missing_restrictive:
        ok = False
        print("FAIL: required RESTRICTIVE polic(y/ies) missing or not restrictive -- a role-narrowing rule is gone:")
        for table, name in missing_restrictive:
            state = "missing" if (table, name) not in policies else "PERMISSIVE"
            print(f"  {table}.{name} ({state})")
    else:
        print(f"PASS: all {len(REQUIRED_RESTRICTIVE)} required RESTRICTIVE policies exist and are restrictive.")

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

    without_rls = find_tables_without_rls(MIGRATIONS_DIR)
    if without_rls:
        ok = False
        print("FAIL: a table created in a migration does not have row level security both ENABLED and FORCED:")
        for table, lacks in without_rls:
            print(f"  {table}: missing {lacks} row level security")
        print(
            "\nAdd to the migration that creates it:\n"
            "  alter table <table> enable row level security;\n"
            "  alter table <table> force row level security;"
        )
    else:
        print("PASS: every table created in a migration has row level security enabled and forced.")

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

        # Drop then recreate in one file (C112): the policy exists at the
        # end, with the recreated shape; a later drop alone removes it.
        order_dir = tmp / "order"
        order_dir.mkdir()
        (order_dir / "0001_a.sql").write_text(
            "create policy teacher_scope_students on students for select using (true);\n"
        )
        (order_dir / "0002_b.sql").write_text(
            "drop policy if exists teacher_scope_students on students;\n"
            "create policy teacher_scope_students on students as restrictive for select using (true);\n"
            "create policy gone on students for select using (true);\n"
            "drop policy gone on students;\n"
        )
        order = parse_migrations(order_dir)
        if order.get(("students", "teacher_scope_students")) != (False, "SELECT") or ("students", "gone") in order:
            print("SELF-TEST FAILED: create/drop order within a file was not respected")
            print(order)
            return 1

        # Every created table needs ENABLE and FORCE (C127).
        rls_dir = tmp / "rls"
        rls_dir.mkdir()
        (rls_dir / "0001_a.sql").write_text(
            "create table good (id int);\n"
            "alter table good enable row level security;\n"
            "alter table good force row level security;\n"
            "create table if not exists public.only_enabled (id int);\n"
            "alter table only_enabled enable row level security;\n"
            "create table bare (id int);\n"
            "-- alter table bare enable row level security; (a comment does not count)\n"
            "create table sessions (id int);\n"
            "create table templated_a (id int);\ncreate table templated_b (id int);\n"
            "do $$ declare t text; begin\n"
            "  for t in select unnest(array['templated_a', 'templated_b']) loop\n"
            "    execute format('alter table %I enable row level security', t);\n"
            "    execute format('alter table %I force row level security', t);\n"
            "  end loop; end $$;\n"
            "create table gone (id int);\n"
            "create table switched_off (id int);\n"
            "alter table switched_off enable row level security;\n"
            "alter table switched_off force row level security;\n"
        )
        (rls_dir / "0002_b.sql").write_text(
            "drop table gone;\n"
            "alter table switched_off disable row level security;\n"
            "create table later_fixed (id int);\n"
        )
        (rls_dir / "0003_c.sql").write_text(
            "alter table later_fixed enable row level security;\nalter table later_fixed force row level security;\n"
        )
        got = find_tables_without_rls(rls_dir)
        want = [("bare", "ENABLE and FORCE"), ("only_enabled", "FORCE"), ("switched_off", "ENABLE")]
        if got != want:
            print("SELF-TEST FAILED: tables without ENABLE/FORCE row level security were not reported exactly")
            print(f"  got  {got}\n  want {want}")
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main())
