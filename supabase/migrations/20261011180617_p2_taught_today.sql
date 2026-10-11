-- P2 5d (C147): the syllabus map and one-tap "taught today" (D5).
--
--   1. syllabus_units: what a class is to be taught in a subject, in order.
--   2. syllabus_progress (the classwork log: one row per class, subject and
--      day) gains the unit it covered and a lesson note.
--   3. pulse_messages gains a status and the log row a draft was prepared
--      from, so one tap prepares exactly one draft and a second tap changes
--      it. A teacher now sees and writes only their own classes' messages.

-- 1.
create table syllabus_units (
  unit_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  class_id uuid not null,
  subject_id uuid not null,
  position int not null check (position >= 1),
  chapter text not null check (char_length(chapter) between 1 and 120),
  topic text not null check (char_length(topic) between 1 and 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (school_id, unit_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, created_by) references users(school_id, user_id)
);
create index idx_syllabus_units_map on syllabus_units(school_id, class_id, subject_id, position);

revoke all on syllabus_units from public, anon, authenticated;
grant select, insert, delete on syllabus_units to app_user, nca_super;
alter table syllabus_units enable row level security;
alter table syllabus_units force row level security;
create policy syllabus_units_tenant_isolation on syllabus_units
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- A teacher reads and writes the map of their own classes only.
create policy syllabus_units_teacher_scope on syllabus_units as restrictive
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or class_id = any (public.teacher_own_class_ids())
  );
-- The map is written by those who teach or run the school.
create policy syllabus_units_staff_insert on syllabus_units as restrictive
  for insert with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));
create policy syllabus_units_staff_delete on syllabus_units as restrictive
  for delete using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));

-- 2.
alter table syllabus_progress add constraint syllabus_progress_school_id_progress_id_key unique (school_id, progress_id);
alter table syllabus_progress add column unit_id uuid;
alter table syllabus_progress add column note text check (note is null or char_length(note) between 1 and 500);
alter table syllabus_progress add constraint syllabus_progress_school_unit_fkey
  foreign key (school_id, unit_id) references syllabus_units(school_id, unit_id);

-- 3.
alter table pulse_messages add column status text not null default 'draft' check (status in ('draft', 'ready', 'sent'));
alter table pulse_messages add column created_by uuid;
alter table pulse_messages add column source_progress_id uuid;
alter table pulse_messages alter column body_hinglish set default '';
alter table pulse_messages add constraint pulse_messages_one_per_log_row unique (school_id, source_progress_id);
alter table pulse_messages add constraint pulse_messages_school_progress_fkey
  foreign key (school_id, source_progress_id) references syllabus_progress(school_id, progress_id);
alter table pulse_messages add constraint pulse_messages_school_created_by_fkey
  foreign key (school_id, created_by) references users(school_id, user_id);
create policy teacher_scope_pulse_messages on pulse_messages as restrictive
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or class_id = any (public.teacher_own_class_ids())
  );
