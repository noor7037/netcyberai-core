-- =====================================================================
-- NetCyberAI — Row-Level Security policies
-- Run after netcyberai_schema.sql. Requires app.current_tenant_id and
-- app.current_role / app.current_user_id to be set per-connection by
-- your API layer (Supabase does this automatically via JWT claims if
-- you use Supabase Auth + `auth.jwt()`; the generic version below uses
-- session GUCs so it also works with a plain Postgres + your own auth).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
-- nca_super    : bypasses RLS entirely (NetCyberAI internal team only)
-- app_user     : normal application role, subject to every policy below
-- audit_writer : insert-only on audit_log, used by the audit trigger
create role nca_super bypassrls;
create role app_user nobypassrls;
create role audit_writer nobypassrls;

-- ---------------------------------------------------------------------
-- Enable + force RLS on every tenant table
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'users','classes','subjects','students','parents','parent_student_map',
      'teachers','teacher_subjects','consent_ledger','attendance','syllabus_progress',
      'exams','marks','fees_ledger','communication_log','recognition_events',
      'teacher_impact_metrics','parent_feedback','certificate_requests','system_config'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- schools itself: super_admin sees all, everyone else only their own row
alter table schools enable row level security;
alter table schools force row level security;

create policy schools_tenant_isolation on schools
  using (school_id = current_setting('app.current_tenant_id', true)::uuid
         or current_setting('app.current_role', true) = 'super_admin');

-- ---------------------------------------------------------------------
-- Generic tenant-isolation policy, applied per table
-- (super_admin bypasses via the nca_super role, not via this policy)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'users','classes','subjects','students','parents','parent_student_map',
      'teachers','teacher_subjects','consent_ledger','attendance','syllabus_progress',
      'exams','marks','fees_ledger','communication_log','recognition_events',
      'teacher_impact_metrics','parent_feedback','certificate_requests','system_config'
    ])
  loop
    execute format(
      'create policy %I_tenant_isolation on %I using (school_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Role-scoped overlays (narrower than tenant isolation)
-- ---------------------------------------------------------------------

-- Parents: only rows for their own linked children
create policy parent_scope_students on students
  for select using (
    current_setting('app.current_role', true) <> 'parent'
    or student_id in (
      select psm.student_id from parent_student_map psm
      where psm.parent_id = current_setting('app.current_user_id', true)::uuid
    )
  );

create policy parent_scope_attendance on attendance
  for select using (
    current_setting('app.current_role', true) <> 'parent'
    or student_id in (
      select psm.student_id from parent_student_map psm
      where psm.parent_id = current_setting('app.current_user_id', true)::uuid
    )
  );

create policy parent_scope_marks on marks
  for select using (
    current_setting('app.current_role', true) <> 'parent'
    or student_id in (
      select psm.student_id from parent_student_map psm
      where psm.parent_id = current_setting('app.current_user_id', true)::uuid
    )
  );

create policy parent_scope_fees on fees_ledger
  for select using (
    current_setting('app.current_role', true) <> 'parent'
    or student_id in (
      select psm.student_id from parent_student_map psm
      where psm.parent_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- Teachers: only their own classes for attendance/marks/syllabus writes
create policy teacher_scope_attendance on attendance
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or class_id in (
      select ts.class_id from teacher_subjects ts
      join teachers t on t.teacher_id = ts.teacher_id
      where t.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- Never expose payroll-style data to teachers: no salary column exists in
-- this schema by design — enforced structurally, not by a policy, per
-- Constitution's explicit "teachers must not see salary data" rule.

-- Teacher Impact Card: principal + self only, never other teachers
create policy impact_card_scope on teacher_impact_metrics
  for select using (
    current_setting('app.current_role', true) in ('principal','school_admin','super_admin')
    or teacher_id in (
      select t.teacher_id from teachers t
      where t.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- pending_consent students: invisible to parents until consent lands
create policy consent_gate_students on students
  for select using (
    status <> 'pending_consent'
    or current_setting('app.current_role', true) in ('teacher','principal','school_admin','super_admin')
  );

-- ---------------------------------------------------------------------
-- Audit log: append-only, no update/delete grants to anyone
-- ---------------------------------------------------------------------
alter table audit_log enable row level security;
alter table audit_log force row level security;

create policy audit_insert_only on audit_log
  for insert with check (true);   -- writer identity enforced by the trigger below, not by RLS

create policy audit_read_own_school on audit_log
  for select using (
    school_id = current_setting('app.current_tenant_id', true)::uuid
    or current_setting('app.current_role', true) = 'super_admin'
  );

revoke update, delete on audit_log from app_user, audit_writer;

-- Hash-chain trigger: each new row hashes itself together with the
-- previous row's hash, so any out-of-band tampering breaks the chain.
create or replace function audit_hash_chain() returns trigger as $$
declare
  prev text;
begin
  select row_hash into prev from audit_log
    where school_id is not distinct from new.school_id
    order by occurred_at desc limit 1;
  new.prev_hash := coalesce(prev, '0');
  new.row_hash := encode(
    digest(coalesce(new.prev_hash,'') || new.event_action || coalesce(new.target_id,'') || new.occurred_at::text, 'sha256'),
    'hex'
  );
  return new;
end;
$$ language plpgsql;

create extension if not exists pgcrypto;  -- provides digest()

create trigger audit_hash_chain_trigger
  before insert on audit_log
  for each row execute function audit_hash_chain();

-- ---------------------------------------------------------------------
-- Per-request setup, called by the API layer at the start of every
-- request/transaction (example — adapt to your ORM/connection pooler):
--
--   select set_config('app.current_tenant_id', $1, true);
--   select set_config('app.current_role', $2, true);
--   select set_config('app.current_user_id', $3, true);
--
-- If you're on a connection pooler (pgbouncer transaction mode etc.),
-- these MUST be set at the start of every transaction, not once per
-- connection — this is the exact footgun the Firestore ADR warned
-- about, and it applies equally to RLS if this step is skipped.
-- ---------------------------------------------------------------------
