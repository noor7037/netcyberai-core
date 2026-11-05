-- W21-M2 (docs/42 Medium, Setup): one-click promotion to the next academic session, with a dry run, a per-student
-- override list, and an undo within 24 hours.
--
-- Classes are the school's own rows across years, not one set per session: no class list or chooser filters by
-- classes.session_id, and a class carries its timetable, its subject teachers and its class teacher. So a promotion
-- moves each student to the next grade's class of the same section, re-tags every class to the new session, and
-- makes only the classes that are missing (5-C has no 6-C). The old session's attendance (student, class, date),
-- marks (exam -> exams.session_id) and fees (fee_structures.session_id, invoices per student) are never touched, so
-- no new session column is needed on them. Fee structures are not copied: the office sets the new year's fees.
-- A roll number belongs to one class (students_class_roll_unique), so a student who changes class starts the new class
-- with none; the old one is kept on the event, and an undo gives it back.
--
--   promotion_runs       one row per promotion and one per undo (append-only; an undo names the run it reverses,
--                        once). Read by the principal and the school admin; written by the principal, as self.
--   promotion_events     one row per student moved, kept back, moved section or marked as left, and per class made
--                        or re-tagged: from, to, who, when, the reason (append-only). An undo writes the reverse
--                        events; nothing is rewritten. Class ids are plain ids (as in audit rows), so a class made
--                        by a promotion can still be removed when an undo finds it empty.
--   promotion_overrides  the principal's decisions for the dry run: repeat, leave, or move to another section,
--                        with a reason. Kept per session; changed and cleared by the principal only.
--   students.left_on     the day a student left the school (set by a promotion for a leaver, cleared by its undo).
--                        Changed by the principal or the school admin only, like the student's status.

create table promotion_runs (
  run_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (school_id),
  action text not null check (action in ('promoted', 'undone')),
  from_session_id uuid not null references academic_sessions (session_id),
  to_session_id uuid not null references academic_sessions (session_id),
  undoes_run_id uuid references promotion_runs (run_id),
  actor_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (school_id, run_id),
  unique (undoes_run_id),
  check ((action = 'undone') = (undoes_run_id is not null)),
  check (from_session_id <> to_session_id),
  foreign key (school_id, actor_user_id) references users (school_id, user_id)
);
create index idx_promotion_runs_school on promotion_runs (school_id, created_at desc);

create table promotion_events (
  event_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (school_id),
  run_id uuid not null,
  outcome text not null check (outcome in ('promoted', 'repeated', 'moved_section', 'left', 'class_made', 'class_retagged', 'undone')),
  student_id uuid,
  class_id uuid,
  from_class_id uuid,
  to_class_id uuid,
  from_session_id uuid,
  to_session_id uuid,
  from_status student_status,
  from_roll_no text,
  reason text check (reason is null or (char_length(btrim(reason)) between 1 and 200 and public.no_aadhaar_number(reason))),
  actor_user_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (school_id, run_id) references promotion_runs (school_id, run_id),
  foreign key (school_id, student_id) references students (school_id, student_id),
  foreign key (school_id, actor_user_id) references users (school_id, user_id),
  check ((outcome in ('class_made', 'class_retagged')) = (class_id is not null and student_id is null))
);
create index idx_promotion_events_run on promotion_events (school_id, run_id);
create index idx_promotion_events_student on promotion_events (school_id, student_id) where student_id is not null;

create table promotion_overrides (
  school_id uuid not null references schools (school_id),
  from_session_id uuid not null references academic_sessions (session_id),
  student_id uuid not null,
  decision text not null check (decision in ('repeat', 'leave', 'move_section')),
  to_section text check (to_section is null or to_section ~ '^[A-Z0-9]{1,10}$'),
  reason text not null check (char_length(btrim(reason)) between 1 and 200 and public.no_aadhaar_number(reason)),
  set_by uuid not null,
  set_at timestamptz not null default now(),
  primary key (school_id, from_session_id, student_id),
  foreign key (school_id, student_id) references students (school_id, student_id),
  foreign key (school_id, set_by) references users (school_id, user_id),
  check ((decision = 'move_section') = (to_section is not null))
);

alter table students add column left_on date;

-- History is never rewritten, not even by the owner: a mistake is undone by a reverse run.
create function public.promotion_history_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'a promotion is never changed or removed: undo it within 24 hours' using errcode = 'insufficient_privilege';
end $$;
revoke all on function public.promotion_history_fixed() from public, anon, authenticated, service_role;
create trigger promotion_runs_fixed before update or delete on promotion_runs for each row execute function public.promotion_history_fixed();
create trigger promotion_events_fixed before update or delete on promotion_events for each row execute function public.promotion_history_fixed();

-- The leaving date is the office's, as the student's status is.
create function public.students_left_on_office_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.left_on is distinct from old.left_on and current_user = 'app_user'
     and coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin', 'super_admin') then
    raise exception 'only the principal or the school admin sets the leaving date' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.students_left_on_office_only() from public, anon, authenticated, service_role;
create trigger students_left_on_office_only before update of left_on on students for each row execute function public.students_left_on_office_only();

revoke all on promotion_runs, promotion_events, promotion_overrides from public, anon, authenticated, service_role;
revoke all on promotion_runs, promotion_events, promotion_overrides from app_user, nca_super;
grant select, insert on promotion_runs, promotion_events to app_user;
grant select, insert, update, delete on promotion_overrides to app_user;
grant select on promotion_runs, promotion_events, promotion_overrides to nca_super;

alter table promotion_runs enable row level security;
alter table promotion_runs force row level security;
alter table promotion_events enable row level security;
alter table promotion_events force row level security;
alter table promotion_overrides enable row level security;
alter table promotion_overrides force row level security;

create policy promotion_runs_tenant_isolation on promotion_runs using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy promotion_events_tenant_isolation on promotion_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy promotion_overrides_tenant_isolation on promotion_overrides using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Read by the principal and the school admin (and the platform's own role); nobody else, never a parent.
create policy promotion_runs_office on promotion_runs as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
);
create policy promotion_events_office on promotion_events as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
);
create policy promotion_overrides_office on promotion_overrides as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
);
-- Written by the principal, in their own name.
create policy promotion_runs_principal_writes on promotion_runs as restrictive for insert with check (
  current_setting('app.current_role', true) = 'principal' and actor_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy promotion_events_principal_writes on promotion_events as restrictive for insert with check (
  current_setting('app.current_role', true) = 'principal' and actor_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy promotion_overrides_principal_sets on promotion_overrides as restrictive for insert with check (
  current_setting('app.current_role', true) = 'principal' and set_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy promotion_overrides_principal_changes on promotion_overrides as restrictive for update using (
  current_setting('app.current_role', true) = 'principal'
) with check (
  current_setting('app.current_role', true) = 'principal' and set_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy promotion_overrides_principal_clears on promotion_overrides as restrictive for delete using (
  current_setting('app.current_role', true) = 'principal'
);
