-- P7 slice 10c (C223): the RTE claim desk.
--
-- 1. rte_rates: the state's per-child rate for a school year, in paise, with the sentence that says where it
--    comes from (the state's notification), typed by whom and when. A new rate REPLACES the year's rate by being
--    the latest typed: no row is ever changed or removed (select and insert only). The time it was typed is the
--    database's own clock, never the caller's.
-- 2. rte_claims: ONE claim per child per school year. The amount is the lower of the state rate and the child's
--    fee (RTE Act s.12(2)); the database holds:
--      - amount = least(rate, fee), and the rate is a rate row of the same year with that very amount;
--      - no claim without a rate: the rate in force for the year (the latest typed) when it is raised;
--      - a claim only for a child admitted under RTE by the year's last day, raised on a day of its year and
--        never after today in India;
--      - raised, then paid (on a date, with the state's reference) or written off (with a note); nothing else
--        about it ever changes, and it is never removed.
-- 3. rte_evidence: an RTE child's evidence file: one of that child's own captured documents, or a typed note,
--    with its kind (admission order, lottery, income or category proof, other). Never an Aadhaar number (a note
--    with a run of 12 digits is refused) and never a captured Aadhaar card (guardian_id). A wrong one is removed.
--
-- Who reads and writes: the principal, the school admin and the accountant of the school, in their own name. A
-- teacher and the academic coordinator read nothing here. The platform role holds nothing on these tables. The
-- audit rows of the desk ('rte.%') are read by those three roles, or by the person who acted.
--
-- rte_claim_children() gives those three roles the children the desk is about (tagged RTE, or with a claim): the
-- consent gate on students hides a child waiting for consent from the accountant, and the desk needs them, as
-- fee_billing_students() does for billing (C162).
--
-- Read by: src/lib/rte/desk.ts (the desk, its CSV and the My Day card).

create table rte_rates (
  rate_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  session_id uuid not null,
  rate_minor bigint not null check (rate_minor between 1 and 9999999999),
  source text not null check (
    char_length(btrim(source)) between 5 and 300
    and regexp_replace(source, '[[:space:]-]', '', 'g') !~ '^[0-9]{12}$'
  ),
  typed_by uuid not null,
  typed_at timestamptz not null default clock_timestamp(),
  unique (school_id, rate_id),
  unique (school_id, session_id, rate_id, rate_minor),
  unique (school_id, session_id, typed_at),
  foreign key (school_id, session_id) references academic_sessions(school_id, session_id),
  foreign key (school_id, typed_by) references users(school_id, user_id)
);

create table rte_claims (
  claim_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  session_id uuid not null,
  class_id uuid not null,
  rate_id uuid not null,
  rate_minor bigint not null,
  fee_minor bigint not null check (fee_minor between 1 and 9999999999),
  amount_minor bigint not null,
  state text not null default 'raised' check (state in ('raised', 'paid', 'written_off')),
  raised_on date not null,
  raised_by uuid not null,
  raised_at timestamptz not null default now(),
  paid_on date,
  reference text check (
    reference is null or (
      char_length(btrim(reference)) between 1 and 80
      and regexp_replace(reference, '[[:space:]-]', '', 'g') !~ '^[0-9]{12}$'
    )
  ),
  write_off_note text check (
    write_off_note is null or (
      char_length(btrim(write_off_note)) between 1 and 300
      and write_off_note !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)'
    )
  ),
  settled_by uuid,
  settled_at timestamptz,
  unique (school_id, claim_id),
  unique (school_id, student_id, session_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, session_id) references academic_sessions(school_id, session_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, session_id, rate_id, rate_minor) references rte_rates(school_id, session_id, rate_id, rate_minor),
  foreign key (school_id, raised_by) references users(school_id, user_id),
  foreign key (school_id, settled_by) references users(school_id, user_id),
  check (amount_minor = least(rate_minor, fee_minor)),
  check (state <> 'raised' or (paid_on is null and reference is null and write_off_note is null and settled_by is null and settled_at is null)),
  check (state <> 'paid' or (paid_on is not null and paid_on >= raised_on and reference is not null and write_off_note is null and settled_by is not null and settled_at is not null)),
  check (state <> 'written_off' or (write_off_note is not null and paid_on is null and reference is null and settled_by is not null and settled_at is not null))
);
create index idx_rte_claims_state on rte_claims (school_id, state, raised_on);

create table rte_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  kind text not null check (kind in ('admission_order', 'lottery', 'income_or_category', 'other')),
  document_id uuid,
  note text check (
    note is null or (
      char_length(btrim(note)) between 1 and 300
      and note !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)'
    )
  ),
  added_by uuid not null,
  added_at timestamptz not null default now(),
  unique (school_id, evidence_id),
  check (document_id is not null or note is not null),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, document_id) references captured_documents(school_id, document_id),
  foreign key (school_id, added_by) references users(school_id, user_id)
);
create index idx_rte_evidence_child on rte_evidence (school_id, student_id, added_at);

