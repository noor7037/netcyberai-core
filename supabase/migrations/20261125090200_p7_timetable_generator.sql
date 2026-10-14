-- P7 slice 10f (C229): the timetable generator.
--
-- The generator PROPOSES a week; a person reviews it beside the timetable in force, may swap periods, and publishes
-- it. Nothing reaches timetable_entries until a person publishes, and publishing goes through the app's own entry
-- path (putEntry, clearEntry: their clash guard and audit rows) in one transaction, with the two unique constraints
-- of timetable_entries as the last guard. No language model and no randomness (src/lib/timetable/generator.ts).
--
-- 1. timetable_loads: for each class, the periods a week each subject needs and the teacher who teaches it. The
--    teacher is an active teacher of the school when the row is written (a trigger), as timetable_entries'
--    teachers are users. The office edits the rows; nothing else reads them.
-- 2. timetable_unavailable: the periods a teacher cannot teach: a whole day (period null) or one period of a day.
--    Once per teacher, day and period (a unique index).
-- 3. timetable_proposals: one proposed week. A school has at most one DRAFT at a time (a unique index). A draft
--    keeps the generator's week (entries), what it could not place and why (unplaced), the classes whose week it
--    replaces (class_ids), the rules it was made under, and a fingerprint of the whole timetable it was made
--    against (based_on: md5 of timetable_snapshot()), so publishing refuses a draft the timetable has moved past.
--    Only a draft changes, and only its entries (a person's swaps); then it is PUBLISHED or DISCARDED, for good,
--    by a person in their own name. A published draft has its version, and the classes it plans hold exactly its
--    entries in timetable_entries at that moment (the trigger checks both).
-- 4. timetable_versions: every publish, kept. APPEND-ONLY. Who and when, the classes, the whole timetable before
--    (as the app read it in the same transaction) and after (taken by the database itself), and how many periods
--    were added, removed or changed in the classes planned (counted by the database). The earlier timetable is
--    read back from here.
--
-- Who reads and writes: the office (principal, school admin, academic coordinator: the roles that already write
-- timetable_entries, C146), all four tables, in their own name. A teacher, an accountant, a parent and the
-- platform role (nca_super) read nothing here; a teacher reads the published timetable in timetable_entries as
-- before. The audit rows of the generator ('timetable.plan.%') hold ids, counts, codes and dates only, and are read
-- by the office or the person who acted.
-- The most periods in a row for a teacher is a setting of the module 'timetable' (max_consecutive): no table here.
-- Read by: src/lib/timetable/generator-store.ts (the screen /app/timetable/generator, its API under
-- /api/app/timetable/generator and /api/app/timetable/history, and the My Day card 'timetable-draft').

create table timetable_loads (
  school_id uuid not null references schools(school_id),
  class_id uuid not null,
  subject_id uuid not null,
  periods_per_week smallint not null check (periods_per_week between 1 and 84), -- 7 days of 12 periods at most
  teacher_user_id uuid not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, class_id, subject_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, teacher_user_id) references users(school_id, user_id),
  foreign key (school_id, updated_by) references users(school_id, user_id)
);

create table timetable_unavailable (
  unavailable_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  teacher_user_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 is Monday
  period smallint check (period between 1 and 12), -- null: the whole day
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (school_id, teacher_user_id) references users(school_id, user_id),
  foreign key (school_id, updated_by) references users(school_id, user_id)
);
create unique index timetable_unavailable_once on timetable_unavailable (school_id, teacher_user_id, weekday, coalesce(period, 0));

create table timetable_proposals (
  proposal_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  state text not null default 'draft' check (state in ('draft', 'published', 'discarded')),
  days smallint[] not null check (cardinality(days) between 1 and 7 and days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  periods smallint not null check (periods between 1 and 12),
  max_consecutive smallint not null check (max_consecutive between 1 and 12),
  class_ids uuid[] not null check (cardinality(class_ids) between 1 and 1000),
  -- [{ classId, weekday, period, subjectId, teacherUserId }]: the proposed week of the classes planned.
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) <= 84000),
  -- [{ classId, subjectId, teacherUserId, wanted, placed, reason }]: what could not be placed, and why.
  unplaced jsonb not null check (jsonb_typeof(unplaced) = 'array'),
  based_on text not null check (based_on ~ '^[0-9a-f]{32}$'),
  swaps integer not null default 0 check (swaps >= 0),
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  unique (school_id, proposal_id),
  foreign key (school_id, proposed_by) references users(school_id, user_id),
  foreign key (school_id, decided_by) references users(school_id, user_id),
  -- Decided exactly when it is no longer a draft.
  constraint timetable_proposals_decided check ((state = 'draft') = (decided_by is null and decided_at is null))
);
-- One draft at a time: a new proposal discards the one before.
create unique index timetable_proposals_one_draft on timetable_proposals (school_id) where state = 'draft';

