-- C232 part A: documents and certificates close-out (docs/28 row 10e; the supervisor's answers in C230-A).
--
-- 1. WAIVED FEES ARE NOT OWED (a bug in C228). public.student_owed_minor(school, student) is the ONE sum of what a
--    child owes, in the fees summary's own shape (src/lib/fees/overdue.ts, ENTRIES_WITH_PAID): a fee stored as waived
--    owes nothing, a fee stored as paid owes nothing, every other fee owes its amount less what came in for it (never
--    below nothing). The certificate trigger and feeClearance() (src/lib/fees/clearance.ts) both call it, so they can
--    never say different things. Before this, both counted a waived fee's amount as owed today.
-- 2. FEE CLEARANCE PER CERTIFICATE TYPE (C230-A: the founder decides with the lawyer whether a TC may be held for fees;
--    until then the school switches it knowingly). A school setting of the Documents module (school_settings,
--    module 'documents', keys clearance_transfer, clearance_bonafide, clearance_character, clearance_study; the
--    settings engine writes them, audited). public.certificate_needs_clearance(school, type) reads the school's stored
--    value and falls back to the same defaults as src/lib/frameworks/settings-schemas.ts: OFF for the transfer
--    certificate, ON for the other three. A certificate issued with the clearance off records clearance
--    'not_required' (a new value of the check) with what was owed then; no waiver is asked for or kept.
-- 3. CERTIFICATE NUMBERS: a prefix and a starting number per school, set once. certificate_numbering holds the
--    school's choice (no row: no prefix, from 1). The number is no longer a generated column: it is stored on each row
--    when the certificate is issued (the trigger), so every certificate already issued keeps its number and its form
--    exactly. The series per type stays gap-free under the advisory lock, numbers never shrink (the next is one more
--    than the last of the type, or the starting number when that is higher) and stay unique per school (the index
--    certificates_one_number, kept). Each certificate records the numbering it was issued under
--    (numbering_revision); the numbering can be changed only while no certificate carries its revision: the database
--    refuses a change after the first certificate issued under it.
-- 4. THE SIGNATURE OF THE PERSON WHO APPROVED IT. Each certificate stores who signed it (signed_by), decided here,
--    never by the caller: the principal who issues it, or a school admin the principal has named as a signatory
--    (certificate_signatories); anyone else's certificate is unsigned and carries a line for the principal's hand
--    signature. The name and title printed under the line are set here from the same decision. Each signer's
--    signature image is their own row of certificate_signatures (written only by that person, and only while they may
--    sign); public.certificate_signature_for(ids) is where the database chooses the mark: the signature of the
--    certificate's own signer, or none. The principal's signature already kept in certificate_marks is copied there;
--    the old row stays for main's code until the new code removes it on the next change.
--
-- SAFE WHILE MAIN'S CODE RUNS ON THE TEST DATABASE: every change is additive or keeps main's calls working.
-- Main inserts a certificate without a number (the trigger now writes it), reads number, clearance and owed_minor back
-- (still there), reads and writes certificate_marks (unchanged; the signature row is copied, not moved) and never
-- names the new columns. Its waiver for a child held by the old rule is accepted and not kept when the clearance is
-- off (main shows such a certificate as "nothing owed" until this PR's screen is deployed). The new functions are
-- not called by main.

-- 1. -----------------------------------------------------------------------------------------------------------------
create function public.student_owed_minor(p_school_id uuid, p_student_id uuid) returns bigint
language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(case when l.status::text in ('waived', 'paid') then 0
                           else l.amount_minor - least(l.amount_minor, greatest(0, coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0))) end), 0)::bigint
    from fees_ledger l
   where l.school_id = p_school_id and l.student_id = p_student_id
