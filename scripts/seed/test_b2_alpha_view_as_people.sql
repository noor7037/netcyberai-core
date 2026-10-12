-- TEST DATABASE ONLY (C165). Never run on production.
--
-- Two people in "B2 Test School Alpha" for the founder's "View as": a
-- principal and an academic coordinator, each given classes and subjects
-- that already exist there. They have no password and no sign-in account:
-- the only way in is "View as" from Control. Safe to run twice.

do $$
declare
  v_school uuid;
  v_principal constant uuid := 'f1c50000-0000-4000-8000-0000000000a1';
  v_coordinator constant uuid := 'f1c50000-0000-4000-8000-0000000000a2';
  v_principal_teacher uuid;
  v_coordinator_teacher uuid;
begin
  select school_id into strict v_school from schools where name = 'B2 Test School Alpha';

  insert into users (user_id, school_id, email, role, display_name, is_active) values
    (v_principal, v_school, 'fixture.principal@b2test.netcyberai.dev', 'principal', 'Fixture Principal (test)', true),
    (v_coordinator, v_school, 'fixture.coordinator@b2test.netcyberai.dev', 'academic_coordinator', 'Fixture Coordinator (test)', true)
  on conflict (user_id) do nothing;

  insert into memberships (user_id, school_id, role, is_active)
  select u, v_school, r::user_role, true from (values (v_principal, 'principal'), (v_coordinator, 'academic_coordinator')) as p(u, r)
   where not exists (select 1 from memberships m where m.user_id = p.u and m.school_id = v_school);

  insert into teachers (school_id, user_id, name)
  select v_school, p.u, p.n from (values (v_principal, 'Fixture Principal (test)'), (v_coordinator, 'Fixture Coordinator (test)')) as p(u, n)
   where not exists (select 1 from teachers t where t.school_id = v_school and t.user_id = p.u);
  select teacher_id into strict v_principal_teacher from teachers where school_id = v_school and user_id = v_principal;
  select teacher_id into strict v_coordinator_teacher from teachers where school_id = v_school and user_id = v_coordinator;

  -- The principal takes one subject in 8-A; the coordinator one each in 6-A and 7-A:
  -- in each class, the first subject (by name) that is already taught there.
  insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
  select v_school, a.teacher_id, s.subject_id, c.class_id
    from (values (v_principal_teacher, '8-A'), (v_coordinator_teacher, '6-A'), (v_coordinator_teacher, '7-A')) as a(teacher_id, class_name)
    join classes c on c.school_id = v_school and c.name = a.class_name
    join lateral (
      select su.subject_id from teacher_subjects ts join subjects su on su.school_id = ts.school_id and su.subject_id = ts.subject_id
       where ts.school_id = v_school and ts.class_id = c.class_id order by su.name limit 1
    ) s on true
  on conflict do nothing;
end $$;