create table timetable_versions (
  version_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  proposal_id uuid not null,
  class_ids uuid[] not null check (cardinality(class_ids) between 1 and 1000),
  before_entries jsonb not null check (jsonb_typeof(before_entries) = 'array'),
  after_entries jsonb not null default '[]'::jsonb check (jsonb_typeof(after_entries) = 'array'),
  added integer not null default 0 check (added >= 0),
  removed integer not null default 0 check (removed >= 0),
  changed integer not null default 0 check (changed >= 0),
  published_by uuid not null,
  published_at timestamptz not null default now(),
  unique (school_id, version_id),
  foreign key (school_id, proposal_id) references timetable_proposals(school_id, proposal_id),
  foreign key (school_id, published_by) references users(school_id, user_id)
);
-- A proposal is published once.
create unique index timetable_versions_one_per_proposal on timetable_versions (school_id, proposal_id);
create index idx_timetable_versions_school on timetable_versions (school_id, published_at desc);

-- The whole timetable of a school, in one order, as the app and the database both keep it. Runs as its caller: the
-- office reads every period.
create function public.timetable_snapshot(p_school uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('classId', e.class_id, 'weekday', e.weekday, 'period', e.period, 'subjectId', e.subject_id, 'teacherUserId', e.teacher_user_id)
                            order by e.class_id, e.weekday, e.period), '[]'::jsonb)
    from timetable_entries e
   where e.school_id = p_school
$$;
revoke all on function public.timetable_snapshot(uuid) from public, anon, authenticated, service_role;
grant execute on function public.timetable_snapshot(uuid) to app_user;

-- A load's teacher is an active teacher of the school when the row is written.
create function public.timetable_loads_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from users u where u.school_id = new.school_id and u.user_id = new.teacher_user_id and u.role::text = 'teacher' and u.is_active) then
    raise exception 'a subject is taught by an active teacher of the school' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if (new.school_id, new.class_id, new.subject_id) is distinct from (old.school_id, old.class_id, old.subject_id) then
      raise exception 'a load is for one class and one subject: remove it and add another' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.timetable_loads_rules() from public, anon, authenticated, service_role;
create trigger timetable_loads_rules before insert or update on timetable_loads for each row execute function public.timetable_loads_rules();

-- A proposal's rules: written as a draft, of the school's own classes; only a draft changes, and only its entries;
-- published only with its version and with the classes it plans holding exactly its entries.
create function public.timetable_proposals_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.state <> 'draft' or new.swaps <> 0 then
      raise exception 'a proposal is written as a draft' using errcode = 'check_violation';
    end if;
    if exists (select 1 from unnest(new.class_ids) c(id) where not exists (select 1 from classes k where k.school_id = new.school_id and k.class_id = c.id))
       or cardinality(new.class_ids) <> (select count(distinct c.id) from unnest(new.class_ids) c(id)) then
      raise exception 'a proposal plans classes of the school, each once' using errcode = 'check_violation';
    end if;
    new.proposed_at := now();
    return new;
  end if;
  if old.state <> 'draft' then
    raise exception 'a published or discarded proposal stays as it is' using errcode = 'check_violation';
  end if;
  if (new.proposal_id, new.school_id, new.days, new.periods, new.max_consecutive, new.class_ids, new.unplaced, new.based_on, new.proposed_by, new.proposed_at)
     is distinct from (old.proposal_id, old.school_id, old.days, old.periods, old.max_consecutive, old.class_ids, old.unplaced, old.based_on, old.proposed_by, old.proposed_at) then
    raise exception 'only a draft''s periods change, by a swap' using errcode = 'check_violation';
  end if;
  if new.state = 'draft' then
    if new.entries is distinct from old.entries and new.swaps <> old.swaps + 1 then
      raise exception 'each change of a draft is one swap' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.entries is distinct from old.entries or new.swaps <> old.swaps then
    raise exception 'a draft is published or discarded as it is' using errcode = 'check_violation';
  end if;
  new.decided_at := now();
  if new.state = 'published' then
    if not exists (select 1 from timetable_versions v where v.school_id = new.school_id and v.proposal_id = new.proposal_id) then
      raise exception 'a published proposal has its version' using errcode = 'check_violation';
    end if;
    if exists (
         select e.class_id, e.weekday, e.period, e.subject_id, e.teacher_user_id from timetable_entries e
          where e.school_id = new.school_id and e.class_id = any (new.class_ids)
         except
         select (x->>'classId')::uuid, (x->>'weekday')::smallint, (x->>'period')::smallint, (x->>'subjectId')::uuid, (x->>'teacherUserId')::uuid
           from jsonb_array_elements(new.entries) x
       ) or exists (
         select (x->>'classId')::uuid, (x->>'weekday')::smallint, (x->>'period')::smallint, (x->>'subjectId')::uuid, (x->>'teacherUserId')::uuid
           from jsonb_array_elements(new.entries) x
         except
         select e.class_id, e.weekday, e.period, e.subject_id, e.teacher_user_id from timetable_entries e
          where e.school_id = new.school_id and e.class_id = any (new.class_ids)
       ) then
      raise exception 'a published proposal is exactly what its classes hold in the timetable' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.timetable_proposals_rules() from public, anon, authenticated, service_role;
