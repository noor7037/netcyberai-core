-- P5 close-out (C210): leave in a small office, cancelled leave releases its covers, and the academic
-- coordinator is told who is away and nothing else.
--
-- 1. A PRINCIPAL WITH NO SCHOOL ADMIN RECORDS THEIR OWN LEAVE. Nobody decides their own request (C201): the
--    principal's goes to the school admin, the school admin's to the principal. A school with no active school
--    admin has nobody to decide the principal's, so there, and only there, the principal records their own leave:
--    approved at once, in their own name, and marked so (staff_leave.self_recorded; the app writes the audit row
--    'leave.self_recorded'). The database still refuses self-approval
--      - for every role other than the principal (the policy staff_leave_asked_as_self, and the trigger, which
--        asks the person's own row in users),
--      - once the school has an active school admin (the trigger),
--      - and on any request that was asked and waits: self_recorded is set when the row is made and never after
--        (it joins what was asked, which never changes), and staff_leave_not_own_decision still holds for every
--        row that is not self-recorded.
-- 2. CANCELLED LEAVE RELEASES ITS COVERS. When approved leave is withdrawn by the person or cancelled by the
--    office, every cover still assigned for that person on a day from India's today to the leave's last day is
--    undone in the same transaction, in the canceller's name (undone_by is who withdrew the leave), with
--    undone_reason 'leave_cancelled' (the trigger staff_leave_releases_covers). Covers of days gone by stay as they
--    were. The covering teacher reads it in the app (My Day, Proxy Auto); nothing is sent and no job is added.
--      - A new cover for that person and the release take one lock each, the one a person's leave is taken under
--        (staff_leave:<school>:<person>), so a cover assigned at the moment the leave is cancelled is either
--        refused (the leave is no longer approved) or released with the rest. substitutions_rules is the 8c rule
--        with that lock added before it asks about leave, and the rule for undone_reason.
--      - undone_reason 'leave_cancelled' is written only when the absent teacher is no longer on leave that day.
-- 3. THE ACADEMIC COORDINATOR: AWAY OR PRESENT ONLY (docs/26 section 3 rule 4). Nothing here gives the
--    coordinator a leave row or a leave audit row: staff_leave and its 'leave.%' audit rows stay the person's and
--    the office's (C201); the coordinator learns who is away from teachers_away_on() (C202), which gives user ids
--    and nothing else. undone_reason says why a cover was undone, never the kind or the reason of anyone's leave.
--
-- Who reads: unchanged. staff_leave: the person themself and the office (principal, school admin).
-- substitutions: the principal, the school admin and the academic coordinator, and a teacher the covers where
-- they are the substitute or the absent teacher. The platform role holds no right on either table. The two
-- functions below run with the owner's rights: the release must undo the covers of a teacher who withdraws their
-- own leave, and a teacher changes no cover row themself (substitutions_undone_as_self).

-- 1. One's own leave, recorded by the principal of a school with no school admin.
alter table staff_leave add column self_recorded boolean not null default false;
alter table staff_leave drop constraint staff_leave_not_own_decision;
-- Never decided by the person on leave, unless the principal recorded it themself (rule 1 above).
alter table staff_leave add constraint staff_leave_not_own_decision check (decided_by is null or decided_by <> user_id or self_recorded);
-- Self-recorded leave is recorded and decided by its own person, and is approved (or withdrawn after).
alter table staff_leave add constraint staff_leave_self_recorded check (
  not self_recorded or (recorded_by = user_id and decided_by = user_id and status in ('approved', 'withdrawn'))
);

-- The 8b rules (C201), with self_recorded among what was asked, and the two checks of a self-recorded row.
create or replace function public.staff_leave_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if tg_op = 'INSERT' then
    if new.self_recorded then
      if new.status <> 'approved' then
        raise exception 'leave a principal records for themself is approved at once' using errcode = 'check_violation';
      end if;
      if not exists (select 1 from users u where u.school_id = new.school_id and u.user_id = new.user_id and u.role::text = 'principal' and u.is_active) then
        raise exception 'only the principal records their own leave, and only when the school has no school admin' using errcode = 'check_violation';
      end if;
      if exists (select 1 from users u where u.school_id = new.school_id and u.role::text = 'school_admin' and u.is_active) then
        raise exception 'the school has a school admin, who decides the principal''s leave: ask for it' using errcode = 'check_violation';
      end if;
    end if;
    -- One person's requests are taken one at a time, so two cannot both pass the look below.
    if new.status in ('waiting', 'approved') then
      perform pg_advisory_xact_lock(hashtext('staff_leave:' || new.school_id::text || ':' || new.user_id::text));
      if exists (
        select 1 from staff_leave l
         where l.school_id = new.school_id and l.user_id = new.user_id and l.status in ('waiting', 'approved')
           and l.from_date <= new.to_date and l.to_date >= new.from_date
      ) then
        raise exception 'this person already has leave waiting or approved on some of these days' using errcode = 'exclusion_violation';
      end if;
    end if;
    return new;
  end if;

  if (new.leave_id, new.school_id, new.user_id, new.from_date, new.to_date, new.kind, new.reason, new.asked_at, new.recorded_by, new.self_recorded)
     is distinct from (old.leave_id, old.school_id, old.user_id, old.from_date, old.to_date, old.kind, old.reason, old.asked_at, old.recorded_by, old.self_recorded) then
    raise exception 'what was asked for is never changed: withdraw the request and ask again' using errcode = 'check_violation';
  end if;
  if old.status in ('refused', 'withdrawn') and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'a refused or withdrawn request stays as it is: ask again' using errcode = 'check_violation';
  end if;
  if old.status = 'approved' and new.status not in ('approved', 'withdrawn') then
    raise exception 'approved leave can only be withdrawn' using errcode = 'check_violation';
  end if;
  -- Who decided, when and with what note is written by one change only: a waiting request being approved or
  -- refused (in the decider's own name: the policy staff_leave_in_own_name).
  if (new.decided_by, new.decided_at, new.decision_note) is distinct from (old.decided_by, old.decided_at, old.decision_note)
     and not (old.status = 'waiting' and new.status in ('approved', 'refused')) then
    raise exception 'a decision is written only when a waiting request is approved or refused, and is recorded once' using errcode = 'check_violation';
  end if;
  if new.status = 'withdrawn' and old.status <> 'withdrawn' then
    if new.withdrawn_by = new.user_id then
      -- The person: while it waits, or before the first day of approved leave.
      if old.status = 'approved' and old.from_date <= today then
        raise exception 'leave that has begun is cancelled by the office, not by the person' using errcode = 'check_violation';
      end if;
    elsif old.status <> 'approved' then
      -- The office: a waiting request is approved or refused, not cancelled.
      raise exception 'the office cancels approved leave only' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.staff_leave_rules() from public, anon, authenticated, service_role;

-- Asking: one's own request, waiting. Or the office, for someone else who phoned: approved at once, in the office
-- person's own name. Or the principal of a school with no school admin, their own leave: approved at once, in
-- their own name, marked self-recorded (the trigger checks that the school has no active school admin).
drop policy staff_leave_asked_as_self on staff_leave;
create policy staff_leave_asked_as_self on staff_leave as restrictive for insert with check (
  recorded_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  and (
    (user_id = recorded_by and status = 'waiting' and not self_recorded)
    or (
      user_id <> recorded_by and status = 'approved' and decided_by = recorded_by and not self_recorded
      and current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
    )
    or (
      user_id = recorded_by and status = 'approved' and decided_by = recorded_by and self_recorded
      and current_setting('app.current_role', true) = 'principal'
    )
  )
);

-- 2. Cancelled leave releases its covers.
alter table substitutions add column undone_reason text;
-- Why a cover was undone, when it was not a person's own tap on that cover: its leave was cancelled.
alter table substitutions add constraint substitutions_undone_reason check (undone_reason is null or (undone_reason = 'leave_cancelled' and status = 'undone'));

-- The 8c rules (C202), with two things added: a new cover takes the lock its absent teacher's leave is changed
-- under, before it asks whether that teacher is on leave; and a cover is marked released for cancelled leave only
-- when that teacher is no longer on leave that day.
create or replace function public.substitutions_rules() returns trigger
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
    -- The absent teacher's leave is not cancelled while this is asked (staff_leave_releases_covers takes the same lock).
    perform pg_advisory_xact_lock(hashtext('staff_leave:' || new.school_id::text || ':' || new.absent_user_id::text));
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
  if new.undone_reason = 'leave_cancelled' and public.staff_on_leave(new.school_id, new.absent_user_id, new.on_date) then
    raise exception 'a cover is released for cancelled leave only when that leave no longer covers the day' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.substitutions_rules() from public, anon, authenticated, service_role;

-- The release. After approved leave becomes withdrawn, in the same statement's transaction: every cover still
-- assigned for that person from India's today to the leave's last day is undone in the name of whoever withdrew
-- the leave. With the owner's rights, because the person who withdraws may be a teacher, who changes no cover row
-- themself. If a cover in those days is still assigned afterwards, the withdrawal fails: it never leaves a cover
-- standing for leave that no longer exists.
create function public.staff_leave_releases_covers() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  first_day date := greatest(new.from_date, (now() at time zone 'Asia/Kolkata')::date);
begin
  -- The lock a new cover for this person takes before it asks about their leave.
  perform pg_advisory_xact_lock(hashtext('staff_leave:' || new.school_id::text || ':' || new.user_id::text));
  update substitutions x
     set status = 'undone', undone_by = new.withdrawn_by, undone_at = now(), undone_reason = 'leave_cancelled'
   where x.school_id = new.school_id and x.absent_user_id = new.user_id and x.status = 'assigned'
     and x.on_date between first_day and new.to_date;
  if exists (
    select 1 from substitutions x
     where x.school_id = new.school_id and x.absent_user_id = new.user_id and x.status = 'assigned'
       and x.on_date between first_day and new.to_date
  ) then
    raise exception 'the covers of cancelled leave were not all released' using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function public.staff_leave_releases_covers() from public, anon, authenticated, service_role;
create trigger staff_leave_releases_covers after update of status on staff_leave for each row
  when (old.status = 'approved' and new.status = 'withdrawn')
  execute function public.staff_leave_releases_covers();
