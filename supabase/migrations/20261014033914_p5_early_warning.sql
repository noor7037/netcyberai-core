-- P5 slice 8j (C209): Early Warning v1. For staff only: nothing here reaches a parent.
--
-- 1. at_risk_flags becomes early_warning_flags, and is reshaped. It had no
--    row in either database and no code read it. Why the new name: the
--    repository's secrets check refuses any line under src that holds the
--    letters "sk" followed by an underscore, and "at_risk_" holds them, so
--    the old name could not be written in the app's own SQL without hiding
--    it from the checks that read that SQL. The module is "Early Warning"
--    everywhere else.
--      - A flag is a reason to look, not a verdict. It stores WHICH signals
--        (reasons: attendance, homework, needs_help), WHAT each rests on
--        (evidence: for each reason its numbers and dates) and the VERSION
--        of the rule that produced them.
--      - ONE OPEN FLAG A STUDENT at a time (a unique index).
--      - It CLOSES when no signal remains (resolved_at, closed_reason, and
--        closed_by: the person whose check closed it). A closed flag stays
--        closed: a later signal opens a new one. Attendance that could not
--        be worked out again (too few days marked) is not a signal that
--        went: the app keeps that reason on the flag, with a "held" note in
--        its evidence, and closes nothing for it.
--      - NOTHING IS SENT TO A PARENT: notified_parent is false for ever (a
--        check). schools.at_risk_parent_dispatch_enabled is read by nothing.
--      - Never deleted.
-- 2. early_warning_actions: what a person did about a flag, and what came of
--    it when that is known. APPEND-ONLY: a later outcome is a new row.
--
-- Who reads: the principal, the school admin and the academic coordinator,
-- every flag of the school; a teacher, the flags of the children who are in
-- their own classes NOW (the child's own row and teacher_own_class_ids, as
-- for a child's guardians), so a child moved to another class is the new
-- teacher's from that moment. Nobody else: an accountant reads none, and the
-- platform role holds no right on either table (nothing is sent or
-- scheduled). Who writes a flag: the three roles that run the check, never a
-- teacher. Who adds an action: whoever may read the flag, in their own name.
-- The audit rows of Early Warning ('early_warning.%') follow the same three
-- roles, or the person who acted.

-- 1. The flags.
drop policy at_risk_flags_tenant_isolation on at_risk_flags;
alter table at_risk_flags rename to early_warning_flags;
alter table early_warning_flags rename constraint at_risk_flags_pkey to early_warning_flags_pkey;
alter table early_warning_flags rename constraint at_risk_flags_school_id_fkey to early_warning_flags_school_id_fkey;
alter table early_warning_flags rename constraint at_risk_flags_school_student_fkey to early_warning_flags_school_student_fkey;
alter index idx_at_risk_school_student rename to idx_early_warning_flags_student;

-- The old single reason ('attendance', 'marks', 'both') no longer fits: no marks are recorded before P6.
alter table early_warning_flags drop column reason;
alter table early_warning_flags
  add column class_id uuid not null, -- the child's class at the last check: a record, not what a teacher's reading rests on
  add column reasons text[] not null,
  add column evidence jsonb not null,
  add column rule_version integer not null,
  add column opened_by uuid not null, -- the person whose check opened it
  add column checked_at timestamptz not null default now(), -- when its evidence was last worked out
  add column closed_reason text,
  add column closed_by uuid, -- the person whose check closed it
  add constraint early_warning_flags_school_flag_key unique (school_id, flag_id),
  add constraint early_warning_flags_class_fkey foreign key (school_id, class_id) references classes(school_id, class_id),
  add constraint early_warning_flags_opened_by_fkey foreign key (school_id, opened_by) references users(school_id, user_id),
  add constraint early_warning_flags_closed_by_fkey foreign key (school_id, closed_by) references users(school_id, user_id),
  -- At least one signal, and only the three of rule version 1. Fees are never one.
  add constraint early_warning_flags_reasons check (cardinality(reasons) between 1 and 3 and reasons <@ array['attendance', 'homework', 'needs_help']::text[]),
  add constraint early_warning_flags_evidence check (jsonb_typeof(evidence) = 'object'),
  add constraint early_warning_flags_rule_version check (rule_version >= 1),
  add constraint early_warning_flags_closed check (
    (resolved_at is null) = (closed_reason is null)
    and (resolved_at is null) = (closed_by is null)
    and (closed_reason is null or closed_reason in ('signals_cleared', 'not_active'))
  ),
  -- Nothing from Early Warning reaches a parent (docs/26 section 3 rule 6): this stays false whatever the
  -- school's switch or a child's consent says.
  add constraint early_warning_flags_parent_never_told check (notified_parent = false);

-- One open flag a student at a time.
create unique index early_warning_flags_one_open on early_warning_flags (school_id, student_id) where resolved_at is null;
create index idx_early_warning_flags_open_class on early_warning_flags (school_id, class_id) where resolved_at is null;

-- The rules a check cannot hold: they compare a row with what it was, or its evidence with its reasons.
create function public.early_warning_flags_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  class_set boolean := true;
begin
  if (select count(distinct r) from unnest(new.reasons) r) <> cardinality(new.reasons) then
    raise exception 'a reason is given once' using errcode = 'check_violation';
  end if;
  -- The flag's class is the class the child is in: when the flag is opened, and again whenever a check moves
  -- it. It is never pointed at a class the child is not in. (Read as the person writing the flag, who is one of
  -- the three roles that read every student.) Between two checks it can be behind the child, so nothing that
  -- decides who reads a flag uses it: the readers policy below asks the child's own row.
  if tg_op = 'UPDATE' then
    class_set := new.class_id is distinct from old.class_id;
  end if;
  if class_set and not exists (select 1 from students s where s.school_id = new.school_id and s.student_id = new.student_id and s.class_id = new.class_id) then
    raise exception 'a flag''s class is the class the child is in' using errcode = 'check_violation';
  end if;
  if (select coalesce(array_agg(k order by k), '{}'::text[]) from jsonb_object_keys(new.evidence) k)
     is distinct from (select coalesce(array_agg(r order by r), '{}'::text[]) from unnest(new.reasons) r)
     or exists (select 1 from unnest(new.reasons) r where jsonb_typeof(new.evidence -> r) is distinct from 'object') then
    raise exception 'a flag carries evidence for each of its reasons, and for nothing else' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if new.resolved_at is not null then
      raise exception 'a flag is opened open' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if (new.flag_id, new.school_id, new.student_id, new.detected_at, new.opened_by) is distinct from (old.flag_id, old.school_id, old.student_id, old.detected_at, old.opened_by) then
    raise exception 'whose flag it is, and who opened it and when, is never changed' using errcode = 'check_violation';
  end if;
  if old.resolved_at is not null and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'a closed flag stays closed: a later signal opens a new one' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.early_warning_flags_rules() from public, anon, authenticated, service_role;
create trigger early_warning_flags_rules before insert or update on early_warning_flags for each row execute function public.early_warning_flags_rules();

-- 2. What a person did about a flag.
create table early_warning_actions (
  action_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  flag_id uuid not null,
  -- Something a person did themself, in the school: none of these is a message from the app.
  kind text not null check (kind in ('talked_to_student', 'spoke_to_guardian', 'extra_help', 'other')),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  outcome text check (outcome is null or char_length(btrim(outcome)) between 1 and 500),
  by_user uuid not null,
  at timestamptz not null default now(),
  foreign key (school_id, flag_id) references early_warning_flags(school_id, flag_id),
  foreign key (school_id, by_user) references users(school_id, user_id),
  -- "Other" says what it was.
  constraint early_warning_actions_other_says_what check (kind <> 'other' or note is not null)
);
create index idx_early_warning_actions_flag on early_warning_actions (school_id, flag_id, at);

revoke all on early_warning_flags, early_warning_actions from public, anon, authenticated, service_role;
revoke all on early_warning_flags, early_warning_actions from app_user, nca_super;
grant select, insert, update on early_warning_flags to app_user;
grant select, insert on early_warning_actions to app_user;
revoke update, delete on early_warning_actions from app_user, anon, authenticated, nca_super;

alter table early_warning_flags enable row level security;
alter table early_warning_flags force row level security;
alter table early_warning_actions enable row level security;
alter table early_warning_actions force row level security;
create policy early_warning_flags_tenant_isolation on early_warning_flags using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy early_warning_actions_tenant_isolation on early_warning_actions using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read: the three roles that run the check, every flag; a teacher, the flags of the children who are in their
-- own classes now. Nobody else reads any row. The teacher's branch asks the child's own row, not the flag's copy
-- of the class (which only a check brings up to date): the day a child is moved, the old class's teacher stops
-- reading the flag and its log, and the new class's teacher starts. The same shape as a child's guardians
-- (teacher_scope_parent_student_map).
create policy early_warning_flags_readers on early_warning_flags as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (
    current_setting('app.current_role', true) = 'teacher'
    and exists (
      select 1 from students s
      where s.school_id = early_warning_flags.school_id
        and s.student_id = early_warning_flags.student_id
        and s.class_id in (select unnest(public.teacher_own_class_ids()))
    )
  )
);
-- Opened by a check one of the three roles ran, in that person's own name. A teacher opens none.
create policy early_warning_flags_opened_as_self on early_warning_flags as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and opened_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
-- Brought up to date, or closed, by a check one of the three roles ran: closed in that person's own name. A
-- teacher changes no row.
create policy early_warning_flags_checked_by_office on early_warning_flags as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']))
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
    and (closed_by is null or closed_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
  );
-- An action is seen, and added, by whoever may see its flag (the policy above decides inside this query).
create policy early_warning_actions_with_flag on early_warning_actions as restrictive for all using (
  exists (select 1 from early_warning_flags f where f.school_id = early_warning_actions.school_id and f.flag_id = early_warning_actions.flag_id)
);
-- In one's own name, by a member of staff who works with the child: the office, the coordinator, a teacher.
create policy early_warning_actions_as_self on early_warning_actions as restrictive for insert with check (
  by_user = nullif(current_setting('app.current_user_id', true), '')::uuid
  and current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher'])
);

-- Every role of a school reads its own audit rows (audit_read_own_school).
-- An Early Warning row there says a check was run or something was done
-- about a child's flag, so it follows the flags: the three roles that read
-- every flag, or the person who acted. RESTRICTIVE, as for leave (C201).
create policy audit_early_warning_rows_office_or_actor on audit_log as restrictive for select
  using (
    event_action not like 'early_warning.%'
    or current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );

-- Early Warning is partly built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'early-warning', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
