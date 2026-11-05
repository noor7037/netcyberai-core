-- W20-B (docs/42 H2): a notice to one student's guardians, for chronic absence.
--
-- A class notice reaches a whole class. This one is for a single child's family, so the notice gets an optional student
-- and a kind. A parent reads a notice with a student only when the student is their own child (the old rule, a notice of
-- the child's class, would show the whole class a message about one child). The kind lets the office ask "was this
-- family told in the last 7 days". Nothing else about a notice changes: the principal's approval still sends it.
alter table public.class_notices
  add column student_id uuid,
  add column kind text not null default 'class' check (kind in ('class', 'chronic_absence')),
  add constraint class_notices_student_fk foreign key (school_id, student_id) references public.students (school_id, student_id),
  add constraint class_notices_kind_student check ((kind = 'chronic_absence') = (student_id is not null));
create index idx_class_notices_student on public.class_notices (school_id, student_id, decided_at desc) where student_id is not null;

-- The words, the class, the writer, the student and the kind never change.
create or replace function public.class_notices_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.body, new.written_by, new.written_at) is distinct from (old.school_id, old.body, old.written_by, old.written_at)
     or new.class_id is distinct from old.class_id or new.student_id is distinct from old.student_id or new.kind is distinct from old.kind then
    raise exception 'a notice is never edited: reject it and write it again' using errcode = 'check_violation';
  end if;
  if old.status <> 'waiting' then
    raise exception 'a notice is decided once' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- A parent reads a sent notice for the whole school, for their child's class, or for their own child.
alter policy class_notices_no_parent on public.class_notices
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (status = 'sent'
             and ((student_id is null and class_id is null and cardinality((select public.guardian_student_ids())::uuid[]) > 0)
                  or (student_id is null and class_id = any ((select public.guardian_class_ids())::uuid[]))
                  or student_id = any ((select public.guardian_student_ids())::uuid[]))))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy class_notices_staff on public.class_notices
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
         or (current_setting('app.current_role', true) = 'teacher' and class_id is not null and class_id in (select unnest(teacher_own_class_ids())))
         or (current_setting('app.current_role', true) = 'parent' and status = 'sent'
             and ((student_id is null and class_id is null and cardinality((select public.guardian_student_ids())::uuid[]) > 0)
                  or (student_id is null and class_id = any ((select public.guardian_class_ids())::uuid[]))
                  or student_id = any ((select public.guardian_student_ids())::uuid[]))))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
              or (current_setting('app.current_role', true) = 'teacher' and class_id is not null and class_id in (select unnest(teacher_own_class_ids()))));
