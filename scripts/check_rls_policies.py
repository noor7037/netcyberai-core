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
# trusted_devices (F1-1, C257) is kept exactly like sessions: "Trust this
# browser" rows, reachable only through app_backend's own grant.
TABLES_WITHOUT_RLS = {"sessions", "trusted_devices"}

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
    "compliance_config", "pulse_messages", "pulse_response_log",
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
        # C201: tenant isolation only; narrowed by the RESTRICTIVE policies required below.
        ("staff_leave", "staff_leave_tenant_isolation"),
        # p5-8b end
        # p5-8c begin
        # C202: tenant isolation only; narrowed by the RESTRICTIVE policies required below.
        ("substitutions", "substitutions_tenant_isolation"),
        # p5-8c end
        # p5-8d begin
        # p5-8d end
        # p5-8e begin
        # C204: plans is the platform's alone (each policy is "to nca_super"; the app role has no grant).
        ("plans", "plans_platform_read"),
        ("plans", "plans_platform_insert"),
        ("plans", "plans_platform_update"),
        # C204: tenant isolation only. The app role holds SELECT on school_subscriptions and nothing on subscription_payments;
        # both are narrowed by the RESTRICTIVE policies required below.
        ("school_subscriptions", "school_subscriptions_tenant_isolation"),
        ("subscription_payments", "subscription_payments_tenant_isolation"),
        # p5-8e end
        # p5-8f begin
        # p5-8f end
        # p5-8g begin
        # p5-8g end
        # p5-8h begin
        # p5-8h end
        # p5-8i begin
        # C208: tenant isolation only; narrowed by the RESTRICTIVE policies required below.
        ("school_health_runs", "school_health_runs_tenant_isolation"),
        # p5-8i end
        # p5-8j begin
        # C209: tenant isolation only; narrowed by the RESTRICTIVE policies required below. early_warning_flags is
        # at_risk_flags under its new name: the migration drops the old policy and makes this one.
        ("early_warning_flags", "early_warning_flags_tenant_isolation"),
        ("early_warning_actions", "early_warning_actions_tenant_isolation"),
        # p5-8j end
        # c210-rls begin
        # c210-rls end
        # c210-leave begin
        # c210-leave end
        # c210-jobs begin
        # c210-jobs end
        # c210-ui begin
        # c210-ui end
        # p6-9a begin
        ("boards", "boards_read"),  # C213: every school role reads; only the platform role adds
        ("board_presets", "board_presets_read"),
        ("grading_schemes", "grading_schemes_tenant_isolation"),  # C213: narrowed by the RESTRICTIVE policies below
        # p6-9a end
        # p6-9b begin
        ("exam_papers", "exam_papers_tenant_isolation"),  # C214: narrowed by the RESTRICTIVE policies below
        # p6-9b end
        # p6-9c begin
        ("exam_publications", "exam_publications_tenant_isolation"),  # C215: narrowed by the RESTRICTIVE policies below
        ("report_remarks", "report_remarks_tenant_isolation"),
        # p6-9c end
        # p6-9d begin
        # p6-9d end
        # p6-9e begin
        # p6-9e end
        # p6-9f begin
        # p6-9f end
        # c212-pricing begin
        # C212: a school's own terms. Tenant isolation, and a restrictive policy below lets no role it applies to read them.
        ("school_billing_terms", "school_billing_terms_tenant_isolation"),
        # c212-pricing end
        # p7-10a begin
        ("admission_enquiries", "admission_enquiries_tenant_isolation"),  # C221: narrowed by the RESTRICTIVE policies below
        ("admission_events", "admission_events_tenant_isolation"),
        # p7-10a end
        # p7-10b begin
        # C222: narrowed by the RESTRICTIVE policies below (the office; a class teacher reads their own class).
        ("student_id_as_printed", "student_id_as_printed_tenant_isolation"),
        ("data_check_requests", "data_check_requests_tenant_isolation"),
        # p7-10b end
        # p7-10c begin
        # C223: tenant isolation only; narrowed by the RESTRICTIVE policies required below.
        ("rte_rates", "rte_rates_tenant_isolation"),
        ("rte_claims", "rte_claims_tenant_isolation"),
        ("rte_evidence", "rte_evidence_tenant_isolation"),
        # p7-10c end
        # p7-10d begin
        # C227: tenant isolation only; narrowed by the RESTRICTIVE policies required below (the office only).
        ("staff_qualifications", "staff_qualifications_tenant_isolation"),
        ("disclosure_entries", "disclosure_entries_tenant_isolation"),
        ("sqaaf_evidence", "sqaaf_evidence_tenant_isolation"),
        ("sqaaf_standards", "sqaaf_standards_read"),  # C227: CBSE's standards, read by the office of any school; nobody writes
        # p7-10d end
        # p7-10e begin
        # C228: tenant isolation only; narrowed by the RESTRICTIVE policies required below (the office only).
        ("certificates_issued", "certificates_issued_tenant_isolation"),
        ("certificate_copies", "certificate_copies_tenant_isolation"),
        ("certificate_marks", "certificate_marks_tenant_isolation"),
        # p7-10e end
        # p7-10f begin
        # C229: tenant isolation only; narrowed by the RESTRICTIVE policies required below.
        ("timetable_loads", "timetable_loads_tenant_isolation"),
        ("timetable_unavailable", "timetable_unavailable_tenant_isolation"),
        ("timetable_proposals", "timetable_proposals_tenant_isolation"),
        ("timetable_versions", "timetable_versions_tenant_isolation"),
        # p7-10f end
        # p7-10g begin
        # C231: a teacher's proposal of a subject and class. Tenant isolation, narrowed by the RESTRICTIVE policies below.
        ("teacher_subject_requests", "teacher_subject_requests_tenant_isolation"),
        # p7-10g end
        # c224 begin
        ("attendance_change_reasons", "attendance_change_reasons_tenant_isolation"),  # review of C224: narrowed by the RESTRICTIVE policies below
        # c224 end
        # c225 begin
        ("rte_claim_receipts", "rte_claim_receipts_tenant_isolation"),
        # c225 end
        # c226 begin
        # C226: the free month. Tenant isolation, narrowed to the principal and the school admin by the RESTRICTIVE
        # policy required below; the app role holds SELECT only, so a school never writes it.
        ("school_trials", "school_trials_tenant_isolation"),
        # c226 end
        # c219 begin
        # C219: co-scholastic grades. Tenant isolation, narrowed by the RESTRICTIVE policies required below.
        ("co_scholastic_grades", "co_scholastic_grades_tenant_isolation"),
        # c219 end
        # c232a begin
        # C232 part A: the school's certificate numbering, the school admins the principal names to sign, and each
        # signer's own signature. Tenant isolation only; narrowed to the office by the RESTRICTIVE policies below.
        ("certificate_numbering", "certificate_numbering_tenant_isolation"),
        ("certificate_signatories", "certificate_signatories_tenant_isolation"),
        ("certificate_signatures", "certificate_signatures_tenant_isolation"),
        # c232a end
        # c235d begin
        # C235-D: papers on a staff or student record, and their versions. Tenant isolation only; narrowed by the
        # RESTRICTIVE policies required below.
        ("record_documents", "record_documents_tenant_isolation"),
        ("record_document_versions", "record_document_versions_tenant_isolation"),
        # c235d end
        # c238 begin
        # C238: a member of staff's profile. Tenant isolation only; narrowed by the RESTRICTIVE policies required below.
        ("staff_profiles", "staff_profiles_tenant_isolation"),
        # c238 end
        # C230-AA: School Link's connect codes, school-owned. Tenant isolation only; narrowed to the office and refused to a
        # parent by the RESTRICTIVE policies required below.
        ("family_connect_codes", "family_connect_codes_tenant_isolation"),
        # m1 begin
        # M1-1 (C247): the Family app's role (family_app) on its own schemas. Family tables: own account only, granted by
        # a permissive policy and held by a restrictive one of the same condition (REQUIRED_RESTRICTIVE below). Content:
        # families read boards and what is published to everyone, and add AI-made responses only. Control: families read
        # the family switches and limits (never a credential), and add to AI counts only through control.count_ai_usage().
        ("family.accounts", "accounts_own"),
        ("family.consents", "consents_own"),
        ("family.children", "children_own"),
        ("family.attempts", "attempts_own"),
        ("family.topic_progress", "topic_progress_own"),
        ("family.ai_daily", "ai_daily_own"),
        ("content.boards", "boards_family_read"),
        ("content.syllabus_versions", "versions_family_read"),
        ("content.units", "units_family_read"),
        ("content.chapters", "chapters_family_read"),
        ("content.topics", "topics_family_read"),
        ("content.responses", "responses_family_read"),
        ("content.responses", "responses_family_add"),
        ("control.settings", "settings_family_read"),
        ("control.app_flags", "app_flags_family_read"),
        ("control.app_banners", "app_banners_family_read"),
        ("control.app_versions", "app_versions_family_read"),
        ("control.preview_accounts", "preview_family_read"),
        ("control.ai_providers", "ai_providers_family_read"),
        ("control.ai_profiles", "ai_profiles_family_read"),
        # m1 end
        # wb1 begin
        # C274: the English course. Family tables own account only (with the restrictive twins below); families read
        # only course versions published to everyone, and their units, lessons and assessments.
        ("family.english_enrolments", "english_enrolments_own"),
        ("family.english_lessons_done", "english_lessons_done_own"),
        ("family.english_reviews", "english_reviews_own"),
        ("family.english_assessment_results", "english_results_own"),
        ("family.english_days", "english_days_own"),
        ("content.english_versions", "english_versions_family_read"),
        ("content.english_units", "english_units_family_read"),
        ("content.english_lessons", "english_lessons_family_read"),
        ("content.english_assessments", "english_assessments_family_read"),
        # wb1 end
        # m2 begin
        # C275: M2's family tables own account only (with the restrictive twins below); families read the video picks a
        # reviewer has not rejected, and write them only through content.save_video_picks.
        ("family.revisits", "revisits_own"),
        ("family.plan_days", "plan_days_own"),
        ("family.reward_jars", "reward_jars_own"),
        ("family.day_counts", "day_counts_own"),
        # C230-AA (School Link): the family's own links and code tries, own account only (restrictive twins below).
        ("family.school_links", "school_links_own"),
        ("family.child_links", "child_links_own"),
        ("family.connect_attempts", "connect_attempts_own"),
        ("content.video_picks", "video_picks_family_read"),
        # m2-10: school staff read the two school AI profiles and the provider list (C284).
        ("control.ai_profiles", "ai_profiles_staff_read"),
        ("control.ai_providers", "ai_providers_staff_read"),
        # m2 end
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
    # C200: nobody changes, notes or closes a complaint that is about themselves.
    ("complaints", "complaints_not_by_its_subject"),
    ("complaint_events", "complaint_events_not_by_its_subject"),
    # p5-8a end
    # p5-8b begin
    # C201: leave is read by the person and the office only; asked and changed in one's own name.
    ("staff_leave", "staff_leave_own_or_office"),
    ("staff_leave", "staff_leave_asked_as_self"),
    ("staff_leave", "staff_leave_in_own_name"),
    ("audit_log", "audit_leave_rows_own_or_office"),
    # p5-8b end
    # p5-8c begin
    # C202: covers are read by the three roles that arrange them, and by a teacher their own; assigned and undone in one's own name.
    ("substitutions", "substitutions_arrangers_or_own"),
    ("substitutions", "substitutions_assigned_as_self"),
    ("substitutions", "substitutions_undone_as_self"),
    ("audit_log", "audit_cover_rows_arrangers_or_actor"),
    # p5-8c end
    # p5-8d begin
    # p5-8d end
    # p5-8e begin
    # C204: a school's staff read their own subscription row; payments are nobody's but the platform role's.
    ("school_subscriptions", "school_subscriptions_staff"),
    ("subscription_payments", "subscription_payments_nobody"),
    # p5-8e end
    # p5-8f begin
    # p5-8f end
    # p5-8g begin
    # p5-8g end
    # p5-8h begin
    # p5-8h end
    # p5-8i begin
    # C208: check-ups are read and written by the principal and the school admin only, in one's own name.
    ("school_health_runs", "school_health_runs_office"),
    ("school_health_runs", "school_health_runs_recorded_as_self"),
    ("school_health_runs", "school_health_runs_rewritten_as_self"),
    # p5-8i end
    # p5-8j begin
    # C209: flags are read by the three roles that run the check and, for their own classes, by a teacher; opened and
    # changed by the three roles only. An action follows its flag and is added in one's own name. The audit rows
    # of Early Warning follow the same three roles, or the person who acted.
    ("early_warning_flags", "early_warning_flags_readers"),
    ("early_warning_flags", "early_warning_flags_opened_as_self"),
    ("early_warning_flags", "early_warning_flags_checked_by_office"),
    ("early_warning_actions", "early_warning_actions_with_flag"),
    ("early_warning_actions", "early_warning_actions_as_self"),
    ("audit_log", "audit_early_warning_rows_office_or_actor"),
    # p5-8j end
    # c210-rls begin
    # C210: the four tables the dashboard's registry alone held by role now carry role policies of their own: each
    # role reads and writes them exactly as the app does (the access map is in the migration's header).
    ("attendance", "attendance_role_read"),
    ("attendance", "attendance_role_insert"),
    ("attendance", "attendance_role_update"),
    ("attendance", "attendance_not_deleted"),
    ("pulse_messages", "pulse_messages_role_read"),
    ("pulse_messages", "pulse_messages_role_insert"),
    ("pulse_messages", "pulse_messages_role_update"),
    ("pulse_messages", "pulse_messages_role_delete"),
    ("pulse_response_log", "pulse_response_log_role_read"),
    ("pulse_response_log", "pulse_response_log_not_inserted"),
    ("pulse_response_log", "pulse_response_log_not_updated"),
    ("pulse_response_log", "pulse_response_log_not_deleted"),
    ("communication_log", "communication_log_role_read"),
    ("communication_log", "communication_log_role_insert"),
    ("communication_log", "communication_log_not_updated"),
    # c210-rls end
    # c210-leave begin
    # c210-leave end
    # c210-jobs begin
    # c210-jobs end
    # c210-ui begin
    # C210: adding, changing and removing a class is the principal's and the school admin's; reading is unchanged.
    ("classes", "classes_added_by_office"),
    ("classes", "classes_changed_by_office"),
    ("classes", "classes_removed_by_office"),
    # c210-ui end
    # p6-9a begin
    ("grading_schemes", "grading_schemes_staff"),
    ("grading_schemes", "grading_schemes_saved_by_office"),
    # p6-9a end
    # p6-9b begin
    # C214: exams, papers and marks are read by the office and the academic coordinator, and by a teacher for their
    # own classes; made by the three roles in their own name; a mark entered only by whoever may enter that paper's
    # marks (may_enter_marks). The accountant reads nothing. The audit rows of exams follow the same three roles, or
    # the person who acted.
    ("exams", "exams_readers"),
    ("exams", "exams_made_by_office"),
    ("exams", "exams_changed_by_office"),
    ("exams", "exams_removed_by_office"),
    ("exam_papers", "exam_papers_readers"),
    ("exam_papers", "exam_papers_made_by_office"),
    ("exam_papers", "exam_papers_changed_by_who_may"),
    ("exam_papers", "exam_papers_removed_by_office"),
    ("marks", "marks_readers"),
    ("marks", "marks_entered_by_who_may"),
    ("marks", "marks_changed_by_who_may"),
    ("marks", "marks_cleared_by_who_may"),
    ("marks", "parent_scope_marks"),
    ("audit_log", "audit_exam_rows_office_or_actor"),
    # p6-9b end
    # p6-9c begin
    # C215: a publication is read by the three roles that run exams and by a teacher for their own classes; made by
    # the three roles in their own name; reopened only by the principal, in their own name; never removed. A remark is
    # read the same way, and written, changed and cleared only by the class's class teacher.
    ("exam_publications", "exam_publications_readers"),
    ("exam_publications", "exam_publications_published_by_office"),
    ("exam_publications", "exam_publications_reopened_by_principal"),
    ("exam_publications", "exam_publications_never_removed"),
    ("report_remarks", "report_remarks_readers"),
    ("report_remarks", "report_remarks_written_by_class_teacher"),
    ("report_remarks", "report_remarks_changed_by_class_teacher"),
    ("report_remarks", "report_remarks_cleared_by_class_teacher"),
    # p6-9c end
    # p6-9d begin
    # p6-9d end
    # p6-9e begin
    # p6-9e end
    # p6-9f begin
    # p6-9f end
    # c212-pricing begin
    # C212: a school's terms are the platform's alone (it bypasses row level security), and so are the audit rows about them.
    ("school_billing_terms", "school_billing_terms_nobody"),
    ("audit_log", "audit_billing_terms_platform_only"),
    # c212-pricing end
    # p7-10a begin
    # C221: enquiries and their steps are the office's (principal and school admin) alone; recorded in one's own name;
    # a step is written in one's own name, and only a note by hand (the others by the trigger). Audit rows likewise.
    ("admission_enquiries", "admission_enquiries_office"),
    ("admission_enquiries", "admission_enquiries_recorded_as_self"),
    ("admission_events", "admission_events_office"),
    ("admission_events", "admission_events_as_self"),
    ("audit_log", "audit_admissions_rows_office"),
    # p7-10a end
    # p7-10b begin
    # C222: what Aadhaar prints and the correction requests are read by the office and by the class teacher of the
    # child's class; typed, asked, answered, corrected and closed by the office only, in their own name. The accountant
    # reads nothing.
    ("student_id_as_printed", "student_id_as_printed_readers"),
    ("student_id_as_printed", "student_id_as_printed_typed_by_office"),
    ("student_id_as_printed", "student_id_as_printed_changed_by_office"),
    ("data_check_requests", "data_check_requests_readers"),
    ("data_check_requests", "data_check_requests_asked_by_office"),
    ("data_check_requests", "data_check_requests_decided_by_office"),
    # p7-10b end
    # p7-10c begin
    # C223: the RTE claim desk is read and written by the principal, the school admin and the accountant only, in
    # their own name; its audit rows by those three roles, or the person who acted.
    ("rte_rates", "rte_rates_finance"),
    ("rte_rates", "rte_rates_typed_as_self"),
    ("rte_claims", "rte_claims_finance"),
    ("rte_claims", "rte_claims_raised_as_self"),
    ("rte_claims", "rte_claims_settled_as_self"),
    ("rte_evidence", "rte_evidence_finance"),
    ("rte_evidence", "rte_evidence_added_as_self"),
    ("audit_log", "audit_rte_rows_finance_or_actor"),
    # p7-10c end
    # p7-10d begin
    # C227: the compliance desk is read and written by the principal and the school admin only, in their own name; its
    # audit rows by those two roles, or the person who acted.
    ("staff_qualifications", "staff_qualifications_saved_as_self"),
    ("staff_qualifications", "staff_qualifications_changed_as_self"),
    ("disclosure_entries", "disclosure_entries_office"),
    ("disclosure_entries", "disclosure_entries_changed_as_self"),
    ("sqaaf_evidence", "sqaaf_evidence_office"),
    ("sqaaf_evidence", "sqaaf_evidence_added_as_self"),
    ("audit_log", "audit_compliance_desk_rows_office_or_actor"),
    # p7-10d end
    # c232b begin
    # C232 part B: staff_qualifications_office is split by command: the office reads every row and any staff member
    # their own; adding, changing and erasing stay the office's. The Form 6 figures (compliance_config) are written by
    # the principal and the school admin, and read by them and the accountant.
    ("staff_qualifications", "staff_qualifications_readers"),
    ("staff_qualifications", "staff_qualifications_added_by_office"),
    ("staff_qualifications", "staff_qualifications_changed_by_office"),
    ("staff_qualifications", "staff_qualifications_erased_by_office"),
    ("compliance_config", "compliance_config_readers"),
    ("compliance_config", "compliance_config_set_by_office"),
    ("compliance_config", "compliance_config_changed_by_office"),
    ("compliance_config", "compliance_config_removed_by_office"),
    # c232b end
    # p7-10e begin
    # C228: the register, the family copies and the seal and signature are the office's (principal and school admin),
    # in their own name; only the principal withdraws a certificate or keeps the seal and the signature. The register's
    # audit rows are read by the office only.
    ("certificates_issued", "certificates_issued_office"),
    ("certificates_issued", "certificates_issued_as_self"),
    ("certificates_issued", "certificates_issued_withdrawn_by_principal"),
    ("certificate_copies", "certificate_copies_office"),
    ("certificate_copies", "certificate_copies_as_self"),
    ("certificate_marks", "certificate_marks_office"),
    ("certificate_marks", "certificate_marks_kept_by_principal"),
    ("certificate_marks", "certificate_marks_replaced_by_principal"),
    ("certificate_marks", "certificate_marks_removed_by_principal"),
    ("audit_log", "audit_certificate_rows_office"),
    # p7-10e end
    # p7-10f begin
    # C229: the timetable generator's constraints, drafts and versions are read and written by the office (principal,
    # school admin, academic coordinator) only, in their own name; its audit rows by the office or the person who acted.
    ("timetable_loads", "timetable_loads_office"),
    ("timetable_loads", "timetable_loads_as_self"),
    ("timetable_loads", "timetable_loads_updated_as_self"),
    ("timetable_unavailable", "timetable_unavailable_office"),
    ("timetable_unavailable", "timetable_unavailable_as_self"),
    ("timetable_proposals", "timetable_proposals_office"),
    ("timetable_proposals", "timetable_proposals_as_self"),
    ("timetable_proposals", "timetable_proposals_decided_as_self"),
    ("timetable_versions", "timetable_versions_office"),
    ("timetable_versions", "timetable_versions_as_self"),
    ("audit_log", "audit_timetable_plan_rows_office_or_actor"),
    # p7-10f end
    # p7-10g begin
    # C231: who teaches what (teacher_subjects, and the teachers row behind it) is written by the principal or the school
    # admin only, and a teachers row only for a teacher; a teacher proposes for themselves, read by the office and
    # themselves, decided by the office and never by the teacher who asked.
    ("teachers", "teachers_office_insert"),
    ("teachers", "teachers_office_update"),
    ("teachers", "teachers_office_delete"),
    ("teacher_subjects", "teacher_subjects_office_insert"),
    ("teacher_subjects", "teacher_subjects_office_update"),
    ("teacher_subjects", "teacher_subjects_office_delete"),
    ("teacher_subject_requests", "teacher_subject_requests_readers"),
    ("teacher_subject_requests", "teacher_subject_requests_made_by_self"),
    ("teacher_subject_requests", "teacher_subject_requests_office_decides"),
    ("audit_log", "audit_teacher_subject_request_rows_office_or_actor"),
    # p7-10g end
    # c224 begin
    # review of C224: the words for an attendance change: the office and the writer read; written as self; the erasure deletes.
    ("attendance_change_reasons", "attendance_change_reasons_readers"),
    ("attendance_change_reasons", "attendance_change_reasons_written_as_self"),
    ("attendance_change_reasons", "attendance_change_reasons_erased_by_office"),
    # c224 end
    # c225 begin
    ("rte_claim_receipts", "rte_claim_receipts_finance"),
    ("rte_claim_receipts", "rte_claim_receipts_recorded_as_self"),
    # c225 end
    # c226 begin
    # C226: a school's free month, and its audit rows, are read by its principal and school admin only.
    ("school_trials", "school_trials_office"),
    ("audit_log", "audit_trial_rows_office"),
    # c226 end
    # c219 begin
    # C219: only the principal and the school admin update their own school's row (and only its profile columns, by
    # column grants and a trigger). A co-scholastic grade is read by the three roles that run exams and a teacher of
    # the class; written, changed and cleared by those three or the class teacher, in their own name.
    ("schools", "schools_profile_by_office"),
    ("co_scholastic_grades", "co_scholastic_grades_readers"),
    ("co_scholastic_grades", "co_scholastic_grades_written"),
    ("co_scholastic_grades", "co_scholastic_grades_changed"),
    ("co_scholastic_grades", "co_scholastic_grades_cleared"),
    # c219 end
    # c232a begin
    # C232 part A: the numbering is set by the office in its own name; only the principal names or un-names a
    # signatory; a signature is kept, replaced and removed by its own person (the principal's un-naming takes an
    # admin's with it).
    ("certificate_numbering", "certificate_numbering_office"),
    ("certificate_numbering", "certificate_numbering_set_as_self"),
    ("certificate_numbering", "certificate_numbering_changed_as_self"),
    ("certificate_signatories", "certificate_signatories_office"),
    ("certificate_signatories", "certificate_signatories_named_by_principal"),
    ("certificate_signatories", "certificate_signatories_unnamed_by_principal"),
    ("certificate_signatures", "certificate_signatures_office"),
    ("certificate_signatures", "certificate_signatures_kept_as_self"),
    ("certificate_signatures", "certificate_signatures_replaced_as_self"),
    ("certificate_signatures", "certificate_signatures_removed"),
    # c232a end
    # c235d begin
    # C235-D: a paper is read by the office, its own staff member, and (a student's) by the coordinator, the
    # accountant and a teacher of the child's class; added and removed by the office in its own name; nothing for a
    # parent; its audit rows and the list exports' by the office or the person who acted.
    ("record_documents", "record_documents_readers"),
    ("record_documents", "record_documents_added_by_office"),
    ("record_documents", "record_documents_removed_by_office"),
    ("record_documents", "record_documents_no_parent"),
    ("record_document_versions", "record_document_versions_readers"),
    ("record_document_versions", "record_document_versions_added_by_office"),
    ("record_document_versions", "record_document_versions_removed_by_office"),
    ("record_document_versions", "record_document_versions_no_parent"),
    ("audit_log", "audit_record_document_rows_office_or_actor"),
    # c235d end
    # c244 begin
    # C244: subjects and academic sessions are written by the principal or the school admin only; a session is never
    # deleted through the app; a subject is retired (retired_at), never deleted.
    ("subjects", "subjects_office_insert"),
    ("subjects", "subjects_office_update"),
    ("subjects", "subjects_office_delete"),
    ("academic_sessions", "academic_sessions_office_insert"),
    ("academic_sessions", "academic_sessions_office_update"),
    ("academic_sessions", "academic_sessions_no_delete"),
    # c244 end
    # c238 begin
    # C238: a staff profile is read by the office and by the person themself; added and changed by the office in its
    # own name; nothing for a parent; its audit rows by the office or the person who acted.
    ("staff_profiles", "staff_profiles_readers"),
    ("staff_profiles", "staff_profiles_added_by_office"),
    ("staff_profiles", "staff_profiles_changed_by_office"),
    ("staff_profiles", "staff_profiles_no_parent"),
    ("audit_log", "audit_staff_profile_rows_office_or_actor"),
    # c238 end
    # m1 begin
    # M1-1 (C247): own account only on every family table, and families never write the catalog.
    ("family.accounts", "accounts_own_only"),
    ("family.consents", "consents_own_only"),
    ("family.children", "children_own_only"),
    ("family.attempts", "attempts_own_only"),
    ("family.topic_progress", "topic_progress_own_only"),
    ("family.ai_daily", "ai_daily_own_only"),
    ("content.syllabus_versions", "versions_family_only"),
    ("content.units", "units_family_only"),
    ("content.chapters", "chapters_family_only"),
    ("content.topics", "topics_family_only"),
    ("content.responses", "responses_family_only"),
    ("control.preview_accounts", "preview_family_only"),
    # m1 end
    # wb1 begin
    # C274: own account only on every English course table, and families never write the course.
    ("family.english_enrolments", "english_enrolments_own_only"),
    ("family.english_lessons_done", "english_lessons_done_own_only"),
    ("family.english_reviews", "english_reviews_own_only"),
    ("family.english_assessment_results", "english_results_own_only"),
    ("family.english_days", "english_days_own_only"),
    ("content.english_versions", "english_versions_family_only"),
    ("content.english_units", "english_units_family_only"),
    ("content.english_lessons", "english_lessons_family_only"),
    ("content.english_assessments", "english_assessments_family_only"),
    # wb1 end
    # m2 begin
    # C275: own account only on every M2 family table, and families never write the video picks directly.
    ("family.revisits", "revisits_own_only"),
    ("family.plan_days", "plan_days_own_only"),
    ("family.reward_jars", "reward_jars_own_only"),
    ("family.day_counts", "day_counts_own_only"),
    # C230-AA (School Link): own account only; the codes for the office only and never a parent; a linked guardian reads
    # the school's syllabus and subject names for their own children's classes, read only.
    ("family.school_links", "school_links_own_only"),
    ("family.child_links", "child_links_own_only"),
    ("family.connect_attempts", "connect_attempts_own_only"),
    ("family_connect_codes", "family_connect_codes_office"),
    ("family_connect_codes", "family_connect_codes_no_parent"),
    ("syllabus_units", "syllabus_units_parent_scope"),
    ("syllabus_units", "syllabus_units_parent_no_insert"),
    ("subjects", "subjects_parent_scope"),
    ("subjects", "subjects_parent_no_insert"),
    ("content.video_picks", "video_picks_family_only"),
    # m2-10: staff never write the AI settings.
    ("control.ai_profiles", "ai_profiles_staff_only"),
    ("control.ai_providers", "ai_providers_staff_only"),
    # m2 end
}

