-- P3 6h-1 (C174): direct UPI to the school's own account, checked one by one
-- (docs/24 §3.3, §3.4 path A, §3.5).
--
-- 1. Every payment link has a reference code: eight characters with no
--    look-alike letters, unique in the school. It goes into the UPI payment
--    as its note and reference, so the bank's own line can carry it.
-- 2. payment_reports: a parent says "I paid, and this is the UTR". It is a
--    claim, not proof: nothing is credited from it. A UTR can be reported
--    once in a school, ever. A named verifier of the school then says
--    "found in the school's bank" with the amount they saw (above the
--    school's limit, the principal as well), or "not found". Only "found"
--    credits, through payment_evidence. Nothing here is decided by time
--    passing.
--    The parent has no account, so the report is written by the platform
--    role; the school's finance roles read and decide.

-- 1.
alter table payment_links add column reference_code text check (reference_code is null or reference_code ~ '^[A-HJKMNP-Z2-9]{8}$');
create unique index payment_links_reference_per_school on payment_links (school_id, reference_code) where reference_code is not null;

-- 2.
create table payment_reports (
  report_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  link_id uuid not null,
  utr text not null check (utr ~ '^[0-9]{12}$'),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'reported' check (status in ('reported', 'awaiting_principal', 'verified', 'not_found', 'withdrawn')),
  reported_at timestamptz not null default now(),
  checked_by uuid,
  checked_at timestamptz,
  amount_seen_minor bigint check (amount_seen_minor is null or amount_seen_minor > 0),
  decided_by uuid,
  decided_at timestamptz,
  evidence_id uuid,
  reminded_at timestamptz,
  alerted_at timestamptz,
  unique (school_id, utr),
  unique (school_id, report_id),
  foreign key (school_id, link_id) references payment_links(school_id, link_id),
  foreign key (school_id, evidence_id) references payment_evidence(school_id, evidence_id),
  -- Verified means: a named person, an amount seen in the bank, and the evidence it was credited through.
  check (status <> 'verified' or (decided_by is not null and decided_at is not null and amount_seen_minor is not null and evidence_id is not null)),
  check (status <> 'awaiting_principal' or (checked_by is not null and checked_at is not null and amount_seen_minor is not null)),
  check (status <> 'not_found' or (decided_by is not null and decided_at is not null)),
  check (status in ('verified') or evidence_id is null)
);
create unique index payment_reports_one_waiting_per_link on payment_reports (link_id) where status in ('reported', 'awaiting_principal');
create index idx_payment_reports_school_status on payment_reports (school_id, status, reported_at);
revoke all on payment_reports from public, anon, authenticated, service_role;
grant select, update on payment_reports to app_user;
grant select, insert, update on payment_reports to nca_super;
alter table payment_reports enable row level security;
alter table payment_reports force row level security;
create policy payment_reports_tenant_isolation on payment_reports using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy payment_reports_finance on payment_reports as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
-- What the parent reported never changes; a decision, once made, stays.
create function public.payment_reports_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.link_id, new.utr, new.amount_minor, new.reported_at) is distinct from (old.school_id, old.link_id, old.utr, old.amount_minor, old.reported_at) then
    raise exception 'a payment report is never edited' using errcode = 'check_violation';
  end if;
  if old.status in ('verified', 'not_found', 'withdrawn') and (new.status, new.decided_by, new.amount_seen_minor, new.evidence_id) is distinct from (old.status, old.decided_by, old.amount_seen_minor, old.evidence_id) then
    raise exception 'a decided payment report is not decided again' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.payment_reports_fixed() from public;
create trigger payment_reports_fixed before update on payment_reports for each row execute function public.payment_reports_fixed();
