-- W16-B1: a short quiz made from a tutor session at its end, kept with review dates (Programme W16, the proposal's M7).
-- Placeholder timestamp: the lead applies the migration (TEST first) and renames it to the version it is applied as.
--
-- 1. family.session_quizzes: the quiz itself. The existing test tables hold only what a child SENT (chapter_test_attempts
--    and chapter_test_answers, S5); the test (questions, answers, reasons) lives in a chapter's authored blocks, and a
--    session has no chapter to hold it. So this one table keeps a session's quiz, in the shape of a chapter test's items
--    (src/lib/family/blocks.ts ChapterTest), where it came from (conversation, day, subject, the chapter key the child
--    asked about, if any) and its review dates (review_due_on: made day +1, +3, +7, as a three-day array, the smaller
--    change: no second table). A quiz is taken and scored by the existing scorer; each take is a chapter_test_attempts
--    row whose block_id is the quiz id, so "taken", "score" and "which review is due" are read from attempts, never
--    stored twice. One quiz a conversation a day (the same key as the job).
-- 2. family.tutor_conversations.session_ended_at: the child pressing "Done for now", or ending a call. The sweep below
--    reads it; nothing else does.
-- 3. family.quiz_session(): for the quiz job only (the platform role): who owns a conversation, so the job can work inside
--    that account's own family session, as the push job does (family.push_accounts()).
-- 4. public.family_quiz_enqueue(): every two minutes, one tutor.quiz job for each conversation whose session has ended: no
--    turn for ten minutes, or "Done for now" pressed after the last turn. At least two child turns, a turn in the last six
--    hours, no quiz yet for that conversation and day. Idempotent on conversation + day (the job's idempotency key, the
--    same as src/lib/ai/agents/orchestrator.ts quizJob). The payload holds ids and the day, never a word of the child's.
--
-- Own account only, twice (a permissive and a restrictive policy), and on a child's own phone that one child only, like
-- every family table; removed with the child (the foreign key cascades). A quiz is never edited.

alter table family.tutor_conversations add column session_ended_at timestamptz;

create table family.session_quizzes (
  quiz_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  conversation_id uuid not null,
  session_day date not null,
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  chapter_key text check (chapter_key is null or chapter_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  lang text not null default 'en' check (lang in ('en', 'hi')),
  title text not null check (char_length(title) between 1 and 120),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 8 and octet_length(items::text) <= 30000),
  review_due_on date[] not null check (cardinality(review_due_on) = 3),
  created_at timestamptz not null default now(),
  unique (conversation_id, session_day),
  unique (quiz_id, account_id, child_id),
  foreign key (conversation_id, account_id, child_id) references family.tutor_conversations (conversation_id, account_id, child_id) on delete cascade
);
create index idx_family_session_quizzes_child on family.session_quizzes (account_id, child_id, created_at desc);

alter table family.session_quizzes enable row level security;
alter table family.session_quizzes force row level security;
revoke all on family.session_quizzes from public, anon, authenticated, app_user, nca_super;

create policy session_quizzes_own on family.session_quizzes as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy session_quizzes_own_only on family.session_quizzes as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy session_quizzes_one_child on family.session_quizzes as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

grant select, insert, delete on family.session_quizzes to family_app;

-- Who owns a conversation, for the quiz job only.
create function family.quiz_session(p_conversation uuid) returns table (account_id uuid, token_version integer)
language sql stable security definer set search_path = '' as $$
  select a.account_id, a.token_version
    from family.tutor_conversations c join family.accounts a on a.account_id = c.account_id
   where c.conversation_id = p_conversation
$$;
revoke all on function family.quiz_session(uuid) from public, anon, authenticated, app_user, family_app, service_role;
grant execute on function family.quiz_session(uuid) to nca_super;

-- Every two minutes (pg_cron), once the deployed code says it runs the job.
create function public.family_quiz_enqueue() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with due as (
    select c.conversation_id, to_char((c.last_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, (c.last_at at time zone 'Asia/Kolkata')::date as day_date
      from family.tutor_conversations c
     where c.last_at > now() - interval '6 hours'
       and c.turn_count >= 2
       and (c.last_at <= now() - interval '10 minutes' or (c.session_ended_at is not null and c.session_ended_at >= c.last_at))
       and not exists (select 1 from family.session_quizzes q where q.conversation_id = c.conversation_id and q.session_day = (c.last_at at time zone 'Asia/Kolkata')::date)
       and exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'tutor.quiz')
  ), made as (
    insert into jobs (type, payload, idempotency_key, max_attempts)
    select 'tutor.quiz', jsonb_build_object('conversationId', d.conversation_id, 'day', d.day), 'tutor.quiz:' || d.conversation_id || ':' || d.day, 3
      from due d
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*)::integer from made
$$;
revoke all on function public.family_quiz_enqueue() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('family-quiz-enqueue', '*/2 * * * *', 'select public.family_quiz_enqueue()');
  end if;
end $$;
