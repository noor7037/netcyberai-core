-- P7 slice 10a (C221): the admissions pipeline.
--
-- 1. admission_enquiries: a family asking about a place for a child, from a walk-in, a phone call, WhatsApp and
--    the other sources of the website's Admissions Enquiry Tracker (src/lib/free-tools/admissions-tracker.ts),
--    with an OWNER in the office, the NEXT FOLLOW-UP date and the STAGE. The stages and sources are the free
--    tool's own, stored as codes (src/lib/admissions/admissions.ts maps each to the tool's label; a test holds the
--    two lists here to the tool's).
--      - Recorded OPEN: a child is admitted only by "Admit", never by recording or editing an enquiry.
--      - ADMITTED IS FOR GOOD: an admitted enquiry names exactly one student, and that student is new: made in the
--        same transaction, waiting for consent, in the class sought (a trigger). One student is never two
--        enquiries' (a unique index). Nothing on an admitted enquiry changes afterwards.
--      - "Not joining" says why (a check); it can be reopened if the family comes back.
--      - The owner is the office: an active principal or school admin of the school (a trigger).
--      - NO AADHAAR NUMBER: no free-text field holds a run of twelve digits written the way Aadhaar prints its
--        number (4-4-4, with or without a space or hyphen). The phone is kept as WhatsApp wants it (+ and digits).
--      - Never deleted.
-- 2. admission_events: what happened to an enquiry, in order. APPEND-ONLY. Every change of an enquiry is kept by
--    the database itself (a trigger writes the step: recorded, a stage moved, a follow-up set, given to someone,
--    details corrected) in the name of the person whose session made it; a person adds a note of a contact.
--    Nobody can write a step the enquiry did not take: only a note is written directly.
--
-- Who reads and writes: the office only (principal and school admin), both tables, every row of the school. A
-- teacher, an accountant, an academic coordinator and a parent read nothing; the platform role (nca_super) holds
-- no right on either table. The audit rows of Admissions ('admissions.%') are read by the office only.
--
-- "Gone quiet" (no contact for a number of days) is a setting of the module 'admissions', with the free tool's
-- QUIET_DAYS_DEFAULT as its default: no table here.
-- Read by: src/lib/admissions/admissions.ts (the screen /app/admissions, its API, and the My Day card
-- 'admissions-follow-up').