-- The children the desk is about, for the three roles that keep it, in the caller's own school only.
create function public.rte_claim_children()
returns table (student_id uuid, name text, admission_no text, class_id uuid, status text, rte_admission boolean, rte_entry_class text, rte_admitted_on date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.student_id, s.name, s.admission_no, s.class_id, s.status::text, s.rte_admission, s.rte_entry_class, s.rte_admitted_on
    from students s
   where s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant')
     and (s.rte_admission or exists (select 1 from rte_claims c where c.school_id = s.school_id and c.student_id = s.student_id))
$$;
revoke all on function public.rte_claim_children() from public, anon, authenticated, service_role;
grant execute on function public.rte_claim_children() to app_user;

-- A rate's time is the database's clock: the latest typed is the year's rate, and nobody types one into the past.
create function public.rte_rates_typed_now() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.typed_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.rte_rates_typed_now() from public, anon, authenticated, service_role;
create trigger rte_rates_typed_now before insert on rte_rates for each row execute function public.rte_rates_typed_now();

create function public.rte_claims_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  starts date;
  ends date;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'raised' then
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
    new.raised_at := now();
    return new;
  end if;
  if (new.claim_id, new.school_id, new.student_id, new.session_id, new.class_id, new.rate_id, new.rate_minor, new.fee_minor, new.amount_minor, new.raised_on, new.raised_by, new.raised_at)
     is distinct from (old.claim_id, old.school_id, old.student_id, old.session_id, old.class_id, old.rate_id, old.rate_minor, old.fee_minor, old.amount_minor, old.raised_on, old.raised_by, old.raised_at) then
    raise exception 'what a claim is for, and its amount, never change' using errcode = 'check_violation';
  end if;
  if old.state <> 'raised' then
    raise exception 'a paid or written-off claim stays as it is' using errcode = 'check_violation';
  end if;
  if new.state = 'paid' and new.paid_on > today then
    raise exception 'a claim is marked paid on a day that has come' using errcode = 'check_violation';
  end if;
  if new.state <> 'raised' then
    new.settled_at := now();
  end if;
  return new;
end $$;
revoke all on function public.rte_claims_rules() from public, anon, authenticated, service_role;
create trigger rte_claims_rules before insert or update on rte_claims for each row execute function public.rte_claims_rules();

create function public.rte_evidence_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  owner uuid;
  kind_of text;
  path text;
begin
  if not exists (select 1 from public.rte_claim_children() c where c.student_id = new.student_id and c.rte_admission) then
    raise exception 'evidence is kept for a child admitted under RTE' using errcode = 'check_violation';
  end if;
  if new.document_id is not null then
    select d.student_id, d.doc_type, d.storage_path into owner, kind_of, path from captured_documents d where d.school_id = new.school_id and d.document_id = new.document_id;
    if owner is distinct from new.student_id or kind_of = 'guardian_id' or path like 'discarded:%' then
      raise exception 'evidence is one of this child''s own captured documents, never an Aadhaar card' using errcode = 'check_violation';
    end if;
  end if;
  new.added_at := now();
  return new;
end $$;
revoke all on function public.rte_evidence_rules() from public, anon, authenticated, service_role;
create trigger rte_evidence_rules before insert on rte_evidence for each row execute function public.rte_evidence_rules();

revoke all on rte_rates, rte_claims, rte_evidence from public, anon, authenticated, service_role;
revoke all on rte_rates, rte_claims, rte_evidence from app_user, nca_super;
grant select, insert on rte_rates to app_user;
grant select, insert, update on rte_claims to app_user;
grant select, insert, delete on rte_evidence to app_user;

alter table rte_rates enable row level security;
alter table rte_rates force row level security;
alter table rte_claims enable row level security;
alter table rte_claims force row level security;
alter table rte_evidence enable row level security;
alter table rte_evidence force row level security;

create policy rte_rates_tenant_isolation on rte_rates using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy rte_claims_tenant_isolation on rte_claims using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy rte_evidence_tenant_isolation on rte_evidence using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- The office and the accountant only: a teacher and the academic coordinator read and write nothing here.
create policy rte_rates_finance on rte_rates as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant'));
create policy rte_claims_finance on rte_claims as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant'));
create policy rte_evidence_finance on rte_evidence as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant'));

-- In one's own name.
create policy rte_rates_typed_as_self on rte_rates as restrictive for insert
  with check (typed_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy rte_claims_raised_as_self on rte_claims as restrictive for insert
  with check (raised_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy rte_claims_settled_as_self on rte_claims as restrictive for update
  using (true)
  with check (settled_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy rte_evidence_added_as_self on rte_evidence as restrictive for insert
  with check (added_by = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- The desk's audit rows name children and amounts: the three roles, or the person who acted.
create policy audit_rte_rows_finance_or_actor on audit_log as restrictive for select
  using (
    split_part(event_action, '.', 1) <> 'rte'
    or current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );
