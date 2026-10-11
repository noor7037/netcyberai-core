-- P2 5c (C145): the timetable, entered by the office and read by teachers.
--
-- One row is one period of one class on one weekday: the subject and the
-- teacher. The two unique constraints are the clash guard of last resort:
-- a class cannot be in two places at once, and neither can a teacher. The
-- app checks first and names the two entries; the database refuses a clash
-- the app missed (two people saving at the same moment).

create table timetable_entries (
  entry_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  class_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 is Monday
  period smallint not null check (period between 1 and 12),
  subject_id uuid not null,
  teacher_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, teacher_user_id) references users(school_id, user_id),
  constraint timetable_class_slot unique (school_id, class_id, weekday, period),
  constraint timetable_teacher_slot unique (school_id, teacher_user_id, weekday, period)
);

revoke all on timetable_entries from public, anon, authenticated;
grant select, insert, update, delete on timetable_entries to app_user, nca_super;
alter table timetable_entries enable row level security;
alter table timetable_entries force row level security;

create policy timetable_entries_tenant_isolation on timetable_entries
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Staff read it; a teacher reads their own periods and their own classes'.
create policy timetable_entries_staff_read on timetable_entries as restrictive
  for select using (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'accountant', 'super_admin'])
    or (current_setting('app.current_role', true) = 'teacher'
        and (teacher_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
             or class_id = any (public.teacher_own_class_ids())))
  );

-- Only the office writes it.
create policy timetable_entries_office_insert on timetable_entries as restrictive
  for insert with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin']));
create policy timetable_entries_office_update on timetable_entries as restrictive
  for update using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin']));
create policy timetable_entries_office_delete on timetable_entries as restrictive
  for delete using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin']));
