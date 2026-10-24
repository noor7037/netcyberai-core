-- School Link, notices and events (C331; the build lead brief of 2026-10-24, item 3.1): a linked guardian reads, read
-- only, what the school already sent to them: a notice the principal approved (status 'sent'), and an event the office
-- sent out as an invitation (invited_at set; a later cancellation shows as cancelled), each for one of their own
-- children's classes or for the whole school. Never a notice that waits or was rejected, never a draft event. As
-- homework (school_link_homework.sql, C329): the guardian's own active children with the school's consent come from
-- guardian_student_ids() and guardian_class_ids() (reused, not repeated); each table's two parent refusals (no_parent and
-- staff, restrictive for every command) let those rows be READ; every write check stays as it was, the staff ones now
-- written out word for word (a rule without one checks writes against its widened read); a new restrictive rule per
-- table refuses a parent's update and delete outright. Event replies are not opened here.

-- 1. Notices.
alter policy class_notices_no_parent on public.class_notices
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (status = 'sent'
             and ((class_id is null and cardinality((select public.guardian_student_ids())::uuid[]) > 0)
                  or class_id = any ((select public.guardian_class_ids())::uuid[]))))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy class_notices_staff on public.class_notices
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
         or (current_setting('app.current_role', true) = 'teacher' and class_id is not null and class_id in (select unnest(teacher_own_class_ids())))
         or (current_setting('app.current_role', true) = 'parent' and status = 'sent'
             and ((class_id is null and cardinality((select public.guardian_student_ids())::uuid[]) > 0)
                  or class_id = any ((select public.guardian_class_ids())::uuid[]))))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
              or (current_setting('app.current_role', true) = 'teacher' and class_id is not null and class_id in (select unnest(teacher_own_class_ids()))));

-- 2. Events (class_ids empty: the whole school).
alter policy school_events_no_parent on public.school_events
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (invited_at is not null
             and ((cardinality(class_ids) = 0 and cardinality((select public.guardian_student_ids())::uuid[]) > 0)
                  or class_ids && (select public.guardian_class_ids())::uuid[])))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy school_events_staff on public.school_events
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
         or (current_setting('app.current_role', true) = 'teacher' and (cardinality(class_ids) = 0 or class_ids && teacher_own_class_ids()))
         or (current_setting('app.current_role', true) = 'parent' and invited_at is not null
             and ((cardinality(class_ids) = 0 and cardinality((select public.guardian_student_ids())::uuid[]) > 0)
                  or class_ids && (select public.guardian_class_ids())::uuid[])))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
              or (current_setting('app.current_role', true) = 'teacher' and (cardinality(class_ids) = 0 or class_ids && teacher_own_class_ids())));

-- 3. A parent never updates or deletes a notice or an event.
create policy class_notices_parent_no_update on public.class_notices as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy class_notices_parent_no_delete on public.class_notices as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy school_events_parent_no_update on public.school_events as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy school_events_parent_no_delete on public.school_events as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
