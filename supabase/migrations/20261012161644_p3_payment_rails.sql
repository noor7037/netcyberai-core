-- P3 6f-2 (C171): payment rails (docs/24 §3.1, §3.2, §3.8, §5).
--
-- 1. payment_methods: which ways of paying a school has switched on, in
--    what order, with their public settings. The principal or the school
--    admin sets them.
-- 2. payment_gateway_access: whether a school may use a gateway at all. Set
--    by NetCyberAI in Control, with a reason; the school only reads it.
-- 3. payment_credentials: a provider's keys for a school, test and live
--    apart. Only ciphertext is stored (AES-256-GCM, done in the app with a
--    key that is not in the database), so a copy of the database reveals
--    nothing. The app's own role holds NO right on this table: only the
--    server's payment path, as the platform role, reads or writes it.
-- 4. payment_evidence: the one door every credit goes through. Unique on
--    (source, external_id): the same notice, bank row or confirmation can
--    never credit twice, whatever the app does.
-- 5. A payment link remembers the configuration it was opened with and its
--    checkout address; a receipt names its evidence.

-- 1.
create table payment_methods (
  school_id uuid not null references schools(school_id),
  method text not null check (method in ('counter', 'direct_upi', 'razorpay', 'stand-in', 'bharat_connect')),
  enabled boolean not null default false,
  sort_order int not null default 0 check (sort_order between 0 and 99),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, method)
);
revoke all on payment_methods from public, anon, authenticated, service_role;
grant select, insert, update on payment_methods to app_user;
grant select on payment_methods to nca_super;
alter table payment_methods enable row level security;
alter table payment_methods force row level security;
create policy payment_methods_tenant_isolation on payment_methods using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy payment_methods_finance_read on payment_methods as restrictive
  for select using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy payment_methods_office_insert on payment_methods as restrictive
  for insert with check (current_setting('app.current_role', true) = any (array['school_admin', 'principal']) and updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy payment_methods_office_update on payment_methods as restrictive
  for update using (current_setting('app.current_role', true) = any (array['school_admin', 'principal']))
  with check (updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- 2.
create table payment_gateway_access (
  school_id uuid not null references schools(school_id),
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  allowed boolean not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  primary key (school_id, provider)
);
revoke all on payment_gateway_access from public, anon, authenticated, service_role;
grant select on payment_gateway_access to app_user;
grant select, insert, update on payment_gateway_access to nca_super;
alter table payment_gateway_access enable row level security;
alter table payment_gateway_access force row level security;
create policy payment_gateway_access_tenant_isolation on payment_gateway_access using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy payment_gateway_access_finance on payment_gateway_access as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));

-- 3.
create table payment_credentials (
  config_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  mode text not null check (mode in ('test', 'live')),
  ciphertext text not null check (char_length(ciphertext) between 1 and 4000),
  iv text not null check (char_length(iv) = 16),
  tag text not null check (char_length(tag) = 24),
  key_version int not null check (key_version >= 1),
  key_last4 text not null check (char_length(key_last4) = 4),
  saved_by uuid not null,
  saved_from text not null check (saved_from in ('school', 'control')),
  saved_at timestamptz not null default now(),
  tested_at timestamptz,
  test_ok boolean,
  test_message text check (test_message is null or char_length(test_message) <= 200),
  unique (school_id, provider, mode),
  unique (school_id, config_id),
  check ((tested_at is null) = (test_ok is null))
);
revoke all on payment_credentials from public, anon, authenticated, service_role, app_user;
grant select, insert, update on payment_credentials to nca_super;
alter table payment_credentials enable row level security;
alter table payment_credentials force row level security;
-- No policy for any school role: with RLS forced and no grant, nothing but the platform role reaches a row.
create policy payment_credentials_nobody on payment_credentials as restrictive for all using (false);
create policy payment_credentials_tenant_isolation on payment_credentials using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- 4.
create table payment_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  source text not null check (source in ('gateway_notice', 'school_confirmed', 'bank_statement_row', 'network_notice', 'counter')),
  external_id text not null check (char_length(external_id) between 1 and 200),
  amount_minor bigint not null check (amount_minor > 0),
  link_id uuid,
  rule text check (rule is null or rule in ('A', 'R1', 'R2', 'manual')),
  decided_by uuid,
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 300),
  receipt_id uuid,
  applied_minor bigint not null default 0 check (applied_minor >= 0),
  unapplied_minor bigint not null default 0 check (unapplied_minor >= 0),
  created_at timestamptz not null default now(),
  unique (source, external_id),
  unique (school_id, evidence_id),
  foreign key (school_id, link_id) references payment_links(school_id, link_id),
  foreign key (school_id, receipt_id) references receipts(school_id, receipt_id),
  check (applied_minor + unapplied_minor <= amount_minor),
  -- A person's decision names the person.
  check (rule is distinct from 'manual' or (decided_by is not null and reason is not null)),
  check (source <> 'school_confirmed' or decided_by is not null)
);
create index idx_payment_evidence_school on payment_evidence (school_id, created_at desc);
revoke all on payment_evidence from public, anon, authenticated, service_role;
grant select, insert, update on payment_evidence to app_user, nca_super;
alter table payment_evidence enable row level security;
alter table payment_evidence force row level security;
create policy payment_evidence_tenant_isolation on payment_evidence using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy payment_evidence_finance on payment_evidence as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
-- What the evidence says never changes; only where it ended up is filled in.
create function public.payment_evidence_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.source, new.external_id, new.amount_minor, new.created_at) is distinct from (old.school_id, old.source, old.external_id, old.amount_minor, old.created_at)
     or new.link_id is distinct from old.link_id or new.rule is distinct from old.rule or new.decided_by is distinct from old.decided_by or new.reason is distinct from old.reason
     or (old.receipt_id is not null and new.receipt_id is distinct from old.receipt_id) then
    raise exception 'payment evidence is never edited' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.payment_evidence_fixed() from public;
create trigger payment_evidence_fixed before update on payment_evidence for each row execute function public.payment_evidence_fixed();

-- 5.
alter table payment_links add column config_id uuid;
alter table payment_links add constraint payment_links_school_config_fkey foreign key (school_id, config_id) references payment_credentials(school_id, config_id);
alter table payment_links add column checkout_url text check (checkout_url is null or checkout_url ~ '^(/|https://)[^[:space:]]{1,500}$');
alter table receipts add column evidence_id uuid;
alter table receipts add constraint receipts_school_evidence_fkey foreign key (school_id, evidence_id) references payment_evidence(school_id, evidence_id);
