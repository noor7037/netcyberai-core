-- P2 (C148, D6): the "needs help" queue.
--
-- One row is one student who needs a follow-up from their teacher: why, and
-- what was done about it. In P2 a teacher or the office adds the row; from
-- P4 a parent's reply "needs help" to the Daily Pulse adds it; from P5 the
-- recorded outcome feeds Early Warning.
--
-- Daily Pulse becomes partly live with this screen, so it is switched on
-- for every existing school the same way Timetable was (C146): safe to run
-- again, and a founder's own switch is left as it is.

create table pulse_followups (
  followup_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  class_id uuid not null,
  kind text not null check (kind in ('did_not_understand', 'homework_help', 'missed_class', 'other')),
  reason text check (reason is null or char_length(reason) between 1 and 300),
  source text not null default 'staff' check (source in ('staff', 'parent_reply')),
  status text not null default 'open' check (status in ('open', 'done', 'not_needed')),
  outcome text check (outcome is null or char_length(outcome) between 1 and 500),
  created_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, created_by) references users(school_id, user_id),
  foreign key (school_id, decided_by) references users(school_id, user_id),
  -- Open has no outcome yet; a decided one always says what happened and who decided.
  check ((status = 'open') = (decided_by is null)),
  check (status = 'open' or outcome is not null)
);
create index idx_pulse_followups_open on pulse_followups(school_id, status, created_at);

revoke all on pulse_followups from public, anon, authenticated;
grant select, insert, update on pulse_followups to app_user, nca_super;
alter table pulse_followups enable row level security;
alter table pulse_followups force row level security;
create policy pulse_followups_tenant_isolation on pulse_followups
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Those who teach or run the school; a teacher only for their own classes.
create policy pulse_followups_staff on pulse_followups as restrictive
  for all using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));
create policy pulse_followups_teacher_scope on pulse_followups as restrictive
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or class_id = any (public.teacher_own_class_ids())
  );

insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'pulse', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
