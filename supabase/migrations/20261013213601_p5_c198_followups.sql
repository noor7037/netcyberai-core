-- P5 slice 8a (C200): the follow-ups the supervisor set in C198.
--
-- 1. A meeting can include subject teachers (ptm_events.with_subject_teachers):
--    each teacher who teaches one of its classes in the timetable gets a row
--    of times. A teacher with a row of times sees that meeting, whether or
--    not the class is one of "their own".
-- 2. A complaint is never changed by the person it is about: not noted, not
--    reassigned, not closed. Until now that was true of everyone but the
--    principal. A complaint about the principal is looked into by the school
--    admin; the principal still reads it.

alter table ptm_events add column with_subject_teachers boolean not null default false;

alter policy ptm_events_staff on ptm_events using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and (
    class_ids && public.teacher_own_class_ids()
    or exists (select 1 from ptm_slots s where s.school_id = ptm_events.school_id and s.ptm_id = ptm_events.ptm_id and s.teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  ))
);

create policy complaints_not_by_its_subject on complaints as restrictive for update using (
  about_user_id is distinct from nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy complaint_events_not_by_its_subject on complaint_events as restrictive for insert with check (
  not exists (
    select 1 from complaints c
     where c.school_id = complaint_events.school_id and c.complaint_id = complaint_events.complaint_id
       and c.about_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
);
