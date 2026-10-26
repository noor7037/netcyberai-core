-- AM-4 review (C351): a family's private result link opens the child's result only while the child is on the school's
-- roll and the school holds the family's consent for the child's records, as the Family app does. Consent withdrawn,
-- or the child gone, and the link opens nothing the next time it is opened (marking_report_marks and
-- marking_report_pages read through this function, so they follow).
create or replace function public.marking_report(p_key_hash text)
returns table (school_id uuid, school_name text, student_id uuid, student_name text, class_name text, exam_id uuid, exam_name text, class_id uuid,
               scheme jsonb, published_at timestamptz, paper_id uuid, subject_name text, components jsonb, paper_marks jsonb,
               sheet_id uuid, choice_counts jsonb, strengths text, improve text, practice jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.school_id, sc.name, st.student_id, st.name, c.name, e.exam_id, e.name, c.class_id, x.scheme, x.published_at,
         p.paper_id, sb.name, p.components,
         coalesce((select jsonb_agg(jsonb_build_object('component', m.component, 'kind', m.kind, 'score', m.score) order by m.component)
                     from marks m where m.school_id = l.school_id and m.paper_id = p.paper_id and m.student_id = l.student_id), '[]'::jsonb),
         s.sheet_id, coalesce(ms.choice_counts, '{}'::jsonb), s.strengths, s.improve, s.practice
    from marking_report_links l
    join schools sc on sc.school_id = l.school_id
    join students st on st.school_id = l.school_id and st.student_id = l.student_id
    join classes c on c.school_id = l.school_id and c.class_id = l.class_id
    join exams e on e.school_id = l.school_id and e.exam_id = l.exam_id
    join exam_publications x on x.school_id = l.school_id and x.exam_id = l.exam_id and x.class_id = l.class_id
                            and x.version = l.publication_version and x.reopened_at is null
    join exam_papers p on p.school_id = l.school_id and p.exam_id = l.exam_id and p.class_id = l.class_id
    join subjects sb on sb.school_id = l.school_id and sb.subject_id = p.subject_id
    left join marking_sheets s on s.school_id = l.school_id and s.paper_id = p.paper_id and s.student_id = l.student_id and s.state = 'approved'
                              and not ('changed' = any (s.flags)) and public.families_see_scripts(l.school_id)
    left join marking_setups ms on ms.school_id = l.school_id and ms.paper_id = p.paper_id
   where p_key_hash ~ '^[0-9a-f]{64}$' and l.key_hash = p_key_hash and l.made_at > now() - interval '30 days'
     and st.status = 'active'
     and (sc.is_test_fixture
          or coalesce((select cl.granted from consent_ledger cl
                        where cl.student_id = st.student_id and cl.purpose = 'core_records'
                        order by cl.created_at desc limit 1), false))
$$;
