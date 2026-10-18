-- C243 (C230-C): who teaches what, finished. Two changes the supervisor answered in C230-C: "the academic coordinator
-- may also assign teachers and the database will enforce the assigned-teacher rule"; "existing periods that
-- contradict the assignments stay, accepted".
--
-- 1. The academic coordinator assigns and decides, beside the principal and the school admin. The coordinator
--    already writes the timetable and plans it with the generator (C146, C229); who teaches what is the list those
--    screens keep to, and the coordinator keeps it from the Timetable module ("Who teaches what"). The C231 policies
--    that name the office on teacher_subjects and teacher_subject_requests, and the one on the proposals' audit rows,
--    are altered in place (same names, same commands, same shape) to name the coordinator too:
--      teacher_subjects_office_insert / _update / _delete: the principal, the school admin, the coordinator; an
--        assignment is still for a teacher of the school;
--      teacher_subject_requests_readers: the same three read every proposal; a teacher still reads only their own;
--      teacher_subject_requests_office_decides: the same three decide, in their own name, never the teacher who asked
--        (decided_by <> teacher_user_id, as the trigger teacher_subject_requests_rules also says);
--      audit_teacher_subject_request_rows_office_or_actor: the proposals' audit rows follow the proposals.
--    teachers_office_insert names the coordinator too, and it is the only policy of teachers that changes: an
--    assignment names the teacher's teachers row, which the app makes the first time a teacher is given a subject
--    (or a proposal of theirs is confirmed), with the user's display name, for a teacher of the school only (the
--    policy's own check, unchanged) and once (the unique index of C231). Without it the coordinator could not give a
--    teacher their first subject, nor confirm a new teacher's proposal. Changing or removing a teachers row stays the
--    principal's and the school admin's (teachers_office_update and teachers_office_delete, unchanged).
--
-- 2. The database keeps the assigned-teacher rule: a period (timetable_entries) of a class and subject that has
--    assigned teachers (teacher_subjects) is taught by one of them. A class and subject with no assignment takes any
--    teacher, as before. Only the assignments of active teachers count, exactly as the app's own rule reads them
--    (activeAssignments() and notAssigned(), src/lib/timetable/plan.ts): a teacher who left keeps their rows until
--    the office removes them, but no longer holds a subject back. So the database refuses nothing the app allows.
--    Checked when a period is written: on INSERT, and on an UPDATE that changes what the period is (its school,
--    class, day, period, subject or teacher). A period already in the timetable that contradicts the assignments
--    stays as it is (C230-C): it is read, and every other row is written, as before; a change of the assignments
--    never rewrites or refuses the timetable; but any change to such a period must keep to the rule. The refusal is
--    a check_violation whose message names the rule, never a person; the app maps it to its own 'not_assigned'.
--    Runs as its caller: every role of a school reads its teacher_subjects, teachers and users (C231), and only the
--    office and the coordinator write the timetable.
--
-- Who: the supervisor's answer (C230-C), built in C243.
-- Deploy safety: the code on main already refuses 'not_assigned' in the app before it writes a period (putEntry, the
-- CSV import, the generator's loads and its publish, all since C231), with the same rule (active teachers'
-- assignments), so nothing main does is refused by the trigger; the policy changes only widen who may write the three
-- tables to a role main's routes do not let in yet. No row is changed or checked by this migration.

-- ---- 1. The academic coordinator assigns and decides -----------------------------------------------------------
alter policy teachers_office_insert on teachers with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and exists (select 1 from users u where u.school_id = teachers.school_id and u.user_id = teachers.user_id and u.role::text = 'teacher')
);
alter policy teacher_subjects_office_insert on teacher_subjects with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and exists (
    select 1 from teachers t join users u on u.school_id = t.school_id and u.user_id = t.user_id
     where t.school_id = teacher_subjects.school_id and t.teacher_id = teacher_subjects.teacher_id and u.role::text = 'teacher'
  )
);
alter policy teacher_subjects_office_update on teacher_subjects
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']));
alter policy teacher_subjects_office_delete on teacher_subjects using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
);

alter policy teacher_subject_requests_readers on teacher_subject_requests using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or teacher_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
);
alter policy teacher_subject_requests_office_decides on teacher_subject_requests
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']))
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
    and decided_by = nullif(current_setting('app.current_user_id', true), '')::uuid
    and decided_by <> teacher_user_id
  );

alter policy audit_teacher_subject_request_rows_office_or_actor on audit_log using (
  event_action not like 'teacher_subject.request%'
  or current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator')
  or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
);

-- ---- 2. The assigned-teacher rule on the timetable ------------------------------------------------------------
create function public.timetable_entries_assigned_teacher() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  assigned uuid[];
begin
  -- The active teachers assigned to this class and subject (src/lib/academics/teacher-subjects.ts, ACTIVE).
  select array_agg(t.user_id) into assigned
    from teacher_subjects ts
    join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
   where ts.school_id = new.school_id and ts.class_id = new.class_id and ts.subject_id = new.subject_id
     and exists (select 1 from users u where u.school_id = t.school_id and u.user_id = t.user_id and u.role::text = 'teacher' and u.is_active);
  if assigned is not null and not (new.teacher_user_id = any (assigned)) then
    raise exception 'a period takes one of the teachers assigned to its class and subject' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.timetable_entries_assigned_teacher() from public, anon, authenticated, service_role;

create trigger timetable_entries_assigned_teacher before insert on timetable_entries
  for each row execute function public.timetable_entries_assigned_teacher();
-- An update only when it changes what the period is: a period made before this rule, left alone, stays.
create trigger timetable_entries_assigned_teacher_changed before update on timetable_entries
  for each row
  when ((new.school_id, new.class_id, new.weekday, new.period, new.subject_id, new.teacher_user_id)
        is distinct from (old.school_id, old.class_id, old.weekday, old.period, old.subject_id, old.teacher_user_id))
  execute function public.timetable_entries_assigned_teacher();
