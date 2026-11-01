-- W14-H: a roll number belongs to one student in a class. A student who has left or been transferred (inactive,
-- transferred) does not hold it: that roll can be given to a new student.
-- The import and the Add / Edit student routes check this first and name the clash in plain words; this index is the
-- backstop for a race and for any other writer. A student with no class or no roll number is not constrained
-- (a null never clashes in a unique index).
--
-- BEFORE APPLYING (the lead): this fails if the data already holds a duplicate. Run this first; it must return no row.
-- Fix the rows it lists (give one of the pair another roll number), then apply.
--
--   select school_id, class_id, roll_no, count(*) as students, array_agg(name order by name) as names
--     from students
--    where roll_no is not null and class_id is not null and status in ('active', 'pending_consent')
--    group by school_id, class_id, roll_no
--   having count(*) > 1;
--
-- A plain `create unique index` (not `concurrently`, which cannot run inside the migration's transaction); the
-- students table is small enough that the brief lock is not a concern.
create unique index if not exists students_class_roll_unique
  on students (school_id, class_id, roll_no)
  where roll_no is not null and status in ('active', 'pending_consent');