create trigger timetable_proposals_rules before insert or update on timetable_proposals for each row execute function public.timetable_proposals_rules();

-- A version is the publishing of the school's draft: the timetable after is taken here, and the periods added,
-- removed and changed in the classes planned are counted here, whatever the app sent.
create function public.timetable_versions_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from timetable_proposals p where p.school_id = new.school_id and p.proposal_id = new.proposal_id and p.state = 'draft' and p.class_ids = new.class_ids) then
    raise exception 'a version is the publishing of the school''s draft, for its classes' using errcode = 'check_violation';
  end if;
  new.after_entries := public.timetable_snapshot(new.school_id);
  new.published_at := now();
  with b as (
    select (x->>'classId')::uuid as c, (x->>'weekday')::int as w, (x->>'period')::int as p, x->>'subjectId' as s, x->>'teacherUserId' as t
      from jsonb_array_elements(new.before_entries) x where (x->>'classId')::uuid = any (new.class_ids)
  ), a as (
    select (x->>'classId')::uuid as c, (x->>'weekday')::int as w, (x->>'period')::int as p, x->>'subjectId' as s, x->>'teacherUserId' as t
      from jsonb_array_elements(new.after_entries) x where (x->>'classId')::uuid = any (new.class_ids)
  )
  select count(*) filter (where b.c is null), count(*) filter (where a.c is null), count(*) filter (where a.c is not null and b.c is not null and (a.s, a.t) is distinct from (b.s, b.t))
    into new.added, new.removed, new.changed
    from b full join a on a.c = b.c and a.w = b.w and a.p = b.p;
  return new;
end $$;
revoke all on function public.timetable_versions_rules() from public, anon, authenticated, service_role;
create trigger timetable_versions_rules before insert on timetable_versions for each row execute function public.timetable_versions_rules();

revoke all on timetable_loads, timetable_unavailable, timetable_proposals, timetable_versions from public, anon, authenticated, service_role;
revoke all on timetable_loads, timetable_unavailable, timetable_proposals, timetable_versions from app_user, nca_super;
grant select, insert, update, delete on timetable_loads to app_user;
grant select, insert, delete on timetable_unavailable to app_user;
grant select, insert, update on timetable_proposals to app_user;
grant select, insert on timetable_versions to app_user;
-- Append-only (scripts/check_append_only_grants.py), said in the words the check reads: the versions here, and the
-- lead's two others the same check now lists, disclosure_entries (C227) and admission_events (C221; only a definer
-- function deletes a step, with its enquiry, C224). Each already holds no UPDATE or DELETE for these roles.
revoke update, delete on timetable_versions from anon, authenticated, app_user, nca_super;
revoke update, delete on disclosure_entries from anon, authenticated, app_user, nca_super;
revoke update, delete on admission_events from anon, authenticated, app_user, nca_super;

alter table timetable_loads enable row level security;
alter table timetable_loads force row level security;
alter table timetable_unavailable enable row level security;
alter table timetable_unavailable force row level security;
alter table timetable_proposals enable row level security;
alter table timetable_proposals force row level security;
alter table timetable_versions enable row level security;
alter table timetable_versions force row level security;
create policy timetable_loads_tenant_isolation on timetable_loads using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy timetable_unavailable_tenant_isolation on timetable_unavailable using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy timetable_proposals_tenant_isolation on timetable_proposals using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy timetable_versions_tenant_isolation on timetable_versions using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- The office only, for every command. Nobody else of the school reads or writes a row.
create policy timetable_loads_office on timetable_loads as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
);
create policy timetable_unavailable_office on timetable_unavailable as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
);
create policy timetable_proposals_office on timetable_proposals as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
);
create policy timetable_versions_office on timetable_versions as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
);
-- Written in one's own name.
create policy timetable_loads_as_self on timetable_loads as restrictive for insert with check (
  updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy timetable_loads_updated_as_self on timetable_loads as restrictive for update with check (
  updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy timetable_unavailable_as_self on timetable_unavailable as restrictive for insert with check (
  updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy timetable_proposals_as_self on timetable_proposals as restrictive for insert with check (
  proposed_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy timetable_proposals_decided_as_self on timetable_proposals as restrictive for update with check (
  decided_by is null or decided_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy timetable_versions_as_self on timetable_versions as restrictive for insert with check (
  published_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);

-- Every role of a school reads its own audit rows (audit_read_own_school). The generator's rows say which teacher
-- cannot teach when, and what the office is planning, so they follow the tables above: the office, or the person who
-- acted. RESTRICTIVE, as for Proxy Auto (C202).
create policy audit_timetable_plan_rows_office_or_actor on audit_log as restrictive for select
  using (
    event_action not like 'timetable.plan.%'
    or current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );

-- Timetable is partly built: on for every school, as the default plan gives it (already so since C146; a row a
-- founder set is left as it is).
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'timetable', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
