-- P3 6h-2 part 1 (C176): bank statements, and the school's holidays.
--
-- 1. school_holidays: days the school is closed. Used with the working-days
--    setting to count working days (first use: how long a UPI payment has
--    waited to be verified).
-- 2. bank_accounts: the school's own accounts that fees land in, each with
--    the column map of its bank's statement, set the first time one is
--    uploaded.
-- 3. bank_statement_imports: one row per upload: the file's SHA-256, the
--    period, what was read, the balances, who uploaded it.
-- 4. bank_credit_rows: the bank's own credit lines. CREDIT ROWS ONLY: money
--    going out is never kept. A row has an identity built from the bank's
--    own line; the same line uploaded again, in the same or an overlapping
--    statement, is the same row. Rows hold payers' names and UPI IDs as the
--    bank wrote them: personal data, readable by the finance roles only.
--    A row is never edited and never deleted; only its match is filled in.

-- 1.
create table school_holidays (
  school_id uuid not null references schools(school_id),
  holiday_date date not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (school_id, holiday_date)
);
revoke all on school_holidays from public, anon, authenticated, service_role;
grant select, insert, delete on school_holidays to app_user;
grant select on school_holidays to nca_super;
alter table school_holidays enable row level security;
alter table school_holidays force row level security;
create policy school_holidays_tenant_isolation on school_holidays using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy school_holidays_office_insert on school_holidays as restrictive
  for insert with check (current_setting('app.current_role', true) = any (array['school_admin', 'principal']) and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy school_holidays_office_delete on school_holidays as restrictive
  for delete using (current_setting('app.current_role', true) = any (array['school_admin', 'principal']));

-- 2.
create table bank_accounts (
  account_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  bank_name text not null check (char_length(btrim(bank_name)) between 1 and 60),
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  ifsc text check (ifsc is null or ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  statement_profile jsonb check (statement_profile is null or jsonb_typeof(statement_profile) = 'object'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (school_id, account_id),
  unique (school_id, label)
);
-- 3.
create table bank_statement_imports (
  import_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  account_id uuid not null,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  period_from date not null,
  period_to date not null,
  rows_read int not null check (rows_read >= 0),
  credit_rows int not null check (credit_rows > 0),
  credit_total_minor bigint not null check (credit_total_minor > 0),
  rows_added int not null check (rows_added >= 0),
  opening_balance_minor bigint,
  closing_balance_minor bigint,
  balance_continues boolean,
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  unique (school_id, import_id),
  foreign key (school_id, account_id) references bank_accounts(school_id, account_id),
  check (period_to >= period_from)
);
create index idx_bank_imports_account on bank_statement_imports (school_id, account_id, uploaded_at desc);
-- 4.
create table bank_credit_rows (
  row_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  account_id uuid not null,
  import_id uuid not null,
  value_date date not null,
  narration text not null check (char_length(narration) <= 500),
  utr text check (utr is null or utr ~ '^[0-9]{12}$'),
  reference_code text check (reference_code is null or reference_code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  amount_minor bigint not null check (amount_minor > 0),
  balance_after_minor bigint,
  row_identity text not null check (row_identity ~ '^[0-9a-f]{64}$'),
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'matched', 'needs_person', 'not_a_fee')),
  evidence_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(btrim(decision_reason)) between 1 and 300),
  unique (school_id, row_id),
  unique (school_id, account_id, row_identity),
  foreign key (school_id, account_id) references bank_accounts(school_id, account_id),
  foreign key (school_id, import_id) references bank_statement_imports(school_id, import_id),
  foreign key (school_id, evidence_id) references payment_evidence(school_id, evidence_id),
  -- A bank row backs at most one credit, ever.
  check (match_status <> 'matched' or evidence_id is not null),
  check (match_status = 'matched' or evidence_id is null),
  check (match_status <> 'not_a_fee' or (decided_by is not null and decision_reason is not null))
);
create unique index bank_credit_rows_one_evidence on bank_credit_rows (evidence_id) where evidence_id is not null;
create index idx_bank_credit_rows_utr on bank_credit_rows (school_id, utr) where utr is not null;
create index idx_bank_credit_rows_ref on bank_credit_rows (school_id, reference_code) where reference_code is not null;
create index idx_bank_credit_rows_status on bank_credit_rows (school_id, match_status, value_date);

revoke all on bank_accounts, bank_statement_imports, bank_credit_rows from public, anon, authenticated, service_role;
grant select, insert, update on bank_accounts to app_user;
grant select, insert on bank_statement_imports to app_user;
grant select, insert, update on bank_credit_rows to app_user;
alter table bank_accounts enable row level security;
alter table bank_accounts force row level security;
alter table bank_statement_imports enable row level security;
alter table bank_statement_imports force row level security;
alter table bank_credit_rows enable row level security;
alter table bank_credit_rows force row level security;
create policy bank_accounts_tenant_isolation on bank_accounts using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy bank_accounts_finance on bank_accounts as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
-- Adding an account is the office's (principal or school admin); the accountant uploads statements to it.
create policy bank_accounts_office_insert on bank_accounts as restrictive
  for insert with check (current_setting('app.current_role', true) = any (array['school_admin', 'principal']) and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy bank_statement_imports_tenant_isolation on bank_statement_imports using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy bank_statement_imports_finance on bank_statement_imports as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy bank_statement_imports_as_self on bank_statement_imports as restrictive
  for insert with check (uploaded_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy bank_credit_rows_tenant_isolation on bank_credit_rows using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy bank_credit_rows_finance on bank_credit_rows as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
-- What the bank said never changes; a match, once made, stays.
create function public.bank_credit_rows_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.account_id, new.import_id, new.value_date, new.narration, new.amount_minor, new.row_identity) is distinct from (old.school_id, old.account_id, old.import_id, old.value_date, old.narration, old.amount_minor, old.row_identity)
     or new.utr is distinct from old.utr or new.reference_code is distinct from old.reference_code or new.balance_after_minor is distinct from old.balance_after_minor then
    raise exception 'a bank row is never edited' using errcode = 'check_violation';
  end if;
  if old.evidence_id is not null and new.evidence_id is distinct from old.evidence_id then
    raise exception 'a bank row is used at most once' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.bank_credit_rows_fixed() from public;
create trigger bank_credit_rows_fixed before update on bank_credit_rows for each row execute function public.bank_credit_rows_fixed();
