-- P3 6g part 2 (C179): fee reminders by email, and fee clearance.
--
-- 1. fee_reminders: one row per due line and reminder (3 days before, on
--    the due date, 7 days after): sent, or held and why. The row is what
--    stops a second reminder for the same line, and what the office reads
--    to see why a family was not reminded.
-- 2. A payment link may be made by the nightly reminder (no person:
--    created_by is null), so that the reminder carries the family's link.
--    The platform role may insert links and their lines for that.
-- 3. fee_clearance_overrides: a student with dues is not cleared for a
--    transfer or leaving certificate unless a named person says so, with a
--    reason. Each override is one row, never edited.

-- 1.
create table fee_reminders (
  reminder_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  fee_id uuid not null,
  which text not null check (which in ('before_3', 'due_day', 'after_7')),
  payer_id uuid not null,
  outcome text not null check (outcome in ('sent', 'held')),
  held_reason text check (held_reason is null or held_reason in ('promise', 'hardship', 'no_email', 'no_consent', 'one_a_day')),
  link_id uuid,
  run_date date not null,
  created_at timestamptz not null default now(),
  unique (school_id, fee_id, which),
  foreign key (school_id, fee_id) references fees_ledger(school_id, fee_id),
  foreign key (school_id, link_id) references payment_links(school_id, link_id),
  check ((outcome = 'held') = (held_reason is not null))
);
create index idx_fee_reminders_payer on fee_reminders (school_id, payer_id, run_date desc);
revoke all on fee_reminders from public, anon, authenticated, service_role;
grant select on fee_reminders to app_user;
grant select, insert on fee_reminders to nca_super;
alter table fee_reminders enable row level security;
alter table fee_reminders force row level security;
create policy fee_reminders_tenant_isolation on fee_reminders using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy fee_reminders_finance on fee_reminders as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));

-- 2.
alter table payment_links alter column created_by drop not null;
grant insert on payment_links, payment_link_lines to nca_super;

-- 3.
create table fee_clearance_overrides (
  override_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  owed_minor bigint not null check (owed_minor > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  foreign key (school_id, student_id) references students(school_id, student_id)
);
create index idx_fee_clearance_student on fee_clearance_overrides (school_id, student_id, decided_at desc);
revoke all on fee_clearance_overrides from public, anon, authenticated, service_role;
grant select, insert on fee_clearance_overrides to app_user;
alter table fee_clearance_overrides enable row level security;
alter table fee_clearance_overrides force row level security;
create policy fee_clearance_overrides_tenant_isolation on fee_clearance_overrides using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy fee_clearance_overrides_office on fee_clearance_overrides as restrictive
  for insert with check (current_setting('app.current_role', true) = any (array['school_admin', 'principal']) and decided_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy fee_clearance_overrides_finance on fee_clearance_overrides as restrictive
  for select using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
