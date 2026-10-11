-- P2 5e (C150): homework.
--
--   homework              what the teacher wrote once (the original)
--   homework_targets      one assignment per section it was copied to; each
--                         holds its own text and due date, so it stands on
--                         its own and is checked separately
--   homework_status       done or not done, per student of an assignment
--   homework_attachments  a photo or a PDF of the original, kept through FileStorage
--
-- Homework becomes partly live, so it is switched on for every existing
-- school as Timetable and Daily Pulse were (C146, C149).

create table homework (
  homework_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  subject_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  details text check (details is null or char_length(details) between 1 and 2000),
  due_date date not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, homework_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, created_by) references users(school_id, user_id)
);
create index idx_homework_school_due on homework(school_id, due_date desc);

create table homework_targets (
  target_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  homework_id uuid not null,
  class_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  details text check (details is null or char_length(details) between 1 and 2000),
  due_date date not null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, homework_id, class_id),
  unique (school_id, target_id, class_id),
  foreign key (school_id, homework_id) references homework(school_id, homework_id),
  foreign key (school_id, class_id) references classes(school_id, class_id)
);
create index idx_homework_targets_class_due on homework_targets(school_id, class_id, due_date desc);

create table homework_status (
  school_id uuid not null references schools(school_id),
  target_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  done boolean not null,
  checked_by uuid not null,
  checked_at timestamptz not null default now(),
  primary key (target_id, student_id),
  foreign key (school_id, target_id, class_id) references homework_targets(school_id, target_id, class_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, checked_by) references users(school_id, user_id)
);

create table homework_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  homework_id uuid not null,
  storage_key text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 120),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes int not null check (size_bytes between 1 and 4194304),
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (school_id, homework_id) references homework(school_id, homework_id),
  foreign key (school_id, uploaded_by) references users(school_id, user_id),
  -- The file sits under its own school's prefix, whoever wrote the row.
  check (storage_key like school_id::text || '/homework/' || homework_id::text || '/%')
);

revoke all on homework, homework_targets, homework_status, homework_attachments from public, anon, authenticated;
grant select, insert, update on homework, homework_targets, homework_status to app_user, nca_super;
grant select, insert on homework_attachments to app_user, nca_super;
alter table homework enable row level security;
alter table homework force row level security;
alter table homework_targets enable row level security;
alter table homework_targets force row level security;
alter table homework_status enable row level security;
alter table homework_status force row level security;
alter table homework_attachments enable row level security;
alter table homework_attachments force row level security;

create policy homework_tenant_isolation on homework using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy homework_targets_tenant_isolation on homework_targets using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy homework_status_tenant_isolation on homework_status using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy homework_attachments_tenant_isolation on homework_attachments using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Homework is for those who teach or run the school.
create policy homework_staff on homework as restrictive
  for all using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));
create policy homework_targets_staff on homework_targets as restrictive
  for all using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));
create policy homework_status_staff on homework_status as restrictive
  for all using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));
create policy homework_attachments_staff on homework_attachments as restrictive
  for all using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));

-- A teacher: assignments and completion of their own classes only; an
-- original (and its files) they wrote, or one assigned to a class of theirs.
create policy homework_targets_teacher_scope on homework_targets as restrictive
  for all using (current_setting('app.current_role', true) <> 'teacher' or class_id = any (public.teacher_own_class_ids()));
create policy homework_status_teacher_scope on homework_status as restrictive
  for all using (current_setting('app.current_role', true) <> 'teacher' or class_id = any (public.teacher_own_class_ids()));
create policy homework_teacher_scope on homework as restrictive
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
    or exists (select 1 from homework_targets t where t.school_id = homework.school_id and t.homework_id = homework.homework_id)
  );
create policy homework_attachments_teacher_scope on homework_attachments as restrictive
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or exists (select 1 from homework h where h.school_id = homework_attachments.school_id and h.homework_id = homework_attachments.homework_id)
  );

insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'homework', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
