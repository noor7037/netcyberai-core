-- P5 slice 8c (C202): Proxy Auto. Covers for the periods of a teacher on leave.
--
-- 1. substitutions: one row is one period of one class on one date, taken by
--    a substitute because the teacher the timetable names is on approved
--    leave that day. A person assigns it with one tap and can undo it. The
--    app proposes; nothing here assigns by itself.
--      - A PERIOD IS COVERED ONCE, AND A TEACHER COVERS ONE CLASS A PERIOD:
--        the two unique indexes, while a cover is 'assigned'. They are the
--        last guard: two people tapping at the same moment, one is refused.
--      - The substitute is never the absent teacher (a check).
--      - A cover is assigned only for today or one of the 31 days after
--        (India's date), for a period the timetable gives the absent
--        teacher on that weekday, while that teacher's leave is approved
--        for the date, to an active teacher of the school who has no period
--        of their own then and no approved leave that day (the trigger).
--      - WHAT WAS ASSIGNED NEVER CHANGES. A cover is undone, once, in the
--        name of whoever undid it; an undone cover stays undone, and the
--        period is assigned again as a new row.
--      - No delete.
-- 2. teachers_away_on(date): which teachers have approved leave covering a
--    day, for the people who arrange cover. Leave itself is read by the
--    person and the office only (staff_leave, C201). The academic
--    coordinator arranges cover and needs this one fact and no other: never
--    the kind, the reason, a request that is not approved, or the leave of
--    anyone who is not a teacher; and only for the days cover can still be
--    arranged for (today and the 31 days after), never a day gone by or
--    leave planned further ahead.
-- 3. Two rules written once, which everything above reads through:
--      - staff_on_leave(school, user, date): a day is "on leave" for a
--        person while a request of theirs covering it is approved. The
--        trigger, teachers_away_on() and the app's own onLeave() all ask
--        this one function.
--      - cover_day_open(date): the days a cover is arranged for (today and
--        the 31 days after). The trigger and teachers_away_on() both ask it.
--
-- Who reads substitutions: the principal, the school admin and the academic
-- coordinator, every row; a teacher, the rows where they are the substitute
-- or the absent teacher. Nobody else, and the platform role holds no right
-- on the table. A cover does not widen what a substitute can read anywhere
-- else: teacher_own_class_ids() and every existing policy are untouched.
-- The audit rows of a cover ('cover.%') say who was away, so they follow the
-- same rule: the three roles that arrange cover, or the person who acted.

-- ON LEAVE ON A DAY, written once (docs/26 section 3 rule 2): a person is on
-- leave on a date while a request of theirs covering it is approved, and at
-- no other time. With the CALLER's rights (not a definer): a session that
-- asks is answered from the leave rows it may read, so it learns nothing
-- staff_leave would not show it (the person: their own; the office: anyone's;
-- the academic coordinator and everyone else: nothing, always false). The
-- trigger and teachers_away_on() below run with the owner's rights and ask it
-- there. The app's onLeave() (src/lib/staff/leave.ts) asks it too.
create function public.staff_on_leave(p_school_id uuid, p_user_id uuid, p_date date)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from staff_leave l
     where l.school_id = p_school_id and l.user_id = p_user_id and l.status = 'approved' and p_date between l.from_date and l.to_date
  )
$$;
revoke all on function public.staff_on_leave(uuid, uuid, date) from public, anon, authenticated, service_role;
grant execute on function public.staff_on_leave(uuid, uuid, date) to app_user;

-- THE DAYS A COVER IS ARRANGED FOR, written once: India's today and the 31
-- days after (PROXY_AHEAD_DAYS in src/lib/proxy/rules.ts holds the same
-- number). Asked only inside the two functions below; no role calls it.
create function public.cover_day_open(p_date date)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_date between (now() at time zone 'Asia/Kolkata')::date and (now() at time zone 'Asia/Kolkata')::date + 31
$$;
revoke all on function public.cover_day_open(date) from public, anon, authenticated, service_role;

create table substitutions (
  substitution_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  on_date date not null,
  period smallint not null check (period between 1 and 12), -- as timetable_entries.period
  class_id uuid not null,
  subject_id uuid not null,
  absent_user_id uuid not null,
  substitute_user_id uuid not null,
  status text not null default 'assigned' check (status in ('assigned', 'undone')),
  assigned_by uuid not null,
  assigned_at timestamptz not null default now(),
  undone_by uuid,
  undone_at timestamptz,
  unique (school_id, substitution_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, absent_user_id) references users(school_id, user_id),
  foreign key (school_id, substitute_user_id) references users(school_id, user_id),
  foreign key (school_id, assigned_by) references users(school_id, user_id),
  foreign key (school_id, undone_by) references users(school_id, user_id),
  -- Never the absent teacher.
  constraint substitutions_not_the_absent check (substitute_user_id <> absent_user_id),
  constraint substitutions_undone check ((status = 'undone') = (undone_at is not null) and (undone_at is null) = (undone_by is null))
);
-- A period of a class is covered once.
create unique index substitutions_one_cover_a_period on substitutions (school_id, class_id, on_date, period) where status = 'assigned';
-- A teacher covers one class a period.
create unique index substitutions_one_class_a_substitute on substitutions (school_id, substitute_user_id, on_date, period) where status = 'assigned';
create index idx_substitutions_day on substitutions (school_id, on_date, status);

