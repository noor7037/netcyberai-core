-- P5 slice 8b (C201): staff leave.
--
-- staff_leave: a member of staff asks for whole days of leave; the principal
-- or the school admin decides. The office can also record leave for someone
-- who phoned in: it is approved at once, in that office person's own name.
--   - A REQUEST IS NEVER DECIDED BY THE PERSON IT IS FOR (a check), and a
--     decision is written in the decider's own name from the principal's or
--     the school admin's session (the policy staff_leave_in_own_name), and
--     only by approving or refusing a waiting request: no other change,
--     a withdrawal least of all, writes who decided (the trigger).
--   - WHAT WAS ASKED NEVER CHANGES (who, the dates, the kind, the reason):
--     to change it, withdraw the request and ask again.
--   - A REFUSED OR WITHDRAWN REQUEST STAYS AS IT IS: never approved later.
--   - Two requests of one person never overlap while waiting or approved.
--   - A day is "on leave" only while a request covering it is 'approved'.
--   - No balances, no half days, no delete.
--
-- Who reads: the person themself, and the office (principal, school admin).
-- Nobody else reads any row, and the platform role holds no right on the
-- table. The audit rows of leave ('leave.%') follow the same rule: the
-- office, or the person who acted.

create table staff_leave (
  leave_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  user_id uuid not null,
  from_date date not null,
  to_date date not null,
  kind text not null check (kind in ('casual', 'sick', 'other')),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'refused', 'withdrawn')),
  asked_at timestamptz not null default now(),
  recorded_by uuid not null,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) between 1 and 300),
  withdrawn_by uuid,
  withdrawn_at timestamptz,
  withdrawn_note text check (withdrawn_note is null or char_length(btrim(withdrawn_note)) between 1 and 300),
  unique (school_id, leave_id),
  foreign key (school_id, user_id) references users(school_id, user_id),
  foreign key (school_id, recorded_by) references users(school_id, user_id),
  foreign key (school_id, decided_by) references users(school_id, user_id),
  foreign key (school_id, withdrawn_by) references users(school_id, user_id),
  -- Whole days, the last not before the first, sixty days at the longest.
  constraint staff_leave_dates check (to_date >= from_date and to_date - from_date < 60),
  -- Never decided by the person on leave.
  constraint staff_leave_not_own_decision check (decided_by is null or decided_by <> user_id),
  constraint staff_leave_decided check (
    (decided_at is null) = (decided_by is null)
    and (status <> 'waiting' or decided_at is null)
    and (status not in ('approved', 'refused') or decided_at is not null)
    and (decision_note is null or decided_at is not null)
  ),
  -- Refusing needs a note: it is what the person reads.
  constraint staff_leave_refused_with_note check (status <> 'refused' or decision_note is not null),
  constraint staff_leave_withdrawn check (
    (status = 'withdrawn') = (withdrawn_at is not null)
    and (withdrawn_at is null) = (withdrawn_by is null)
    and (withdrawn_note is null or withdrawn_at is not null)
  ),
  -- The office cancelling someone's leave says why.
  constraint staff_leave_cancel_with_note check (withdrawn_by is null or withdrawn_by = user_id or withdrawn_note is not null)
);
create index idx_staff_leave_school on staff_leave (school_id, status, from_date);
create index idx_staff_leave_person on staff_leave (school_id, user_id, from_date);

-- The rules a check cannot hold, because they compare a row with what it was
-- or with the person's other rows.
create function public.staff_leave_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if tg_op = 'INSERT' then
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

  if (new.leave_id, new.school_id, new.user_id, new.from_date, new.to_date, new.kind, new.reason, new.asked_at, new.recorded_by)
     is distinct from (old.leave_id, old.school_id, old.user_id, old.from_date, old.to_date, old.kind, old.reason, old.asked_at, old.recorded_by) then
    raise exception 'what was asked for is never changed: withdraw the request and ask again' using errcode = 'check_violation';
  end if;
  if old.status in ('refused', 'withdrawn') and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'a refused or withdrawn request stays as it is: ask again' using errcode = 'check_violation';
  end if;
  if old.status = 'approved' and new.status not in ('approved', 'withdrawn') then
    raise exception 'approved leave can only be withdrawn' using errcode = 'check_violation';
  end if;
  -- Who decided, when and with what note is written by one change only: a
  -- waiting request being approved or refused (in the decider's own name:
  -- the policy staff_leave_in_own_name). No other change touches the three,
  -- so a withdrawal can neither put an answer on a request nor rewrite one.
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
revoke all on function public.staff_leave_rules() from public;
create trigger staff_leave_rules before insert or update on staff_leave for each row execute function public.staff_leave_rules();

revoke all on staff_leave from public, anon, authenticated, service_role;
grant select, insert, update on staff_leave to app_user;

alter table staff_leave enable row level security;
alter table staff_leave force row level security;
create policy staff_leave_tenant_isolation on staff_leave using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read, and so change: the person themself, and the office. Nobody else reads any row.
create policy staff_leave_own_or_office on staff_leave as restrictive for all using (
  user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  or current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);
-- Asking: one's own request, waiting. Or the office, for someone else who
-- phoned: approved at once, in the office person's own name.
create policy staff_leave_asked_as_self on staff_leave as restrictive for insert with check (
  recorded_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  and (
    (user_id = recorded_by and status = 'waiting')
    or (
      user_id <> recorded_by and status = 'approved' and decided_by = recorded_by
      and current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
    )
  )
);
-- A change is made in one's own name: a decision from the principal's or the
-- school admin's session, a withdrawal by whoever withdraws.
create policy staff_leave_in_own_name on staff_leave as restrictive for update with check (
  status = 'waiting'
  or (
    status in ('approved', 'refused')
    and decided_by = nullif(current_setting('app.current_user_id', true), '')::uuid
    and current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  )
  or (status = 'withdrawn' and withdrawn_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
);

-- Every role of a school reads its own audit rows (audit_read_own_school).
-- A leave row there says who was away and when, so it follows the leave:
-- the office, or the person who acted. RESTRICTIVE, as for tickets (C124).
create policy audit_leave_rows_own_or_office on audit_log as restrictive for select
  using (
    event_action not like 'leave.%'
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );

-- Staff is partly built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'staff', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
