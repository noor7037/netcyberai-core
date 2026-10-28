-- W6-D (docs/38 section 1; Decision Log C398; the founder's decision C230-AU): everything built is ON by default, everywhere.
-- Nobody turns a feature on; the founder turns things off later, by hand, in Control -> Apps. Nothing here touches what stays
-- a gate: a parent's consents, the per-provider "cleared for children's words" switch, the daily caps, the spend alert, the
-- PIN, the checked-explanations-only list, Plus (family.plus_open) and the Focus Lock (C304: off until written pilot
-- consent, so it gets no row here). A switch a person set off in Control carries the reason Control requires; every row
-- with a reason is kept exactly as it is. Only rows with no reason (no person ever decided) are made on.

-- 1. The whole-app switch of each of the three apps: a row, on, where there is none. (A missing '*' row reads as off.)
insert into control.app_flags (app, module, enabled, reason)
select a, '*', true, null from unnest(array['family', 'teacher', 'school_web']) a
on conflict (app, module) do nothing;

-- 2. Every built Family module: an enabled row for everyone where there is none (the code already counts a missing row as
--    on; the row lets the database's own reader, family.module_on, agree).
insert into control.app_flags (app, module, enabled, reason)
select 'family', m, true, null from unnest(array['careers', 'english_programme', 'exams_portal', 'habit', 'home_plan', 'homework', 'offline', 'opportunities', 'parent_card', 'plan', 'practice', 'progress', 'school_today', 'understand', 'videos', 'voice_input', 'worksheets']) m
on conflict (app, module) do nothing;

-- 3. Any switch of any app that is off, limited to a share or a preview, or past its end date, with no reason from a person:
--    on for everyone, no end. (The Focus Lock keeps whatever Control saved for it.)
update control.app_flags
   set enabled = true, audience = 'everyone', audience_percent = null, audience_schools = null, ends_at = null, updated_at = now()
 where reason is null and module <> 'focus_lock'
   and (not enabled or audience <> 'everyone' or (ends_at is not null and ends_at <= now()));

-- 4. Test-fixture (demo) schools on a plan for test schools only that gives every working module: the module rows of the
--    plan, on, for every module that works today (live or partial in src/lib/contracts/modules.ts). A module a person
--    set by hand (founder_override) or a trial keeps its row. Applying the plan from Control gives the same result and
--    keeps it current as modules go live.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select e.school_id, m, true, 'plan'
  from school_entitlements e
  join schools s on s.school_id = e.school_id and s.is_test_fixture
  join plans p on p.plan_id = e.plan and p.test_schools_only and p.all_working_modules,
       unnest(array['dashboard', 'setup', 'admissions', 'students', 'parents', 'staff', 'academics', 'attendance', 'timetable', 'proxy', 'homework', 'recovery', 'exams', 'pulse', 'communication', 'ptm', 'events', 'complaints', 'fees', 'documents', 'compliance', 'reports', 'early-warning', 'learning-genome', 'curriculum-gap', 'parent-ai', 'school-auditor', 'help-center', 'raise-ticket']) m
on conflict (school_id, module_id) do update set enabled = true, updated_at = now()
  where school_module_entitlements.source = 'plan' and not school_module_entitlements.enabled;
