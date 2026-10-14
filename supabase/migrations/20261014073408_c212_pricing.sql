-- C212 (founder, 2026-10-14): plans priced per active student, a school's own
-- terms, and the amount due.
--
-- 1. plans: a price a MONTH and a price a YEAR, each per active student, in
--    paise (both or neither: a school chooses one of the two). They replace
--    the single price and period of 8e, which were for the whole school; a
--    price for a school is not a price for a student, so a plan that had one
--    keeps it in the audit log and its new prices start empty ('standard'
--    had none). The old two columns are retired, not yet dropped (see below). Also: features (parts of a module a plan gives, read by
--    school_plan_has_feature below), and the WhatsApp messages included per
--    student a month, left empty until the founder enters Meta's rates.
-- 2. school_subscriptions.billing_period: the period the school chose,
--    'month' or 'year'. Empty: not chosen yet (every existing row).
-- 3. school_billing_terms: a school's own terms, typed in Control, each with
--    a reason, a first day and (optional) a last day: a negotiated price per
--    student (a month and a year), a complimentary module (always with a last
--    day), a discount (hundredths of a percent, 0 to 10000) and a minimum
--    number of billed students. Dated rows: a value is never changed and a row
--    is never removed; a new row of the same kind ends the old one the day
--    before it starts (a trigger allows only that, and refuses two rows of a
--    kind on the same day). A past day is never rewritten.
-- 4. school_module_entitlements.source gains 'complimentary': the row a
--    complimentary module switches on. The billing nightly job (and the
--    request that adds or ends the term) switches it on from its first day
--    and back to what the plan gives after its last day
--    (src/lib/control/billing-terms.ts); billing_nightly_enqueue now queues
--    the night's job when there is a complimentary module to look after.
-- 5. The audit rows of a school's terms ('billing.terms.%') are read in
--    Control only: hidden from every school role, as the terms are.
-- 6. Three plans, seeded as data and editable in Control. The founder's words
--    mapped to the registry's module ids (src/lib/contracts/modules.ts):
--
--    | Founder's words                                  | Module ids or feature                         | Essential | Growth | Premium |
--    |--------------------------------------------------|-----------------------------------------------|-----------|--------|---------|
--    | every school, whatever its plan (help; DPDP)     | help-center, raise-ticket, setup, compliance  | yes       | yes    | yes     |
--    | students and families                            | students                                      | yes       | yes    | yes     |
--    | attendance                                       | attendance                                    | yes       | yes    | yes     |
--    | fees with UPI, receipts and reminders            | fees                                          | yes       | yes    | yes     |
--    | notices and Communication                        | communication                                 | yes       | yes    | yes     |
--    | Daily Pulse                                      | pulse                                         | yes       | yes    | yes     |
--    | the teacher app (docs/16, P2 row)                | dashboard (My Day), academics, homework,      | yes       | yes    | yes     |
--    |                                                  | timetable, recovery                           |           |        |         |
--    | (staff accounts and invitations, which the       | staff                                         | yes       | yes    | yes     |
--    |  teacher app needs)                              |                                               |           |        |         |
--    | exams and report cards                           | exams                                         |           | yes    | yes     |
--    | PTM                                              | ptm                                           |           | yes    | yes     |
--    | events                                           | events                                        |           | yes    | yes     |
--    | complaints                                       | complaints                                    |           | yes    | yes     |
--    | Parents                                          | parents                                       |           | yes    | yes     |
--    | staff leave                                      | feature 'staff-leave' (of staff)              |           | yes    | yes     |
--    | Proxy Auto                                       | proxy                                         |           | yes    | yes     |
--    | the principal dashboard                          | feature 'principal-dashboard' (of dashboard)  |           | yes    | yes     |
--    | reports                                          | reports                                       |           | yes    | yes     |
--    | (not named: certificates and documents)          | documents                                     |           | yes    | yes     |
--    | Parent AI                                        | parent-ai                                     |           |        | yes     |
--    | Early Warning                                    | early-warning                                 |           |        | yes     |
--    | School Health Auditor                            | school-auditor                                |           |        | yes     |
--    | Learning Genome                                  | learning-genome                               |           |        | yes     |
--    | Curriculum Gap                                   | curriculum-gap                                |           |        | yes     |
--    | Personal Best                                    | feature 'personal-best' (of exams)            |           |        | yes     |
--
--    Not in any plan (not named, and not built or not sold yet): admissions,
--    payroll, teacher-copilot, career, twin, automation. A plan may list a
--    module that is not built yet (exams, learning-genome, curriculum-gap):
--    applying the plan switches on only the modules that work today, and a
--    module built later reaches the school when the plan is applied again.
--    No school is moved: every school stays on its plan until the founder
--    changes it in Control, and new schools still start on the plan the
--    platform setting names.
--
-- Who reads: plans and school_billing_terms are the platform's (nca_super)
-- alone; a school's session reads its own school_subscriptions row (8e) and,
-- through school_plan_has_feature, only whether its own plan has a feature.

