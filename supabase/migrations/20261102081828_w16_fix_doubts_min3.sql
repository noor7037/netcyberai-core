-- W16 security review, finding 3: family.doubts_for_class returned a class's recent doubts however few families had
-- linked the app, so in a class where one family had linked, the teacher saw that one child's subjects, chapters and
-- counts for 14 days and knew whose they were. Like family.class_week_summary, it now answers only when at least three
-- linked, consented children of the class asked something in the window; otherwise nothing. Same signature, same
-- rights (the school app's role only; a teacher for their own classes, the office for any class of their school).

create or replace function family.doubts_for_class(p_class uuid, p_days integer default 14)
returns table (subject text, chapter_key text, topic_key text, title_en text, title_hi text, doubts integer)
language sql stable security definer set search_path = '' as $$
  with me as (
    select nullif(current_setting('app.current_tenant_id', true), '')::uuid as school_id,
           coalesce(current_setting('app.current_role', true), '') as role
  ), cls as (
    select c.class_id, c.school_id from public.classes c, me
     where c.class_id = p_class and c.school_id = me.school_id
       and (me.role in ('principal', 'school_admin', 'academic_coordinator')
            or (me.role = 'teacher' and p_class = any (public.teacher_own_class_ids())))
  ), kids as (
    select distinct cl.account_id, cl.child_id
      from family.child_links cl
      join family.school_links sl on sl.link_id = cl.link_id and sl.revoked_at is null
      join cls on cls.school_id = sl.school_id
      join public.students s on s.student_id = cl.student_id and s.school_id = sl.school_id and s.class_id = cls.class_id and s.status = 'active'
      join public.schools sc on sc.school_id = s.school_id
     where (sc.is_test_fixture or coalesce((select g.granted from public.consent_ledger g where g.school_id = s.school_id and g.student_id = s.student_id and g.purpose::text = 'core_records' order by g.created_at desc limit 1), false))
       and coalesce((select f.granted from family.consents f where f.account_id = cl.account_id and f.purpose = 'study_core' order by f.created_at desc limit 1), false)
  ), window_msgs as (
    select m.account_id, m.child_id, m.chapter_key, m.block_id, c.subject
      from family.tutor_messages m
      join kids k on k.account_id = m.account_id and k.child_id = m.child_id
      join family.tutor_conversations c on c.conversation_id = m.conversation_id
     where m.role = 'child' and m.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 31))
  ), enough as (
    select count(distinct (account_id, child_id)) >= 3 as ok from window_msgs
  ), asked as (
    select w.subject, w.chapter_key, w.block_id, count(*)::int as n
      from window_msgs w, enough e
     where e.ok
     group by 1, 2, 3
  )
  select a.subject, a.chapter_key, a.block_id, t.title_en, t.title_hi, a.n
    from asked a
    left join lateral (select cc.title_en, cc.title_hi from content.chapter_contents cc
                        where cc.chapter_key = a.chapter_key and cc.status = 'published' and cc.owner_account_id is null
                        order by cc.version_no desc limit 1) t on true
   order by a.n desc, a.subject, a.chapter_key nulls last, a.block_id nulls last
   limit 50
$$;
