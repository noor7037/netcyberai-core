-- C219: the P6 close-out (supervisor's answers, Decision Log C218-A and C198-A).
--
-- 1. PLAN NAMES. The plans are Starter, Growth and Compass, the founder's names published on the website (C198-A).
--    C212 seeded 'essential' and 'premium' by mistake. Each is renamed in place: its id and its name, and every row
--    that names it: school_subscriptions, subscription_payments (append-only: its guard is held off for this one
--    statement, which changes nothing a payment says but the plan's new id), school_entitlements.plan and the
--    platform setting of the plan for new schools. Prices, modules, features and grace days are kept. One audit row
--    'billing.plan_renamed' a plan says what happened. The rename stops, changing nothing, if a plan 'starter' or
--    'compass' (or a plan already named Starter or Compass) exists. Billing counts "enrolled students", the website's
--    word; the rule is the students module's own (status 'active') and is not changed here.
-- 2. TEACHER COPILOT is in Compass (C218-A answer 3): added to its modules, audited. It is not built yet, so it waits
--    until it works and the plan is applied again. Documents stays in Growth (and so in Compass).
-- 3. 'standard' IS FOR TEST SCHOOLS ONLY (C218-A answer 3). plans.test_schools_only says so of a plan (true for
--    'standard' alone). The database refuses a subscription to such a plan for a school that is not a test fixture,
--    a school on one being made a real school, and a plan being made test-only while a real school is on it. The
--    plan for new schools (platform setting billing.default_plan) is a real school's plan: it moves from 'standard'
--    to Starter here (Control changes it under Billing & Plans, and refuses a test-only plan). A school with no
--    subscription row (made before plans existed, or by a test) keeps every feature, as it has had until now; every
--    school made since C204 gets its row when it is made.
-- 4. THE SCHOOLS ROW. Only the principal and the school admin of a school update its row, and only its profile
--    columns. The profile columns are the school's own details that exist as columns today:
--        name, address
--    (Every app-role update of schools in src before this slice set board_id, from the grading scheme screen; that
--    choice moves to Control. There are no contact or logo columns yet; a slice that adds one adds it here.) Plan,
--    subscription, billing and budget (plan, subscription_status, monthly_budget_paise), pilot and outbound
--    (is_pilot, pilot_allow_outbound), the test-fixture flag, the board (board, board_id, board_set_by,
--    board_set_at), onboarding, jurisdiction, time zone, quiet hours and the dispatch switches change only through
--    the platform role (nca_super, Control). Held three ways: the app's role keeps SELECT and is granted UPDATE on
--    the profile columns alone (no INSERT, no DELETE: schools are made in Control); a RESTRICTIVE update policy
--    admits only the principal and the school admin of that school; and a trigger refuses any change to another
--    column from the app's role, whatever grant a later migration adds.
-- 5. THE DASHBOARD'S FIVE ROLE-AND-FACT PAIRS that C210 left to the app's role list (test/insights/access.test.ts)
--    now get nothing from the database. Two narrow rules, each a function the facts' own queries read through:
--      reads_attendance_days(): who reads a whole class's day of attendance (the principal, the school admin, the
--        academic coordinator, a teacher). The Attendance screen's list of classes for a day (classesOnDay), and so
--        the facts attendance.classes_marked and attendance.classes_unmarked, ask it: an accountant, who keeps the
--        classes and students the fees need, is answered no class at all, rather than every class "not marked".
--      reads_school_message_totals(): who reads the school's whole message log (the principal, the school admin).
--        The Communication screen's counts by state and its month's spend (countMessages, schoolSpend), and so the
--        facts messages.total, messages.failed, messages.held and whatsapp.spend, ask it: a teacher is answered
--        nothing. A teacher's own screens read their own classes' messages as before (communication_log's policy is
--        not changed here).
--    The platform role and the database's owner are answered yes by both (a job or Control counting a school).
-- 6. CO-SCHOLASTIC GRADES (docs/27 row 9c, the scheme's co-scholastic areas of 9a): co_scholastic_grades, one grade a
--    child, exam and area, from the grading scheme in force when it is entered (a trigger checks the area and the
--    grade against it). Entered by the class teacher, the principal, the school admin or the academic coordinator,
--    in their own name; read by those three and a teacher of the class. Frozen with the class's publication, as
--    remarks are (exam_class_frozen). The report card shows them where the kept scheme's layout says so.
-- 7. ATTENDANCE ON A REPORT CARD IS FROZEN AT PUBLISH. exam_publications.attendance keeps each child's attendance
--    for the exam's session up to the day it was published (present or late, of the days marked), worked out by the
--    publication's own trigger for every child on the class's roll, so a later correction never changes a published
--    card. Existing publications are filled in once, as their cards show them today (up to their publish day).
-- 8. THE CURRICULUM GAP IS PER SESSION: curriculum_gap_units(class, subject, session) counts lessons marked "Taught"
--    on the session's days and papers of the session's exams only. The two-argument reader stays for the code
--    deployed before this slice; the cleanup after it removes it.
--
-- Who reads what is said at each part. Read by: src/lib/frameworks/plans.ts and src/lib/control/billing*.ts (1-3),
-- src/lib/exams/boards.ts (4), src/lib/attendance/day.ts, src/lib/whatsapp/delivery.ts and cost.ts (5),
-- src/lib/exams/co-scholastic.ts, publish.ts and report-card.ts (6, 7), src/lib/curriculum-gap (8).

-- ---- 1. Plan names --------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from plans where plan_id in ('starter', 'compass'))
     or exists (select 1 from plans where lower(btrim(name)) in ('starter', 'compass') and plan_id not in ('essential', 'premium')) then
    raise exception 'c219: a plan starter or compass already exists; the rename of essential and premium was not made';
  end if;
end $$;

insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, null, null, 'billing.plan_renamed', 'plans', v.new_id,
       jsonb_build_object('plan_id', p.plan_id, 'name', p.name),
       jsonb_build_object('plan_id', v.new_id, 'name', v.new_name, 'by', 'c219: the founder''s plan names (C198-A, C218-A)')
  from plans p
  join (values ('essential', 'starter', 'Starter'), ('premium', 'compass', 'Compass')) as v(old_id, new_id, new_name) on v.old_id = p.plan_id
 order by v.new_id;

alter table school_subscriptions drop constraint school_subscriptions_plan_id_fkey;
alter table subscription_payments drop constraint subscription_payments_plan_id_fkey;

update plans p set plan_id = v.new_id, name = v.new_name, updated_at = now()
  from (values ('essential', 'starter', 'Starter'), ('premium', 'compass', 'Compass')) as v(old_id, new_id, new_name)
 where p.plan_id = v.old_id;
update school_subscriptions set plan_id = case plan_id when 'essential' then 'starter' else 'compass' end where plan_id in ('essential', 'premium');
-- A recorded payment is never changed (subscription_payments_fixed); its plan's id is renamed, nothing else.
alter table subscription_payments disable trigger subscription_payments_fixed;
update subscription_payments set plan_id = case plan_id when 'essential' then 'starter' else 'compass' end where plan_id in ('essential', 'premium');
alter table subscription_payments enable trigger subscription_payments_fixed;
update school_entitlements set plan = case plan when 'essential' then 'starter' else 'compass' end where plan in ('essential', 'premium');
update platform_settings set value = to_jsonb(case value #>> '{}' when 'essential' then 'starter' else 'compass' end), updated_at = now()
 where key = 'billing.default_plan' and value #>> '{}' in ('essential', 'premium');

alter table school_subscriptions add constraint school_subscriptions_plan_id_fkey foreign key (plan_id) references plans (plan_id);
alter table subscription_payments add constraint subscription_payments_plan_id_fkey foreign key (plan_id) references plans (plan_id);

-- ---- 2. Teacher Copilot in Compass ------------------------------------------------------------------------------

with changed as (
  update plans set module_ids = module_ids || array['teacher-copilot'], updated_at = now()
   where plan_id = 'compass' and not ('teacher-copilot' = any (module_ids)) and not all_working_modules
  returning plan_id, module_ids
)
insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, null, null, 'billing.plan_changed', 'plans', c.plan_id,
       jsonb_build_object('module_ids', to_jsonb(array_remove(c.module_ids, 'teacher-copilot'))),
       jsonb_build_object('module_ids', to_jsonb(c.module_ids), 'by', 'c219: Teacher Copilot is in Compass (C218-A)')
  from changed c;

-- ---- 3. 'standard' for test schools only ------------------------------------------------------------------------

alter table plans add column test_schools_only boolean not null default false;
update plans set test_schools_only = true where plan_id = 'standard';
comment on column plans.test_schools_only is 'C219: only a test-fixture school may subscribe to this plan (the database refuses a real school).';

-- The plan for new schools is a real school's plan.
with moved as (
  select s.value #>> '{}' as before from platform_settings s
   where s.key = 'billing.default_plan'
     and exists (select 1 from plans p where p.plan_id = s.value #>> '{}' and p.test_schools_only)
     and exists (select 1 from plans p where p.plan_id = 'starter' and p.retired_at is null)
), done as (
  update platform_settings set value = '"starter"'::jsonb, updated_at = now()
   where key = 'billing.default_plan' and exists (select 1 from moved)
  returning key
)
insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, null, null, 'platform_setting.update', 'platform_settings', 'billing.default_plan',
       jsonb_build_object('value', m.before), jsonb_build_object('value', 'starter', 'by', 'c219: a test schools'' plan is not the plan for new schools')
  from moved m where exists (select 1 from done);

-- One rule: a plan for test schools only is never a real school's. With the owner's rights, so the answer does not
-- depend on what the writer may read (only the platform role writes these tables).
create function public.plan_test_only_for_real_school(p_plan_id text, p_school_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from plans p where p.plan_id = p_plan_id and p.test_schools_only)
     and exists (select 1 from schools s where s.school_id = p_school_id and not s.is_test_fixture)
$$;
revoke all on function public.plan_test_only_for_real_school(text, uuid) from public, anon, authenticated, service_role;

create function public.school_subscriptions_real_plan() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.plan_test_only_for_real_school(new.plan_id, new.school_id) then
    raise exception 'this plan is for test schools only: a real school is put on a plan for schools' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.school_subscriptions_real_plan() from public, anon, authenticated, service_role;
create trigger school_subscriptions_real_plan before insert or update of plan_id, school_id on school_subscriptions
  for each row execute function public.school_subscriptions_real_plan();

create function public.schools_test_plan_kept() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.is_test_fixture and not new.is_test_fixture
     and exists (select 1 from school_subscriptions sub join plans p on p.plan_id = sub.plan_id where sub.school_id = new.school_id and p.test_schools_only) then
    raise exception 'this school is on a plan for test schools only: put it on a plan for schools first' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.schools_test_plan_kept() from public, anon, authenticated, service_role;
create trigger schools_test_plan_kept before update of is_test_fixture on schools
  for each row execute function public.schools_test_plan_kept();

create function public.plans_test_only_kept() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.test_schools_only and not old.test_schools_only
     and exists (select 1 from school_subscriptions sub join schools s on s.school_id = sub.school_id where sub.plan_id = new.plan_id and not s.is_test_fixture) then
    raise exception 'a real school is on this plan: it cannot become a plan for test schools only' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.plans_test_only_kept() from public, anon, authenticated, service_role;
create trigger plans_test_only_kept before update of test_schools_only on plans
  for each row execute function public.plans_test_only_kept();

-- No school is moved here. A real school already on a test schools' plan (none is expected: C218-A says the two
-- schools on 'standard' on the test database are test fixtures) keeps it until Control moves it; the triggers refuse
-- only a new subscription or a change. Said here, so whoever applies this migration sees it.
do $$
declare
  n integer;
begin
  select count(*) into n from school_subscriptions sub join plans p on p.plan_id = sub.plan_id join schools s on s.school_id = sub.school_id
   where p.test_schools_only and not s.is_test_fixture;
  if n > 0 then
    raise notice 'c219: % real school(s) are on a plan for test schools only; move them to a plan for schools in Control', n;
  end if;
end $$;

-- Whether a school's plan has a feature. As C212, except a school with no subscription row: it has every feature,
-- as it had under the plan for new schools until now (that plan is no longer one with every module).
create or replace function public.school_plan_has_feature(p_school uuid, p_feature text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not (p_school = nullif(current_setting('app.current_tenant_id', true), '')::uuid or current_setting('role', true) = 'nca_super') then false
    when not exists (select 1 from school_subscriptions sub where sub.school_id = p_school) then true
    else coalesce((select p.all_working_modules or p_feature = any (p.features)
                     from school_subscriptions sub join plans p on p.plan_id = sub.plan_id
                    where sub.school_id = p_school), false)
  end
$$;
revoke all on function public.school_plan_has_feature(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.school_plan_has_feature(uuid, text) to app_user, nca_super;

-- ---- 4. The schools row -----------------------------------------------------------------------------------------

revoke insert, update, delete on schools from app_user;
grant update (name, address) on schools to app_user;

create policy schools_profile_by_office on schools as restrictive for update
  using (
    school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    and current_setting('app.current_role', true) in ('principal', 'school_admin')
  )
  with check (
    school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    and current_setting('app.current_role', true) in ('principal', 'school_admin')
  );

-- The app's role changes the profile columns and nothing else (and the day the row last changed, set here).
create function public.schools_profile_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'app_user' then
    if (to_jsonb(new) - array['name', 'address', 'updated_at']) is distinct from (to_jsonb(old) - array['name', 'address', 'updated_at']) then
      raise exception 'a school changes only its own name and address; everything else is changed by NetCyberAI in Control' using errcode = 'insufficient_privilege';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.schools_profile_only() from public, anon, authenticated, service_role;
create trigger schools_profile_only before update on schools for each row execute function public.schools_profile_only();

-- The board is recorded by NetCyberAI in Control only (the platform role); the trigger keeps who and when.
create or replace function public.schools_board_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- A new school whose form named CBSE or ICSE starts on that board.
    if new.board_id is null then
      new.board_id := case new.board::text when 'CBSE' then 'cbse' when 'ICSE' then 'cisce' end;
    end if;
    new.board_set_by := null;
    new.board_set_at := case when new.board_id is null then null else now() end;
    return new;
  end if;
  if new.board_id is distinct from old.board_id then
    if current_user = 'app_user'
       or (current_user = 'nca_super' and coalesce(current_setting('app.current_role', true), '') <> 'super_admin') then
      raise exception 'NetCyberAI records the school''s board, in Control' using errcode = 'insufficient_privilege';
    end if;
    new.board_set_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
    new.board_set_at := now();
  else
    -- Who set the board and when are written by this trigger only.
    new.board_set_by := old.board_set_by;
    new.board_set_at := old.board_set_at;
  end if;
  return new;
end $$;
revoke all on function public.schools_board_rules() from public, anon, authenticated, service_role;

-- ---- 5. The dashboard's five pairs ------------------------------------------------------------------------------

-- Who reads a whole class's day of attendance: the roles the attendance screens are for. Not the accountant.
create function public.reads_attendance_days() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select current_user <> 'app_user'
      or coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
$$;
revoke all on function public.reads_attendance_days() from public, anon, authenticated, service_role;
grant execute on function public.reads_attendance_days() to app_user, nca_super;

-- Who reads the school's whole message log, and so its totals: the principal and the school admin.
create function public.reads_school_message_totals() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select current_user <> 'app_user'
      or coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin')
$$;
revoke all on function public.reads_school_message_totals() from public, anon, authenticated, service_role;
grant execute on function public.reads_school_message_totals() to app_user, nca_super;

-- ---- 6. Co-scholastic grades ------------------------------------------------------------------------------------

create table co_scholastic_grades (
  grade_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  area text not null,
  grade text not null,
  written_by uuid not null,
  written_at timestamptz not null default now(),
  unique (school_id, grade_id),
  -- One grade a child, exam and area.
  unique (school_id, exam_id, student_id, area),
  foreign key (school_id, exam_id) references exams(school_id, exam_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, written_by) references users(school_id, user_id),
  constraint co_scholastic_grades_area check (char_length(btrim(area)) between 1 and 60),
  constraint co_scholastic_grades_grade check (char_length(btrim(grade)) between 1 and 20)
);
create index idx_co_scholastic_grades_class on co_scholastic_grades (school_id, exam_id, class_id);

-- An area and a grade of the school's grading scheme in force, for a child of a class the exam has papers for. Read
-- as the person writing (the class teacher reads their own class's papers and children; the office every class).
create function public.co_scholastic_grades_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  co jsonb;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.grade_id, new.school_id, new.exam_id, new.class_id, new.student_id, new.area) is distinct from (old.grade_id, old.school_id, old.exam_id, old.class_id, old.student_id, old.area) then
    raise exception 'a co-scholastic grade''s exam, class, child and area never change' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from exam_papers p where p.school_id = new.school_id and p.exam_id = new.exam_id and p.class_id = new.class_id) then
      raise exception 'a co-scholastic grade is for a class the exam has papers for' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from students s where s.school_id = new.school_id and s.student_id = new.student_id and s.class_id = new.class_id) then
      raise exception 'a co-scholastic grade is for a child of that class' using errcode = 'check_violation';
    end if;
  end if;
  new.area := btrim(new.area);
  new.grade := btrim(new.grade);
  select g.scheme -> 'coScholastic' into co from grading_schemes g where g.school_id = new.school_id order by g.version desc limit 1;
  if co is null or jsonb_typeof(co) <> 'object'
     or not exists (select 1 from jsonb_array_elements_text(co -> 'areas') a where a = new.area)
     or not exists (select 1 from jsonb_array_elements(co -> 'grades') x where x ->> 'grade' = new.grade) then
    raise exception 'a co-scholastic grade is one of the grading scheme''s, for one of its areas' using errcode = 'check_violation';
  end if;
  new.written_at := now();
  return new;
end $$;
revoke all on function public.co_scholastic_grades_rules() from public, anon, authenticated, service_role;
create trigger co_scholastic_grades_rules before insert or update or delete on co_scholastic_grades for each row execute function public.co_scholastic_grades_rules();

-- Frozen with the class's publication, as its marks and remarks are.
create function public.co_scholastic_frozen_when_published() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then
    perform pg_advisory_xact_lock_shared(public.exam_class_lock_key(old.exam_id, old.class_id));
    if public.exam_class_frozen(old.school_id, old.exam_id, old.class_id) then
      raise exception 'the co-scholastic grades of a published class are frozen: the principal reopens it, with a reason, first' using errcode = 'object_not_in_prerequisite_state';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    perform pg_advisory_xact_lock_shared(public.exam_class_lock_key(new.exam_id, new.class_id));
    if public.exam_class_frozen(new.school_id, new.exam_id, new.class_id) then
      raise exception 'the co-scholastic grades of a published class are frozen: the principal reopens it, with a reason, first' using errcode = 'object_not_in_prerequisite_state';
    end if;
    return new;
  end if;
  return old;
end $$;
revoke all on function public.co_scholastic_frozen_when_published() from public, anon, authenticated, service_role;
create trigger co_scholastic_frozen_when_published before insert or update or delete on co_scholastic_grades for each row execute function public.co_scholastic_frozen_when_published();

revoke all on co_scholastic_grades from public, anon, authenticated, service_role;
revoke all on co_scholastic_grades from app_user, nca_super;
grant select, insert, update, delete on co_scholastic_grades to app_user;

alter table co_scholastic_grades enable row level security;
alter table co_scholastic_grades force row level security;
create policy co_scholastic_grades_tenant_isolation on co_scholastic_grades using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read by the three roles that run exams, and by a teacher for their own classes. The accountant reads nothing.
create policy co_scholastic_grades_readers on co_scholastic_grades as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (current_setting('app.current_role', true) = 'teacher' and class_id in (select unnest(public.teacher_own_class_ids())))
);
-- Written, changed and cleared by the class's class teacher or the three roles that run exams, in their own name.
create policy co_scholastic_grades_written on co_scholastic_grades as restrictive for insert with check (
  (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']) or public.is_class_teacher_of(class_id))
  and written_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy co_scholastic_grades_changed on co_scholastic_grades as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']) or public.is_class_teacher_of(class_id))
  with check (
    (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']) or public.is_class_teacher_of(class_id))
    and written_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  );
create policy co_scholastic_grades_cleared on co_scholastic_grades as restrictive for delete
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']) or public.is_class_teacher_of(class_id));

-- ---- 7. Attendance frozen at publish ----------------------------------------------------------------------------

alter table exam_publications add column attendance jsonb;
alter table exam_publications add constraint exam_publications_attendance check (attendance is null or (jsonb_typeof(attendance) = 'object' and pg_column_size(attendance) <= 262144));
comment on column exam_publications.attendance is 'C219: each child''s attendance for the exam''s session up to the day it was published, {student_id: {present, days}}; null when the exam has no session.';

-- Each child on the class's roll: the days marked for them in the exam's session up to `upto`, and how many of
-- those they were in school (present or late). Null when the exam has no session. One rule in one place: the trigger
-- below and the fill-in of the publications made before this migration.
create function public.publication_attendance(p_school_id uuid, p_exam_id uuid, p_class_id uuid, p_upto date) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select case when a.session_id is null then null else coalesce((
    select jsonb_object_agg(x.student_id::text, jsonb_build_object('present', x.present, 'days', x.days))
      from (
        select s.student_id,
               (count(m.attendance_id) filter (where m.status in ('present', 'late')))::int as present,
               count(m.attendance_id)::int as days
          from students s
          left join attendance m on m.school_id = s.school_id and m.student_id = s.student_id
                                and m.date >= a.start_date and m.date <= least(a.end_date, p_upto)
         where s.school_id = p_school_id and s.class_id = p_class_id and s.status in ('active', 'pending_consent')
         group by s.student_id
      ) x
  ), '{}'::jsonb) end
    from exams e left join academic_sessions a on a.school_id = e.school_id and a.session_id = e.session_id
   where e.school_id = p_school_id and e.exam_id = p_exam_id
$$;
revoke all on function public.publication_attendance(uuid, uuid, uuid, date) from public, anon, authenticated, service_role;
-- Called by the publication's trigger in the publisher's own session; it reads with the caller's own rights, so it
-- answers nobody more than their own row level security gives them.
grant execute on function public.publication_attendance(uuid, uuid, uuid, date) to app_user;

-- The publications already made: as their cards show them today, up to the day each was published.
alter table exam_publications disable trigger exam_publications_rules;
update exam_publications x set attendance = public.publication_attendance(x.school_id, x.exam_id, x.class_id, (x.published_at at time zone 'Asia/Kolkata')::date);
alter table exam_publications enable trigger exam_publications_rules;

create or replace function public.exam_publications_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  kept record;
  papers integer;
  waiting integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'a publication is never removed: the principal reopens it, with a reason' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(public.exam_class_lock_key(new.exam_id, new.class_id));
    -- Read as the person publishing (the office reads every class's papers, children, attendance and the scheme).
    select count(*)::integer, count(*) filter (where p.entered_at is null)::integer into papers, waiting
      from exam_papers p where p.school_id = new.school_id and p.exam_id = new.exam_id and p.class_id = new.class_id;
    if papers = 0 then
      raise exception 'an exam is published for a class it has papers for' using errcode = 'check_violation';
    end if;
    if waiting > 0 then
      raise exception 'an exam is published for a class only when every paper of it is entered' using errcode = 'check_violation';
    end if;
    -- The scheme in force now is the one kept, copied as it is.
    select g.version, g.scheme into kept from grading_schemes g where g.school_id = new.school_id order by g.version desc limit 1;
    if not found then
      raise exception 'an exam is published by the school''s grading scheme: save one first' using errcode = 'check_violation';
    end if;
    if exists (select 1 from exam_publications x where x.school_id = new.school_id and x.exam_id = new.exam_id and x.class_id = new.class_id and x.reopened_at is null) then
      raise exception 'this exam is already published for this class: the principal reopens it first' using errcode = 'unique_violation';
    end if;
    new.scheme_version := kept.version;
    new.scheme := kept.scheme;
    new.version := coalesce((select max(x.version) from exam_publications x where x.school_id = new.school_id and x.exam_id = new.exam_id and x.class_id = new.class_id), 0) + 1;
    new.published_at := now();
    -- Attendance up to today in India, the day it is published: kept, so a later correction never changes the card.
    new.attendance := public.publication_attendance(new.school_id, new.exam_id, new.class_id, (now() at time zone 'Asia/Kolkata')::date);
    new.reopened_by := null;
    new.reopened_at := null;
    new.reopen_reason := null;
    return new;
  end if;
  -- An update is a reopening, once, with a reason; nothing else about a publication changes.
  if old.reopened_at is not null then
    raise exception 'a reopened publication does not change: publish the class again' using errcode = 'check_violation';
  end if;
  if (new.publication_id, new.school_id, new.exam_id, new.class_id, new.version, new.scheme_version, new.scheme, new.recognition, new.attendance, new.published_by, new.published_at)
     is distinct from (old.publication_id, old.school_id, old.exam_id, old.class_id, old.version, old.scheme_version, old.scheme, old.recognition, old.attendance, old.published_by, old.published_at) then
    raise exception 'a publication is only reopened: what was published never changes' using errcode = 'check_violation';
  end if;
  if new.reopened_by is null or new.reopen_reason is null then
    raise exception 'a publication is reopened by a person, with a reason' using errcode = 'check_violation';
  end if;
  new.reopen_reason := btrim(new.reopen_reason);
  new.reopened_at := now();
  return new;
end $$;
revoke all on function public.exam_publications_rules() from public, anon, authenticated, service_role;

-- ---- 8. The Curriculum Gap of one session ----------------------------------------------------------------------

-- As curriculum_gap_units (C216), for one academic session of the school: lessons marked "Taught" on the session's
-- days, and papers of the session's exams. Answered to the same people, and nothing for a session of another school.
create function public.curriculum_gap_units(p_class_id uuid, p_subject_id uuid, p_session_id uuid)
returns table (unit_id uuid, place integer, chapter text, topic text, added_at timestamptz, taught_first date, taught_last date, lessons integer, papers jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.unit_id, u.position, u.chapter, u.topic, u.created_at,
         t.first_day, t.last_day, coalesce(t.n, 0),
         coalesce(pp.list, '[]'::jsonb)
    from syllabus_units u
    join academic_sessions a on a.school_id = u.school_id and a.session_id = p_session_id
    left join lateral (
      select min(p.date) as first_day, max(p.date) as last_day, count(*)::integer as n
        from syllabus_progress p
       where p.school_id = u.school_id and p.unit_id = u.unit_id
         and p.class_id = u.class_id and p.subject_id = u.subject_id
         and p.status = 'taught'
         and p.date between a.start_date and a.end_date
    ) t on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('paperId', ep.paper_id, 'examId', e.exam_id, 'examName', e.name, 'date', ep.paper_date)
                       order by ep.paper_date nulls last, e.created_at, ep.paper_id) as list
        from exam_papers ep
        join exams e on e.school_id = ep.school_id and e.exam_id = ep.exam_id
       where ep.school_id = u.school_id and ep.class_id = u.class_id and ep.subject_id = u.subject_id
         and e.session_id = p_session_id
         and u.unit_id = any (ep.unit_ids)
    ) pp on true
   where u.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and u.class_id = p_class_id and u.subject_id = p_subject_id
     and (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
          or (coalesce(current_setting('app.current_role', true), '') = 'teacher' and p_class_id = any (public.teacher_own_class_ids())))
   order by u.position, u.created_at, u.unit_id
$$;
revoke all on function public.curriculum_gap_units(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.curriculum_gap_units(uuid, uuid, uuid) from app_user, nca_super;
grant execute on function public.curriculum_gap_units(uuid, uuid, uuid) to app_user;
