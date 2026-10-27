-- AM-1 review (C347, C351): what the security review of #317 found, closed in the database.
--
-- 1. A script changed after it was approved is not approved any more for families: it carries 'changed' until a
--    person approves it again, and neither the guardian's reads nor the report link show it. Publishing a class is
--    refused while any of its scripts carries 'changed' (the paper's marks would no longer be the script's).
-- 2. A job's session never changes an approved script, nor its question marks: "AI never writes" no longer rests on
--    the application alone.
-- 3. Marking jobs are queued by the people who mark (a teacher or the office), never by the accountant or a parent.
-- 4. families_see_scripts() answers only inside the definer functions that use it: no school's session reads
--    another school's switch.
-- 5. A script read with a number but no name is matched, flagged 'check_child' so it is kept out of approving every
--    script with no flag (the flag list gains it).
-- 6. A withdrawal of a published class is not taken back (as it is not made).

-- 1.
create or replace function public.guardian_marking_sheets() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.sheet_id
    from public.marking_sheets s
    join public.exam_papers p on p.school_id = s.school_id and p.paper_id = s.paper_id
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and s.state = 'approved'
     and not ('changed' = any (s.flags))
     and s.student_id = any ((select public.guardian_student_ids())::uuid[])
     and (p.exam_id, p.class_id) in (select g.exam_id, g.class_id from public.guardian_publications() g)
     and public.families_see_scripts(s.school_id)
$$;

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
$$;

create function public.exam_publications_scripts_settled() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from marking_sheets s join exam_papers p on p.school_id = s.school_id and p.paper_id = s.paper_id
              where p.school_id = new.school_id and p.exam_id = new.exam_id and p.class_id = new.class_id
                and s.state <> 'set_aside' and 'changed' = any (s.flags)) then
    raise exception 'a checked answer sheet was changed after it was approved: approve it again before publishing' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.exam_publications_scripts_settled() from public, anon, authenticated, service_role;
create trigger exam_publications_scripts_settled before insert on exam_publications for each row execute function public.exam_publications_scripts_settled();

-- 2.
create or replace function public.marking_sheets_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  job text := coalesce(current_setting('app.current_job', true), '');
begin
  if tg_op = 'UPDATE' and job <> '' and old.state = 'approved' then
    raise exception 'an approved script is changed by a person only' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.sheet_id, new.school_id, new.paper_id, new.upload_id, new.created_at) is distinct from (old.sheet_id, old.school_id, old.paper_id, old.upload_id, old.created_at) then
    raise exception 'a script stays on its paper and upload' using errcode = 'check_violation';
  end if;
  if new.student_id is not null and (tg_op = 'INSERT' or new.student_id is distinct from old.student_id) and not exists (
      select 1 from students s join exam_papers p on p.school_id = s.school_id and p.class_id = s.class_id
       where s.school_id = new.school_id and s.student_id = new.student_id and p.paper_id = new.paper_id
         and s.status in ('active', 'pending_consent')) then
    raise exception 'a script is a child''s on its paper''s class roll' using errcode = 'check_violation';
  end if;
  if new.state = 'approved' and (tg_op = 'INSERT' or old.state <> 'approved' or new.approved_at is distinct from old.approved_at) then
    if job <> '' or me is null or me = '00000000-0000-0000-0000-000000000000'::uuid then
      raise exception 'a script is approved by a person' using errcode = '42501';
    end if;
    new.approved_by := me;
    new.approved_at := now();
  elsif new.state <> 'approved' then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.marking_marks_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  q record;
begin
  if coalesce(current_setting('app.current_job', true), '') <> ''
     and exists (select 1 from marking_sheets s where s.school_id = new.school_id and s.sheet_id = new.sheet_id and s.state = 'approved') then
    raise exception 'an approved script''s marks are changed by a person only' using errcode = '42501';
  end if;
  select m.max_marks, m.paper_id into q from marking_questions m where m.school_id = new.school_id and m.question_id = new.question_id;
  if q.paper_id is distinct from new.paper_id then
    raise exception 'a question mark is for a question of its script''s paper' using errcode = 'check_violation';
  end if;
  if coalesce(new.ai_marks, 0) > q.max_marks or coalesce(new.marks, 0) > q.max_marks then
    raise exception 'a question mark is at most the question''s marks' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and (new.marks, new.note) is distinct from (old.marks, old.note) then
    if coalesce(current_setting('app.current_job', true), '') <> '' then
      raise exception 'a teacher''s mark is a person''s' using errcode = '42501';
    end if;
    new.changed_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
    new.changed_at := now();
  elsif tg_op = 'INSERT' and (new.marks is not null or new.note is not null) then
    new.changed_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
    new.changed_at := now();
  end if;
  return new;
end $$;

-- 3.
alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify', 'whatsapp.send', 'ptm.remind', 'event.remind', 'complaint.escalate')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
    or (
      type in ('marking.read', 'marking.group', 'marking.mark')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
      and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
    )
  );

-- 4.
revoke execute on function public.families_see_scripts(uuid) from app_user, nca_super;

-- 5.
alter table marking_sheets drop constraint marking_sheets_flags;
alter table marking_sheets add constraint marking_sheets_flags
  check (flags <@ array['identity', 'two_scripts', 'missing_page', 'unreadable', 'not_all_read', 'unsure', 'changed', 'check_child']::text[]);

-- 6.
alter policy exam_withdrawals_undone_by_office on exam_withdrawals
  using (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
    and exists (select 1 from students s join exam_papers p on p.school_id = s.school_id and p.class_id = s.class_id
                 where s.school_id = exam_withdrawals.school_id and s.student_id = exam_withdrawals.student_id and p.exam_id = exam_withdrawals.exam_id
                   and not public.exam_class_published(p.exam_id, p.class_id))
  );
