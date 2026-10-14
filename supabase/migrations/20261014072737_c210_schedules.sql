-- C210 (P5 close-out): Early Warning each night and the School Health Auditor each week, through the job queue.
--
-- 1. THE CHECKS RUN AS THE SCHOOL'S OFFICE SEES IT, not as the platform. A job opens a tenant transaction for its
--    own school (the school id comes only from the job row, which only the enqueue functions below and the platform
--    role can write) as the app's role, app_user, with the role 'principal', NO person (app.current_user_id is the
--    nil uuid, which no account has), and app.current_job naming the job (withSchoolJobContext, src/lib/auth/db.ts).
--    Every read follows row level security exactly as for the principal, so the numbers are the ones "Check now"
--    gives. The platform role gains no right on flags, leave or check-ups.
-- 2. WRITES WITH NO PERSON. A flag says who opened it and who closed it: a person (opened_by, closed_by) or the
--    nightly check (opened_by_job, closed_by_job), exactly one of the two. A check-up says who recorded it: a person
--    (recorded_by) or the weekly check-up (recorded_by_job), exactly one. The restrictive policies admit the job's
--    name with no person ONLY while app.current_job is that job, which only the job's own transaction sets. A job
--    never writes what a person did about a flag (early_warning_actions stays in a person's own name), and never
--    rewrites a check-up (the update policy still asks for the person's own name). The trigger rules stay; "who
--    opened it", which never changes, now includes the job.
-- 3. THE CLOCK. pg_cron queues one job a school whose module is on and whose records can be changed (full use, or a
--    grace period that has not ended; not read-only, not suspended): early_warning.nightly at 00:20 in India every
--    night, keyed by school and India's date; auditor.weekly at 00:30 in India every Monday, keyed by school and the
--    Monday of the week.
-- 4. DEPLOY SAFETY. This migration reaches the database before the code that runs the jobs, and a job with no
--    handler dies at once. So the deployed job runner records the job types it handles in platform_settings
--    'jobs.handlers' (src/lib/jobs/handled-types.ts), and each enqueue function queues only when its own type is in
--    that list. Until the runner has said so, nothing is queued.
--
-- Rows already there stay valid: every flag has its person (opened_by; closed_by when closed) and every check-up its
-- person (recorded_by), so each new "exactly one" check holds for them as they are.
--
-- Who reads: unchanged. Flags: the principal, the school admin and the academic coordinator; a teacher, the flags of
-- the children in their own classes. Check-ups: the principal and the school admin. platform_settings and jobs: the
-- platform role only. The enqueue functions: pg_cron (the database owner) only.

-- 2. Flags opened and closed by the nightly check.
alter table early_warning_flags
  alter column opened_by drop not null,
  add column opened_by_job text,
  add column closed_by_job text;
alter table early_warning_flags drop constraint early_warning_flags_closed;
alter table early_warning_flags
  -- A person or the nightly check opened it: exactly one.
  add constraint early_warning_flags_opened_by_one check (num_nonnulls(opened_by, opened_by_job) = 1),
  -- The one job that may open or close a flag.
  add constraint early_warning_flags_by_job check (
    (opened_by_job is null or opened_by_job = 'early_warning.nightly')
    and (closed_by_job is null or closed_by_job = 'early_warning.nightly')
  ),
  -- Open: no reason, nobody closed it. Closed: a reason, and a person or the nightly check closed it, exactly one.
  add constraint early_warning_flags_closed check (
    (resolved_at is null) = (closed_reason is null)
    and num_nonnulls(closed_by, closed_by_job) = (case when resolved_at is null then 0 else 1 end)
    and (closed_reason is null or closed_reason in ('signals_cleared', 'not_active'))
  );

-- The trigger's rules, as they were, with the job counted in "who opened it".
create or replace function public.early_warning_flags_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  class_set boolean := true;
begin
  if (select count(distinct r) from unnest(new.reasons) r) <> cardinality(new.reasons) then
    raise exception 'a reason is given once' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    class_set := new.class_id is distinct from old.class_id;
  end if;
  if class_set and not exists (select 1 from students s where s.school_id = new.school_id and s.student_id = new.student_id and s.class_id = new.class_id) then
    raise exception 'a flag''s class is the class the child is in' using errcode = 'check_violation';
  end if;
  if (select coalesce(array_agg(k order by k), '{}'::text[]) from jsonb_object_keys(new.evidence) k)
     is distinct from (select coalesce(array_agg(r order by r), '{}'::text[]) from unnest(new.reasons) r)
     or exists (select 1 from unnest(new.reasons) r where jsonb_typeof(new.evidence -> r) is distinct from 'object') then
    raise exception 'a flag carries evidence for each of its reasons, and for nothing else' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if new.resolved_at is not null then
      raise exception 'a flag is opened open' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if (new.flag_id, new.school_id, new.student_id, new.detected_at, new.opened_by, new.opened_by_job) is distinct from (old.flag_id, old.school_id, old.student_id, old.detected_at, old.opened_by, old.opened_by_job) then
    raise exception 'whose flag it is, and who opened it and when, is never changed' using errcode = 'check_violation';
  end if;
  if old.resolved_at is not null and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'a closed flag stays closed: a later signal opens a new one' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.early_warning_flags_rules() from public, anon, authenticated, service_role;

-- Opened by a check one of the three roles ran, in that person's own name; or by the nightly check, with no person,
-- only inside the nightly check's own transaction. A teacher opens none.
alter policy early_warning_flags_opened_as_self on early_warning_flags with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and (
    (opened_by = nullif(current_setting('app.current_user_id', true), '')::uuid and opened_by_job is null)
    or (opened_by is null and opened_by_job = 'early_warning.nightly' and current_setting('app.current_job', true) = 'early_warning.nightly')
  )
);
-- Brought up to date or closed by a check one of the three roles ran (closed in that person's own name), or by the
-- nightly check inside its own transaction. A teacher changes no row.
alter policy early_warning_flags_checked_by_office on early_warning_flags
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']))
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
    and (closed_by is null or closed_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
    and (closed_by_job is null or (closed_by_job = 'early_warning.nightly' and current_setting('app.current_job', true) = 'early_warning.nightly'))
  );

-- 2. Check-ups recorded by the weekly check-up.
alter table school_health_runs
  alter column recorded_by drop not null,
  add column recorded_by_job text,
  -- A person or the weekly check-up recorded it: exactly one.
  add constraint school_health_runs_recorded_by_one check (num_nonnulls(recorded_by, recorded_by_job) = 1),
  add constraint school_health_runs_by_job check (recorded_by_job is null or recorded_by_job = 'auditor.weekly');
-- Recorded in one's own name; or by the weekly check-up, with no person, only inside its own transaction. The update
-- policy is left as it was: a check-up is rewritten only in a person's own name, so the weekly check-up never
-- rewrites a day's row, and a person's "Check again" the same day takes the row over in their own name.
alter policy school_health_runs_recorded_as_self on school_health_runs with check (
  (recorded_by = nullif(current_setting('app.current_user_id', true), '')::uuid and recorded_by_job is null)
  or (recorded_by is null and recorded_by_job = 'auditor.weekly' and current_setting('app.current_job', true) = 'auditor.weekly')
);

-- 4. The job types the deployed runner can run: written by the runner (which only ever updates this row and never
-- makes it, so a database without it queues nothing), read by the enqueue functions below. Empty until the runner
-- says otherwise.
insert into platform_settings (key, value) values ('jobs.handlers', '[]'::jsonb)
on conflict (key) do nothing;

-- 3. One job a school whose module is on and whose records can be changed, tonight (India's date). A grace period is
-- full use until it ends (as loadEntitlements reads it); read-only, a grace period that has ended and suspended are
-- left alone. The job asks again when it runs.
create function public.early_warning_nightly_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, school_id, max_attempts)
  select 'early_warning.nightly', jsonb_build_object('date', t.d::text), 'early_warning.nightly:' || s.school_id::text || ':' || t.d::text, s.school_id, 5
    from (select (now() at time zone 'Asia/Kolkata')::date as d) t
    cross join schools s
    join school_module_entitlements m on m.school_id = s.school_id and m.module_id = 'early-warning' and m.enabled
    left join school_entitlements e on e.school_id = s.school_id
   where (coalesce(e.access_mode, 'full') = 'full' or (e.access_mode = 'grace' and (e.grace_ends_at is null or e.grace_ends_at > now())))
     and exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'early_warning.nightly')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.early_warning_nightly_enqueue() from public, anon, authenticated, service_role;

-- This week's check-up (the Monday of India's date), once a school.
create function public.auditor_weekly_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, school_id, max_attempts)
  select 'auditor.weekly', jsonb_build_object('week', t.w::text), 'auditor.weekly:' || s.school_id::text || ':' || t.w::text, s.school_id, 5
    from (select d - (extract(isodow from d)::int - 1) as w from (select (now() at time zone 'Asia/Kolkata')::date as d) x) t
    cross join schools s
    join school_module_entitlements m on m.school_id = s.school_id and m.module_id = 'school-auditor' and m.enabled
    left join school_entitlements e on e.school_id = s.school_id
   where (coalesce(e.access_mode, 'full') = 'full' or (e.access_mode = 'grace' and (e.grace_ends_at is null or e.grace_ends_at > now())))
     and exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'auditor.weekly')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.auditor_weekly_enqueue() from public, anon, authenticated, service_role;

-- 18:50 UTC is 00:20 in India, after the fees and billing nightlies. Sunday 19:00 UTC is Monday 00:30 in India.
-- cron.schedule upserts by name. Where there is no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('early-warning-nightly', '50 18 * * *', 'select public.early_warning_nightly_enqueue()');
    perform cron.schedule('auditor-weekly', '0 19 * * 0', 'select public.auditor_weekly_enqueue()');
  end if;
end $$;
