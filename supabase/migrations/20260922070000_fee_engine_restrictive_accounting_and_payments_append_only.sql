-- =====================================================================
-- Pre-Prompt-I hardening (standalone, no Prompt I feature work included).
-- Two live gaps found while pulling the real fee-engine schema to plan
-- Prompt I -- both inherited from migration 2
-- (20260917072616_fee_engine.sql / 20260917074052_rls_extension_new_tables.sql),
-- present since the very first fee-engine migration, not introduced now.
--
-- GAP 1 -- accounting-role overlay policies are permissive no-ops.
-- fee_heads_accounting_write/update/delete (and the same three on
-- fee_structures, fee_structure_items, fee_concessions, payments) were
-- created PERMISSIVE in 20260917074052_rls_extension_new_tables.sql.
-- Postgres ORs permissive policies together on the same command; since
-- <table>_tenant_isolation is *also* PERMISSIVE and unconditionally
-- allows every command once school_id matches app.current_tenant_id,
-- the accounting overlay's role check never actually narrows anything
-- -- any role correctly scoped to a tenant (teacher, parent session,
-- anything) can insert/update/delete fee data today. Identical bug
-- class to parent_scope_*/teacher_scope_*/consent_gate_students
-- (fixed in 20260917075715_fix_permissive_overlay_policies.sql) and
-- the reason school_whatsapp_configs/whatsapp_templates were built
-- RESTRICTIVE from the start (20260922060000). check_rls_policies.py
-- did not catch this: its own allowlist (Stage 2b) was built by
-- matching what was already live at the time, so it recorded these
-- overlays as permissive-and-expected rather than treating "permissive
-- AND role-scoped-without-tenant-scoping" as itself suspicious -- the
-- check documented the status quo, it did not evaluate it.
--
-- Fix: drop and recreate every accounting overlay policy `as
-- restrictive`, identical USING/WITH CHECK conditions, so each ANDs
-- against tenant_isolation instead of ORing around it.
--
-- GAP 2 -- payments permits physical deletion and free-form update.
-- Prompt I's own first non-negotiable ("No physical deletion of a
-- successful payment. Ever.") and second ("Corrections are reversals
-- or adjustments, never edits.") are both violated live today: anon,
-- authenticated, app_user, and nca_super all hold UPDATE/DELETE on
-- payments at the grant layer (role_grants.sql's blanket grant was
-- never narrowed for this table), and payments_accounting_delete
-- additionally let accountant/school_admin/principal/super_admin
-- delete a row outright via RLS. No reversal/adjustment mechanism
-- exists yet -- that is Prompt I's own build, and its trigger-based
-- audit is already tracked as a separate Deferred item -- and no
-- application code anywhere in this repo currently issues UPDATE or
-- DELETE against payments (confirmed by grep; the fee engine has no
-- application code yet beyond a stub page). Revoking both costs zero
-- functionality today and forecloses the exact violation class the
-- spec calls non-negotiable before any reversal/adjustment code path
-- gets a chance to bypass it. payments joins the same append-only
-- treatment already given to audit_log, consent_ledger, sessions, and
-- webhook_events.
-- =====================================================================

-- --- GAP 1: PERMISSIVE -> RESTRICTIVE on all five accounting tables ---

drop policy fee_heads_accounting_write on fee_heads;
drop policy fee_heads_accounting_update on fee_heads;
drop policy fee_heads_accounting_delete on fee_heads;
create policy fee_heads_accounting_write on fee_heads as restrictive
  for insert with check (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));
create policy fee_heads_accounting_update on fee_heads as restrictive
  for update using (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));
create policy fee_heads_accounting_delete on fee_heads as restrictive
  for delete using (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));

drop policy fee_structures_accounting_write on fee_structures;
drop policy fee_structures_accounting_update on fee_structures;
drop policy fee_structures_accounting_delete on fee_structures;
create policy fee_structures_accounting_write on fee_structures as restrictive
  for insert with check (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));
create policy fee_structures_accounting_update on fee_structures as restrictive
  for update using (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));
create policy fee_structures_accounting_delete on fee_structures as restrictive
  for delete using (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));

drop policy fee_structure_items_accounting_write on fee_structure_items;
drop policy fee_structure_items_accounting_update on fee_structure_items;
drop policy fee_structure_items_accounting_delete on fee_structure_items;
create policy fee_structure_items_accounting_write on fee_structure_items as restrictive
  for insert with check (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));
create policy fee_structure_items_accounting_update on fee_structure_items as restrictive
  for update using (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));
create policy fee_structure_items_accounting_delete on fee_structure_items as restrictive
  for delete using (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));

drop policy fee_concessions_accounting_write on fee_concessions;
drop policy fee_concessions_accounting_update on fee_concessions;
drop policy fee_concessions_accounting_delete on fee_concessions;
create policy fee_concessions_accounting_write on fee_concessions as restrictive
  for insert with check (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));
create policy fee_concessions_accounting_update on fee_concessions as restrictive
  for update using (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));
create policy fee_concessions_accounting_delete on fee_concessions as restrictive
  for delete using (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));

-- payments: write stays a restrictive accounting-role overlay, same
-- shape as the other four tables. update/delete are dropped without
-- replacement, not converted to restrictive -- GAP 2 below revokes the
-- underlying grant entirely, so a policy gating a privilege nobody
-- holds would be dead and misleading (audit_log's own pattern: no
-- update/delete policy exists there either, for the same reason).
drop policy payments_accounting_write on payments;
drop policy payments_accounting_update on payments;
drop policy payments_accounting_delete on payments;
create policy payments_accounting_write on payments as restrictive
  for insert with check (current_setting('app.current_role', true) in ('accountant','school_admin','principal','super_admin'));

-- --- GAP 2: payments joins the append-only set ---

revoke update, delete on payments from anon, authenticated, app_user, nca_super;
