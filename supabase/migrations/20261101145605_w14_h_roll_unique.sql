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
-- The lead's check on the test database (1 Nov 2026) found about 300 such pairs across the twenty seeded schools:
-- the seed scripts drew roll numbers at random. They are renumbered here, not by hand: in each class the student
-- made first keeps the roll, every later holder of the same roll gets the next free number above the class's highest
-- (a real school's office may change it on the student's record afterwards). On a database with no duplicates this
-- step changes nothing.
with dups as (
  select student_id, school_id, class_id, roll_no,
         row_number() over (partition by school_id, class_id, roll_no order by created_at, student_id) as rn
    from students
   where roll_no is not null and class_id is not null and status in ('active', 'pending_consent')
), losers as (
  select * from dups where rn > 1
), highest as (
  select school_id, class_id, max(nullif(regexp_replace(roll_no, '\D', '', 'g'), '')::int) as top
    from students
   where class_id is not null
   group by school_id, class_id
), assign as (
  select l.student_id,
         (coalesce(h.top, 0) + row_number() over (partition by l.school_id, l.class_id order by l.roll_no, l.student_id))::text as new_roll
    from losers l
    join highest h using (school_id, class_id)
)
update students s set roll_no = a.new_roll from assign a where s.student_id = a.student_id;

-- A plain `create unique index` (not `concurrently`, which cannot run inside the migration's transaction); the
-- students table is small enough that the brief lock is not a concern.
create unique index if not exists students_class_roll_unique
  on students (school_id, class_id, roll_no)
  where roll_no is not null and status in ('active', 'pending_consent');
