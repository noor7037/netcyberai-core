-- C224 (P7 wave 1 close-out, admissions and the data check): the supervisor's answers 3, 6 and 7 of C223-A.
--
-- 1. THE ERASURE OF A DATA REQUEST REACHES THE CHILD'S ADMISSION ENQUIRY. An admitted enquiry is the child's record
--    (Admit made the student from it) and is never deleted: public.erase_admission_enquiries(student) blanks the
--    child's name, the guardian's name, the phone, the next step and the reason on it (erased_at says when), and the
--    note and next step of each of its steps. Its stage, class, source, owner, dates and the steps themselves are
--    kept, and a step 'erased' says who carried the erasure out and when. Called by pseudonymizeStudent
--    (src/lib/consent/dsr.ts), in the transaction of the rest of the erasure.
--      - child_name, guardian_name and phone are empty exactly when the enquiry is erased (a check);
--      - the rules trigger lets the erasure through from the database's own function only (it runs as the owner),
--        never from the app's or the platform's role, and changes nothing else; an erased enquiry never changes;
--      - a step's note and next step are empty after an erasure only (a check).
-- 2. THE DATA CHECK'S MESSAGES. erase_student_data_check() also blanks template_params on the communication_log rows
--    of the requests it removes: they hold the child's name and the details as asked. communication_log_forward_only
--    keeps refusing every change to what a sent message was, with one exception, the narrowest the erasure needs:
--    template_params set to nothing, by the database's owner (a SECURITY DEFINER function), never by the app's or the
--    platform's role. The row itself (to whom, when, its state and price) is Communication's and stays.
-- 3. DELETING ENQUIRIES (C223-A answer 3). The principal and the school admin delete an enquiry that was not admitted,
--    with its steps (public.delete_admission_enquiry), and, for a parent's erasure request about a family that never
--    joined, every enquiry with that phone that was not admitted (public.delete_family_enquiries). An admitted
--    enquiry is never deleted: it is erased with the child's data. Both are SECURITY DEFINER with a pinned
--    search_path, answer the caller's own school only, and are executed by the app's role only: the app's role still
--    holds no DELETE on either table (the steps stay append-only for it), and the platform role holds nothing. The
--    app audits each deletion with ids and counts (never a name or a phone). Nothing is deleted automatically: the
--    retention period is the lawyer's (P8).
-- 4. ONE AADHAAR RULE (C223-A answer 6). Every free-text column of Admissions refuses a twelve-digit run through
--    public.no_aadhaar_number, as the data check's columns do, in place of the 4-4-4 pattern of C221. Every existing
--    row is checked first: the migration stops, naming the column, if one would not pass.
-- 5. The two-argument curriculum_gap_units(uuid, uuid) is dropped: main's code calls only the three-argument one
--    (C219, checked by the lead).
--
-- Read by: src/lib/admissions/admissions.ts (the /app/admissions screen and its API), src/lib/consent/dsr.ts (the
-- erasure of a data request), src/lib/students/data-check.ts (through erase_student_data_check, from dsr.ts).
-- Existing rows stay valid: the new columns are empty, the relaxed NOT NULLs keep every row as it is, and the new
-- checks are tested against every row before they are added.

-- ---- 4 first: every existing row passes the one rule ------------------------------------------------------------
do $$
declare
  c record;
  bad boolean;
begin
  for c in
    select * from (values
      ('admission_enquiries', 'child_name'), ('admission_enquiries', 'guardian_name'), ('admission_enquiries', 'next_step'),
      ('admission_enquiries', 'closed_reason'), ('admission_events', 'note'), ('admission_events', 'next_step')
    ) as v(t, col)
  loop
    execute format('select exists (select 1 from public.%I where not public.no_aadhaar_number(%I))', c.t, c.col) into bad;
    if bad then
      raise exception 'C224: %.% holds a value that public.no_aadhaar_number refuses (a run of twelve digits). Correct those rows, then run this migration again. The values are not shown here.', c.t, c.col
        using errcode = 'check_violation';
    end if;
  end loop;
end $$;

-- ---- 1 and 4: admission_enquiries ----------------------------------------------------------------------------------
alter table admission_enquiries add column erased_at timestamptz;
alter table admission_enquiries alter column child_name drop not null;
alter table admission_enquiries alter column guardian_name drop not null;
alter table admission_enquiries alter column phone drop not null;
alter table admission_enquiries drop constraint admission_enquiries_child_name_check;
alter table admission_enquiries drop constraint admission_enquiries_guardian_name_check;
alter table admission_enquiries drop constraint admission_enquiries_next_step_check;
alter table admission_enquiries drop constraint admission_enquiries_closed_reason_check;
alter table admission_enquiries add constraint admission_enquiries_child_name_check
  check (child_name is null or (char_length(btrim(child_name)) between 1 and 60 and public.no_aadhaar_number(child_name)));
alter table admission_enquiries add constraint admission_enquiries_guardian_name_check
  check (guardian_name is null or (char_length(btrim(guardian_name)) between 1 and 60 and public.no_aadhaar_number(guardian_name)));
alter table admission_enquiries add constraint admission_enquiries_next_step_check
  check (next_step is null or (char_length(btrim(next_step)) between 1 and 120 and public.no_aadhaar_number(next_step)));
alter table admission_enquiries add constraint admission_enquiries_closed_reason_check
  check (closed_reason is null or (char_length(btrim(closed_reason)) between 1 and 120 and public.no_aadhaar_number(closed_reason)));
-- (admission_enquiries_phone_check stays: + and digits, as WhatsApp wants it.)
-- Who and how to reach them are there exactly while the enquiry is not erased; an erased one holds no words at all.
alter table admission_enquiries add constraint admission_enquiries_erased check (
  case when erased_at is null then child_name is not null and guardian_name is not null and phone is not null
       else child_name is null and guardian_name is null and phone is null and next_step is null and closed_reason is null end
);

-- ---- 1 and 4: admission_events -------------------------------------------------------------------------------------
alter table admission_events add column erased_at timestamptz;
alter table admission_events drop constraint admission_events_note_check;
alter table admission_events drop constraint admission_events_next_step_check;
alter table admission_events drop constraint admission_events_kind_check;
alter table admission_events drop constraint admission_events_note_says_something;
alter table admission_events add constraint admission_events_note_check
  check (note is null or (char_length(btrim(note)) between 1 and 500 and public.no_aadhaar_number(note)));
alter table admission_events add constraint admission_events_next_step_check
  check (next_step is null or (char_length(btrim(next_step)) between 1 and 120 and public.no_aadhaar_number(next_step)));
-- 'erased': written by the database when the erasure of a data request blanks the enquiry.
alter table admission_events add constraint admission_events_kind_check
  check (kind in ('recorded', 'note', 'stage', 'follow_up', 'owner', 'details', 'erased'));
-- A note says something, until an erasure takes its words; an erased step holds no words.
alter table admission_events add constraint admission_events_note_says_something
  check (kind <> 'note' or note is not null or erased_at is not null);
alter table admission_events add constraint admission_events_erased_no_words
  check (erased_at is null or (note is null and next_step is null));

-- ---- 1: the rules trigger lets the erasure through, from the database's own function only --------------------------
create or replace function public.admission_enquiries_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.stage in ('admitted', 'not_joining') or new.student_id is not null or new.admitted_structure_id is not null then
      raise exception 'an enquiry is recorded open: a child is admitted only by Admit' using errcode = 'check_violation';
    end if;
    if new.erased_at is not null then
      raise exception 'an enquiry is recorded with its details: only the erasure of a data request blanks them' using errcode = 'check_violation';
    end if;
  else
    if (new.enquiry_id, new.school_id, new.created_by, new.created_at) is distinct from (old.enquiry_id, old.school_id, old.created_by, old.created_at) then
      raise exception 'who recorded an enquiry, and when, is never changed' using errcode = 'check_violation';
    end if;
    if old.erased_at is not null then
      raise exception 'an erased enquiry stays as it is' using errcode = 'check_violation';
    end if;
    if new.erased_at is not null then
      -- C224: the erasure of a data request, from public.erase_admission_enquiries (which runs as the database's
      -- owner), never from the app's or the platform's role. The details go; nothing else changes.
      if current_user in ('app_user', 'nca_super') then
        raise exception 'an enquiry is erased only by the erasure of a data request' using errcode = '42501';
      end if;
      if (new.class_id, new.source, new.stage, new.owner_id, new.next_follow_up, new.student_id, new.admitted_structure_id)
         is distinct from (old.class_id, old.source, old.stage, old.owner_id, old.next_follow_up, old.student_id, old.admitted_structure_id) then
        raise exception 'an erasure blanks the details of an enquiry and changes nothing else' using errcode = 'check_violation';
      end if;
      new.updated_at := now();
      return new;
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

-- Every change is kept; the erasure is kept as one step 'erased', in the name of the person who carried it out.
create or replace function public.admission_enquiries_kept() returns trigger
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
  if new.erased_at is not null and old.erased_at is null then
    insert into admission_events (school_id, enquiry_id, kind, by_user) values (new.school_id, new.enquiry_id, 'erased', me);
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

-- ---- 1: the erasure --------------------------------------------------------------------------------------------------
-- The child's enquiry is the one Admit made the child's record from (admission_enquiries_one_student: at most one).
-- In the caller's own school, for the principal and the school admin only (the roles that carry out an erasure).
create function public.erase_admission_enquiries(p_student_id uuid) returns table (enquiries integer, steps integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  ids uuid[];
begin
  if school is null or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    raise exception 'an erasure is carried out by the principal or the school admin of the child''s school' using errcode = '42501';
  end if;
  select coalesce(array_agg(e.enquiry_id), '{}'::uuid[]) into ids
    from admission_enquiries e
   where e.school_id = school and e.student_id = p_student_id and e.erased_at is null;
  update admission_events v set note = null, next_step = null, erased_at = now()
   where v.school_id = school and v.enquiry_id = any (ids) and (v.note is not null or v.next_step is not null);
  get diagnostics steps = row_count;
  update admission_enquiries e set child_name = null, guardian_name = null, phone = null, next_step = null, closed_reason = null, erased_at = now()
   where e.school_id = school and e.enquiry_id = any (ids);
  get diagnostics enquiries = row_count;
  return next;
end $$;
revoke all on function public.erase_admission_enquiries(uuid) from public, anon, authenticated, service_role;
revoke all on function public.erase_admission_enquiries(uuid) from app_user, nca_super;
grant execute on function public.erase_admission_enquiries(uuid) to app_user;

-- ---- 3: deleting enquiries ------------------------------------------------------------------------------------------
-- One enquiry that was not admitted, with its steps: the number of steps removed, or null when the school has no such
-- enquiry. An admitted one is refused: it is the child's record, erased with the child's data, never deleted.
create function public.delete_admission_enquiry(p_enquiry_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  was text;
  n integer;
begin
  if school is null or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    raise exception 'an enquiry is deleted by the principal or the school admin' using errcode = '42501';
  end if;
  select e.stage into was from admission_enquiries e where e.school_id = school and e.enquiry_id = p_enquiry_id for update;
  if not found then
    return null;
  end if;
  if was = 'admitted' then
    raise exception 'an admitted enquiry is the child''s record: it is erased with the child''s data, never deleted' using errcode = 'check_violation';
  end if;
  delete from admission_events v where v.school_id = school and v.enquiry_id = p_enquiry_id;
  get diagnostics n = row_count;
  delete from admission_enquiries e where e.school_id = school and e.enquiry_id = p_enquiry_id;
  return n;
end $$;
revoke all on function public.delete_admission_enquiry(uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_admission_enquiry(uuid) from app_user, nca_super;
grant execute on function public.delete_admission_enquiry(uuid) to app_user;

-- A parent's erasure request about a family that never joined: every enquiry with that phone, as the enquiries keep
-- it (+ and digits), that was not admitted, with its steps. One row for each enquiry deleted. An admitted enquiry
-- with the same phone is a child's record and stays (an erasure of that child's data blanks it).
create function public.delete_family_enquiries(p_phone text) returns table (deleted_enquiry uuid, deleted_steps integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  r record;
begin
  if school is null or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    raise exception 'an enquiry is deleted by the principal or the school admin' using errcode = '42501';
  end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'a phone number as the enquiries keep it: + and digits' using errcode = 'check_violation';
  end if;
  for r in
    select e.enquiry_id from admission_enquiries e
     where e.school_id = school and e.phone = p_phone and e.stage <> 'admitted'
     order by e.created_at, e.enquiry_id
       for update
  loop
    delete from admission_events v where v.school_id = school and v.enquiry_id = r.enquiry_id;
    get diagnostics deleted_steps = row_count;
    delete from admission_enquiries e where e.school_id = school and e.enquiry_id = r.enquiry_id;
    deleted_enquiry := r.enquiry_id;
    return next;
  end loop;
end $$;
revoke all on function public.delete_family_enquiries(text) from public, anon, authenticated, service_role;
revoke all on function public.delete_family_enquiries(text) from app_user, nca_super;
grant execute on function public.delete_family_enquiries(text) to app_user;

-- ---- 2: a sent message's words, blanked by the erasure only ---------------------------------------------------------
-- As C190's, with one exception: template_params set to nothing by the database's owner (the erasure functions run as
-- the owner), never by the app's role or the platform role, which still cannot change what a message was.
create or replace function public.communication_log_forward_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  was text := old.status::text;
  now_is text := new.status::text;
  rank constant jsonb := '{"queued": 0, "uncertain": 1, "sent": 2, "delivered": 3, "read": 4}';
begin
  if (new.school_id, new.channel, new.created_at) is distinct from (old.school_id, old.channel, old.created_at)
     or new.to_phone is distinct from old.to_phone or new.template_name is distinct from old.template_name or new.dedupe_key is distinct from old.dedupe_key
     or new.body is distinct from old.body or new.thread_id is distinct from old.thread_id or new.sent_by is distinct from old.sent_by
     or (old.provider_message_id is not null and new.provider_message_id is distinct from old.provider_message_id) then
    raise exception 'what a message was never changes' using errcode = 'check_violation';
  end if;
  if was <> 'queued' and (new.template_version is distinct from old.template_version or new.language is distinct from old.language
     or (new.template_params is distinct from old.template_params and not (new.template_params is null and current_user not in ('app_user', 'nca_super')))) then
    raise exception 'what a message was never changes' using errcode = 'check_violation';
  end if;
  if now_is = was then
    return new;
  end if;
  if was = 'queued' and (now_is = 'failed' or now_is like 'blocked_%') then
    return new;
  end if;
  if now_is = 'failed' and was in ('sent', 'uncertain') then
    return new;
  end if;
  if rank ? was and rank ? now_is and (rank ->> now_is)::int > (rank ->> was)::int then
    return new;
  end if;
  raise exception 'a message''s state only moves forward (% to % is refused)', was, now_is using errcode = 'check_violation';
end $$;
revoke all on function public.communication_log_forward_only() from public, anon, authenticated, service_role;

-- As C222's, and the words of the messages that asked about these details go too (C223-A answer 7). A message still
-- queued is failed ('erased') in the same step, so it is never sent with its words gone (lead, at integration).
create or replace function public.erase_student_data_check(p_student_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  printed integer;
  asked integer;
begin
  if school is null or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    raise exception 'an erasure is carried out by the principal or the school admin of the child''s school' using errcode = '42501';
  end if;
  update communication_log l
     set template_params = null,
         status = case when l.status::text = 'queued' then 'failed'::comm_status else l.status end,
         failed_at = case when l.status::text = 'queued' then now() else l.failed_at end,
         failure_code = case when l.status::text = 'queued' then 'erased' else l.failure_code end
   where l.school_id = school and (l.template_params is not null or l.status::text = 'queued')
     and l.log_id in (
       select r.message_log_id from data_check_requests r
        where r.school_id = school and r.student_id = p_student_id and r.message_log_id is not null
     );
  delete from student_id_as_printed where school_id = school and student_id = p_student_id;
  get diagnostics printed = row_count;
  delete from data_check_requests where school_id = school and student_id = p_student_id;
  get diagnostics asked = row_count;
  return printed + asked;
end $$;
revoke all on function public.erase_student_data_check(uuid) from public, anon, authenticated, service_role;
revoke all on function public.erase_student_data_check(uuid) from app_user, nca_super;
grant execute on function public.erase_student_data_check(uuid) to app_user;

-- ---- 5 ----------------------------------------------------------------------------------------------------------------
drop function public.curriculum_gap_units(uuid, uuid);
