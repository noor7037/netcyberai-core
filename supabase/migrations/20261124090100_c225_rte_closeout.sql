-- C225 (agent Y): the RTE claim desk's close-out (C223-A answer 4) and the ONE Aadhaar-number rule (answer 6).
--
-- 0. public.no_aadhaar_number(text) is redefined as the one rule, the twin of src/lib/privacy/aadhaar.ts (both run on
--    test/fixtures/aadhaar-cases.ts). Devanagari digits are digits. A NUMBER is a run of digits with runs of spaces or
--    hyphens allowed between its groups. A text is refused when a number has twelve digits in all, or a group of
--    exactly twelve digits, or three groups of exactly four digits in a row (Aadhaar's printed form). A number written
--    with "+" straight before it is a phone with its country code: the first two do not apply to it, the third does.
--    So a longer bank UTR passes, a twelve-digit number standing alone is refused, "1234 5678 9012 3456" is refused.
--    A check that calls the function is not checked again when the function changes, so step 1 first counts, for
--    every column of every table that uses the rule (the data check, admissions and the RTE desk), the rows the new
--    rule would refuse, and stops the migration naming each table and column if there is any.
-- 1. The RTE desk's free-text checks take the one rule: rte_rates.source, rte_claims.reference and write_off_note,
--    rte_evidence.note, and the new reopen_reason and receipt reference. (The old rule for a source or a reference
--    refused only a value that was entirely twelve digits; a twelve-digit IMPS or UPI reference is now refused.)
-- 2. rte_claim_receipts: the state pays a claim in parts. A receipt (amount in paise, the day, the state's reference,
--    by whom) is never changed or removed (select and insert only); one typed wrongly is undone, while the claim is
--    still raised, by a reversing row of minus its amount with a reason code. The receipts never come to more than the
--    claim. The receipt that covers the claim is recorded by marking the claim paid: the claim's trigger writes it
--    (so a claim marked paid as before, with a day and a reference, gets its one receipt for what was still due).
-- 3. rte_claims: a short payment is written off with a note (what is still due is what is written off); the
--    principal or the school admin (never the accountant) reopens a written-off claim with a reason; a past year's
--    claim takes the class the child was in that year: the class of that year's dues ('dues'), or, for a year that is
--    over with no dues for the child, the class the principal or the school admin chooses ('chosen'); a claim for a
--    year not over takes the child's class now ('current', what every existing claim was raised with).
-- 4. public.erase_student_rte_notes(student): a data-request erasure removes the child's evidence file and clears the
--    write-off notes and reasons for reopening on the child's claims; the claims and receipts, money the state owes the
--    school, are kept. Principal and school admin only, in their own school.
--
-- Who reads and writes: as before, the principal, the school admin and the accountant of the school, in their own
-- name; a teacher and the academic coordinator nothing; the platform role nothing. Audit rows 'rte.%' hold ids,
-- amounts, dates and codes, never a note, a reason, a reference or a source (C223-A answer 7).
--
-- Read by: src/lib/rte/desk.ts (the desk, its CSV and the My Day card), src/lib/consent/dsr.ts (the erasure), and every
-- check that calls public.no_aadhaar_number (the data check's and, from agent X, admissions').
--
-- Existing rows stay valid: existing claims get class_source 'current' (they were raised with the child's class at
-- the time) and each existing paid claim gets one receipt of its whole amount, on its paid day, with its reference,
-- by the person who marked it paid.

-- ---- 0. The one Aadhaar-number rule ---------------------------------------------------------------------------------

create or replace function public.no_aadhaar_number(p text) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  t text;
  m text[];
  groups int[];
  total int;
  i int;
begin
  if p is null then
    return true;
  end if;
  -- Devanagari digits as digits; every separator (tab, line breaks, no-break and thin spaces, hyphen-minus, the Unicode
  -- hyphens and dashes, the minus sign) as one space. The same list as NUMBER_SEPARATORS in src/lib/privacy/aadhaar.ts.
  t := translate(p,
    '०१२३४५६७८९' || E'\t\n\r' || chr(160) || chr(8201) || chr(8239) || '-' || chr(8208) || chr(8209) || chr(8210) || chr(8211) || chr(8212) || chr(8722),
    '0123456789' || repeat(' ', 13));
  for m in select regexp_matches(t, '(\+?)([0-9]+( +[0-9]+)*)', 'g') loop
    groups := array(select length(g) from unnest(regexp_split_to_array(m[2], ' +')) as g);
    total := (select sum(x) from unnest(groups) as x);
    if m[1] = '' and (total = 12 or 12 = any (groups)) then
      return false;
    end if;
    for i in 1 .. coalesce(array_length(groups, 1), 0) - 2 loop
      if groups[i] = 4 and groups[i + 1] = 4 and groups[i + 2] = 4 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;
revoke all on function public.no_aadhaar_number(text) from public, anon, authenticated, service_role;
grant execute on function public.no_aadhaar_number(text) to app_user;

-- Every column of every table that uses the rule: no existing row may be one the new rule refuses.
do $$
declare
  found text;
begin
  select string_agg(format('%s.%s (%s rows)', tbl, col, n), ', ' order by tbl, col) into found
    from (
      select 'student_id_as_printed' as tbl, 'printed_name' as col, count(*) as n from student_id_as_printed where not public.no_aadhaar_number(printed_name)
      union all select 'data_check_requests', 'school_value', count(*) from data_check_requests where not public.no_aadhaar_number(school_value)
      union all select 'data_check_requests', 'printed_value', count(*) from data_check_requests where not public.no_aadhaar_number(printed_value)
      union all select 'data_check_requests', 'office_note', count(*) from data_check_requests where not public.no_aadhaar_number(office_note)
      union all select 'data_check_requests', 'corrected_to', count(*) from data_check_requests where not public.no_aadhaar_number(corrected_to)
      union all select 'data_check_requests', 'closing_note', count(*) from data_check_requests where not public.no_aadhaar_number(closing_note)
      union all select 'admission_enquiries', 'child_name', count(*) from admission_enquiries where not public.no_aadhaar_number(child_name)
      union all select 'admission_enquiries', 'guardian_name', count(*) from admission_enquiries where not public.no_aadhaar_number(guardian_name)
      union all select 'admission_enquiries', 'next_step', count(*) from admission_enquiries where not public.no_aadhaar_number(next_step)
      union all select 'admission_enquiries', 'closed_reason', count(*) from admission_enquiries where not public.no_aadhaar_number(closed_reason)
      union all select 'admission_events', 'note', count(*) from admission_events where not public.no_aadhaar_number(note)
      union all select 'admission_events', 'next_step', count(*) from admission_events where not public.no_aadhaar_number(next_step)
      union all select 'rte_rates', 'source', count(*) from rte_rates where not public.no_aadhaar_number(source)
      union all select 'rte_claims', 'reference', count(*) from rte_claims where not public.no_aadhaar_number(reference)
      union all select 'rte_claims', 'write_off_note', count(*) from rte_claims where not public.no_aadhaar_number(write_off_note)
      union all select 'rte_evidence', 'note', count(*) from rte_evidence where not public.no_aadhaar_number(note)
      union all select 'attendance_change_reasons', 'reason', count(*) from attendance_change_reasons where not public.no_aadhaar_number(reason)
    ) counted
   where n > 0;
  if found is not null then
    raise exception 'C225: existing rows the one Aadhaar rule refuses: %. Correct them, then apply again.', found;
  end if;
end $$;

-- ---- 1. The RTE desk's free text takes the one rule ----------------------------------------------------------------

alter table rte_rates
  drop constraint rte_rates_source_check,
  add constraint rte_rates_source_check check (char_length(btrim(source)) between 5 and 300 and public.no_aadhaar_number(source));

alter table rte_evidence
  drop constraint rte_evidence_note_check,
  add constraint rte_evidence_note_check check (note is null or (char_length(btrim(note)) between 1 and 300 and public.no_aadhaar_number(note)));

-- ---- 3. rte_claims: reopening, the year's class, notes cleared by an erasure -----------------------------------------

-- The 10c check on a written-off claim (generated name rte_claims_check3), found by what it says rather than its name.
do $$
declare
  found text;
begin
  select conname into found from pg_constraint
   where conrelid = 'public.rte_claims'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%state <> ''written_off''%';
  if found is null then
    raise exception 'C225: the written-off check of rte_claims was not found';
  end if;
  execute format('alter table public.rte_claims drop constraint %I', found);
end $$;

alter table rte_claims
  add column class_source text not null default 'current' check (class_source in ('current', 'dues', 'chosen')),
  add column reopen_reason text,
  add column reopened_by uuid,
  add column reopened_at timestamptz,
  add column notes_erased_at timestamptz,
  add constraint rte_claims_reopened_by_fkey foreign key (school_id, reopened_by) references users(school_id, user_id),
  add constraint rte_claims_reopen_reason_check check (reopen_reason is null or (char_length(btrim(reopen_reason)) between 1 and 300 and public.no_aadhaar_number(reopen_reason))),
  add constraint rte_claims_reopened_check check ((reopened_by is null) = (reopened_at is null) and (reopen_reason is null or reopened_by is not null)),
  drop constraint rte_claims_reference_check,
  add constraint rte_claims_reference_check check (reference is null or (char_length(btrim(reference)) between 1 and 80 and public.no_aadhaar_number(reference))),
  drop constraint rte_claims_write_off_note_check,
  add constraint rte_claims_write_off_note_check check (write_off_note is null or (char_length(btrim(write_off_note)) between 1 and 300 and public.no_aadhaar_number(write_off_note))),
  -- A written-off claim holds its note, unless an erasure has cleared it.
  add constraint rte_claims_written_off_check check (
    state <> 'written_off' or ((write_off_note is not null or notes_erased_at is not null) and paid_on is null and reference is null and settled_by is not null and settled_at is not null)
  );

-- ---- 2. Receipts: the state pays in parts --------------------------------------------------------------------------

create table rte_claim_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  claim_id uuid not null,
  amount_minor bigint not null check (amount_minor <> 0 and amount_minor between -9999999999 and 9999999999),
  received_on date not null,
  reference text check (reference is null or (char_length(btrim(reference)) between 1 and 80 and public.no_aadhaar_number(reference))),
  reverses uuid,
  reversal_reason text check (reversal_reason in ('typed_wrong', 'recorded_twice', 'not_received')),
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  unique (school_id, receipt_id),
  -- A receipt is reversed once.
  unique (school_id, reverses),
  foreign key (school_id, claim_id) references rte_claims(school_id, claim_id),
  foreign key (school_id, reverses) references rte_claim_receipts(school_id, receipt_id),
  foreign key (school_id, recorded_by) references users(school_id, user_id),
  -- A receipt: money in, with the state's reference. A reversal: minus a receipt, with a reason code.
  check ((reverses is null) = (amount_minor > 0)),
  check ((reverses is null) = (reference is not null)),
  check ((reverses is null) = (reversal_reason is null))
);
create index idx_rte_claim_receipts_claim on rte_claim_receipts (school_id, claim_id, received_on);