$$;
revoke all on function public.student_owed_minor(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.student_owed_minor(uuid, uuid) to app_user;

-- 2. -----------------------------------------------------------------------------------------------------------------
create function public.certificate_needs_clearance(p_school_id uuid, p_type text) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select case when jsonb_typeof(s.setting_values -> ('clearance_' || p_type)) = 'boolean' then (s.setting_values ->> ('clearance_' || p_type))::boolean end
       from school_settings s where s.school_id = p_school_id and s.module_id = 'documents'),
    p_type <> 'transfer')
$$;
revoke all on function public.certificate_needs_clearance(uuid, text) from public, anon, authenticated, service_role;

alter table certificates_issued drop constraint certificates_issued_clearance_check;
alter table certificates_issued add constraint certificates_issued_clearance_check check (clearance in ('nothing_owed', 'fee_override', 'waived', 'not_required'));

-- 3. -----------------------------------------------------------------------------------------------------------------
create table certificate_numbering (
  school_id uuid primary key references schools(school_id),
  prefix text check (prefix is null or (prefix ~ '^[A-Za-z0-9-]{1,12}$' and public.no_aadhaar_number(prefix))),
  start_at integer not null check (start_at between 1 and 999999),
  revision integer not null default 1 check (revision >= 1),
  set_by uuid not null,
  set_at timestamptz not null default now(),
  foreign key (school_id, set_by) references users(school_id, user_id)
);

-- The printed number: the prefix (if any), the type's letters, and the sequence with at least four digits. lpad never
-- cuts a long number (TC/10000 after TC/9999). The twin of certificateNumber() in src/lib/documents/certificate-rules.ts.
create function public.certificate_number(p_prefix text, p_type text, p_seq integer) returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_prefix || '/', '')
         || (case p_type when 'transfer' then 'TC' when 'bonafide' then 'BC' when 'character' then 'CC' else 'SC' end)
         || '/' || lpad(p_seq::text, greatest(4, length(p_seq::text)), '0')
$$;
revoke all on function public.certificate_number(text, text, integer) from public, anon, authenticated, service_role;

-- The number is kept as it was given: no longer computed again from the type and the sequence.
alter table certificates_issued alter column number drop expression;
alter table certificates_issued alter column number set not null;
alter table certificates_issued add constraint certificates_issued_number_shape check (number ~ '^([A-Za-z0-9-]{1,12}/)?(TC|BC|CC|SC)/[0-9]{4,}$');
alter table certificates_issued add column numbering_revision integer check (numbering_revision is null or numbering_revision >= 1);

-- The numbering is set by the principal or the school admin, in their own name, and changed only while no certificate
-- has been issued under it. The same lock as issuing (shared there, exclusive here), so a change and an issue never
-- cross: whichever comes second sees the first.
create function public.certificate_numbering_set() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  role_now text := coalesce(current_setting('app.current_role', true), '');
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
begin
  if role_now not in ('principal', 'school_admin') or me is null or new.set_by is distinct from me
     or new.school_id is distinct from nullif(current_setting('app.current_tenant_id', true), '')::uuid then
    raise exception 'the numbering is set by the principal or the school admin of the school, in their own name' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('certificate_numbering:' || new.school_id::text, 0));
  if tg_op = 'UPDATE' then
    if new.school_id is distinct from old.school_id then
      raise exception 'a school''s numbering stays its own' using errcode = 'check_violation';
    end if;
    if exists (select 1 from certificates_issued c where c.school_id = old.school_id and c.numbering_revision = old.revision) then
      raise exception 'the numbering is fixed: a certificate has been issued under it' using errcode = 'check_violation';
    end if;
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;
  new.set_at := now();
  return new;
end $$;
revoke all on function public.certificate_numbering_set() from public, anon, authenticated, service_role;
create trigger certificate_numbering_set before insert or update on certificate_numbering for each row execute function public.certificate_numbering_set();

-- 4. -----------------------------------------------------------------------------------------------------------------
create table certificate_signatories (
  school_id uuid not null references schools(school_id),
  user_id uuid not null,
  named_by uuid not null,
  named_at timestamptz not null default now(),
  primary key (school_id, user_id),
  foreign key (school_id, user_id) references users(school_id, user_id),
  foreign key (school_id, named_by) references users(school_id, user_id)
);

create table certificate_signatures (
  school_id uuid not null references schools(school_id),
  user_id uuid not null,
  storage_key text not null check (storage_key like school_id::text || '/certificate-marks/signature/%' and storage_key !~ '\.\.'),
  size_bytes integer not null check (size_bytes between 1 and 1000000),
  aspect numeric not null check (aspect > 0.05 and aspect < 20),
  uploaded_at timestamptz not null default now(),
  primary key (school_id, user_id),
  unique (storage_key),
  foreign key (school_id, user_id) references users(school_id, user_id)
);

-- The principal's signature already kept is theirs (the row stays in certificate_marks for main's code).
insert into certificate_signatures (school_id, user_id, storage_key, size_bytes, aspect, uploaded_at)
select m.school_id, m.uploaded_by, m.storage_key, m.size_bytes, m.aspect, m.uploaded_at
  from certificate_marks m join users u on u.school_id = m.school_id and u.user_id = m.uploaded_by
 where m.kind = 'signature' and u.role::text = 'principal'
on conflict do nothing;

-- Naming: the principal names a school admin of the school, in their own name. Un-naming takes the admin's signature
-- with it (the caller removes the file): an admin who may no longer sign has no signature to draw.
create function public.certificate_signatories_rules() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  role_now text := coalesce(current_setting('app.current_role', true), '');
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
begin
  if tg_op = 'DELETE' then
    delete from certificate_signatures g where g.school_id = old.school_id and g.user_id = old.user_id;
    return old;
  end if;
  if role_now <> 'principal' or me is null or new.named_by is distinct from me
     or new.school_id is distinct from nullif(current_setting('app.current_tenant_id', true), '')::uuid then
    raise exception 'only the principal names who signs certificates, in their own name' using errcode = '42501';
  end if;
  if not exists (select 1 from users u where u.school_id = new.school_id and u.user_id = new.user_id and u.role::text = 'school_admin' and u.is_active) then
    raise exception 'a signatory is a school admin of the school' using errcode = 'check_violation';
  end if;
  new.named_at := now();
  return new;
end $$;
revoke all on function public.certificate_signatories_rules() from public, anon, authenticated, service_role;
create trigger certificate_signatories_named before insert on certificate_signatories for each row execute function public.certificate_signatories_rules();
create trigger certificate_signatories_unnamed after delete on certificate_signatories for each row execute function public.certificate_signatories_rules();
create function public.certificate_signatories_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'a signatory is named or un-named, never changed' using errcode = 'check_violation';
end $$;
revoke all on function public.certificate_signatories_fixed() from public, anon, authenticated, service_role;
create trigger certificate_signatories_fixed before update on certificate_signatories for each row execute function public.certificate_signatories_fixed();

-- A signature is kept by its own person, and only while they may sign: the principal, or a named school admin.
create function public.certificate_signatures_rules() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  role_now text := coalesce(current_setting('app.current_role', true), '');
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
begin
  if tg_op = 'UPDATE' and (new.school_id, new.user_id) is distinct from (old.school_id, old.user_id) then
    raise exception 'a signature is replaced in its own place' using errcode = 'check_violation';
  end if;
  if me is null or new.user_id is distinct from me
     or new.school_id is distinct from nullif(current_setting('app.current_tenant_id', true), '')::uuid then
    raise exception 'a signature is kept by its own person' using errcode = '42501';
  end if;
  if role_now <> 'principal' and not exists (select 1 from certificate_signatories g where g.school_id = new.school_id and g.user_id = me) then
    raise exception 'only the principal, or a school admin the principal names, signs certificates' using errcode = '42501';
  end if;
  new.uploaded_at := now();
  return new;
end $$;
revoke all on function public.certificate_signatures_rules() from public, anon, authenticated, service_role;
create trigger certificate_signatures_rules before insert or update on certificate_signatures for each row execute function public.certificate_signatures_rules();

alter table certificates_issued add column signed_by uuid;
alter table certificates_issued add constraint certificates_issued_signed_by_fkey foreign key (school_id, signed_by) references users(school_id, user_id);

-- A certificate the principal issued before this carries the principal's signature, as it did when printed; one the
-- school admin issued is now unsigned (a line for the principal's hand). Who issued it is read from its audit row.
alter table certificates_issued disable trigger certificates_issued_update;
update certificates_issued c set signed_by = c.issued_by
 where c.signed_by is null
   and exists (select 1 from audit_log a where a.event_action = 'certificate.issued' and a.target_id = c.certificate_id::text and a.actor_role::text = 'principal');
alter table certificates_issued enable trigger certificates_issued_update;

-- Where the database chooses the signature drawn on a certificate: its own signer's, or none. Row level security
-- applies (the caller's school, the office only).
create function public.certificate_signature_for(p_certificate_ids uuid[])
returns table (certificate_id uuid, user_id uuid, storage_key text, aspect numeric)
language sql stable set search_path = public, pg_temp as $$
  select c.certificate_id, g.user_id, g.storage_key, g.aspect
    from certificates_issued c join certificate_signatures g on g.school_id = c.school_id and g.user_id = c.signed_by
   where c.certificate_id = any(p_certificate_ids) and c.withdrawn_at is null and c.erased_at is null
$$;
revoke all on function public.certificate_signature_for(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.certificate_signature_for(uuid[]) to app_user;

-- 1 to 4 in the issuing trigger -------------------------------------------------------------------------------------
create or replace function public.certificates_issued_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  role_now text := coalesce(current_setting('app.current_role', true), '');
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  owed bigint;
  covered bigint;
  n_prefix text;
  n_start integer;
  n_revision integer;
  signer text;
begin
  if role_now not in ('principal', 'school_admin') or me is null or new.issued_by is distinct from me
     or new.school_id is distinct from nullif(current_setting('app.current_tenant_id', true), '')::uuid then
    raise exception 'a certificate is issued by the principal or the school admin of the school, in their own name' using errcode = '42501';
  end if;
  -- The class is the child's class in the school's record when it is issued.
  select s.class_id into new.class_id from students s where s.school_id = new.school_id and s.student_id = new.student_id;
  if not found then
    raise exception 'a certificate is for a child of the school' using errcode = 'foreign_key_violation';
  end if;
  new.issued_on := (now() at time zone 'Asia/Kolkata')::date;
  new.issued_at := now();
  new.verify_token := public.certificate_random_key();
  new.withdrawn_at := null;
  new.withdrawn_by := null;
  new.withdraw_reason := null;
  new.erased_at := null;

  -- Who signs: the principal who issues it, or a school admin the principal named; otherwise nobody (a line for the
  -- principal's hand). The name and title printed under the line follow the same decision.
  new.signed_by := case when role_now = 'principal' then me
                        when exists (select 1 from certificate_signatories g where g.school_id = new.school_id and g.user_id = me) then me end;
  new.printed := coalesce(new.printed, '{}'::jsonb) - 'signName' - 'signTitle';
  if new.signed_by is not null then
    select left(btrim(u.display_name), 60) into signer from users u where u.school_id = new.school_id and u.user_id = new.signed_by;
    if coalesce(signer, '') <> '' then new.printed := new.printed || jsonb_build_object('signName', signer); end if;
    new.printed := new.printed || jsonb_build_object('signTitle', case when role_now = 'principal' then 'Principal' else 'School Administrator' end);
  else
    new.printed := new.printed || jsonb_build_object('signTitle', 'Principal');
  end if;
  if exists (select 1 from jsonb_each(new.printed) e where jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 300 or not public.no_aadhaar_number(e.value #>> '{}')) then
    raise exception 'what a certificate prints is short words and dates, and never an Aadhaar number' using errcode = 'check_violation';
  end if;

  -- The fee clearance, when the school asks for it for this type: nothing owed (student_owed_minor, the same sum as
  -- feeClearance()), or the counter's latest override covers it, or the principal's waiver with a reason.
  owed := public.student_owed_minor(new.school_id, new.student_id);
  if not public.certificate_needs_clearance(new.school_id, new.cert_type) then
    -- Not asked for this type: issued, with what was owed then; a waiver the clearance does not need is not kept.
    new.clearance := 'not_required';
    new.owed_minor := greatest(owed, 0);
    new.waiver_reason := null;
    new.waived_by := null;
  else
    select o.owed_minor into covered from fee_clearance_overrides o
     where o.school_id = new.school_id and o.student_id = new.student_id order by o.decided_at desc limit 1;
    if owed <= 0 or (covered is not null and covered >= owed) then
      if new.waiver_reason is not null then
        raise exception 'the fee clearance is given, so there is nothing to waive' using errcode = 'check_violation';
      end if;
      new.clearance := case when owed <= 0 then 'nothing_owed' else 'fee_override' end;
      new.owed_minor := greatest(owed, 0);
      new.waived_by := null;
    else
      if new.waiver_reason is null then
        raise exception 'fees are owed: a certificate waits for the fee clearance, or the principal''s waiver with a reason' using errcode = 'check_violation';
      end if;
      if role_now <> 'principal' then
        raise exception 'only the principal waives the fee clearance' using errcode = '42501';
      end if;
      new.clearance := 'waived';
      new.owed_minor := owed;
      new.waived_by := me;
    end if;
  end if;

  -- The number: the school's numbering (read under the numbering lock, shared: a change waits for this issue, and this
  -- issue waits for a change), then the next of the school's own series for the type, under a lock held to the end of
  -- the transaction. Never below the starting number, never below one more than the last.
  perform pg_advisory_xact_lock_shared(hashtextextended('certificate_numbering:' || new.school_id::text, 0));
  select n.prefix, n.start_at, n.revision into n_prefix, n_start, n_revision from certificate_numbering n where n.school_id = new.school_id;
  perform pg_advisory_xact_lock(hashtextextended('certificates_issued:' || new.school_id::text || ':' || new.cert_type, 0));
  select greatest(coalesce(max(c.seq), 0) + 1, coalesce(n_start, 1)) into new.seq
    from certificates_issued c where c.school_id = new.school_id and c.cert_type = new.cert_type;
  new.numbering_revision := n_revision;
  new.number := public.certificate_number(n_prefix, new.cert_type, new.seq);
  return new;
end $$;
revoke all on function public.certificates_issued_insert() from public, anon, authenticated, service_role;

-- Nothing about a certificate changes after it is issued (now also its number, its numbering and who signed it),
-- except the principal's withdrawal and a child's erasure, as before.
create or replace function public.certificates_issued_update() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- A child's erasure (erase_student_certificates, never the app's role) blanks the words and nothing else.
  if current_user <> 'app_user' and old.erased_at is null and new.erased_at is not null
     and new.printed = '{}'::jsonb and new.purpose is null and new.waiver_reason is null and new.withdraw_reason is null
     and (new.certificate_id, new.school_id, new.cert_type, new.seq, new.number, new.numbering_revision, new.signed_by, new.student_id, new.class_id, new.issued_on, new.issued_by, new.issued_at, new.owed_minor, new.clearance, new.waived_by, new.verify_token, new.withdrawn_at, new.withdrawn_by)
         is not distinct from (old.certificate_id, old.school_id, old.cert_type, old.seq, old.number, old.numbering_revision, old.signed_by, old.student_id, old.class_id, old.issued_on, old.issued_by, old.issued_at, old.owed_minor, old.clearance, old.waived_by, old.verify_token, old.withdrawn_at, old.withdrawn_by) then
    return new;
  end if;
  if old.withdrawn_at is not null then
    raise exception 'a withdrawn certificate stays withdrawn, with its number' using errcode = 'check_violation';
  end if;
  if (new.certificate_id, new.school_id, new.cert_type, new.seq, new.number, new.numbering_revision, new.signed_by, new.student_id, new.class_id, new.issued_on, new.issued_by, new.issued_at, new.purpose, new.printed, new.owed_minor, new.clearance, new.waiver_reason, new.waived_by, new.verify_token, new.erased_at)
     is distinct from (old.certificate_id, old.school_id, old.cert_type, old.seq, old.number, old.numbering_revision, old.signed_by, old.student_id, old.class_id, old.issued_on, old.issued_by, old.issued_at, old.purpose, old.printed, old.owed_minor, old.clearance, old.waiver_reason, old.waived_by, old.verify_token, old.erased_at) then
    raise exception 'a certificate never changes after it is issued: the principal withdraws it, with a reason' using errcode = 'check_violation';
  end if;
  -- The reason is kept, except on a certificate a child's erasure has blanked (it would be words about the child).
  if new.withdrawn_at is null or (new.withdraw_reason is null and old.erased_at is null) then
    raise exception 'a certificate is withdrawn with a reason' using errcode = 'check_violation';
  end if;
  if coalesce(current_setting('app.current_role', true), '') <> 'principal'
     or new.withdrawn_by is distinct from nullif(current_setting('app.current_user_id', true), '')::uuid then
    raise exception 'only the principal withdraws a certificate, in their own name' using errcode = '42501';
  end if;
  new.withdrawn_at := now();
  return new;
end $$;
revoke all on function public.certificates_issued_update() from public, anon, authenticated, service_role;

-- Grants and row level security on the new tables ------------------------------------------------------------------
revoke all on certificate_numbering, certificate_signatories, certificate_signatures from public, anon, authenticated, service_role;
revoke all on certificate_numbering, certificate_signatories, certificate_signatures from app_user, nca_super;
grant select, insert, update on certificate_numbering to app_user;
grant select, insert, delete on certificate_signatories to app_user;
grant select, insert, update, delete on certificate_signatures to app_user;

alter table certificate_numbering enable row level security;
alter table certificate_numbering force row level security;
alter table certificate_signatories enable row level security;
alter table certificate_signatories force row level security;
alter table certificate_signatures enable row level security;
alter table certificate_signatures force row level security;

create policy certificate_numbering_tenant_isolation on certificate_numbering using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy certificate_signatories_tenant_isolation on certificate_signatories using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy certificate_signatures_tenant_isolation on certificate_signatures using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- The office only: a teacher, the academic coordinator and the accountant read and write nothing here.
create policy certificate_numbering_office on certificate_numbering as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy certificate_signatories_office on certificate_signatories as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy certificate_signatures_office on certificate_signatures as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));

-- In one's own name; the principal alone names and un-names a signatory; a signature is its own person's (the
-- principal's un-naming takes the admin's with it).
create policy certificate_numbering_set_as_self on certificate_numbering as restrictive for insert
  with check (set_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_numbering_changed_as_self on certificate_numbering as restrictive for update
  with check (set_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_signatories_named_by_principal on certificate_signatories as restrictive for insert
  with check (current_setting('app.current_role', true) = 'principal' and named_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_signatories_unnamed_by_principal on certificate_signatories as restrictive for delete
  using (current_setting('app.current_role', true) = 'principal');
create policy certificate_signatures_kept_as_self on certificate_signatures as restrictive for insert
  with check (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_signatures_replaced_as_self on certificate_signatures as restrictive for update
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_signatures_removed on certificate_signatures as restrictive for delete
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid or current_setting('app.current_role', true) = 'principal');
