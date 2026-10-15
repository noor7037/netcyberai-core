-- P7 slice 10g (C231): who teaches what, kept by the office in Setup (the Staff screen), and read by the timetable.
--
-- teacher_subjects says which teacher teaches which subject in which class. The teacher_scope_* policies read it, so a
-- row widens what that teacher may read and mark: only the office (principal, school admin) writes it, in the app's
-- own audited path (src/lib/academics/teacher-subjects.ts). A teacher may PROPOSE a subject and class for themselves;
-- the office confirms or declines; only a confirmed proposal is written to teacher_subjects.
--
-- 1. teachers: one row per user of a school (a unique index), made by the office when a teacher is first given a
--    subject, and never for a user who is not a teacher (a restrictive policy reads the user's role). The name is
--    the user's display name, copied by the app's insert; nothing is typed. No code made a teachers row before this
--    (only seeds), and the seeds made one per user; if two are found the migration stops and says so.
-- 2. teachers and teacher_subjects: written by the principal or the school admin only (restrictive policies for
--    insert, update and delete). Reading is unchanged: every role of the school reads them as before, which the
--    teacher_scope_* policies need.
-- 3. teacher_subject_requests: a teacher's proposal, made in their own name and for themselves; read by the office
--    and by the teacher who made it; decided once (confirmed or declined) by the office, never by the teacher who
--    asked (a trigger and a restrictive policy). A confirmed request is in teacher_subjects at that moment (the
--    trigger checks it). Never deleted. No free text: ids, a state and dates.
--
-- Safe while main's code runs on the test database (TEST serves the live site): additive. main never writes
-- teachers; main writes teacher_subjects only in /api/app/subjects/assignments, for the principal and the school
-- admin (canWriteMasterData), which the new policies allow; no screen of main calls it. The new table is unused by
-- main. The unique index is checked before it is made.
--
-- The audit rows of these writes ('teacher.profile_made', 'teacher_subject.%') hold ids only (C56); a proposal's rows
-- ('teacher_subject.request%') are read by the office or the person who acted, as the proposals themselves are.

-- ---- 1. One teachers row per user --------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from teachers group by school_id, user_id having count(*) > 1) then
    raise exception 'C231: a user has two teachers rows in one school; join them before this migration';
  end if;
end $$;
create unique index teachers_one_per_user on teachers (school_id, user_id);

-- ---- 2. The office writes who teaches what ---------------------------------------------------------------------
create policy teachers_office_insert on teachers as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and exists (select 1 from users u where u.school_id = teachers.school_id and u.user_id = teachers.user_id and u.role::text = 'teacher')
);
create policy teachers_office_update on teachers as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
    and exists (select 1 from users u where u.school_id = teachers.school_id and u.user_id = teachers.user_id and u.role::text = 'teacher')
  );
create policy teachers_office_delete on teachers as restrictive for delete using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);

create policy teacher_subjects_office_insert on teacher_subjects as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and exists (
    select 1 from teachers t join users u on u.school_id = t.school_id and u.user_id = t.user_id
     where t.school_id = teacher_subjects.school_id and t.teacher_id = teacher_subjects.teacher_id and u.role::text = 'teacher'
  )
);
create policy teacher_subjects_office_update on teacher_subjects as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
create policy teacher_subjects_office_delete on teacher_subjects as restrictive for delete using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);

-- ---- 3. A teacher's proposal -----------------------------------------------------------------------------------
create table teacher_subject_requests (
  request_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  teacher_user_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  state text not null default 'pending' check (state in ('pending', 'confirmed', 'declined')),
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  unique (school_id, request_id),
  foreign key (school_id, teacher_user_id) references users(school_id, user_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, decided_by) references users(school_id, user_id),
  -- Decided exactly when it is no longer pending.
  constraint teacher_subject_requests_decided check ((state = 'pending') = (decided_by is null and decided_at is null))
);
-- One proposal waiting at a time for a teacher, subject and class.
create unique index teacher_subject_requests_one_pending on teacher_subject_requests (school_id, teacher_user_id, class_id, subject_id) where state = 'pending';
create index idx_teacher_subject_requests_school on teacher_subject_requests (school_id, state, requested_at);

-- Made pending, for an active teacher of the school; decided once, by someone other than the teacher who asked; a
-- confirmed one is already in teacher_subjects.
create function public.teacher_subject_requests_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.state <> 'pending' or new.decided_by is not null or new.decided_at is not null then
      raise exception 'a request is made waiting' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from users u where u.school_id = new.school_id and u.user_id = new.teacher_user_id and u.role::text = 'teacher' and u.is_active) then
      raise exception 'a request is made for an active teacher of the school' using errcode = 'check_violation';
    end if;
    new.requested_at := now();
    return new;
  end if;
  if old.state <> 'pending' then
    raise exception 'a confirmed or declined request stays as it is' using errcode = 'check_violation';
  end if;
  if (new.request_id, new.school_id, new.teacher_user_id, new.class_id, new.subject_id, new.requested_at)
     is distinct from (old.request_id, old.school_id, old.teacher_user_id, old.class_id, old.subject_id, old.requested_at) then
    raise exception 'only a request''s decision changes' using errcode = 'check_violation';
  end if;
  if new.state = 'pending' then
    raise exception 'a request is confirmed or declined' using errcode = 'check_violation';
  end if;
  if new.decided_by is not distinct from new.teacher_user_id then
    raise exception 'nobody decides their own request' using errcode = 'check_violation';
  end if;
  new.decided_at := now();
  if new.state = 'confirmed' and not exists (
       select 1 from teacher_subjects ts join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
        where ts.school_id = new.school_id and t.user_id = new.teacher_user_id and ts.class_id = new.class_id and ts.subject_id = new.subject_id
     ) then
    raise exception 'a confirmed request is in teacher_subjects' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.teacher_subject_requests_rules() from public, anon, authenticated, service_role;
create trigger teacher_subject_requests_rules before insert or update on teacher_subject_requests for each row execute function public.teacher_subject_requests_rules();

revoke all on teacher_subject_requests from public, anon, authenticated, service_role;
revoke all on teacher_subject_requests from app_user, nca_super;
grant select, insert, update on teacher_subject_requests to app_user;

alter table teacher_subject_requests enable row level security;
alter table teacher_subject_requests force row level security;
create policy teacher_subject_requests_tenant_isolation on teacher_subject_requests using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read by the office, and by the teacher who asked.
create policy teacher_subject_requests_readers on teacher_subject_requests as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  or teacher_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
);
-- Made by a teacher, for themselves.
create policy teacher_subject_requests_made_by_self on teacher_subject_requests as restrictive for insert with check (
  current_setting('app.current_role', true) = 'teacher'
  and teacher_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
);
-- Decided by the office, in their own name, never by the teacher who asked.
create policy teacher_subject_requests_office_decides on teacher_subject_requests as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
    and decided_by = nullif(current_setting('app.current_user_id', true), '')::uuid
    and decided_by <> teacher_user_id
  );

-- Every role of a school reads its own audit rows (audit_read_own_school). A proposal's rows follow its table: the
-- office, or the person who acted. RESTRICTIVE, as for the timetable generator's rows (C229).
create policy audit_teacher_subject_request_rows_office_or_actor on audit_log as restrictive for select
  using (
    event_action not like 'teacher_subject.request%'
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );
