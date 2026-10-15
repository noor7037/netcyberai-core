-- P7 slice 10e (C228): documents and certificates from the student record.
--
-- 1. certificates_issued: the issue register. One row per certificate the school issues: a transfer certificate
--    (TC), a bonafide, a character or a study certificate, for one child, with the words it prints (`printed`, the
--    values of the website studio's own fields, src/lib/certificates/definitions.ts, composed from the record and
--    from what the office typed). The database holds:
--      - the NUMBER: per school and per type, in sequence from 1 with no gap (TC/0001, TC/0002, ... and BC/0001,
--        ... apart), given by the database under a lock, never by the caller. Nothing is ever deleted (no DELETE is
--        granted), so a number is never reused, and a withdrawn certificate keeps its number;
--      - the FEE CLEARANCE: a certificate is issued only when the child owes nothing (fees_ledger less payments, the
--        same sum as feeClearance() in src/lib/fees/clearance.ts), or the fee counter's own override covers what is
--        owed (fee_clearance_overrides, C179), or the PRINCIPAL waives it for this certificate with a reason. How it
--        passed is kept (`clearance`) with what was owed then;
--      - NO DUPLICATE: at most one live TC per child; at most one live bonafide, character or study certificate per
--        child, type, purpose and day (an erased row is out of this rule);
--      - the issue day is India's today; the QR token is 24 random bytes made here (32 characters), never the number
--        or an id, and nobody chooses it;
--      - nothing about a certificate changes after it is issued, except: the principal withdraws it, once, with a
--        reason; and a child's erasure blanks what it printed and the words typed about it (below).
-- 2. certificate_copies: the PDF of a certificate as sent to the family (through the send-gate only). The file is in
--    the app's storage (FileStorage, the documents bucket) under the school's own prefix; the row holds where, and a
--    random key (made here) for the link in the message. A withdrawn or erased certificate's link answers nothing, nor
--    does one sent more than 30 days ago.
-- 3. certificate_marks: the school's seal and the principal's signature (one of each), PNG files in the app's
--    storage, drawn on every certificate. The principal uploads or removes them; the school admin reads them to draw.
-- 4. public.certificate_verify(token): the public QR page's ONLY read. One token in; out: valid or withdrawn, the type,
--    the school's name, the issue day, the number and the least of the name a verifier needs (the first name and the
--    initial of the surname; nothing after an erasure). Nothing else: no date of birth, class, parent or fee.
-- 5. public.certificate_copy(key): the family's link, the storage path of a live certificate's copy, and its number.
-- 6. public.erase_student_certificates(student): a child's erasure (src/lib/consent/dsr.ts): the register keeps each
--    number, type, day, issuer, clearance and state (valid or withdrawn, still answered at the QR page without a
--    name); what was printed (names, date of birth, parents, class), the purpose, the waiver's and the withdrawal's
--    words are blanked; the family copies are deleted (their files are removed by the caller).
--
-- Who reads and writes: the principal and the school admin of the school, in their own name. Only the principal
-- waives the fee clearance, withdraws a certificate, and uploads or removes the seal and the signature. A teacher,
-- the academic coordinator and the accountant read nothing here (the accountant keeps the fee clearance at the fee
-- counter, as before). The platform role holds nothing on these tables; it runs the two public functions. Audit rows
-- 'certificate.%' are read by the office only and hold ids, codes, numbers and booleans, never a name or a reason.
--
-- Read by: src/lib/documents/certificates.ts (the screen, the register, the bulk issue, the send), the verification
-- page src/app/verify/[token]/page.tsx and the copy link src/app/api/public/certificates/copy/[key]/route.ts.

create table certificates_issued (
  certificate_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  cert_type text not null check (cert_type in ('transfer', 'bonafide', 'character', 'study')),
  seq integer not null check (seq >= 1),
  number text generated always as (
    (case cert_type when 'transfer' then 'TC' when 'bonafide' then 'BC' when 'character' then 'CC' else 'SC' end) || '/' || lpad(seq::text, greatest(4, length(seq::text)), '0')
  ) stored,
  student_id uuid not null,
  class_id uuid,
  issued_on date not null,
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  purpose text check (purpose is null or (char_length(btrim(purpose)) between 1 and 90 and public.no_aadhaar_number(purpose))),
  printed jsonb not null check (jsonb_typeof(printed) = 'object'),
  owed_minor bigint not null default 0 check (owed_minor >= 0),
  clearance text not null check (clearance in ('nothing_owed', 'fee_override', 'waived')),
  waiver_reason text check (waiver_reason is null or (char_length(btrim(waiver_reason)) between 1 and 300 and public.no_aadhaar_number(waiver_reason))),
  waived_by uuid,
  verify_token text not null check (verify_token ~ '^[A-Za-z0-9_-]{32}$'),
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdraw_reason text check (withdraw_reason is null or (char_length(btrim(withdraw_reason)) between 1 and 300 and public.no_aadhaar_number(withdraw_reason))),
  erased_at timestamptz,
  unique (school_id, certificate_id),
  unique (school_id, cert_type, seq),
  unique (verify_token),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, issued_by) references users(school_id, user_id),
  foreign key (school_id, waived_by) references users(school_id, user_id),
  foreign key (school_id, withdrawn_by) references users(school_id, user_id),
  -- A TC has no purpose; a bonafide or a study certificate always has one (until an erasure blanks it).
  check (cert_type <> 'transfer' or purpose is null),
  check (cert_type not in ('bonafide', 'study') or purpose is not null or erased_at is not null),
  -- Waived by the principal, with a reason; otherwise no waiver at all.
  check (clearance <> 'waived' or (waived_by is not null and owed_minor > 0 and (waiver_reason is not null or erased_at is not null))),
  check (clearance = 'waived' or (waived_by is null and waiver_reason is null)),
  check (clearance <> 'nothing_owed' or owed_minor = 0),
  -- Withdrawn once, by someone, with a reason (until an erasure blanks the words).
  check ((withdrawn_at is null) = (withdrawn_by is null)),
  check (withdrawn_at is not null or withdraw_reason is null),
  check (withdrawn_at is null or withdraw_reason is not null or erased_at is not null),
  check (erased_at is null or (printed = '{}'::jsonb and purpose is null and waiver_reason is null and withdraw_reason is null))
);
-- A number is printed once in a school: lpad never cuts a long number (TC/10000 after TC/9999), and this backs it.
create unique index certificates_one_number on certificates_issued (school_id, number);
create unique index certificates_one_live_tc on certificates_issued (school_id, student_id)
  where cert_type = 'transfer' and withdrawn_at is null and erased_at is null;
create unique index certificates_one_live_per_purpose_and_day on certificates_issued (school_id, student_id, cert_type, lower(btrim(coalesce(purpose, ''))), issued_on)
  where cert_type <> 'transfer' and withdrawn_at is null and erased_at is null;
create index idx_certificates_issued_register on certificates_issued (school_id, issued_at desc);
create index idx_certificates_issued_child on certificates_issued (school_id, student_id);

create table certificate_copies (
  copy_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  certificate_id uuid not null,
  storage_key text not null check (storage_key like school_id::text || '/certificates/%' and storage_key !~ '\.\.'),
  size_bytes integer not null check (size_bytes between 1 and 4000000),
  copy_key text not null check (copy_key ~ '^[A-Za-z0-9_-]{32}$'),
  made_by uuid not null,
  made_at timestamptz not null default now(),
  unique (school_id, copy_id),
  unique (copy_key),
  unique (storage_key),
  foreign key (school_id, certificate_id) references certificates_issued(school_id, certificate_id),
  foreign key (school_id, made_by) references users(school_id, user_id)
);
create index idx_certificate_copies_certificate on certificate_copies (school_id, certificate_id);

create table certificate_marks (
  school_id uuid not null references schools(school_id),
  kind text not null check (kind in ('seal', 'signature')),
  storage_key text not null check (storage_key like school_id::text || '/certificate-marks/%' and storage_key !~ '\.\.'),
  size_bytes integer not null check (size_bytes between 1 and 1000000),
  aspect numeric not null check (aspect > 0.05 and aspect < 20),
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  primary key (school_id, kind),
  unique (storage_key),
  foreign key (school_id, uploaded_by) references users(school_id, user_id)
);

-- 24 random bytes as 32 URL-safe characters: two random UUIDs (244 random bits), hashed and cut to 192 bits.
create function public.certificate_random_key() returns text
language sql volatile set search_path = public, pg_temp as $$
  select translate(encode(substring(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')) from 1 for 24), 'base64'), '+/', '-_')
$$;
revoke all on function public.certificate_random_key() from public, anon, authenticated, service_role;

-- The least of a name a verifier needs to match the paper: the first word and the initial of the last ("Aarav K.").
-- One word is shown as it is. Nothing for an empty name.
create function public.certificate_name_shown(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when w is null then null
    when array_length(w, 1) = 1 then w[1]
    else w[1] || ' ' || upper(left(w[array_length(w, 1)], 1)) || '.'
  end
  from (select case when nullif(btrim(coalesce(p, '')), '') is null then null else regexp_split_to_array(btrim(p), '\s+') end as w) x
$$;
revoke all on function public.certificate_name_shown(text) from public, anon, authenticated, service_role;
grant execute on function public.certificate_name_shown(text) to app_user;

-- Issuing: who, the day, the token, the clearance and the number, all decided here. A definer function, so the sum of
-- what is owed and the numbering read every row of the school whoever issues.
create function public.certificates_issued_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  role_now text := coalesce(current_setting('app.current_role', true), '');
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  owed bigint;
  covered bigint;
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
  if exists (select 1 from jsonb_each(new.printed) e where jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 300 or not public.no_aadhaar_number(e.value #>> '{}')) then
    raise exception 'what a certificate prints is short words and dates, and never an Aadhaar number' using errcode = 'check_violation';
  end if;
  new.issued_on := (now() at time zone 'Asia/Kolkata')::date;
  new.issued_at := now();
  new.verify_token := public.certificate_random_key();
  new.withdrawn_at := null;
  new.withdrawn_by := null;
  new.withdraw_reason := null;
  new.erased_at := null;

  -- The fee clearance: the same sum as feeClearance() in src/lib/fees/clearance.ts, and the counter's latest override.
  select coalesce(sum(l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0)), 0)
    into owed
    from fees_ledger l where l.school_id = new.school_id and l.student_id = new.student_id;
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

  -- The number: the next of the school's own series for the type, under a lock held to the end of the transaction.
  perform pg_advisory_xact_lock(hashtextextended('certificates_issued:' || new.school_id::text || ':' || new.cert_type, 0));
  select coalesce(max(c.seq), 0) + 1 into new.seq from certificates_issued c where c.school_id = new.school_id and c.cert_type = new.cert_type;
  return new;
end $$;
revoke all on function public.certificates_issued_insert() from public, anon, authenticated, service_role;
create trigger certificates_issued_insert before insert on certificates_issued for each row execute function public.certificates_issued_insert();

create function public.certificates_issued_update() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- A child's erasure (erase_student_certificates, never the app's role) blanks the words and nothing else.
  if current_user <> 'app_user' and old.erased_at is null and new.erased_at is not null
     and new.printed = '{}'::jsonb and new.purpose is null and new.waiver_reason is null and new.withdraw_reason is null
     and (new.certificate_id, new.school_id, new.cert_type, new.seq, new.student_id, new.class_id, new.issued_on, new.issued_by, new.issued_at, new.owed_minor, new.clearance, new.waived_by, new.verify_token, new.withdrawn_at, new.withdrawn_by)
         is not distinct from (old.certificate_id, old.school_id, old.cert_type, old.seq, old.student_id, old.class_id, old.issued_on, old.issued_by, old.issued_at, old.owed_minor, old.clearance, old.waived_by, old.verify_token, old.withdrawn_at, old.withdrawn_by) then
    return new;
  end if;
  if old.withdrawn_at is not null then
    raise exception 'a withdrawn certificate stays withdrawn, with its number' using errcode = 'check_violation';
  end if;
  if (new.certificate_id, new.school_id, new.cert_type, new.seq, new.student_id, new.class_id, new.issued_on, new.issued_by, new.issued_at, new.purpose, new.printed, new.owed_minor, new.clearance, new.waiver_reason, new.waived_by, new.verify_token, new.erased_at)
     is distinct from (old.certificate_id, old.school_id, old.cert_type, old.seq, old.student_id, old.class_id, old.issued_on, old.issued_by, old.issued_at, old.purpose, old.printed, old.owed_minor, old.clearance, old.waiver_reason, old.waived_by, old.verify_token, old.erased_at) then
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
create trigger certificates_issued_update before update on certificates_issued for each row execute function public.certificates_issued_update();

-- A copy for the family: of a live certificate only, with a key made here. A definer function, so the key is made by
-- the owner (the app's role is given no way to make one itself); the row's school is the caller's own (row level
-- security checks the row as written).
create function public.certificate_copies_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from certificates_issued c where c.school_id = new.school_id and c.certificate_id = new.certificate_id and c.withdrawn_at is null and c.erased_at is null) then
    raise exception 'a copy is sent of a certificate that is not withdrawn' using errcode = 'check_violation';
  end if;
  new.copy_key := public.certificate_random_key();
  new.made_at := now();
  return new;
end $$;
revoke all on function public.certificate_copies_insert() from public, anon, authenticated, service_role;
create trigger certificate_copies_insert before insert on certificate_copies for each row execute function public.certificate_copies_insert();
-- A copy is never changed; it goes only with a child's erasure.
create function public.certificate_copies_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'a copy sent to a family is never changed' using errcode = 'check_violation';
end $$;
revoke all on function public.certificate_copies_fixed() from public, anon, authenticated, service_role;
create trigger certificate_copies_fixed before update on certificate_copies for each row execute function public.certificate_copies_fixed();

create function public.certificate_marks_stamp() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.school_id, new.kind) is distinct from (old.school_id, old.kind) then
    raise exception 'a mark is replaced in its own place' using errcode = 'check_violation';
  end if;
  new.uploaded_at := now();
  return new;
end $$;
revoke all on function public.certificate_marks_stamp() from public, anon, authenticated, service_role;
create trigger certificate_marks_stamp before insert or update on certificate_marks for each row execute function public.certificate_marks_stamp();

-- The public QR page: one token, the few facts the paper can be matched with, nothing else.
create function public.certificate_verify(p_token text)
returns table (state text, cert_type text, school_name text, issued_on date, number text, name_shown text)
language sql stable security definer set search_path = public, pg_temp as $$
  select case when c.withdrawn_at is null then 'valid' else 'withdrawn' end, c.cert_type, s.name, c.issued_on, c.number,
         case when c.erased_at is null then public.certificate_name_shown(c.printed ->> 'studentName') end
    from certificates_issued c join schools s on s.school_id = c.school_id
   where p_token ~ '^[A-Za-z0-9_-]{32}$' and c.verify_token = p_token
$$;
revoke all on function public.certificate_verify(text) from public, anon, authenticated, service_role;
grant execute on function public.certificate_verify(text) to nca_super;

-- The family's link: where the copy is, while the certificate is live, for 30 days from the send (the link is in the
-- message, which the family may forward; after that the office sends it again).
create function public.certificate_copy(p_key text)
returns table (storage_key text, number text, cert_type text)
language sql stable security definer set search_path = public, pg_temp as $$
  select k.storage_key, c.number, c.cert_type
    from certificate_copies k join certificates_issued c on c.school_id = k.school_id and c.certificate_id = k.certificate_id
   where p_key ~ '^[A-Za-z0-9_-]{32}$' and k.copy_key = p_key and c.withdrawn_at is null and c.erased_at is null
     and k.made_at > now() - interval '30 days'
$$;
revoke all on function public.certificate_copy(text) from public, anon, authenticated, service_role;
grant execute on function public.certificate_copy(text) to nca_super;

-- A child's erasure: the register keeps its numbers and states; the words and the family copies go. Returns the
-- storage paths of the copies removed, for the caller to delete the files.
create function public.erase_student_certificates(p_student_id uuid)
returns table (certificates integer, copy_paths text[])
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  paths text[];
  n integer;
begin
  if school is null or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    raise exception 'an erasure is carried out by the principal or the school admin of the child''s school' using errcode = '42501';
  end if;
  with gone as (
    delete from certificate_copies k using certificates_issued c
     where c.school_id = k.school_id and c.certificate_id = k.certificate_id and c.school_id = school and c.student_id = p_student_id
    returning k.storage_key
  )
  select coalesce(array_agg(storage_key), '{}') into paths from gone;
  update certificates_issued set printed = '{}'::jsonb, purpose = null, waiver_reason = null, withdraw_reason = null, erased_at = now()
   where school_id = school and student_id = p_student_id and erased_at is null;
  get diagnostics n = row_count;
  return query select n, paths;
end $$;
revoke all on function public.erase_student_certificates(uuid) from public, anon, authenticated, service_role;
grant execute on function public.erase_student_certificates(uuid) to app_user;

revoke all on certificates_issued, certificate_copies, certificate_marks from public, anon, authenticated, service_role;
revoke all on certificates_issued, certificate_copies, certificate_marks from app_user, nca_super;
grant select, insert, update on certificates_issued to app_user;
grant select, insert on certificate_copies to app_user;
grant select, insert, update, delete on certificate_marks to app_user;

alter table certificates_issued enable row level security;
alter table certificates_issued force row level security;
alter table certificate_copies enable row level security;
alter table certificate_copies force row level security;
alter table certificate_marks enable row level security;
alter table certificate_marks force row level security;

create policy certificates_issued_tenant_isolation on certificates_issued using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy certificate_copies_tenant_isolation on certificate_copies using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy certificate_marks_tenant_isolation on certificate_marks using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- The office only: a teacher, the academic coordinator and the accountant read and write nothing here.
create policy certificates_issued_office on certificates_issued as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy certificate_copies_office on certificate_copies as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy certificate_marks_office on certificate_marks as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));

-- In one's own name; the principal alone withdraws, and alone keeps the seal and the signature.
create policy certificates_issued_as_self on certificates_issued as restrictive for insert
  with check (issued_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificates_issued_withdrawn_by_principal on certificates_issued as restrictive for update
  using (current_setting('app.current_role', true) = 'principal')
  with check (withdrawn_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_copies_as_self on certificate_copies as restrictive for insert
  with check (made_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_marks_kept_by_principal on certificate_marks as restrictive for insert
  with check (current_setting('app.current_role', true) = 'principal' and uploaded_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_marks_replaced_by_principal on certificate_marks as restrictive for update
  using (current_setting('app.current_role', true) = 'principal')
  with check (uploaded_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy certificate_marks_removed_by_principal on certificate_marks as restrictive for delete
  using (current_setting('app.current_role', true) = 'principal');

-- The register's audit rows name certificates and children by id: the office reads them.
create policy audit_certificate_rows_office on audit_log as restrictive for select
  using (
    event_action not like 'certificate.%'
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
  );

-- Documents and certificates is partly built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'documents', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