-- Every existing paid claim: one receipt of its whole amount, as it was marked paid.
insert into rte_claim_receipts (school_id, claim_id, amount_minor, received_on, reference, recorded_by, recorded_at)
select c.school_id, c.claim_id, c.amount_minor, c.paid_on, c.reference, c.settled_by, c.settled_at
  from rte_claims c
 where c.state = 'paid';

create function public.rte_claim_receipts_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  c record;
  received bigint;
  undone record;
begin
  -- One change of a claim's money at a time (taken again, harmlessly, when the claim's own trigger writes a receipt).
  perform pg_advisory_xact_lock(hashtext('rte_claim:' || new.claim_id::text));
  select x.state, x.amount_minor, x.raised_on into c from rte_claims x where x.school_id = new.school_id and x.claim_id = new.claim_id;
  if not found then
    raise exception 'a receipt is for a claim of the school' using errcode = 'foreign_key_violation';
  end if;
  if c.state <> 'raised' then
    raise exception 'money is recorded or taken back only on a claim still raised' using errcode = 'check_violation';
  end if;
  select coalesce(sum(r.amount_minor), 0) into received from rte_claim_receipts r where r.school_id = new.school_id and r.claim_id = new.claim_id;
  new.recorded_at := now();
  if new.reverses is null then
    if new.received_on < c.raised_on or new.received_on > today then
      raise exception 'a receipt is dated between the day the claim was raised and today' using errcode = 'check_violation';
    end if;
    if received + new.amount_minor > c.amount_minor then
      raise exception 'the receipts never come to more than the claim' using errcode = 'check_violation';
    end if;
    -- The receipt that covers the claim comes from the claim being marked paid (its trigger, one level down).
    if received + new.amount_minor = c.amount_minor and pg_trigger_depth() < 2 then
      raise exception 'the receipt that covers the claim is recorded by marking the claim paid' using errcode = 'check_violation';
    end if;
  else
    select r.claim_id, r.amount_minor, r.reverses into undone from rte_claim_receipts r where r.school_id = new.school_id and r.receipt_id = new.reverses;
    if not found or undone.claim_id <> new.claim_id or undone.reverses is not null or new.amount_minor <> -undone.amount_minor then
      raise exception 'a reversal takes back one receipt of the same claim, to the paisa' using errcode = 'check_violation';
    end if;
    if new.received_on <> today then
      raise exception 'a reversal is dated the day it is made' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.rte_claim_receipts_rules() from public, anon, authenticated, service_role;