# A table outside public (the family, content and control schemas, C247) is named "<schema>.<table>"; a public table by
# its bare name, as before.
CREATE_POLICY_RE = re.compile(r"create\s+policy\s+\"?(?P<name>\w+)\"?\s+on\s+(?:(?P<schema>\w+)\.)?\"?(?P<table>\w+)\"?", re.IGNORECASE)


def qualified(m: re.Match) -> str:
    schema = (m.groupdict().get("schema") or "").lower()
    table = m.group("table")
    return f"{schema}.{table.lower()}" if schema and schema != "public" else table
TEMPLATED_RE = re.compile(r"create\s+policy\s+%I_(?P<suffix>\w+)\s+on\s+%I", re.IGNORECASE)
UNNEST_ARRAY_RE = re.compile(r"unnest\(array\[(?P<items>.*?)\]\)", re.IGNORECASE | re.DOTALL)
QUOTED_ITEM_RE = re.compile(r"'([^']+)'")
DO_BLOCK_RE = re.compile(r"do\s*\$\$.*?end\s*\$\$\s*;", re.IGNORECASE | re.DOTALL)
DROP_POLICY_RE = re.compile(
    r"drop\s+policy\s+(?:if\s+exists\s+)?\"?(?P<name>\w+)\"?\s+on\s+(?:(?P<schema>\w+)\.)?\"?(?P<table>\w+)\"?", re.IGNORECASE
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
            name, table = m.group("name"), qualified(m)
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
            events.append((m.start(), "drop", (qualified(m), m.group("name")), None))

        for _pos, kind, key, value in sorted(events, key=lambda e: e[0]):
            if kind == "create":
                policies[key] = value  # type: ignore[assignment]
            else:
                policies.pop(key, None)

    return policies


# Control's own tables and the content library (C247): written only by Control through the platform role (nca_super,
# BYPASSRLS), never by app_user, so a missing permissive policy cannot turn one of their writes into a silent no-op.
# Families' only writes there (AI-made responses, AI counts) are an insert policy and a definer function.
PLATFORM_WRITTEN_SCHEMAS = ("control.", "content.")

UPDATE_TABLE_RE = re.compile(r"\bupdate\s+(?:(?P<schema>\w+)\.)?\"?(?P<table>\w+)\"?\s+(?:as\s+\w+\s+|\w+\s+)?set\b", re.IGNORECASE)
DELETE_TABLE_RE = re.compile(r"\bdelete\s+from\s+(?:(?P<schema>\w+)\.)?\"?(?P<table>\w+)\"?", re.IGNORECASE)
UPSERT_TABLE_RE = re.compile(
    r"\binsert\s+into\s+(?:(?P<schema>\w+)\.)?\"?(?P<table>\w+)\"?.*?\bon\s+conflict\b.*?\bdo\s+update\b", re.IGNORECASE | re.DOTALL
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
                mutations.add((qualified(m), "UPDATE"))
            for m in DELETE_TABLE_RE.finditer(literal):
                mutations.add((qualified(m), "DELETE"))
            for m in UPSERT_TABLE_RE.finditer(literal):
                mutations.add((qualified(m), "UPDATE"))
    return {(t, c) for t, c in mutations if t not in TABLES_WITHOUT_RLS and not t.startswith(PLATFORM_WRITTEN_SCHEMAS)}


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
CREATE_TABLE_RE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?P<schema>\w+)\.)?\"?(?P<table>\w+)\"?\s*\(", re.IGNORECASE)
DROP_TABLE_RE = re.compile(r"drop\s+table\s+(?:if\s+exists\s+)?(?:(?P<schema>\w+)\.)?\"?(?P<table>\w+)\"?", re.IGNORECASE)
RLS_SWITCH_RE = re.compile(
    r"alter\s+table\s+(?:only\s+)?(?:(?P<schema>\w+)\.)?\"?(?P<table>\w+)\"?\s+(?P<kind>enable|force|disable|no\s+force)\s+row\s+level\s+security",
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
            events.append((m.start(), "create", qualified(m).lower()))
        for m in DROP_TABLE_RE.finditer(text):
            events.append((m.start(), "drop", qualified(m).lower()))
        for m in RLS_SWITCH_RE.finditer(text):
            events.append((m.start(), re.sub(r"\s+", " ", m.group("kind").lower()), qualified(m).lower()))
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
