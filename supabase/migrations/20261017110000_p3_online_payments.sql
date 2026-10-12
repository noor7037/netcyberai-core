-- P3 6f (C169): online payments through a provider, applied once.
--
-- 1. A payment link remembers which provider it was opened with and the
--    provider's own reference for it.
-- 2. A receipt may come from a provider's notice instead of a person at the
--    counter: method 'online', no issuer, the link it paid, and the
--    provider's payment id. One receipt per provider payment, ever: the
--    database refuses a second, whatever the app does.
-- 3. payment_events: every notice a provider sends, once. The same notice
--    arriving again is found here and changes nothing. What could not be
--    credited (more was paid than is owed) is kept as an amount for the
--    office to refund by hand.
-- 4. The platform role applies a notice (there is no signed-in person), so
--    it gets exactly the rights that needs.

-- 1.
alter table payment_links add column provider text check (provider is null or provider ~ '^[a-z][a-z0-9-]{1,30}$');
alter table payment_links add column provider_ref text check (provider_ref is null or char_length(provider_ref) between 1 and 120);
alter table payment_links add constraint payment_links_provider_pair check ((provider is null) = (provider_ref is null));
create unique index payment_links_one_per_provider_ref on payment_links (provider, provider_ref) where provider_ref is not null;

-- 2.
alter table receipts drop constraint receipts_method_check;
alter table receipts add constraint receipts_method_check check (method in ('cash', 'upi', 'card', 'netbanking', 'cheque', 'online'));
alter table payments drop constraint payments_method_check;
alter table payments add constraint payments_method_check check (method in ('cash', 'upi', 'card', 'netbanking', 'cheque', 'adjustment', 'online'));
alter table receipts alter column issued_by drop not null;
alter table receipts add column payment_link_id uuid;
alter table receipts add constraint receipts_school_link_fkey foreign key (school_id, payment_link_id) references payment_links(school_id, link_id);
alter table receipts add column gateway text;
alter table receipts add column gateway_payment_id text check (gateway_payment_id is null or char_length(gateway_payment_id) between 1 and 120);
alter table receipts add constraint receipts_counter_or_online check (
  (method <> 'online' and issued_by is not null and gateway_payment_id is null)
  or (method = 'online' and issued_by is null and gateway is not null and gateway_payment_id is not null and payment_link_id is not null));
create unique index receipts_one_per_gateway_payment on receipts (gateway, gateway_payment_id) where gateway_payment_id is not null;

-- 3.
create table payment_events (
  event_pk uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  event_id text not null check (char_length(event_id) between 1 and 120),
  kind text not null check (kind in ('captured', 'failed', 'unreadable')),
  provider_ref text,
  gateway_payment_id text,
  amount_minor bigint,
  school_id uuid references schools(school_id),
  link_id uuid,
  receipt_id uuid,
  outcome text not null check (outcome in ('received', 'applied', 'applied_in_part', 'not_applied', 'duplicate', 'ignored', 'refused', 'noted')),
  reason text check (reason is null or char_length(reason) <= 200),
  applied_minor bigint not null default 0 check (applied_minor >= 0),
  unapplied_minor bigint not null default 0 check (unapplied_minor >= 0),
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
create index idx_payment_events_school on payment_events (school_id, received_at desc);
revoke all on payment_events from public, anon, authenticated, service_role;
grant select on payment_events to app_user;
grant select, insert, update on payment_events to nca_super;
alter table payment_events enable row level security;
alter table payment_events force row level security;
create policy payment_events_tenant_isolation on payment_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy payment_events_finance on payment_events as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));

-- 4.
grant select, update on payment_links to nca_super;
grant select on payment_link_lines to nca_super;