create trigger rte_claim_receipts_rules before insert on rte_claim_receipts for each row execute function public.rte_claim_receipts_rules();

revoke all on rte_claim_receipts from public, anon, authenticated, service_role;
revoke all on rte_claim_receipts from app_user, nca_super;
grant select, insert on rte_claim_receipts to app_user;
-- Append-only (scripts/check_append_only_grants.py): said once more in the words the check reads.
revoke update, delete on rte_claim_receipts from anon, authenticated, app_user, nca_super;
alter table rte_claim_receipts enable row level security;
alter table rte_claim_receipts force row level security;
create policy rte_claim_receipts_tenant_isolation on rte_claim_receipts using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy rte_claim_receipts_finance on rte_claim_receipts as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant'));
create policy rte_claim_receipts_recorded_as_self on rte_claim_receipts as restrictive for insert
  with check (recorded_by = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- ---- 3 (continued). The claim's rules --------------------------------------------------------------------------------

create or replace function public.rte_claims_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  starts date;
  ends date;
  received bigint;
  who text := coalesce(current_setting('app.current_role', true), '');
begin
  if tg_op = 'INSERT' then
    if new.state <> 'raised' or new.reopen_reason is not null or new.reopened_by is not null or new.notes_erased_at is not null then
      raise exception 'a claim is raised first, then paid or written off' using errcode = 'check_violation';
    end if;
    select a.start_date, a.end_date into starts, ends from academic_sessions a where a.school_id = new.school_id and a.session_id = new.session_id;
    if new.raised_on > today or new.raised_on < starts then
      raise exception 'a claim is raised on a day of its school year, never after today' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from rte_rates r
       where r.school_id = new.school_id and r.session_id = new.session_id
         and r.typed_at > (select x.typed_at from rte_rates x where x.school_id = new.school_id and x.rate_id = new.rate_id)
    ) then
      raise exception 'a claim takes the year''s rate in force: a newer rate has been typed' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.rte_claim_children() c
       where c.student_id = new.student_id and c.rte_admission and (c.rte_admitted_on is null or c.rte_admitted_on <= ends)
    ) then
      raise exception 'a claim is raised only for a child admitted under RTE by the last day of that year' using errcode = 'check_violation';
    end if;
    -- The class the child was in that year (C223-A answer 4).
    if new.class_source = 'current' then
      if ends < today then
        raise exception 'a claim for a year that is over takes the class the child was in that year' using errcode = 'check_violation';
      end if;
      if not exists (select 1 from public.rte_claim_children() c where c.student_id = new.student_id and c.class_id = new.class_id) then
        raise exception 'a claim for this year takes the child''s class now' using errcode = 'check_violation';
      end if;
    elsif new.class_source = 'dues' then
      if not exists (
        select 1 from fees_ledger l join fee_structures f on f.school_id = l.school_id and f.structure_id = l.structure_id
         where l.school_id = new.school_id and l.student_id = new.student_id and f.session_id = new.session_id and f.class_id = new.class_id
      ) then
        raise exception 'the class of a year''s dues is a class the child was charged in that year' using errcode = 'check_violation';
      end if;
    else
      if who not in ('principal', 'school_admin') then
        raise exception 'only the principal or the school admin chooses the class for a year with no record' using errcode = '42501';
      end if;
      if ends >= today then
        raise exception 'the class is chosen only for a year that is over' using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from fees_ledger l join fee_structures f on f.school_id = l.school_id and f.structure_id = l.structure_id
         where l.school_id = new.school_id and l.student_id = new.student_id and f.session_id = new.session_id
      ) then
        raise exception 'that year''s dues say the child''s class: it is not chosen' using errcode = 'check_violation';
      end if;
    end if;
    new.raised_at := now();
    return new;
  end if;

  -- An erasure (erase_student_rte_notes, never the app's role) clears the notes and nothing else.
  if current_user <> 'app_user' and new.write_off_note is null and new.reopen_reason is null and new.notes_erased_at is not null
     and (new.claim_id, new.school_id, new.student_id, new.session_id, new.class_id, new.class_source, new.rate_id, new.rate_minor, new.fee_minor, new.amount_minor, new.state, new.raised_on, new.raised_by, new.raised_at, new.paid_on, new.reference, new.settled_by, new.settled_at, new.reopened_by, new.reopened_at)
         is not distinct from (old.claim_id, old.school_id, old.student_id, old.session_id, old.class_id, old.class_source, old.rate_id, old.rate_minor, old.fee_minor, old.amount_minor, old.state, old.raised_on, old.raised_by, old.raised_at, old.paid_on, old.reference, old.settled_by, old.settled_at, old.reopened_by, old.reopened_at) then
    return new;
  end if;

  if (new.claim_id, new.school_id, new.student_id, new.session_id, new.class_id, new.class_source, new.rate_id, new.rate_minor, new.fee_minor, new.amount_minor, new.raised_on, new.raised_by, new.raised_at, new.notes_erased_at)
     is distinct from (old.claim_id, old.school_id, old.student_id, old.session_id, old.class_id, old.class_source, old.rate_id, old.rate_minor, old.fee_minor, old.amount_minor, old.raised_on, old.raised_by, old.raised_at, old.notes_erased_at) then
    raise exception 'what a claim is for, and its amount, never change' using errcode = 'check_violation';
  end if;
  if old.state = 'paid' then
    raise exception 'a paid claim stays as it is' using errcode = 'check_violation';
  end if;

  -- Reopened: a written-off claim is raised again, by the principal or the school admin, with a reason.
  if old.state = 'written_off' then
    if new.state <> 'raised' then
      raise exception 'a written-off claim stays as it is, unless it is reopened' using errcode = 'check_violation';
    end if;
    if who not in ('principal', 'school_admin') then
      raise exception 'only the principal or the school admin reopens a written-off claim' using errcode = '42501';
    end if;
    if new.reopen_reason is null or new.reopened_by is null then
      raise exception 'a claim is reopened with a reason, by the person reopening it' using errcode = 'check_violation';
    end if;
    new.write_off_note := null;
    new.settled_by := null;
    new.settled_at := null;
    new.paid_on := null;
    new.reference := null;
    new.reopened_at := now();
    return new;
  end if;

  -- Raised: paid or written off, and nothing else.
  if (new.reopen_reason, new.reopened_by, new.reopened_at) is distinct from (old.reopen_reason, old.reopened_by, old.reopened_at) then
    raise exception 'a claim is reopened only once it is written off' using errcode = 'check_violation';
  end if;
  if new.state = 'raised' then
    raise exception 'a raised claim is paid or written off; nothing else about it changes' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('rte_claim:' || old.claim_id::text));
  if new.state = 'paid' then
    if new.paid_on > today then
      raise exception 'a claim is marked paid on a day that has come' using errcode = 'check_violation';
    end if;
    -- What was still due is the receipt that covers the claim, dated the day it came, with the state's reference.
    select coalesce(sum(r.amount_minor), 0) into received from rte_claim_receipts r where r.school_id = old.school_id and r.claim_id = old.claim_id;
    if received < old.amount_minor then
      insert into rte_claim_receipts (school_id, claim_id, amount_minor, received_on, reference, recorded_by)
      values (old.school_id, old.claim_id, old.amount_minor - received, new.paid_on, new.reference, new.settled_by);
    end if;
    -- Paid on the day the last of the money came.
    new.paid_on := greatest(new.paid_on, (
      select max(r.received_on) from rte_claim_receipts r
       where r.school_id = old.school_id and r.claim_id = old.claim_id and r.reverses is null
         and not exists (select 1 from rte_claim_receipts x where x.school_id = r.school_id and x.reverses = r.receipt_id)
    ));
  elsif new.write_off_note is null then
    raise exception 'a claim is written off with a note' using errcode = 'check_violation';
  end if;
  new.settled_at := now();
  return new;
