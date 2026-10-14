-- P6 slice 9d (C216): the Curriculum Gap Detector (docs/27 section 4 row 9d, and section 5).
--
-- No table changes, and nothing is stored. For a class and a subject, the detector works out each unit's state
-- when the screen is read, from three things already recorded: syllabus_units (the syllabus map, in order),
-- syllabus_progress.unit_id ("Taught today") and exam_papers.unit_ids (the chapters a paper assesses). The rule
-- that turns them into a state is in one place, src/lib/curriculum-gap/rules.ts.
--
-- 1. curriculum_gap_units(class, subject): the facts the states rest on, for one class and subject of the signed-in
--    person's school, unit by unit in the map's order: its place, chapter and topic; the first and the last day a
--    lesson for it was marked "Taught", and how many such lessons; and the exam papers that list it, each with its
--    exam's name and the paper's date. Units, days and exam names only: no child, no mark, no lesson note and no
--    teacher's name.
--
--    Why the reader has its own rule: under the tables' own policies a teacher reads only the lessons they recorded
--    themself (teacher_scope_syllabus_progress). A class teacher would then see every unit of a subject a colleague
--    teaches as never taught, and a subject teacher would not see a lesson a substitute recorded: the states would
--    be wrong. The reader answers with every lesson of the class, to exactly the people docs/27 section 3 rule 6
--    names:
--      the principal, the school admin and the academic coordinator: any class of their own school;
--      a teacher: their own classes only (teacher_own_class_ids(): a class they teach a subject in, or the class
--        they are class teacher of), every subject of it;
--      anyone else (the accountant, a parent account, a session with no school): nothing.
--    SECURITY DEFINER with a pinned search_path, like exam_paper_progress (C214). Only the app's role may call it;
--    the platform role cannot.
-- 2. The module is partly built: on for every school, as the default plan gives it.
--
-- Read by src/lib/curriculum-gap/curriculum-gap.ts (the /app/curriculum-gap screen and its route).

-- 1.
create function public.curriculum_gap_units(p_class_id uuid, p_subject_id uuid)
returns table (unit_id uuid, place integer, chapter text, topic text, added_at timestamptz, taught_first date, taught_last date, lessons integer, papers jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.unit_id, u.position, u.chapter, u.topic, u.created_at,
         t.first_day, t.last_day, coalesce(t.n, 0),
         coalesce(pp.list, '[]'::jsonb)
    from syllabus_units u
    -- The lessons of this class and subject marked "Taught" for this unit (the rule "Taught today" and the syllabus
    -- map already use: a partly taught, delayed or not taught lesson does not count).
    left join lateral (
      select min(p.date) as first_day, max(p.date) as last_day, count(*)::integer as n
        from syllabus_progress p
       where p.school_id = u.school_id and p.unit_id = u.unit_id
         and p.class_id = u.class_id and p.subject_id = u.subject_id
         and p.status = 'taught'
    ) t on true
    -- The papers of this class and subject that list the unit among the chapters they assess.
    left join lateral (
      select jsonb_agg(jsonb_build_object('paperId', ep.paper_id, 'examId', e.exam_id, 'examName', e.name, 'date', ep.paper_date)
                       order by ep.paper_date nulls last, e.created_at, ep.paper_id) as list
        from exam_papers ep
        join exams e on e.school_id = ep.school_id and e.exam_id = ep.exam_id
       where ep.school_id = u.school_id and ep.class_id = u.class_id and ep.subject_id = u.subject_id
         and u.unit_id = any (ep.unit_ids)
    ) pp on true
   where u.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and u.class_id = p_class_id and u.subject_id = p_subject_id
     and (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
          or (coalesce(current_setting('app.current_role', true), '') = 'teacher' and p_class_id = any (public.teacher_own_class_ids())))
   order by u.position, u.created_at, u.unit_id
$$;
revoke all on function public.curriculum_gap_units(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.curriculum_gap_units(uuid, uuid) from app_user, nca_super;
grant execute on function public.curriculum_gap_units(uuid, uuid) to app_user;

-- 2. The Curriculum Gap Detector is partly built (the states of a class and subject's units): on for every school,
-- as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'curriculum-gap', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
