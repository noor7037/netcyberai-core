-- C226 (supervisor's answers 1 and 2 in C223-A): where the P7 work sits in the plans, and the free first month.
--
-- 1. PLAN PLACEMENT, on the plan rows, audited 'billing.plan_changed' as C219 did (one row a plan changed):
--      Growth and Compass: the module 'admissions' (the admissions pipeline), and the plan features
--      'rte-claim-desk' (of Fees), 'compliance-desk' (of Compliance) and 'timetable-generator' (of Timetable).
--    A feature is added only where its module is listed (as Control's form requires: billing.ts, FEATURE_MODULE). The
--    student data check stays in Starter: it is part of Students and Compliance, already there. No school is moved:
--    a school keeps the modules it has until Control applies its plan again (C212), so a Starter school keeps the
--    Admissions switch C221 gave every school until then.
-- 2. THE FREE FIRST MONTH (docs/30_FREE_MONTH_TRIAL.md). school_trials: one row a school, ever. Control (the platform
--    role) starts it on India's day 0 with its last day, day 30 by default, and may extend that day, each time with
--    a reason kept where only the founder reads it (entitlement_change_reasons, C124) and an audit row that holds
--    dates and ids only. In the free month the school's module switches are rows with source 'trial' (every module
--    that works) and school_plan_has_feature answers yes for every feature. The nightly billing job moves the school
--    to its plan (school_subscriptions.plan_id: the plan chosen at onboarding, Starter unless Control chose another)
--    after the last day, once, and sets ended_at. The database holds: one a school; the last day after day 0 and at
--    most 90 days after it; day 0 is India's date of the insert; the last day only moves later and never into the
--    past; a free month that has ended never changes; a row is never removed.
--    school_trial_plan_name(): the name of the plan the school moves to, for the school's own principal and school
--    admin while the free month is in force (the school reads no plan otherwise).
--    billing_nightly_enqueue() also queues the night's job while a free month is in force.
--
-- Who reads: school_trials, and the free month's audit rows ('entitlement.trial_%'), are read by the school's own
-- principal and school admin (the days-left line in the app shell) and by the platform role (Control, the nightly
-- job); every other school role reads no row; only the platform role writes. Read by src/lib/control/trial.ts, billing.ts, billing-nightly.ts and billing-notice.ts.
-- With no free month stored, every function changed here answers exactly as before, so the code deployed before
-- this slice keeps working once this migration is applied.

-- ---- 1. Plan placement ----------------------------------------------------------------------------------------

with was as (
  select plan_id, module_ids, features from plans where plan_id in ('growth', 'compass') and not all_working_modules
), changed as (
  update plans p
     set module_ids = case when 'admissions' = any (p.module_ids) then p.module_ids else p.module_ids || array['admissions'] end,
         features = p.features || array(
           select v.feature from (values (1, 'rte-claim-desk', 'fees'), (2, 'compliance-desk', 'compliance'), (3, 'timetable-generator', 'timetable')) as v(n, feature, module_id)
            where v.module_id = any (p.module_ids) and not (v.feature = any (p.features)) order by v.n
         ),
         updated_at = now()
    from was b
   where p.plan_id = b.plan_id
     and (not ('admissions' = any (p.module_ids))
          or exists (select 1 from (values ('rte-claim-desk', 'fees'), ('compliance-desk', 'compliance'), ('timetable-generator', 'timetable')) as w(feature, module_id)
                      where w.module_id = any (p.module_ids) and not (w.feature = any (p.features))))
  returning p.plan_id, p.module_ids, p.features
)
insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, null, null, 'billing.plan_changed', 'plans', c.plan_id,
       jsonb_build_object('module_ids', to_jsonb(b.module_ids), 'features', to_jsonb(b.features)),
       jsonb_build_object('module_ids', to_jsonb(c.module_ids), 'features', to_jsonb(c.features), 'by', 'c226: plan placement (C223-A answer 1)')
  from changed c join was b on b.plan_id = c.plan_id
 order by c.plan_id;

do $$
begin
  if (select count(*) from plans where plan_id in ('growth', 'compass')) < 2 then
    raise notice 'c226: a plan growth or compass is missing; the placement was made on the plans that exist';
  end if;
end $$;

-- ---- 2. The free first month ----------------------------------------------------------------------------------

create table school_trials (
  school_id uuid primary key references schools(school_id),
  starts_on date not null,                    -- day 0: India's date on the day Control started it
  ends_on date not null,                      -- the last day of the free month (day 30 by default), inclusive
  started_by uuid not null references users(user_id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,                       -- when the nightly job moved the school to its plan
  ended_plan_id text references plans(plan_id),
  check (ends_on > starts_on and ends_on <= starts_on + 90),
  check ((ended_at is null) = (ended_plan_id is null))
);
create index idx_school_trials_in_force on school_trials (ends_on) where ended_at is null;

create function public.school_trials_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  india_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if tg_op = 'DELETE' then
    raise exception 'a free month is never removed' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if new.starts_on <> india_today then
      raise exception 'a free month starts on the day it is started' using errcode = 'check_violation';
    end if;
    if new.ended_at is not null or new.ended_plan_id is not null then
      raise exception 'a new free month has not ended' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if old.ended_at is not null then
    raise exception 'a free month that has ended is never changed' using errcode = 'check_violation';
  end if;
  if (new.school_id, new.starts_on, new.started_by, new.started_at) is distinct from (old.school_id, old.starts_on, old.started_by, old.started_at) then
    raise exception 'only the last day of a free month is extended, and its end recorded' using errcode = 'check_violation';
  end if;
  if new.ends_on < old.ends_on then
    raise exception 'the last day of a free month only moves later' using errcode = 'check_violation';
  end if;
  if new.ends_on > old.ends_on and (new.ends_on < india_today or new.ended_at is not null) then
    raise exception 'a free month is extended to today or later, and not as it ends' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.school_trials_rules() from public, anon, authenticated, service_role;
create trigger school_trials_rules before insert or update or delete on school_trials for each row execute function public.school_trials_rules();

revoke all on school_trials from public, anon, authenticated, service_role;
revoke all on school_trials from app_user, nca_super;
-- The school's office reads its own row (the days-left line); only the platform role writes (Control, the nightly job).
grant select on school_trials to app_user;
grant select, insert, update on school_trials to nca_super;

alter table school_trials enable row level security;
alter table school_trials force row level security;
create policy school_trials_tenant_isolation on school_trials using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The principal and the school admin; every other role of the school reads no row.
create policy school_trials_office on school_trials as restrictive for all using (
  current_setting('app.current_role', true) in ('principal', 'school_admin')
);

-- The free month's own audit rows ('entitlement.trial_%': its dates, the plan after it, the modules) are read by the
-- same two roles of the school, as its row is; the platform role reads them in Control. The reasons are never in them
-- (they are in entitlement_change_reasons, C124). Only the platform role writes these rows, so no school insert meets
-- this policy.
create policy audit_trial_rows_office on audit_log as restrictive for select using (
  event_action not like 'entitlement.trial\_%'
  or current_setting('app.current_role', true) in ('principal', 'school_admin')
);

-- Whether a school's plan has a feature. As C219, and yes for every feature while the school's free month is in force
-- (the same stored fact as its 'trial' module rows: the nightly job ends both together).
create or replace function public.school_plan_has_feature(p_school uuid, p_feature text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not (p_school = nullif(current_setting('app.current_tenant_id', true), '')::uuid or current_setting('role', true) = 'nca_super') then false
    when exists (select 1 from school_trials t where t.school_id = p_school and t.ended_at is null) then true
    when not exists (select 1 from school_subscriptions sub where sub.school_id = p_school) then true
    else coalesce((select p.all_working_modules or p_feature = any (p.features)
                     from school_subscriptions sub join plans p on p.plan_id = sub.plan_id
                    where sub.school_id = p_school), false)
  end
$$;
revoke all on function public.school_plan_has_feature(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.school_plan_has_feature(uuid, text) to app_user, nca_super;

-- The name of the plan a school moves to when its free month ends: for its own principal and school admin, and only
-- while the free month is in force. Nothing else of any plan (no price, no other plan). Null otherwise.
create function public.school_trial_plan_name(p_school uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select p.name
    from school_trials t
    join school_subscriptions sub on sub.school_id = t.school_id
    join plans p on p.plan_id = sub.plan_id
   where t.school_id = p_school and t.ended_at is null
     and ((p_school = nullif(current_setting('app.current_tenant_id', true), '')::uuid
           and current_setting('app.current_role', true) in ('principal', 'school_admin'))
          or current_setting('role', true) = 'nca_super')
$$;
revoke all on function public.school_trial_plan_name(uuid) from public, anon, authenticated, service_role;
grant execute on function public.school_trial_plan_name(uuid) to app_user, nca_super;

-- The night's job is also queued while a free month is in force (to move the school after its last day).
create or replace function public.billing_nightly_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'billing.nightly', jsonb_build_object('date', t.d::text), 'billing.nightly:' || t.d::text, 8
    from (select (now() at time zone 'Asia/Kolkata')::date as d) t
   where exists (select 1 from school_subscriptions where paid_until is not null)
      or exists (select 1 from school_billing_terms where kind = 'complimentary' and ends_on >= t.d - 1)
      or exists (select 1 from school_module_entitlements where source = 'complimentary')
      or exists (select 1 from school_trials where ended_at is null)
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.billing_nightly_enqueue() from public, anon, authenticated, service_role;