-- 1.
alter table plans add column price_month_minor bigint check (price_month_minor is null or price_month_minor between 0 and 100000000);
alter table plans add column price_year_minor bigint check (price_year_minor is null or price_year_minor between 0 and 1000000000);
alter table plans add column features text[] not null default '{}' check (array_position(features, null) is null and array_to_string(features, ',') ~ '^([a-z][a-z0-9-]{1,39}(,[a-z][a-z0-9-]{1,39})*)?$');
alter table plans add column whatsapp_messages_per_student_month int check (whatsapp_messages_per_student_month is null or whatsapp_messages_per_student_month between 0 and 100000);
alter table plans add constraint plans_both_prices_or_neither check ((price_month_minor is null) = (price_year_minor is null));

-- The old price, kept where it can be read again: one audit row a plan that had one.
insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, null, null, 'billing.plan_changed', 'plans', p.plan_id,
       jsonb_build_object('price_minor', p.price_minor, 'period', p.period),
       jsonb_build_object('price_month_minor', null, 'price_year_minor', null, 'by', 'c212: a price for a school is not a price for a student; typed again in Control')
  from plans p where p.price_minor is not null order by p.plan_id;
-- The two old columns stay for now, unused by this code: the code deployed before C212 still reads and writes them
-- (Control's plan form, loadPlan), and this migration reaches the databases first. A later migration drops them
-- once this code is live.
comment on column plans.price_minor is 'Retired by C212 (a price for the whole school); read by no code after C212. Dropped once that code is live.';
comment on column plans.period is 'Retired by C212; read by no code after C212. Dropped once that code is live.';

-- 2.
alter table school_subscriptions add column billing_period text check (billing_period in ('month', 'year'));

-- 4. (before 3: the terms' complimentary rows need the source)
alter table school_module_entitlements drop constraint school_module_entitlements_source_check;
alter table school_module_entitlements add constraint school_module_entitlements_source_check check (source in ('plan', 'founder_override', 'trial', 'complimentary'));

-- 3.
create table school_billing_terms (
  term_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  kind text not null check (kind in ('price', 'complimentary', 'discount', 'minimum')),
  price_month_minor bigint check (price_month_minor is null or price_month_minor between 0 and 100000000),
  price_year_minor bigint check (price_year_minor is null or price_year_minor between 0 and 1000000000),
  module_id text check (module_id is null or module_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  discount_bp int check (discount_bp is null or discount_bp between 0 and 10000),
  minimum_students int check (minimum_students is null or minimum_students between 0 and 1000000),
  starts_on date not null,
  ends_on date,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  created_by uuid not null references users(user_id),
  created_at timestamptz not null default now(),
  ended_by uuid references users(user_id),
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(btrim(end_reason)) between 3 and 500),
  replaced_by uuid,
  unique (school_id, term_id),
  -- Each kind carries its own value and nothing else.
  check (case kind
    when 'price' then price_month_minor is not null and price_year_minor is not null and module_id is null and discount_bp is null and minimum_students is null
    when 'complimentary' then module_id is not null and ends_on is not null and price_month_minor is null and price_year_minor is null and discount_bp is null and minimum_students is null
    when 'discount' then discount_bp is not null and price_month_minor is null and price_year_minor is null and module_id is null and minimum_students is null
    when 'minimum' then minimum_students is not null and price_month_minor is null and price_year_minor is null and module_id is null and discount_bp is null
  end),
  -- A row replaced before its first day ends the day before it: it was never in force.
  check (ends_on is null or ends_on >= starts_on - 1),
  check ((ended_at is null) = (ended_by is null)),
  check (ended_at is null or end_reason is not null or replaced_by is not null),
  -- The row that replaced it is a row of the same school (checked when the transaction commits: the two are written together).
  foreign key (school_id, replaced_by) references school_billing_terms (school_id, term_id) deferrable initially deferred
);
create index idx_school_billing_terms_school on school_billing_terms (school_id, kind, starts_on);

create function public.school_billing_terms_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  india_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if tg_op = 'DELETE' then
    raise exception 'a term is never removed: end it, or add one that replaces it' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if (new.term_id, new.school_id, new.kind, new.price_month_minor, new.price_year_minor, new.module_id, new.discount_bp, new.minimum_students, new.starts_on, new.reason, new.created_by, new.created_at)
       is distinct from (old.term_id, old.school_id, old.kind, old.price_month_minor, old.price_year_minor, old.module_id, old.discount_bp, old.minimum_students, old.starts_on, old.reason, old.created_by, old.created_at) then
      raise exception 'a term is never changed: only its last day can be brought forward' using errcode = 'check_violation';
    end if;
    if new.ends_on is null or (old.ends_on is not null and new.ends_on >= old.ends_on) then
      raise exception 'a term''s last day only moves earlier' using errcode = 'check_violation';
    end if;
    if new.ends_on < india_today - 1 then
      raise exception 'a day already past is never rewritten' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.starts_on < india_today then
    raise exception 'a term starts today or later' using errcode = 'check_violation';
  end if;
  if new.ends_on is not null and new.ends_on < new.starts_on then
    raise exception 'a term ends on or after its first day' using errcode = 'check_violation';
  end if;
  if new.ended_at is not null or new.replaced_by is not null then
    raise exception 'a new term is not ended yet' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('billing-terms:' || new.school_id::text));
  if exists (
    select 1 from school_billing_terms t
     where t.school_id = new.school_id and t.kind = new.kind and t.module_id is not distinct from new.module_id
       and daterange(t.starts_on, t.ends_on + 1, '[)') && daterange(new.starts_on, new.ends_on + 1, '[)')
  ) then
    raise exception 'another term of this kind is in force on some of these days: end it first' using errcode = 'exclusion_violation';
  end if;
  return new;
end $$;
revoke all on function public.school_billing_terms_guard() from public, anon, authenticated, service_role;
create trigger school_billing_terms_guard before insert or update or delete on school_billing_terms for each row execute function public.school_billing_terms_guard();

revoke all on school_billing_terms from public, anon, authenticated, service_role;
revoke all on school_billing_terms from app_user, nca_super;
-- Ending a term is an UPDATE of its last day; the trigger allows nothing else.
grant select, insert, update on school_billing_terms to nca_super;

alter table school_billing_terms enable row level security;
alter table school_billing_terms force row level security;
create policy school_billing_terms_tenant_isolation on school_billing_terms using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read and written as the platform role only (it bypasses row level security; the app's role has no grant either).
create policy school_billing_terms_nobody on school_billing_terms as restrictive for all using (false);

-- 5. Every role of a school reads its own audit rows (audit_read_own_school). A row about the school's terms carries
-- the price, discount or reason, which are the platform's: hidden from every role that row level security applies
-- to. The platform role bypasses it and reads them in Control.
create policy audit_billing_terms_platform_only on audit_log as restrictive for select
  using (event_action not like 'billing.terms.%');

-- Whether a school's plan has a feature (P6 reads 'personal-best'). A school's session learns yes or no for its
-- own school only, never a plan's name or price; the platform role may ask for any school.
-- A plan with every working module gives every feature. A school with no subscription row is on the plan for new
-- schools (platform setting billing.default_plan), as applyDefaultPlan would put it.
create function public.school_plan_has_feature(p_school uuid, p_feature text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select p.all_working_modules or p_feature = any (p.features)
      from plans p
     where p.plan_id = coalesce(
             (select sub.plan_id from school_subscriptions sub where sub.school_id = p_school),
             (select s.value #>> '{}' from platform_settings s where s.key = 'billing.default_plan')
           )
       and (p_school = nullif(current_setting('app.current_tenant_id', true), '')::uuid or current_setting('role', true) = 'nca_super')
  ), false)
$$;
revoke all on function public.school_plan_has_feature(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.school_plan_has_feature(uuid, text) to app_user, nca_super;

-- The nightly job is queued when there is a paid-until day to check or a complimentary module to switch on or off.
create or replace function public.billing_nightly_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'billing.nightly', jsonb_build_object('date', t.d::text), 'billing.nightly:' || t.d::text, 8
    from (select (now() at time zone 'Asia/Kolkata')::date as d) t
   where exists (select 1 from school_subscriptions where paid_until is not null)
      or exists (select 1 from school_billing_terms where kind = 'complimentary' and ends_on >= t.d - 1)
      or exists (select 1 from school_module_entitlements where source = 'complimentary')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.billing_nightly_enqueue() from public, anon, authenticated, service_role;

-- 6. Prices in paise per active student: a month, and a year (ten months: two months free).
with made as (
  insert into plans (plan_id, name, price_month_minor, price_year_minor, grace_days, all_working_modules, module_ids, features) values
    ('essential', 'Essential', 1500, 15000, 15, false,
      array['students', 'attendance', 'fees', 'communication', 'pulse', 'dashboard', 'academics', 'homework', 'timetable', 'recovery', 'staff',
            'setup', 'compliance', 'help-center', 'raise-ticket'],
      '{}'),
    ('growth', 'Growth', 3000, 30000, 15, false,
      array['students', 'attendance', 'fees', 'communication', 'pulse', 'dashboard', 'academics', 'homework', 'timetable', 'recovery', 'staff',
            'exams', 'ptm', 'events', 'complaints', 'parents', 'proxy', 'reports', 'documents',
            'setup', 'compliance', 'help-center', 'raise-ticket'],
      array['principal-dashboard', 'staff-leave']),
    ('premium', 'Premium', 5000, 50000, 15, false,
      array['students', 'attendance', 'fees', 'communication', 'pulse', 'dashboard', 'academics', 'homework', 'timetable', 'recovery', 'staff',
            'exams', 'ptm', 'events', 'complaints', 'parents', 'proxy', 'reports', 'documents',
            'parent-ai', 'early-warning', 'school-auditor', 'learning-genome', 'curriculum-gap',
            'setup', 'compliance', 'help-center', 'raise-ticket'],
      array['principal-dashboard', 'staff-leave', 'personal-best'])
  on conflict do nothing
  returning plan_id, name, price_month_minor, price_year_minor, grace_days, module_ids, features
)
insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, after_state)
select null, null, null, 'billing.plan_created', 'plans', m.plan_id,
       jsonb_build_object('name', m.name, 'price_month_minor', m.price_month_minor, 'price_year_minor', m.price_year_minor, 'grace_days', m.grace_days,
                          'module_ids', to_jsonb(m.module_ids), 'features', to_jsonb(m.features), 'by', 'c212 seed (founder, 2026-10-14)')
  from made m order by m.plan_id;
