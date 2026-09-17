-- =====================================================================
-- Fix a real bug in the locked db/rls_policies.sql, found by the Prompt
-- B two-school isolation suite (the suite's actual job -- and its
-- first real catch): every role-scoped overlay policy in that file is
-- written as `<role check> OR <narrower condition>`, e.g.
--
--   create policy parent_scope_students on students
--     for select using (
--       current_setting('app.current_role', true) <> 'parent'
--       or student_id in (select ... where parent_id = ...)
--     );
--
-- Postgres combines multiple PERMISSIVE policies on the same table
-- with OR (a row is visible if ANY permissive policy allows it). Since
-- these overlays are permissive by default, "role <> 'parent'" alone
-- evaluates to true for every non-parent role, on every row, from
-- every school -- independent of school_id entirely. That OR silently
-- defeats *_tenant_isolation for any row/role the overlay's negation
-- doesn't specifically narrow. Concretely: consent_gate_students'
-- `status <> 'pending_consent' OR ...` makes every non-pending student
-- in the ENTIRE DATABASE visible to every role, regardless of tenant --
-- confirmed by the isolation suite: an explicit cross-tenant filter on
-- `students` returned another school's row under a school_admin
-- session scoped to a different school.
--
-- Same locked-file-has-a-real-error precedent as Decision Log A1: this
-- is not a doc disagreement, it's a bug, fixed by an additive migration
-- rather than editing db/rls_policies.sql, which stays byte-identical.
--
-- The fix: RESTRICTIVE policies are ANDed with permissive ones instead
-- of OR'd, which is what every one of these overlays actually needed --
-- "for this role, ALSO require the narrower condition" rather than
-- "grant blanket access when the negation holds." Dropping and
-- recreating each with `as restrictive` preserves the exact same
-- condition and intent, changing only the composition semantics.
-- =====================================================================

drop policy parent_scope_students on students;
create policy parent_scope_students on students as restrictive
  for select using (
    current_setting('app.current_role', true) <> 'parent'
    or student_id in (
      select psm.student_id from parent_student_map psm
      where psm.parent_id = current_setting('app.current_user_id', true)::uuid
    )
  );

drop policy parent_scope_attendance on attendance;
create policy parent_scope_attendance on attendance as restrictive
  for select using (
    current_setting('app.current_role', true) <> 'parent'
    or student_id in (
      select psm.student_id from parent_student_map psm
      where psm.parent_id = current_setting('app.current_user_id', true)::uuid
    )
  );

drop policy parent_scope_marks on marks;
create policy parent_scope_marks on marks as restrictive
  for select using (
    current_setting('app.current_role', true) <> 'parent'
    or student_id in (
      select psm.student_id from parent_student_map psm
      where psm.parent_id = current_setting('app.current_user_id', true)::uuid
    )
  );

drop policy parent_scope_fees on fees_ledger;
create policy parent_scope_fees on fees_ledger as restrictive
  for select using (
    current_setting('app.current_role', true) <> 'parent'
    or student_id in (
      select psm.student_id from parent_student_map psm
      where psm.parent_id = current_setting('app.current_user_id', true)::uuid
    )
  );

drop policy teacher_scope_attendance on attendance;
create policy teacher_scope_attendance on attendance as restrictive
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or class_id in (
      select ts.class_id from teacher_subjects ts
      join teachers t on t.teacher_id = ts.teacher_id
      where t.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

drop policy impact_card_scope on teacher_impact_metrics;
create policy impact_card_scope on teacher_impact_metrics as restrictive
  for select using (
    current_setting('app.current_role', true) in ('principal','school_admin','super_admin')
    or teacher_id in (
      select t.teacher_id from teachers t
      where t.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

drop policy consent_gate_students on students;
create policy consent_gate_students on students as restrictive
  for select using (
    status <> 'pending_consent'
    or current_setting('app.current_role', true) in ('teacher','principal','school_admin','super_admin')
  );
