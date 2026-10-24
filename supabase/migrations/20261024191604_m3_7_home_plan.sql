-- M3-7 (C337; 07 "M3, the rest"; R5, Plus): after a parent-teacher meeting, a 14-night home plan.
--
-- 1. family.plus_open, a Control setting, false: Family Plus has no checkout before P3 and no school sponsors it yet,
--    so a Plus module (this one) is used only when Control opens Plus to every family for a pilot. Read live.
-- 2. family.home_plans: one open plan per child. The parent chooses one to seven topics of the child's released
--    catalog (the app checks each one and its subject's access); the 14 nights go through them in turn, 15 minutes a
--    night, from the day the plan is made. The parent's own notes from the meeting may be kept with it, for the parent
--    only: 1 to 1000 characters, never a run of twelve digits. A plan is stopped, never changed; a new one stops the
--    old. The family's own rows, as every family table: row level security enabled and forced, the account's own rows.
-- 3. public.guardian_followup_request: "Ask the teacher to follow up" for a linked, matched child. As the Daily Pulse's
--    answer (C336): the guardian's session only; the guardian's own active, consented child; the school's
--    operational_communication consent (without it, no request reaches the school). It opens the follow-up in the
--    teacher's existing queue (pulse_followups: kind 'other', source parent_reply, fixed words, the child's class),
--    one open item per child and kind, under the office's own lock (src/lib/pulse/followups.ts). No free text from the
--    family reaches the school this way.

-- 1. Plus, for a pilot
insert into control.settings (key, value) values ('family.plus_open', 'false'::jsonb) on conflict (key) do nothing;

-- 2. The plan
create table family.home_plans (
  plan_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  starts_on date not null,
  topics jsonb not null check (jsonb_typeof(topics) = 'array' and jsonb_array_length(topics) between 1 and 7),
  note text check (note is null or (char_length(btrim(note)) between 1 and 1000 and note !~ '[0-9]{12}')),
  created_at timestamptz not null default now(),
  stopped_at timestamptz,
  followup_asked_at timestamptz,
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create unique index uq_family_home_plan_open on family.home_plans (child_id) where stopped_at is null;
create index idx_family_home_plans_account on family.home_plans (account_id);
alter table family.home_plans enable row level security;
alter table family.home_plans force row level security;
revoke all on family.home_plans from public, anon, authenticated, app_user, nca_super;
create policy home_plans_own on family.home_plans as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy home_plans_own_only on family.home_plans as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, update, delete on family.home_plans to family_app;

-- 3. Ask the teacher to follow up
create function public.guardian_followup_request(p_student_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  child_class uuid;
  made integer;
begin
  if coalesce(current_setting('app.current_role', true), '') <> 'parent' or me is null or school is null then
    raise exception 'only a guardian asks for a follow-up' using errcode = '42501';
  end if;
  select s.class_id into child_class
    from public.students s
   where s.school_id = school and s.student_id = p_student_id and s.class_id is not null
     and s.student_id = any (public.guardian_student_ids());
  if child_class is null then
    return 'not_found';
  end if;
  if not coalesce((select c.granted from public.consent_ledger c
                    where c.school_id = school and c.student_id = p_student_id and c.purpose = 'operational_communication'
                    order by c.created_at desc limit 1), false) then
    return 'no_consent';
  end if;
  perform pg_advisory_xact_lock(hashtext('followup:' || school || ':' || p_student_id || ':other'));
  insert into public.pulse_followups (school_id, student_id, class_id, kind, reason, source)
  select school, p_student_id, child_class, 'other', 'After the parent-teacher meeting, the parent asked for a follow-up. The child has a 14-night home plan in the Family app.', 'parent_reply'
   where not exists (select 1 from public.pulse_followups f
                      where f.school_id = school and f.student_id = p_student_id and f.kind = 'other' and f.status = 'open');
  get diagnostics made = row_count;
  return case when made = 1 then 'recorded' else 'already' end;
end $$;
revoke all on function public.guardian_followup_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.guardian_followup_request(uuid) to app_user;
