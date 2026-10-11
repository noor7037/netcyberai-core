-- P2 5b (C144): attendance on the phone.
--
--   1. A class teacher marks their own class even with no subject in it:
--      attendance uses the same "own classes" rule as students
--      (teacher_own_class_ids, C112), which is also tenant-scoped.
--   2. A fourth mark, 'leave', with an optional short code.
--   3. client_operations: one row per change made on a device, so the same
--      change arriving twice is applied once (docs/20 §4).
--   4. usage_events: measurement with no student or staff detail (17 §3b).

-- 1. The class teacher rule.
drop policy teacher_scope_attendance on attendance;
create policy teacher_scope_attendance on attendance as restrictive
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or class_id = any (public.teacher_own_class_ids())
  );

-- 2. Leave.
alter table attendance drop constraint attendance_status_check;
alter table attendance add constraint attendance_status_check
  check (status in ('present', 'absent', 'late', 'leave'));
alter table attendance add column leave_code text;
alter table attendance add constraint attendance_leave_code_check
  check (leave_code is null or (status = 'leave' and char_length(leave_code) between 1 and 40));

-- 3. Operations received from devices.
create table client_operations (
  school_id uuid not null references schools(school_id),
  operation_id uuid not null,
  user_id uuid not null,
  kind text not null check (char_length(kind) between 1 and 60),
  for_date date not null,
  result jsonb,
  received_at timestamptz not null default now(),
  primary key (school_id, operation_id),
  foreign key (school_id, user_id) references users(school_id, user_id)
);
revoke all on client_operations from public, anon, authenticated;
grant select, insert, update on client_operations to app_user, nca_super;
alter table client_operations enable row level security;
alter table client_operations force row level security;
create policy client_operations_tenant_isolation on client_operations
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- A person sees and writes only their own operations.
create policy client_operations_own on client_operations as restrictive
  for all using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- 4. Measurement.
create table usage_events (
  event_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  kind text not null check (kind in ('attendance.seconds_to_mark', 'taught.tap')),
  class_id uuid,
  day date not null,
  value numeric not null check (value >= 0),
  created_at timestamptz not null default now(),
  foreign key (school_id, class_id) references classes(school_id, class_id)
);
create index idx_usage_events_school_kind_day on usage_events(school_id, kind, day);
revoke all on usage_events from public, anon, authenticated;
grant select, insert on usage_events to app_user, nca_super;
alter table usage_events enable row level security;
alter table usage_events force row level security;
create policy usage_events_tenant_isolation on usage_events
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Written by any staff member's submission; read by the school's leadership only.
create policy usage_events_read_leadership on usage_events as restrictive
  for select using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin']));
