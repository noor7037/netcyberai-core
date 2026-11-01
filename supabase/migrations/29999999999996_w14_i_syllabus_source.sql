-- W14-I: a school's syllabus from the NetCyberAI library in one click.
--   1. syllabus_units.source: where a unit came from. 'school' (typed or pasted by the school, as before) or 'library'
--      (copied from the NetCyberAI library, content.*). Existing rows are the school's own.
--   2. public.library_syllabus_lines(board, levels): the library's chapters and topics (titles only, no textbook text)
--      of the syllabus last released to everyone for a board and class levels, in the library's order. The school's
--      role cannot read content.* directly; this definer function is the one narrow door, for the roles that may
--      write a syllabus map, inside a school's own session. It writes nothing.

-- 1.
alter table syllabus_units add column source text not null default 'school' check (source in ('school', 'library'));

-- 2.
create function public.library_syllabus_lines(p_board text, p_levels smallint[])
returns table (class_level smallint, subject text, place integer, chapter text, topic text)
language sql stable security definer set search_path = public, pg_temp as $$
  with latest as (
    select distinct on (v.class_level, v.subject) v.version_id, v.class_level, v.subject
      from content.syllabus_versions v
     where v.board_id = upper(p_board) and v.status = 'published' and v.audience = 'everyone' and v.class_level = any (p_levels)
       and nullif(current_setting('app.current_tenant_id', true), '') is not null
       and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
     order by v.class_level, v.subject, v.academic_year desc, v.version_no desc
  )
  select l.class_level, l.subject,
         (row_number() over (partition by l.version_id order by c.position, c.chapter_key, t.position nulls first, t.topic_key))::integer,
         left(c.title_en, 120), left(coalesce(t.title_en, c.title_en), 200)
    from latest l
    join content.chapters c on c.version_id = l.version_id
    left join content.topics t on t.chapter_id = c.chapter_id
   order by l.class_level, l.subject, 3
$$;
revoke all on function public.library_syllabus_lines(text, smallint[]) from public, anon, authenticated, service_role;
revoke all on function public.library_syllabus_lines(text, smallint[]) from app_user, nca_super;
grant execute on function public.library_syllabus_lines(text, smallint[]) to app_user;
