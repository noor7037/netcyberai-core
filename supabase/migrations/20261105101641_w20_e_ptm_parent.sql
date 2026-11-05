-- W20-E (H5, docs/42): a linked guardian books a parent-teacher meeting slot in the Family app.
--
-- The Family app reads and writes the school only AS the guardian its connect code was made for
-- (withGuardianContext: role parent, the guardian's parent_id as the user), so these rules decide. Until now every
-- ptm_* table refused a parent (each staff rule is restrictive, for every command): a parent booked only by a
-- WhatsApp reply, written by the platform role.
--
-- 1. A booking made in the app is `booked_via = 'app'`, with no staff member as `booked_by`.
-- 2. Who the guardian may meet in a meeting (each teacher's display name, and whether they are the class teacher): for each of the guardian's own active children (with the school's
--    consent, guardian_student_ids()) in one of the meeting's classes, the class teacher, and the class's timetable
--    teachers when the meeting includes subject teachers (the rule of ptm.ts's invitees). Only an invited meeting
--    (never a draft or a cancelled one). One definer function answers it, for the parent session's own school only.
-- 3. Which slots of such a meeting are taken, for those teachers only: slot ids, never who took them.
-- 4. The guardian reads an invited meeting of their own children's classes, and the slots of the teachers above.
-- 5. The guardian reads their own bookings; inserts one only for themselves, in the app, with a teacher above, in a
--    meeting still to come; never updates one; deletes (cancels) only their own, before attendance is marked, while
--    the meeting is still to come. A slot is still booked once (unique on the slot) and a guardian has one slot a
--    teacher in a meeting (unique on meeting, teacher and guardian): two parents racing for a time, the second is
--    refused by the database. Staff still never delete a booking: it is moved, never deleted, as before.

-- 1.
alter table ptm_bookings drop constraint ptm_bookings_booked_via_check;
alter table ptm_bookings add constraint ptm_bookings_booked_via_check check (booked_via in ('reply', 'staff', 'app'));

-- 2.
create function public.guardian_ptm_teachers(p_ptm_id uuid)
returns table (teacher_id uuid, student_id uuid, teacher text, class_teacher boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select x.teacher_id, s.student_id, min(u.display_name) as teacher, bool_or(x.class_teacher) as class_teacher
    from ptm_events e
    join students s on s.school_id = e.school_id and s.class_id = any (e.class_ids) and s.status = 'active'
    join parent_student_map m on m.school_id = s.school_id and m.student_id = s.student_id
    join classes c on c.school_id = s.school_id and c.class_id = s.class_id
    cross join lateral (
      select c.class_teacher_id as teacher_id, true as class_teacher where c.class_teacher_id is not null
      union
      select t.teacher_user_id, false from timetable_entries t where e.with_subject_teachers and t.school_id = c.school_id and t.class_id = c.class_id
    ) x
    join users u on u.school_id = e.school_id and u.user_id = x.teacher_id
   where e.ptm_id = p_ptm_id
     and e.status = 'invited'
     and e.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and coalesce(current_setting('app.current_role', true), '') = 'parent'
     and m.parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid
     and s.student_id = any (public.guardian_student_ids())
   group by x.teacher_id, s.student_id
$$;
revoke all on function public.guardian_ptm_teachers(uuid) from public, anon, authenticated, service_role;
grant execute on function public.guardian_ptm_teachers(uuid) to app_user;

-- 3.
create function public.guardian_ptm_taken(p_ptm_id uuid)
returns table (slot_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.slot_id
    from ptm_bookings b
   where b.ptm_id = p_ptm_id
     and b.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and coalesce(current_setting('app.current_role', true), '') = 'parent'
     and b.teacher_id in (select g.teacher_id from public.guardian_ptm_teachers(p_ptm_id) g)
$$;
revoke all on function public.guardian_ptm_taken(uuid) from public, anon, authenticated, service_role;
grant execute on function public.guardian_ptm_taken(uuid) to app_user;

-- 4.
alter policy ptm_events_no_parent on ptm_events
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (status = 'invited' and class_ids && (select public.guardian_class_ids())))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy ptm_slots_no_parent on ptm_slots
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or teacher_id in (select g.teacher_id from public.guardian_ptm_teachers(ptm_slots.ptm_id) g))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy ptm_events_staff on ptm_events using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and (
    class_ids && public.teacher_own_class_ids()
    or exists (select 1 from ptm_slots s where s.school_id = ptm_events.school_id and s.ptm_id = ptm_events.ptm_id and s.teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  ))
  or (current_setting('app.current_role', true) = 'parent' and status = 'invited' and class_ids && (select public.guardian_class_ids()))
);
alter policy ptm_slots_staff on ptm_slots using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  or (current_setting('app.current_role', true) = 'parent' and teacher_id in (select g.teacher_id from public.guardian_ptm_teachers(ptm_slots.ptm_id) g))
);

-- 5. (The no_parent rule lets the guardian's own rows through and an app booking in; the staff rule below holds the
--    rest of the insert's conditions.)
grant delete on ptm_bookings to app_user;
alter policy ptm_bookings_no_parent on ptm_bookings
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent'
              or (parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid and booked_via = 'app'));
alter policy ptm_bookings_staff on ptm_bookings
  using (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
    or (current_setting('app.current_role', true) = 'teacher' and teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
    or (current_setting('app.current_role', true) = 'parent' and parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  )
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
    or (current_setting('app.current_role', true) = 'teacher' and teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
    or (
      current_setting('app.current_role', true) = 'parent'
      and parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      and booked_via = 'app'
      and booked_by is null
      and attended is null
      and teacher_id in (select g.teacher_id from public.guardian_ptm_teachers(ptm_bookings.ptm_id) g)
      and exists (select 1 from ptm_events e where e.school_id = ptm_bookings.school_id and e.ptm_id = ptm_bookings.ptm_id
                   and e.status = 'invited' and e.held_on >= (now() at time zone 'Asia/Kolkata')::date)
    )
  );
create policy ptm_bookings_parent_no_update on ptm_bookings as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy ptm_bookings_parent_cancels_own on ptm_bookings as restrictive for delete using (
  current_setting('app.current_role', true) = 'parent'
  and parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  and attended is null
  and exists (select 1 from ptm_events e where e.school_id = ptm_bookings.school_id and e.ptm_id = ptm_bookings.ptm_id
               and e.status = 'invited' and e.held_on >= (now() at time zone 'Asia/Kolkata')::date)
);

-- 6. The school's switch for this module (docs/19 rule 7) is read in the guardian's session: off, the Family app shows no
--    meeting and books nothing. The parent reads the PTM row of their own school only, nothing else of the plan.
alter policy school_module_entitlements_no_parent on school_module_entitlements
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent' or module_id = 'ptm')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
