-- C210 (P5 close-out): who changes a class, and who can be its class teacher.
--
-- Until now classes had only its tenant-isolation policy: anyone signed in to a school (a teacher, the
-- accountant) could add, change or remove a class directly in the database, and so name themself the class
-- teacher of any class. No screen set the class teacher of a class that already existed. Now the Classes list
-- (Students, "Manage classes") sets and clears it through PATCH /api/app/classes/<id>, for the principal and the
-- school admin; the database holds the same two roles here.
--
--   - classes_added_by_office, classes_changed_by_office, classes_removed_by_office: adding, changing and
--     removing a class is the principal's or the school admin's. Restrictive, one command each: who READS a class
--     is unchanged (every screen with a class chooser reads them, for every role of the school). The app's own
--     routes already allowed only these two roles (canWriteMasterData), so nothing the app does is refused.
--   - classes_class_teacher_rules (trigger): a class teacher who is set or changed is an active teacher of the
--     class's own school (the composite foreign key already holds "of this school"). A class whose class teacher's
--     account is switched off later keeps them until someone chooses again: the School Health Auditor counts that
--     class, and its check opens this list. Clearing a class teacher is always allowed.
--
-- Who reads: everyone of the school, as before. The platform role keeps what it had.
-- No new table, no new grant, and no row is changed.

create policy classes_added_by_office on classes as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);
create policy classes_changed_by_office on classes as restrictive for update using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
) with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);
create policy classes_removed_by_office on classes as restrictive for delete using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);

-- Runs as the person making the change (not security definer): the users it looks at are the ones that person's
-- own session may read, which for the office is every account of its school.
create function public.classes_class_teacher_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from users u
     where u.school_id = new.school_id and u.user_id = new.class_teacher_id and u.role = 'teacher' and u.is_active
  ) then
    raise exception 'a class teacher is an active teacher of the class''s own school' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.classes_class_teacher_rules() from public, anon, authenticated, service_role;
create trigger classes_class_teacher_rules before update of class_teacher_id on classes
  for each row when (new.class_teacher_id is not null and new.class_teacher_id is distinct from old.class_teacher_id)
  execute function public.classes_class_teacher_rules();
