-- W21-M3 (3): a history of timetable changes. One row for each period that changed: what it was, what it became, who,
-- when, and the reason if the person gave one. Append-only (no UPDATE, no DELETE for any app role), in the style of
-- timetable_versions. No foreign keys to subjects, teachers or classes: a history outlives them; the names are read
-- from the current rows when it is shown. The generator's publish writes its rows with kind 'generated' and the
-- proposal that made them. `reason` is what the office typed (kept here, never in the audit log).
create table timetable_changes (
  change_id             uuid primary key default gen_random_uuid(),
  school_id             uuid not null references schools(school_id),
  class_id              uuid not null,
  weekday               smallint not null check (weekday between 1 and 7),
  period                smallint not null check (period between 1 and 20),
  kind                  text not null check (kind in ('set', 'cleared', 'imported', 'generated')),
  before_subject_id     uuid,
  before_teacher_user_id uuid,
  after_subject_id      uuid,
  after_teacher_user_id uuid,
  changed_by            uuid not null,
  reason                text check (reason is null or char_length(reason) between 1 and 200),
  proposal_id           uuid,
  created_at            timestamptz not null default now(),
  check ((before_subject_id is null) = (before_teacher_user_id is null)),
  check ((after_subject_id is null) = (after_teacher_user_id is null)),
  check (before_subject_id is not null or after_subject_id is not null)
);
create index idx_timetable_changes_school on timetable_changes (school_id, created_at desc);
create index idx_timetable_changes_class on timetable_changes (school_id, class_id, created_at desc);

revoke all on timetable_changes from public, anon, authenticated, service_role;
revoke all on timetable_changes from app_user, nca_super;
grant select, insert on timetable_changes to app_user;
-- Append-only (scripts/check_append_only_grants.py), said in the words the check reads.
revoke update, delete on timetable_changes from anon, authenticated, app_user, nca_super;

alter table timetable_changes enable row level security;
alter table timetable_changes force row level security;
create policy timetable_changes_tenant_isolation on timetable_changes using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The office reads all of it; a teacher reads the history of their own classes, and nobody else's.
create policy timetable_changes_read on timetable_changes as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and class_id = any (public.teacher_own_class_ids()))
);
-- Written by those who change the timetable, in their own name.
create policy timetable_changes_as_self on timetable_changes as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'super_admin'])
  and changed_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