create table admission_enquiries (
  enquiry_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  child_name text not null check (char_length(btrim(child_name)) between 1 and 60 and child_name !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)'),
  guardian_name text not null check (char_length(btrim(guardian_name)) between 1 and 60 and guardian_name !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)'),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  class_id uuid not null, -- the class sought
  source text not null check (source in ('walk_in', 'phone_call', 'whatsapp', 'website', 'referral', 'newspaper', 'other')),
  stage text not null default 'enquiry' check (stage in ('enquiry', 'visit_booked', 'visited', 'form_taken', 'form_submitted', 'admitted', 'not_joining')),
  owner_id uuid not null,
  next_follow_up date,
  next_step text check (next_step is null or (char_length(btrim(next_step)) between 1 and 120 and next_step !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)')),
  closed_reason text check (closed_reason is null or (char_length(btrim(closed_reason)) between 1 and 120 and closed_reason !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)')),
  student_id uuid, -- the child's record, made by "Admit"
  admitted_structure_id uuid, -- the class's fee structure in force on the day of admission; null when it had none
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, enquiry_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, owner_id) references users(school_id, user_id),
  foreign key (school_id, created_by) references users(school_id, user_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, admitted_structure_id) references fee_structures(school_id, structure_id),
  -- Admitted exactly when there is a student; "not joining" exactly when there is a reason.
  constraint admission_enquiries_admitted_has_student check ((stage = 'admitted') = (student_id is not null)),
  constraint admission_enquiries_not_joining_says_why check ((stage = 'not_joining') = (closed_reason is not null)),
  constraint admission_enquiries_structure_when_admitted check (admitted_structure_id is null or student_id is not null),
  -- A closed enquiry has nothing left to follow up.
  constraint admission_enquiries_closed_no_follow_up check (stage not in ('admitted', 'not_joining') or (next_follow_up is null and next_step is null))
);
-- One student is one enquiry's: Admit makes exactly one record, and it is never claimed twice.
create unique index admission_enquiries_one_student on admission_enquiries (school_id, student_id) where student_id is not null;
create index idx_admission_enquiries_open on admission_enquiries (school_id, next_follow_up) where stage not in ('admitted', 'not_joining');

create table admission_events (
  event_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  enquiry_id uuid not null,
  -- recorded, stage, follow_up, owner, details: written by the database when the enquiry changes. note: a contact
  -- a person writes down.
  kind text not null check (kind in ('recorded', 'note', 'stage', 'follow_up', 'owner', 'details')),
  note text check (note is null or (char_length(btrim(note)) between 1 and 500 and note !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)')),
  stage_from text check (stage_from is null or stage_from in ('enquiry', 'visit_booked', 'visited', 'form_taken', 'form_submitted', 'admitted', 'not_joining')),
  stage_to text check (stage_to is null or stage_to in ('enquiry', 'visit_booked', 'visited', 'form_taken', 'form_submitted', 'admitted', 'not_joining')),
  follow_up date,
  next_step text check (next_step is null or (char_length(btrim(next_step)) between 1 and 120 and next_step !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)')),
  owner_id uuid,
  student_id uuid,
  changed text[] check (changed is null or (cardinality(changed) between 1 and 5 and changed <@ array['child_name', 'guardian_name', 'phone', 'class', 'source']::text[])),
  by_user uuid not null,
  at timestamptz not null default clock_timestamp(),
  n integer not null, -- the step's place in the enquiry's history: 1, 2, 3 ... (set by the trigger below)
  foreign key (school_id, enquiry_id) references admission_enquiries(school_id, enquiry_id),
  foreign key (school_id, by_user) references users(school_id, user_id),
  foreign key (school_id, owner_id) references users(school_id, user_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  constraint admission_events_note_says_something check (kind <> 'note' or note is not null),
  constraint admission_events_recorded_stage check (kind <> 'recorded' or (stage_to is not null and stage_from is null)),
  constraint admission_events_stage_moves check (kind <> 'stage' or (stage_from is not null and stage_to is not null and stage_from <> stage_to)),
  constraint admission_events_owner_named check (kind <> 'owner' or owner_id is not null),
  constraint admission_events_details_named check ((kind = 'details') = (changed is not null)),
  constraint admission_events_student_when_admitted check (student_id is null or (kind = 'stage' and stage_to = 'admitted'))
);
-- The steps of one enquiry are numbered in the order they were written, whatever the clock says: several steps of
-- one change are written in the same instant. Every app path writes a step with the enquiry's row locked.
create unique index admission_events_in_order on admission_events (school_id, enquiry_id, n);
create function public.admission_events_numbered() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.n := coalesce((select max(v.n) from admission_events v where v.school_id = new.school_id and v.enquiry_id = new.enquiry_id), 0) + 1;
  return new;
end $$;
revoke all on function public.admission_events_numbered() from public, anon, authenticated, service_role;
create trigger admission_events_numbered before insert on admission_events for each row execute function public.admission_events_numbered();

-- The rules a check cannot hold: they compare a row with what it was, or with other tables.
create function public.admission_enquiries_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.stage in ('admitted', 'not_joining') or new.student_id is not null or new.admitted_structure_id is not null then
      raise exception 'an enquiry is recorded open: a child is admitted only by Admit' using errcode = 'check_violation';
    end if;
  else
    if (new.enquiry_id, new.school_id, new.created_by, new.created_at) is distinct from (old.enquiry_id, old.school_id, old.created_by, old.created_at) then
      raise exception 'who recorded an enquiry, and when, is never changed' using errcode = 'check_violation';
    end if;
    if old.stage = 'admitted' then
      raise exception 'an admitted enquiry stays as it is: the child is a student now' using errcode = 'check_violation';
    end if;
    -- (old.student_id is null here: only an admitted enquiry has one.)
    if new.student_id is not null then
      -- Admit makes the child's record in the same step: a new student, made in this very transaction, waiting for
      -- consent, in the class the family sought.
      if not exists (
        select 1 from students s
         where s.school_id = new.school_id and s.student_id = new.student_id and s.class_id = new.class_id
           and s.status = 'pending_consent' and s.created_at = now()
      ) then
        raise exception 'Admit makes the child''s record in the same step: a new student, waiting for consent, in the class sought' using errcode = 'check_violation';
      end if;
      if new.admitted_structure_id is not null and not exists (
        select 1 from fee_structures f where f.school_id = new.school_id and f.structure_id = new.admitted_structure_id and f.class_id = new.class_id
      ) then
        raise exception 'the fee structure kept on an admission is the class''s own' using errcode = 'check_violation';
      end if;
    end if;
    new.updated_at := now();
  end if;
  -- Followed up by the office: an active principal or school admin of the same school.
  if tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id then
    if not exists (
      select 1 from users u
       where u.school_id = new.school_id and u.user_id = new.owner_id and u.is_active and u.role::text in ('principal', 'school_admin')
    ) then
      raise exception 'an enquiry is followed up by the office: an active principal or school admin' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.admission_enquiries_rules() from public, anon, authenticated, service_role;
create trigger admission_enquiries_rules before insert or update on admission_enquiries for each row execute function public.admission_enquiries_rules();

-- Every change is kept: the step is written here, in the name of the person whose session made the change.
create function public.admission_enquiries_kept() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  changed text[];
begin
  if tg_op = 'INSERT' then
    insert into admission_events (school_id, enquiry_id, kind, stage_to, follow_up, next_step, owner_id, by_user)
    values (new.school_id, new.enquiry_id, 'recorded', new.stage, new.next_follow_up, new.next_step, new.owner_id, me);
    return null;
  end if;
  if new.stage is distinct from old.stage then
    insert into admission_events (school_id, enquiry_id, kind, stage_from, stage_to, note, student_id, by_user)
    values (new.school_id, new.enquiry_id, 'stage', old.stage, new.stage, case when new.stage = 'not_joining' then new.closed_reason end, new.student_id, me);
  end if;
  if new.owner_id is distinct from old.owner_id then
    insert into admission_events (school_id, enquiry_id, kind, owner_id, by_user) values (new.school_id, new.enquiry_id, 'owner', new.owner_id, me);
  end if;
  if new.stage not in ('admitted', 'not_joining') and (new.next_follow_up, new.next_step) is distinct from (old.next_follow_up, old.next_step) then
    insert into admission_events (school_id, enquiry_id, kind, follow_up, next_step, by_user) values (new.school_id, new.enquiry_id, 'follow_up', new.next_follow_up, new.next_step, me);
  end if;
  changed := array_remove(array[
    case when new.child_name is distinct from old.child_name then 'child_name' end,
    case when new.guardian_name is distinct from old.guardian_name then 'guardian_name' end,
    case when new.phone is distinct from old.phone then 'phone' end,
    case when new.class_id is distinct from old.class_id then 'class' end,
    case when new.source is distinct from old.source then 'source' end
  ], null);
  if cardinality(changed) > 0 then
    insert into admission_events (school_id, enquiry_id, kind, changed, by_user) values (new.school_id, new.enquiry_id, 'details', changed, me);
  end if;
  return null;
end $$;
revoke all on function public.admission_enquiries_kept() from public, anon, authenticated, service_role;
create trigger admission_enquiries_kept after insert or update on admission_enquiries for each row execute function public.admission_enquiries_kept();

revoke all on admission_enquiries, admission_events from public, anon, authenticated, service_role;
revoke all on admission_enquiries, admission_events from app_user, nca_super;
grant select, insert, update on admission_enquiries to app_user;
grant select, insert on admission_events to app_user;

alter table admission_enquiries enable row level security;
alter table admission_enquiries force row level security;
alter table admission_events enable row level security;
alter table admission_events force row level security;
create policy admission_enquiries_tenant_isolation on admission_enquiries using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy admission_events_tenant_isolation on admission_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The office only, for every command. Nobody else of the school reads or writes a row.
create policy admission_enquiries_office on admission_enquiries as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);
create policy admission_events_office on admission_events as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);
-- Recorded in one's own name.
create policy admission_enquiries_recorded_as_self on admission_enquiries as restrictive for insert with check (
  created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
-- A step is written in one's own name; a person writes only a note, and the other steps come from the trigger above,
-- so no step is kept that the enquiry did not take.
create policy admission_events_as_self on admission_events as restrictive for insert with check (
  by_user = nullif(current_setting('app.current_user_id', true), '')::uuid
  and (kind = 'note' or pg_trigger_depth() > 0)
);

-- Every role of a school reads its own audit rows (audit_read_own_school). An Admissions row there is about a
-- family asking for a place, so it follows the enquiries: the office only. RESTRICTIVE, as for Early Warning (C209).
create policy audit_admissions_rows_office on audit_log as restrictive for select
  using (
    event_action not like 'admissions.%'
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
  );

-- Admissions is partly built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'admissions', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