-- The rules a check cannot hold, because they compare the row with the
-- timetable, with leave, with today, or with what the row was. With the
-- owner's rights, so the answer does not depend on which rows the caller may
-- see (the academic coordinator does not read leave). For that reason it
-- answers nobody but a session of the row's own school in a role that
-- arranges cover, and only for a day cover is arranged for: its refusals say
-- whether someone is on leave, and the day rule comes before any look at
-- leave, so a day gone by or further ahead is refused with the same words
-- whoever is or is not on leave then.
create function public.substitutions_rules() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  weekday_of int;
begin
  if tg_op = 'INSERT' then
    if new.school_id is distinct from nullif(current_setting('app.current_tenant_id', true), '')::uuid
       or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin', 'academic_coordinator') then
      raise exception 'a cover is assigned by the principal, the school admin or the academic coordinator of the school' using errcode = 'insufficient_privilege';
    end if;
    if new.status <> 'assigned' then
      raise exception 'a cover starts as assigned' using errcode = 'check_violation';
    end if;
    if not public.cover_day_open(new.on_date) then
      raise exception 'a cover is arranged for today or one of the 31 days after' using errcode = 'check_violation';
    end if;
    weekday_of := extract(isodow from new.on_date)::int;
    if not exists (
      select 1 from timetable_entries e
       where e.school_id = new.school_id and e.class_id = new.class_id and e.weekday = weekday_of and e.period = new.period
         and e.subject_id = new.subject_id and e.teacher_user_id = new.absent_user_id
    ) then
      raise exception 'a cover is for a period the timetable gives the absent teacher on that day' using errcode = 'check_violation';
    end if;
    if not public.staff_on_leave(new.school_id, new.absent_user_id, new.on_date) then
      raise exception 'a cover is for a teacher whose leave is approved for that day' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from users u where u.school_id = new.school_id and u.user_id = new.substitute_user_id and u.role::text = 'teacher' and u.is_active
    ) then
      raise exception 'the substitute is an active teacher of the school' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from timetable_entries e
       where e.school_id = new.school_id and e.teacher_user_id = new.substitute_user_id and e.weekday = weekday_of and e.period = new.period
    ) then
      raise exception 'the substitute teaches a class of their own in that period' using errcode = 'check_violation';
    end if;
    if public.staff_on_leave(new.school_id, new.substitute_user_id, new.on_date) then
      raise exception 'the substitute is on leave that day' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if (new.substitution_id, new.school_id, new.on_date, new.period, new.class_id, new.subject_id, new.absent_user_id, new.substitute_user_id, new.assigned_by, new.assigned_at)
     is distinct from (old.substitution_id, old.school_id, old.on_date, old.period, old.class_id, old.subject_id, old.absent_user_id, old.substitute_user_id, old.assigned_by, old.assigned_at) then
    raise exception 'what was assigned is never changed: undo the cover and assign again' using errcode = 'check_violation';
  end if;
  if old.status = 'undone' and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'an undone cover stays undone: assign the period again' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.substitutions_rules() from public, anon, authenticated, service_role;
create trigger substitutions_rules before insert or update on substitutions for each row execute function public.substitutions_rules();

revoke all on substitutions from public, anon, authenticated, service_role;
grant select, insert, update on substitutions to app_user;

alter table substitutions enable row level security;
alter table substitutions force row level security;
create policy substitutions_tenant_isolation on substitutions using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read, and so change: the three roles that arrange cover, every row. A
-- teacher: the rows where they are the substitute or the absent teacher.
create policy substitutions_arrangers_or_own on substitutions as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (
    current_setting('app.current_role', true) = 'teacher'
    and nullif(current_setting('app.current_user_id', true), '')::uuid in (substitute_user_id, absent_user_id)
  )
);
-- Assigning: one of the three roles, in that person's own name.
create policy substitutions_assigned_as_self on substitutions as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and status = 'assigned'
  and assigned_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
-- Undoing: one of the three roles, in that person's own name. A teacher changes no row.
create policy substitutions_undone_as_self on substitutions as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']))
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
    and (status = 'assigned' or undone_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
  );

-- 2. Which teachers are away on a day, for the people who arrange cover in
-- the caller's own school. Approved leave only (staff_on_leave); the user ids
-- and nothing else. The principal and the school admin read leave itself, so
-- any day is answered for them. The academic coordinator is answered for the
-- days a cover is arranged for (cover_day_open), and for no other day.
create function public.teachers_away_on(p_date date)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.user_id
    from users u
   where u.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and u.role::text = 'teacher'
     and (
       current_setting('app.current_role', true) in ('principal', 'school_admin')
       or (current_setting('app.current_role', true) = 'academic_coordinator' and public.cover_day_open(p_date))
     )
     and public.staff_on_leave(u.school_id, u.user_id, p_date)
$$;
revoke all on function public.teachers_away_on(date) from public, anon, authenticated, service_role;
grant execute on function public.teachers_away_on(date) to app_user;

-- Every role of a school reads its own audit rows (audit_read_own_school).
-- A cover's row there says who was away and when, so it follows the cover:
-- the roles that arrange it, or the person who acted. RESTRICTIVE, as for
-- leave (C201).
create policy audit_cover_rows_arrangers_or_actor on audit_log as restrictive for select
  using (
    event_action not like 'cover.%'
    or current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );

-- Proxy Auto is partly built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'proxy', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