end $$;
revoke all on function public.rte_claims_rules() from public, anon, authenticated, service_role;

-- In one's own name: settled by oneself, or reopened by oneself (the 10c policy, under its own name, widened to a
-- reopening).
drop policy rte_claims_settled_as_self on rte_claims;
create policy rte_claims_settled_as_self on rte_claims as restrictive for update
  using (true)
  with check (
    (state <> 'raised' and settled_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
    or (state = 'raised' and reopened_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
  );

-- ---- 4. Erasure --------------------------------------------------------------------------------------------------

create function public.erase_student_rte_notes(p_student_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  evidence integer;
  claims integer;
begin
  if school is null or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    raise exception 'an erasure is carried out by the principal or the school admin of the child''s school' using errcode = '42501';
  end if;
  -- The evidence file: its typed notes and its links to the child's documents (which the erasure scrubs).
  delete from rte_evidence where school_id = school and student_id = p_student_id;
  get diagnostics evidence = row_count;
  -- The claims stay, with their money: only the notes about the child go.
  update rte_claims set write_off_note = null, reopen_reason = null, notes_erased_at = now()
   where school_id = school and student_id = p_student_id and (write_off_note is not null or reopen_reason is not null);
  get diagnostics claims = row_count;
  return evidence + claims;
end $$;
revoke all on function public.erase_student_rte_notes(uuid) from public, anon, authenticated, service_role;
grant execute on function public.erase_student_rte_notes(uuid) to app_user;
