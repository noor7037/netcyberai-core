-- P5 slice 8e (C204): billing plans as settings (docs/26 section 3 rule 8).
--
-- 1. plans: what NetCyberAI sells. The name, the price and the period are
--    typed in Control and live here, never in code. A plan gives either
--    every module that works today (the code's registry decides which, when
--    the plan is applied) or a chosen list. A plan is retired, never deleted.
-- 2. school_subscriptions: one row a school: its plan and the day it has
--    paid until (empty: not billed yet). The three billing_ columns are what
--    the nightly check last did for that paid-until day, so the check knows
--    its own work from an access mode a person set (see the code:
--    src/lib/control/billing-nightly.ts).
-- 3. subscription_payments: payments recorded by hand. APPEND-ONLY: a row is
--    never changed or removed (a trigger, and no UPDATE or DELETE right for
--    anyone). A wrong one is corrected by another row that names it.
-- 4. Which plan a new school gets is a platform setting, so the code holds
--    no plan name.
-- 5. The clock: each night just after midnight in India a job is queued, as
--    the fees nightly is (20261012035958), once a school has a paid-until day.
--
-- Who reads: all three are the platform's. Only nca_super writes. A school's
-- own staff session reads its own school_subscriptions row (so its screen can
-- say "paid until") and nothing else: not another school's row, no plan, no
-- price, no payment.

-- 1.
create table plans (
  plan_id text primary key check (plan_id ~ '^[a-z0-9_-]{1,40}$' and plan_id <> 'unassigned'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  price_minor bigint check (price_minor is null or price_minor between 0 and 9999999999),
  currency text not null default 'INR' check (currency = 'INR'),
  period text check (period in ('month', 'quarter', 'year')),
  grace_days int not null check (grace_days between 0 and 90),
  all_working_modules boolean not null default false,
  module_ids text[] not null default '{}',
  limits jsonb not null default '{}' check (jsonb_typeof(limits) = 'object'),
  retired_at timestamptz,
  retired_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  -- A price is always for a period.
  check (price_minor is null or period is not null),
  -- Either every working module, or a chosen list: never both.
  check (not all_working_modules or cardinality(module_ids) = 0),
  check (array_position(module_ids, null) is null and array_to_string(module_ids, ',') ~ '^([a-z][a-z0-9-]{1,39}(,[a-z][a-z0-9-]{1,39})*)?$'),
  check ((retired_at is null) = (retired_by is null))
);
create unique index uq_plans_name on plans (lower(btrim(name)));

-- 2.
create table school_subscriptions (
  school_id uuid primary key references schools(school_id),
  plan_id text not null references plans(plan_id),
  paid_until date,
  billing_access text check (billing_access in ('grace', 'read_only')),
  billing_grace_ends_at timestamptz,
  billing_access_since date,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check ((billing_access is null) = (billing_grace_ends_at is null) and (billing_access is null) = (billing_access_since is null)),
  check (billing_access is null or paid_until is not null)
);
create index idx_school_subscriptions_plan on school_subscriptions (plan_id);

-- 3.
create table subscription_payments (
  payment_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  plan_id text not null references plans(plan_id),
  amount_minor bigint not null check (amount_minor between 0 and 9999999999),
  currency text not null default 'INR' check (currency = 'INR'),
  paid_on date not null,
  covers_until date,
  reference text not null check (char_length(btrim(reference)) between 1 and 120),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  corrects_payment_id uuid,
  recorded_by uuid not null references users(user_id),
  recorded_at timestamptz not null default now(),
  unique (school_id, payment_id),
  -- A correction names a row of the same school, and says what was wrong.
  foreign key (school_id, corrects_payment_id) references subscription_payments (school_id, payment_id),
  check (corrects_payment_id is null or (corrects_payment_id <> payment_id and note is not null)),
  -- A payment has an amount and a day it covers until. Only a correction may say "nothing was paid": no amount, nothing covered.
  check (corrects_payment_id is not null or amount_minor > 0),
  check ((amount_minor = 0) = (covers_until is null))
);
-- A row is corrected once; the correction itself can be corrected.
create unique index uq_subscription_payments_corrected_once on subscription_payments (corrects_payment_id) where corrects_payment_id is not null;
create index idx_subscription_payments_school on subscription_payments (school_id, recorded_at desc);

create function public.subscription_payments_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.paid_on > (now() at time zone 'Asia/Kolkata')::date then
      raise exception 'a payment cannot be recorded for a day still to come' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  raise exception 'a recorded payment is never changed or removed: record a correction that names it' using errcode = 'check_violation';
end $$;
revoke all on function public.subscription_payments_fixed() from public;
create trigger subscription_payments_fixed before insert or update or delete on subscription_payments for each row execute function public.subscription_payments_fixed();

revoke all on plans, school_subscriptions, subscription_payments from public, anon, authenticated, service_role;
revoke all on plans, school_subscriptions, subscription_payments from app_user, nca_super;
grant select on school_subscriptions to app_user;
grant select, insert, update on plans, school_subscriptions to nca_super;
grant select, insert on subscription_payments to nca_super;
revoke update, delete on subscription_payments from app_user, anon, authenticated, nca_super;

alter table plans enable row level security;
alter table plans force row level security;
alter table school_subscriptions enable row level security;
alter table school_subscriptions force row level security;
alter table subscription_payments enable row level security;
alter table subscription_payments force row level security;

-- plans is the platform's alone: scoped to nca_super, so no other role can ever match.
create policy plans_platform_read on plans for select to nca_super using (true);
create policy plans_platform_insert on plans for insert to nca_super with check (true);
create policy plans_platform_update on plans for update to nca_super using (true) with check (true);

create policy school_subscriptions_tenant_isolation on school_subscriptions using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy subscription_payments_tenant_isolation on subscription_payments using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- A school's staff read their own school's row. The app's role holds SELECT only, so nothing here is written by a school.
create policy school_subscriptions_staff on school_subscriptions as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator', 'super_admin'])
);
-- Payments are read and written as the platform role only (the app's role has no grant either).
create policy subscription_payments_nobody on subscription_payments as restrictive for all using (false);

-- The first plan is what the code's constant was: every module that works, with a name and no price.
insert into plans (plan_id, name, grace_days, all_working_modules) values ('standard', 'Standard', 15, true)
on conflict (plan_id) do nothing;

-- 4.
insert into platform_settings (key, value) values ('billing.default_plan', '"standard"'::jsonb)
on conflict (key) do nothing;

-- Every school already on a plan gets its subscription row, not billed yet.
insert into school_subscriptions (school_id, plan_id)
select e.school_id, e.plan from school_entitlements e where e.plan in (select plan_id from plans)
on conflict (school_id) do nothing;

-- 5. Queues tonight's check once (the idempotency key is India's date), and
-- only when there is something to check: at least one school with a
-- paid-until day. Until the first payment is recorded nothing is queued, so a
-- night before then (or before the code that runs the job is deployed)
-- leaves no job behind.
create function public.billing_nightly_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'billing.nightly', jsonb_build_object('date', t.d::text), 'billing.nightly:' || t.d::text, 8
    from (select (now() at time zone 'Asia/Kolkata')::date as d) t
   where exists (select 1 from school_subscriptions where paid_until is not null)
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.billing_nightly_enqueue() from public;
-- 18:40 UTC is 00:10 in India, five minutes after the fees nightly. cron.schedule
-- upserts by name. Where there is no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('billing-nightly', '40 18 * * *', 'select public.billing_nightly_enqueue()');
  end if;
end $$;
