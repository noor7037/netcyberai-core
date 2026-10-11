-- P2 5h (C154): Teacher Copilot v1.
--
--   ai_usage        what each draft cost, per school: who, what kind, how
--                   many tokens, when. Never the prompt or the draft.
--   teaching_notes  a lesson plan or worksheet a teacher approved and kept.
--                   `ai_assisted` and the approver are on the record
--                   (docs/21 provenance).
--
-- No school is switched on by this migration: Copilot stays off until the
-- founder supplies a key and a monthly limit for a school.

create table ai_usage (
  usage_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  user_id uuid not null,
  kind text not null check (kind in ('lesson_plan', 'worksheet', 'pulse_message')),
  tokens_in int not null check (tokens_in >= 0),
  tokens_out int not null check (tokens_out >= 0),
  created_at timestamptz not null default now(),
  foreign key (school_id, user_id) references users(school_id, user_id)
);
create index idx_ai_usage_school_month on ai_usage(school_id, created_at);

create table teaching_notes (
  note_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  class_id uuid not null,
  subject_id uuid not null,
  unit_id uuid,
  kind text not null check (kind in ('lesson_plan', 'worksheet')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  ai_assisted boolean not null,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, unit_id) references syllabus_units(school_id, unit_id),
  foreign key (school_id, approved_by) references users(school_id, user_id)
);
create index idx_teaching_notes_class on teaching_notes(school_id, class_id, subject_id, approved_at desc);

revoke all on ai_usage, teaching_notes from public, anon, authenticated;
grant select, insert on ai_usage, teaching_notes to app_user, nca_super;
alter table ai_usage enable row level security;
alter table ai_usage force row level security;
alter table teaching_notes enable row level security;
alter table teaching_notes force row level security;

create policy ai_usage_tenant_isolation on ai_usage using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Usage is written in one's own name; the school's leadership reads all of it, a person their own.
create policy ai_usage_write_as_self on ai_usage as restrictive
  for insert with check (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy ai_usage_read on ai_usage as restrictive
  for select using (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
    or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

create policy teaching_notes_tenant_isolation on teaching_notes using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy teaching_notes_staff on teaching_notes as restrictive
  for all using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));
create policy teaching_notes_teacher_scope on teaching_notes as restrictive
  for all using (current_setting('app.current_role', true) <> 'teacher' or class_id = any (public.teacher_own_class_ids()));
-- Approved in one's own name.
create policy teaching_notes_approve_as_self on teaching_notes as restrictive
  for insert with check (approved_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
