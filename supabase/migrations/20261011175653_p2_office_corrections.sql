-- P2 (C146): three supervisor decisions.
--
--   1. Timetable is switched on for every existing school. New schools get
--      it from their plan. Safe to run again; a row a founder already set
--      (on or off) is left as it is.
--   2. The academic coordinator writes the timetable as well as reading it.
--   3. attendance_correction_requests: marks from a phone that arrive after
--      their day ended wait here for the office, instead of being refused.

-- 1.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'timetable', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;

-- 2.
drop policy timetable_entries_office_insert on timetable_entries;
drop policy timetable_entries_office_update on timetable_entries;
drop policy timetable_entries_office_delete on timetable_entries;
create policy timetable_entries_office_insert on timetable_entries as restrictive
  for insert with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'super_admin']));
create policy timetable_entries_office_update on timetable_entries as restrictive
  for update using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'super_admin']));
create policy timetable_entries_office_delete on timetable_entries as restrictive
  for delete using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'super_admin']));

-- 3.
create table attendance_correction_requests (
  request_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  class_id uuid not null,
  for_date date not null,
  requested_by uuid not null,
  -- [{ "studentId": uuid, "status": text, "leaveCode": text | null }]
  entries jsonb not null check (jsonb_typeof(entries) = 'array'),
  status text not null default 'waiting' check (status in ('waiting', 'applied', 'dismissed')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, requested_by) references users(school_id, user_id),
  foreign key (school_id, decided_by) references users(school_id, user_id),
  check ((status = 'waiting') = (decided_by is null))
);
create index idx_attendance_correction_requests_waiting on attendance_correction_requests(school_id, status, for_date);

revoke all on attendance_correction_requests from public, anon, authenticated;
grant select, insert, update on attendance_correction_requests to app_user, nca_super;
alter table attendance_correction_requests enable row level security;
alter table attendance_correction_requests force row level security;

create policy attendance_correction_requests_tenant_isolation on attendance_correction_requests
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The office reads the queue; a person reads the requests they made.
create policy attendance_correction_requests_read on attendance_correction_requests as restrictive
  for select using (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
    or requested_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  );
-- A request is made in one's own name, and starts waiting.
create policy attendance_correction_requests_make_own on attendance_correction_requests as restrictive
  for insert with check (requested_by = nullif(current_setting('app.current_user_id', true), '')::uuid and status = 'waiting');
-- Only the office decides one.
create policy attendance_correction_requests_office_decide on attendance_correction_requests as restrictive
  for update using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin']));
