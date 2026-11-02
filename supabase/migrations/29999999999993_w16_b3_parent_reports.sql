-- W16-B3, the weekly parent report (the proposal's M9; docs/AI_TUTOR_AGENT_PROGRESS.md, Programme W16, decision 6).
-- Placeholder timestamp: the lead renames it to the version it is applied as.
--
-- 1. family.parent_reports: one report a child a week, written by the tutor.parent_report job in the family's own
--    session and read in the parent area. The body is counts, chapter names, quiz scores and four sentences made from
--    them: never a child's words. Own account only, and on a child's own phone that one child only, as
--    family.tutor_messages. Removed with the child (the foreign key cascades).
-- 2. family.report_accounts(from, to, account): which accounts had a child ask the tutor in the week, with the
--    account's token version so the job opens that family's own session. The platform role only (as
--    family.push_accounts()); ids and a version, nothing else.
-- 3. family.doubts_for_class(class, days): a school's teacher (their own classes) or office (any class of their
--    school) sees the recent doubts of the class's linked children as subject, chapter key, topic key and a count. Only
--    children whose family linked the Family app, matched to an active student of that class, with the school's consent
--    for the child's records in force and the family's study consent in force. No name, no words, no account.
-- 4. family.class_week_summary(week_start): the principal and the school admin see one week's counts per class
--    (children, sessions, questions, quizzes, average quiz score, the three chapters asked about most), for classes with
--    at least three such children, so no count is one child's. They become draft notices only through writeNotice in a
--    person's own session; the principal's approval decides delivery.
-- 5. ai.ops_daily is queued once a day at 19:13 in India (13:43 UTC); on a Sunday it queues the week's parent reports.

create table family.parent_reports (
  report_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 16000),
  created_at timestamptz not null default now(),
  unique (account_id, child_id, week_start),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_parent_reports_account on family.parent_reports (account_id, child_id, week_start desc);

alter table family.parent_reports enable row level security;
alter table family.parent_reports force row level security;
revoke all on family.parent_reports from public, anon, authenticated, app_user, nca_super;

create policy parent_reports_own on family.parent_reports as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy parent_reports_own_only on family.parent_reports as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy parent_reports_one_child on family.parent_reports as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

grant select, insert, update on family.parent_reports to family_app;

-- 2.
create function family.report_accounts(p_from timestamptz, p_to timestamptz, p_account uuid default null)
returns table (account_id uuid, token_version integer)
language sql stable security definer set search_path = '' as $$
  select a.account_id, a.token_version from family.accounts a
   where (p_account is null or a.account_id = p_account)
     and exists (select 1 from family.tutor_messages m
                  where m.account_id = a.account_id and m.role = 'child' and m.created_at >= p_from and m.created_at < p_to)
   order by a.account_id
   limit 50000
$$;
revoke all on function family.report_accounts(timestamptz, timestamptz, uuid) from public, anon, authenticated, app_user, family_app, service_role;
grant execute on function family.report_accounts(timestamptz, timestamptz, uuid) to nca_super;

-- 3.
create function family.doubts_for_class(p_class uuid, p_days integer default 14)
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
  ), asked as (
    select c.subject, m.chapter_key, m.block_id, count(*)::int as n
      from family.tutor_messages m
      join kids k on k.account_id = m.account_id and k.child_id = m.child_id
      join family.tutor_conversations c on c.conversation_id = m.conversation_id
     where m.role = 'child' and m.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 31))
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
revoke all on function family.doubts_for_class(uuid, integer) from public, anon, authenticated, family_app, nca_super, service_role;
grant execute on function family.doubts_for_class(uuid, integer) to app_user;

