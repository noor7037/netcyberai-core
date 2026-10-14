-- P6 slice 9f (C218): Early Warning v2, the marks signal. For staff only: nothing here reaches a parent.
--
-- Rule version 2 adds one reason, 'marks': in the child's latest exam whose papers for their class are all
-- entered (the stand-in for "published" until the report-card slice adds publishing), their own percent fell by
-- at least the school's number of points against their own exam before it, or is below the grading scheme's pass
-- mark in at least the school's number of subjects. The two numbers are settings of 'early-warning'
-- (school_settings: no change here). The evidence names the exams, the papers and the percents. The rule lives
-- in src/lib/early-warning/marks.ts and runs in "Check now" and in the nightly check alike.
--
-- 1. early_warning_flags.reasons admits 'marks', and only on a flag of rule version 2 or later: a flag of rule
--    version 1 never carries it. Fees are still never a reason. The flags already on record (rule version 1,
--    reasons among attendance, homework and needs_help) keep every rule as they are, and stay readable.
-- 2. A marks reason names the exam it rests on (its evidence has an "exam" object). The trigger
--    early_warning_flags_rules (unchanged) still holds that a flag carries evidence for each of its reasons and
--    for nothing else, and that a closed flag stays closed.
--
-- Who reads and writes: unchanged (C209, C210). The principal, the school admin and the academic coordinator
-- read every flag and run the check; a teacher reads the flags of the children in their own classes now, marks
-- evidence included (they read their own classes' marks already); the nightly check writes as the office, with no
-- person. The accountant reads no flag and no mark; the platform role holds no right on flags; a parent reads
-- none. No table, policy, grant, job or template is added. Read by src/lib/early-warning/** and the Early Warning
-- screen.

alter table early_warning_flags drop constraint early_warning_flags_reasons;
alter table early_warning_flags
  -- At least one signal, each once (the trigger), and only these four. 'marks' from rule version 2. Fees are never one.
  add constraint early_warning_flags_reasons check (
    cardinality(reasons) between 1 and 4
    and reasons <@ array['attendance', 'homework', 'needs_help', 'marks']::text[]
    and (rule_version >= 2 or not ('marks' = any (reasons)))
  ),
  -- A marks reason names the exam it rests on. ("is not distinct from": an evidence with no exam gives null here,
  -- which a plain "=" would let through.)
  add constraint early_warning_flags_marks_evidence check (
    not ('marks' = any (reasons)) or jsonb_typeof(evidence -> 'marks' -> 'exam') is not distinct from 'object'
  );
