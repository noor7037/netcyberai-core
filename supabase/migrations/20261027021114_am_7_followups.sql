-- AM-7 (C230-AG, C355): docs/35 §8's three open decisions, as the supervisor answered them.
--
-- 1. A page that is not an answer page. The AI's reading of each page (exams.read_pages v2) also says whether the page
--    is a page of a handwritten answer sheet and whether it looks like an identity document. Such a page is kept as
--    'not_answer': no name or number read on it is kept or used, it is never sent to be marked, and its script carries
--    'not_answer_page'. The database refuses to approve a script while one of its pages is 'not_answer', so a family
--    never sees it until a person settles the page: an answer page after all (back to 'read' or 'unreadable'), or
--    taken out ('removed': out of its script, its picture deleted by the next sweep, never shown again). A job's session
--    never settles a page, and a removed page never comes back.
-- 2. How long page pictures are kept. A paper's page pictures are deleted the school's "script_days" (Exams settings, 30
--    to 365, else 90) after its class's result is published, counted from the publication in force: nothing goes while
--    a class is reopened, and the next publication counts afresh. The marks, each question's marks and the teacher's
--    notes stay as the school's record. An hourly job (marking.pictures_sweep, src/lib/marking/retention.ts) deletes
--    them through the one storage module, then records the time on the page row; only that job's definer function may
--    record it. The report link's pages leave out a deleted picture, as the app's reads do.
-- 3. Ending and remaking a report link. The principal or the school admin may end a family's link (a lost phone, a
--    forwarded link): it opens nothing from that moment. A new one is made only by the same "Tell parents on WhatsApp"
--    send, after the same preview, as a message of its own (the link's number is in its idempotency key). At most five
--    links per child and publication. Who ended it, when and why are kept on the row; the audit log has it too.
--
-- DEPLOY SAFETY, as C210 and C237: the sweep is queued only once the deployed runner lists 'marking.pictures_sweep'
-- among the job types it handles (platform_settings 'jobs.handlers').

-- ---- 1. A page that is not an answer page --------------------------------------------------------------------------------

alter table marking_pages drop constraint marking_pages_state;
alter table marking_pages add constraint marking_pages_state
  check (state in ('new', 'read', 'blank', 'unreadable', 'duplicate', 'failed', 'not_answer', 'removed'));
alter table marking_pages add column picture_gone_at timestamptz;
alter table marking_pages add constraint marking_pages_removed check (state <> 'removed' or (sheet_id is null and reading is null));
create index marking_pages_picture_kept on marking_pages (school_id, paper_id) where picture_gone_at is null;

alter table marking_sheets drop constraint marking_sheets_flags;
alter table marking_sheets add constraint marking_sheets_flags
  check (flags <@ array['identity', 'two_scripts', 'missing_page', 'unreadable', 'not_all_read', 'unsure', 'changed', 'check_child', 'not_answer_page']::text[]);

-- A page stays the page that was uploaded; a 'not_answer' page is settled, and a page taken out, by a person only; a
-- page taken out stays out; a deleted picture is recorded by the sweep's definer function only, and once.
create function public.marking_pages_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  job text := coalesce(current_setting('app.current_job', true), '');
begin
  if (new.page_id, new.school_id, new.upload_id, new.paper_id, new.storage_key, new.sha256, new.created_at)
     is distinct from (old.page_id, old.school_id, old.upload_id, old.paper_id, old.storage_key, old.sha256, old.created_at) then
    raise exception 'a page stays the page that was uploaded' using errcode = 'check_violation';
  end if;
  if new.picture_gone_at is distinct from old.picture_gone_at and (old.picture_gone_at is not null or current_user in ('app_user', 'nca_super')) then
    raise exception 'a deleted picture is recorded by the sweep that deleted it' using errcode = '42501';
  end if;
  if old.state = 'removed' and (new.state, new.sheet_id, new.sheet_position, new.reading) is distinct from (old.state, old.sheet_id, old.sheet_position, old.reading) then
    raise exception 'a page taken out of its script stays out' using errcode = 'check_violation';
  end if;
  if new.state is distinct from old.state and (old.state = 'not_answer' or new.state = 'removed')
     and (job <> '' or me is null or me = '00000000-0000-0000-0000-000000000000'::uuid) then
    raise exception 'a page that may not be an answer page is settled by a person' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.marking_pages_rules() from public, anon, authenticated, service_role;
create trigger marking_pages_rules before update on marking_pages for each row execute function public.marking_pages_rules();

-- As am_1_review's, with one rule more: a script is not approved while one of its pages may not be an answer page.
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
    if exists (select 1 from marking_pages g where g.school_id = new.school_id and g.sheet_id = new.sheet_id and g.state = 'not_answer') then
      raise exception 'a page that may not be an answer page is settled before its script is approved' using errcode = 'check_violation';
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

-- The reading prompt that asks about identity documents (v1 never reached a provider, and the code no longer has it).
update control.ai_profiles set prompt_version = 'v2' where profile_id = 'exams.read_pages' and prompt_version = 'v1';

-- ---- 2. How long page pictures are kept ------------------------------------------------------------------------------------

-- Whether a page's picture is due to go: a page taken out, or a page of a paper whose class's publication in force is
-- older than the school's days. Called by marking_pictures_due only.
create function public.marking_picture_due(p_school_id uuid, p_paper_id uuid, p_state text) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select p_state = 'removed' or exists (
    select 1
      from exam_papers p
      join exam_publications x on x.school_id = p.school_id and x.exam_id = p.exam_id and x.class_id = p.class_id and x.reopened_at is null
     where p.school_id = p_school_id and p.paper_id = p_paper_id
       and x.published_at < now() - make_interval(days => coalesce((
             select least(365, greatest(30, round((s.setting_values ->> 'script_days')::numeric)::int))
               from school_settings s
              where s.school_id = p_school_id and s.module_id = 'exams' and jsonb_typeof(s.setting_values -> 'script_days') = 'number'), 90)))
$$;
revoke all on function public.marking_picture_due(uuid, uuid, text) from public, anon, authenticated, service_role, app_user, nca_super;

-- The pictures due to go, oldest pages first, at most p_limit (up to 1000). For the platform role (the sweep) only.
create function public.marking_pictures_due(p_limit integer)
returns table (school_id uuid, page_id uuid, storage_key text)
language sql stable security definer set search_path = public, pg_temp as $$
  select g.school_id, g.page_id, g.storage_key
    from marking_pages g
   where g.picture_gone_at is null and public.marking_picture_due(g.school_id, g.paper_id, g.state)
   order by g.school_id, g.created_at, g.page_id
   limit least(greatest(coalesce(p_limit, 0), 0), 1000)
$$;
revoke all on function public.marking_pictures_due(integer) from public, anon, authenticated, service_role, app_user;
grant execute on function public.marking_pictures_due(integer) to nca_super;

-- Records that these pictures were deleted (not recorded before); how many it recorded. Called by the sweep only
-- after the store has deleted them, so it does not ask again whether they are due: a class reopened in between keeps
-- its marks, and its deleted pictures are not left looking stored.
create function public.marking_pictures_gone(p_page_ids uuid[]) returns integer
language sql security definer set search_path = public, pg_temp as $$
  with done as (
    update marking_pages g set picture_gone_at = now()
     where g.page_id = any (coalesce(p_page_ids, '{}'::uuid[])) and g.picture_gone_at is null
    returning 1
  )
  select count(*)::int from done
$$;
revoke all on function public.marking_pictures_gone(uuid[]) from public, anon, authenticated, service_role, app_user;
grant execute on function public.marking_pictures_gone(uuid[]) to nca_super;

-- This hour's sweep, once (the idempotency key is the hour in UTC), once the deployed runner handles it.
create function public.marking_pictures_sweep_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'marking.pictures_sweep', jsonb_build_object('hour', t.h), 'marking.pictures_sweep:' || t.h, 3
    from (select to_char(date_trunc('hour', now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24') as h) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'marking.pictures_sweep')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.marking_pictures_sweep_enqueue() from public, anon, authenticated, service_role;

-- Thirty-five minutes past every hour. Where there is no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('marking-pictures-sweep', '35 * * * *', 'select public.marking_pictures_sweep_enqueue()');
  end if;
end $$;

-- The report link's pages: never a page taken out or a deleted picture.
create or replace function public.marking_report_pages(p_key_hash text)
returns table (sheet_id uuid, page_id uuid, storage_key text, sheet_position integer, width integer, height integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select g.sheet_id, g.page_id, g.storage_key, g.sheet_position, g.width, g.height
    from public.marking_report(p_key_hash) r
    join marking_pages g on g.school_id = r.school_id and g.sheet_id = r.sheet_id
   where g.picture_gone_at is null and g.state <> 'removed'
$$;

-- ---- 3. Ending and remaking a report link ----------------------------------------------------------------------------------

alter table marking_report_links add column link_no integer not null default 1;
alter table marking_report_links add column ended_at timestamptz;
alter table marking_report_links add column ended_by uuid;
alter table marking_report_links add column ended_why text;
alter table marking_report_links add constraint marking_report_links_ended_by_fkey foreign key (school_id, ended_by) references users(school_id, user_id);
alter table marking_report_links add constraint marking_report_links_link_no check (link_no between 1 and 5);
alter table marking_report_links add constraint marking_report_links_ended
  check ((ended_at is null) = (ended_by is null) and (ended_at is null) = (ended_why is null));
alter table marking_report_links add constraint marking_report_links_why check (ended_why is null or ended_why in ('lost', 'forwarded', 'other'));
-- One live link per child and publication (it was one link in all).
alter table marking_report_links drop constraint marking_report_links_school_id_exam_id_class_id_student_id__key;
create unique index marking_report_links_one_live on marking_report_links (school_id, exam_id, class_id, student_id, publication_version) where ended_at is null;

-- A link is numbered by the database (1, then one more for each remade), and never changed by the app's sessions, only
-- ended: once, by a person, who and when taken from the session. (The database owner's own maintenance is not held.)
create function public.marking_report_links_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    new.link_no := coalesce((select max(l.link_no) from marking_report_links l
                              where l.school_id = new.school_id and l.exam_id = new.exam_id and l.class_id = new.class_id
                                and l.student_id = new.student_id and l.publication_version = new.publication_version), 0) + 1;
    new.ended_at := null;
    new.ended_by := null;
    new.ended_why := null;
    return new;
  end if;
  if current_user not in ('app_user', 'nca_super') then
    return new;
  end if;
  if (new.key_hash, new.school_id, new.exam_id, new.class_id, new.student_id, new.publication_version, new.made_by, new.made_at, new.link_no)
     is distinct from (old.key_hash, old.school_id, old.exam_id, old.class_id, old.student_id, old.publication_version, old.made_by, old.made_at, old.link_no) then
    raise exception 'a report link is never changed, only ended' using errcode = 'check_violation';
  end if;
  if old.ended_at is not null then
    raise exception 'an ended report link stays ended' using errcode = 'check_violation';
  end if;
  if coalesce(current_setting('app.current_job', true), '') <> '' or me is null or me = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'a report link is ended by a person' using errcode = '42501';
  end if;
  new.ended_by := me;
  new.ended_at := now();
  return new;
end $$;
revoke all on function public.marking_report_links_rules() from public, anon, authenticated, service_role;
create trigger marking_report_links_rules before insert or update on marking_report_links for each row execute function public.marking_report_links_rules();

grant update (ended_at, ended_by, ended_why) on marking_report_links to app_user;
create policy marking_report_links_ended_by_office on marking_report_links as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));

-- As am_4_report_consent's, with one rule more: an ended link opens nothing.
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
     and l.ended_at is null
     and st.status = 'active'
     and (sc.is_test_fixture
          or coalesce((select cl.granted from consent_ledger cl
                        where cl.student_id = st.student_id and cl.purpose = 'core_records'
                        order by cl.created_at desc limit 1), false))
$$;