-- 4.
create function family.class_week_summary(p_week_start date)
returns table (class_id uuid, children integer, sessions integer, questions integer, quizzes integer, quiz_percent integer, top_chapters text[], top_titles_en text[], top_titles_hi text[])
language sql stable security definer set search_path = '' as $$
  with me as (
    select nullif(current_setting('app.current_tenant_id', true), '')::uuid as school_id
     where coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin')
       and extract(isodow from p_week_start) = 1
  ), win as (
    select (p_week_start::timestamp at time zone 'Asia/Kolkata') as f, ((p_week_start + 7)::timestamp at time zone 'Asia/Kolkata') as t
  ), kids as (
    select distinct cl.account_id, cl.child_id, s.class_id
      from family.child_links cl
      join family.school_links sl on sl.link_id = cl.link_id and sl.revoked_at is null
      join me on me.school_id = sl.school_id
      join public.students s on s.student_id = cl.student_id and s.school_id = sl.school_id and s.status = 'active' and s.class_id is not null
      join public.schools sc on sc.school_id = s.school_id
     where (sc.is_test_fixture or coalesce((select g.granted from public.consent_ledger g where g.school_id = s.school_id and g.student_id = s.student_id and g.purpose::text = 'core_records' order by g.created_at desc limit 1), false))
       and coalesce((select f.granted from family.consents f where f.account_id = cl.account_id and f.purpose = 'study_core' order by f.created_at desc limit 1), false)
  ), msgs as (
    select k.class_id, m.child_id, m.conversation_id, m.chapter_key, (m.created_at at time zone 'Asia/Kolkata')::date as d
      from family.tutor_messages m
      join kids k on k.account_id = m.account_id and k.child_id = m.child_id, win
     where m.role = 'child' and m.created_at >= win.f and m.created_at < win.t
  ), per as (
    select class_id, count(distinct child_id)::int as children, count(distinct (conversation_id::text || d::text))::int as sessions, count(*)::int as questions
      from msgs group by class_id
  ), quiz as (
    select k.class_id, count(*)::int as n, round(avg(100.0 * a.mcq_correct / a.mcq_total))::int as pct
      from family.chapter_test_attempts a
      join kids k on k.account_id = a.account_id and k.child_id = a.child_id, win
     where a.mcq_total > 0 and a.submitted_at >= win.f and a.submitted_at < win.t
     group by k.class_id
  ), ranked as (
    select class_id, chapter_key, count(*) as n, row_number() over (partition by class_id order by count(*) desc, chapter_key) as rn
      from msgs where chapter_key is not null group by class_id, chapter_key
  ), titled as (
    select r.class_id, r.chapter_key, r.n, r.rn, t.title_en, t.title_hi
      from ranked r
      left join lateral (select cc.title_en, cc.title_hi from content.chapter_contents cc
                          where cc.chapter_key = r.chapter_key and cc.status = 'published' and cc.owner_account_id is null
                          order by cc.version_no desc limit 1) t on true
     where r.rn <= 3
  ), chap as (
    select class_id, array_agg(chapter_key order by rn) as keys, array_agg(coalesce(title_en, '') order by rn) as en, array_agg(coalesce(title_hi, '') order by rn) as hi
      from titled group by class_id
  )
  select p.class_id, p.children, p.sessions, p.questions, coalesce(q.n, 0), q.pct, coalesce(c.keys, '{}'), coalesce(c.en, '{}'), coalesce(c.hi, '{}')
    from per p
    left join quiz q on q.class_id = p.class_id
    left join chap c on c.class_id = p.class_id
   where p.children >= 3
   order by p.class_id
$$;
revoke all on function family.class_week_summary(date) from public, anon, authenticated, family_app, nca_super, service_role;
grant execute on function family.class_week_summary(date) to app_user;

-- 5. Today's ai.ops_daily, once (the idempotency key is the India date), only once the deployed runner can run it.
create or replace function public.ai_ops_daily_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'ai.ops_daily', jsonb_build_object('date', t.d), 'ai.ops_daily:' || t.d, 3
    from (select to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'ai.ops_daily')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.ai_ops_daily_enqueue() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ai-ops-daily', '43 13 * * *', 'select public.ai_ops_daily_enqueue()');
  end if;
end $$;
