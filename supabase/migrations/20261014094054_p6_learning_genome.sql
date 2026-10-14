-- P6 slice 9e (C217): Learning Genome v1 (docs/27 sections 3 and 5, row 9e).
--
-- No new table, column or grant on a table. A child's genome is worked out when it is read (src/lib/genome), in
-- the reader's own session (role app_user, with the school, role and user set), from tables that exist already,
-- under the row level security each of them has: students, exams, exam_papers, marks, homework, homework_targets,
-- homework_status and the module's settings. Who opens the genome is decided in the app as well: the principal,
-- the school admin, the academic coordinator, and a teacher for a child of their own classes. The accountant opens
-- none. Nothing is written, stored, queued or sent: no parent sees it, and no model is called.
--
-- 1. genome_chapter_replies(child, from, to): for one child, chapter by chapter, how many of the guardians' Daily
--    Pulse replies about that child said "needs help" (tier 2) and "understood" (tier 1) to the lessons of the
--    chapter's taught units in those days, with the lessons and their first and last day. Counts and days only: no
--    message, no guardian, no lesson note. Why a reader of its own (C210 set the Pulse tables' roles to the Daily
--    Pulse roles, and a teacher reads only the lessons they recorded): the academic coordinator, who opens the genome,
--    reads no reply, and a class teacher would miss the chapters a colleague teaches. It answers exactly the people
--    who open the genome: the principal, the school admin and the academic coordinator for a child of their school;
--    a teacher for a child of their own classes (teacher_own_class_ids()); nobody else. SECURITY DEFINER with a pinned
--    search_path, like curriculum_gap_units (C216); only the app's role may call it.
-- 2. Learning Genome is partly built: on for every school, as the default plan gives it.

-- 1.
create function public.genome_chapter_replies(p_student_id uuid, p_from date, p_to date)
returns table (class_id uuid, class_name text, section text, subject_id uuid, subject_name text, chapter text,
               needs_help integer, understood integer, lessons integer, first_taught date, last_taught date, first_place integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.class_id, c.name, c.section, u.subject_id, sb.name, u.chapter,
         (count(*) filter (where r.tier = 2))::integer, (count(*) filter (where r.tier = 1))::integer,
         count(distinct sp.progress_id)::integer, min(sp.date), max(sp.date), min(u.position)::integer
    from students st
    join pulse_response_log r on r.school_id = st.school_id and r.student_id = st.student_id
    join pulse_messages pm on pm.school_id = r.school_id and pm.pulse_id = r.pulse_id
    join syllabus_progress sp on sp.school_id = pm.school_id and sp.progress_id = pm.source_progress_id
    join syllabus_units u on u.school_id = sp.school_id and u.unit_id = sp.unit_id
    join classes c on c.school_id = u.school_id and c.class_id = u.class_id
    join subjects sb on sb.school_id = u.school_id and sb.subject_id = u.subject_id
   where st.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and st.student_id = p_student_id
     and r.tier in (1, 2) and sp.date between p_from and p_to
     and (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
          or (coalesce(current_setting('app.current_role', true), '') = 'teacher' and st.class_id = any (public.teacher_own_class_ids())))
   group by u.class_id, c.name, c.section, u.subject_id, sb.name, u.chapter
$$;
revoke all on function public.genome_chapter_replies(uuid, date, date) from public, anon, authenticated, service_role;
revoke all on function public.genome_chapter_replies(uuid, date, date) from app_user, nca_super;
grant execute on function public.genome_chapter_replies(uuid, date, date) to app_user;

-- 2.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'learning-genome', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
