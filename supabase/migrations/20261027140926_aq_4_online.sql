-- AQ-4 (docs/36 §1.3, C365): online tests. A paper sat online is sat in the Family app's child mode by a verified
-- guardian's consented child of the paper's class, while the test is open: one attempt, every answer saved as it is
-- given, the time kept by this database, and every time the child leaves the test screen counted for the teacher. No
-- camera, no microphone. What was saved becomes one script of the paper (marking_sheets, source 'online'), marked by
-- rules and the marking AI, reviewed and approved by a person as any script; families see it only at publication.
--
-- 1. online_tests: one per paper. When it opens and closes, its minutes (5 to 300) and whether its questions and
--    options are shuffled; the teacher's "Open" (who and when: before it, no family sees the test) and "Close" (who and
--    when: no attempt starts after it; an attempt already started keeps its own time, which never runs past the
--    closing time). The times are fixed once a child has started.
-- 2. online_attempts: one per child and test, ever. The database starts it (started_at = now()) and sets its deadline:
--    the earlier of the start plus the minutes and the closing time. Its questions' order and each choice question's
--    options' order are fixed when it starts. It ends submitted, or timed out (what was saved is what counts); a person
--    may void it (no script is made from it). left_count: the times the test screen was left. sheet_id: its script.
-- 3. online_answers: per attempt and question, the answer as given ({keys}, {value} or {text} of at most 4000
--    characters, or none), marked to review or not, and when it was saved. A save carries the screen's own count, so a
--    retried older save never overwrites a newer one.
-- 4. Staff read as marking_sheets does (may_read_marking: the office every paper, a teacher their own classes'); the
--    test is written by whoever may mark the paper (may_mark_paper); an attempt is changed only to void it (a person)
--    or to name its script (the school's marking job). Attempts and answers are written by the functions below only.
-- 5. A family never reads these tables (each `<table>_no_parent`): the guardian's functions below answer for the
--    session's own guardian's own consented children (guardian_student_ids(), C329) and the papers of their class, with
--    server time only. The questions they send never carry the correct answer, the answer key or the marking steps.
-- 6. Marking: a submitted or timed-out attempt queues 'online.mark' (src/lib/online/mark.ts), which makes the script
--    in the school's marking session. A sweep ('online.sweep', every two minutes) closes attempts past their deadline
--    and queues any attempt still without a script. As C210 and C237: each is queued only once the deployed runner
--    lists its type among those it handles (platform_settings 'jobs.handlers').
-- 7. Once a child has started a paper's test, the paper's questions as the child read them (their words, options,
--    kind, number, part, marks and group) are fixed; the answer key and the marking steps may still be corrected, and
--    the script marked again. A paper with an attempt is not moved off 'online'.

-- ---- 1. The test -------------------------------------------------------------------------------------------------------

create table online_tests (
  school_id uuid not null references schools(school_id),
  test_id uuid not null default gen_random_uuid(),
  paper_id uuid not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  minutes integer not null,
  shuffle boolean not null default false,
  opened_by uuid,
  opened_at timestamptz,
  closed_by uuid,
  closed_at timestamptz,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, test_id),
  unique (school_id, paper_id),
  unique (school_id, test_id, paper_id),
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id) on delete cascade,
  foreign key (school_id, opened_by) references users(school_id, user_id),
  foreign key (school_id, closed_by) references users(school_id, user_id),
  foreign key (school_id, updated_by) references users(school_id, user_id),
  constraint online_tests_minutes check (minutes between 5 and 300),
  constraint online_tests_window check (closes_at >= opens_at + make_interval(mins => minutes) and closes_at <= opens_at + interval '31 days'),
  constraint online_tests_opened check ((opened_by is null) = (opened_at is null)),
  constraint online_tests_closed check ((closed_by is null) = (closed_at is null) and (closed_at is null or opened_at is not null))
);

-- ---- 2. The attempts ---------------------------------------------------------------------------------------------------

create table online_attempts (
  school_id uuid not null references schools(school_id),
  attempt_id uuid not null default gen_random_uuid(),
  test_id uuid not null,
  paper_id uuid not null,
  student_id uuid not null,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  state text not null default 'open',
  left_count integer not null default 0,
  question_order uuid[] not null,
  option_orders jsonb not null default '{}'::jsonb,
  sheet_id uuid,
  voided_by uuid,
  voided_at timestamptz,
  primary key (school_id, attempt_id),
  unique (school_id, test_id, student_id),
  unique (school_id, attempt_id, paper_id),
  foreign key (school_id, test_id, paper_id) references online_tests(school_id, test_id, paper_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, sheet_id, paper_id) references marking_sheets(school_id, sheet_id, paper_id) on delete set null (sheet_id),
  foreign key (school_id, voided_by) references users(school_id, user_id),
  constraint online_attempts_state check (state in ('open', 'submitted', 'timed_out', 'voided')),
  constraint online_attempts_ended check (state = 'voided' or (state = 'open') = (submitted_at is null)),
  constraint online_attempts_voided check ((state = 'voided') = (voided_at is not null) and (voided_by is null) = (voided_at is null)),
  constraint online_attempts_left check (left_count between 0 and 10000),
  constraint online_attempts_deadline check (deadline_at > started_at),
  constraint online_attempts_order check (cardinality(question_order) between 1 and 200),
  constraint online_attempts_options check (jsonb_typeof(option_orders) = 'object')
);
create unique index online_attempts_one_sheet on online_attempts (school_id, sheet_id) where sheet_id is not null;
create index online_attempts_due on online_attempts (deadline_at) where state = 'open';
create index online_attempts_unmarked on online_attempts (school_id) where sheet_id is null and state in ('submitted', 'timed_out');

-- ---- 3. The answers ----------------------------------------------------------------------------------------------------

create table online_answers (
  school_id uuid not null references schools(school_id),
  attempt_id uuid not null,
  paper_id uuid not null,
  question_id uuid not null,
  answer jsonb,
  flagged boolean not null default false,
  seq integer not null default 0,
  saved_at timestamptz not null default now(),
  primary key (school_id, attempt_id, question_id),
  foreign key (school_id, attempt_id, paper_id) references online_attempts(school_id, attempt_id, paper_id),
  foreign key (school_id, question_id) references marking_questions(school_id, question_id),
  constraint online_answers_seq check (seq between 0 and 1000000000),
  constraint online_answers_shape check (
    answer is null
    or (jsonb_typeof(answer) = 'object' and octet_length(answer::text) <= 20000 and (
         (answer - 'keys' = '{}'::jsonb and jsonb_typeof(answer -> 'keys') = 'array' and jsonb_array_length(answer -> 'keys') between 1 and 6
          and not (answer @? '$.keys[*] ? (!(@ like_regex "^[A-F]$"))'))
      or (answer - 'value' = '{}'::jsonb and jsonb_typeof(answer -> 'value') = 'number' and abs((answer ->> 'value')::numeric) <= 1000000000000)
      or (answer - 'text' = '{}'::jsonb and jsonb_typeof(answer -> 'text') = 'string' and char_length(answer ->> 'text') between 1 and 4000)
    ))
  )
);

-- ---- 4. The rules ------------------------------------------------------------------------------------------------------

-- The test: who changed it, now; the times fixed once a child has started; opened once, by a person, only while the
-- paper is sat online and has questions; closed once, by a person, after it was opened; never removed once opened.
-- (The guardian's functions and the database owner's own maintenance are not held: current_user is not the app's.)
create function public.online_tests_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  job text := coalesce(current_setting('app.current_job', true), '');
  person boolean := job = '' and me is not null and me <> '00000000-0000-0000-0000-000000000000'::uuid;
begin
  if current_user not in ('app_user', 'nca_super') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.opened_at is not null then
      raise exception 'an online test is not removed once it is opened' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if not person then
    raise exception 'an online test is set by a person' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.opened_at is not null or new.closed_at is not null then
      raise exception 'an online test is opened and closed after it is made' using errcode = 'check_violation';
    end if;
  else
    if (new.test_id, new.school_id, new.paper_id) is distinct from (old.test_id, old.school_id, old.paper_id) then
      raise exception 'an online test stays on its paper' using errcode = 'check_violation';
    end if;
    if (new.opens_at, new.closes_at, new.minutes, new.shuffle) is distinct from (old.opens_at, old.closes_at, old.minutes, old.shuffle)
       and exists (select 1 from online_attempts a where a.school_id = old.school_id and a.test_id = old.test_id) then
      raise exception 'an online test''s times are fixed once a child has started it' using errcode = 'check_violation';
    end if;
    if new.opened_at is distinct from old.opened_at or new.opened_by is distinct from old.opened_by then
      if old.opened_at is not null or new.opened_at is null then
        raise exception 'an online test is opened once' using errcode = 'check_violation';
      end if;
      if not exists (select 1 from exam_papers p where p.school_id = new.school_id and p.paper_id = new.paper_id and p.sitting = 'online')
         or not exists (select 1 from marking_questions q where q.school_id = new.school_id and q.paper_id = new.paper_id) then
        raise exception 'an online test is opened for a paper sat online, with its questions' using errcode = 'check_violation';
      end if;
      new.opened_by := me;
      new.opened_at := now();
    end if;
    if new.closed_at is distinct from old.closed_at or new.closed_by is distinct from old.closed_by then
      if old.closed_at is not null or new.closed_at is null or old.opened_at is null then
        raise exception 'an online test is closed once, after it is opened' using errcode = 'check_violation';
      end if;
      new.closed_by := me;
      new.closed_at := now();
    end if;
  end if;
  new.updated_by := me;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.online_tests_rules() from public, anon, authenticated, service_role;
create trigger online_tests_rules before insert or update or delete on online_tests for each row execute function public.online_tests_rules();

-- An attempt starts now and ends at the earlier of now plus the test's minutes and its closing time: the database's
-- clock, never the phone's.
create function public.online_attempts_start() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  t record;
begin
  select o.minutes, o.closes_at into t from online_tests o where o.school_id = new.school_id and o.test_id = new.test_id;
  new.started_at := now();
  new.deadline_at := least(now() + make_interval(mins => t.minutes), t.closes_at);
  new.state := 'open';
  new.submitted_at := null;
  new.left_count := 0;
  new.sheet_id := null;
  new.voided_by := null;
  new.voided_at := null;
  return new;
end $$;
revoke all on function public.online_attempts_start() from public, anon, authenticated, service_role;
create trigger online_attempts_start before insert on online_attempts for each row execute function public.online_attempts_start();

-- The app's sessions change an attempt in two ways only: a person voids it (in their own name, now), or the school's
-- marking job names its script (once: a script of the attempt's own paper that came from an online test). Everything
-- else is the guardian's functions' (the child's answers, leaving the screen, submitting) and the sweep's.
create function public.online_attempts_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  job text := coalesce(current_setting('app.current_job', true), '');
begin
  if current_user not in ('app_user', 'nca_super') then
    return new;
  end if;
  if (new.attempt_id, new.school_id, new.test_id, new.paper_id, new.student_id, new.started_at, new.deadline_at, new.submitted_at,
      new.left_count, new.question_order, new.option_orders)
     is distinct from (old.attempt_id, old.school_id, old.test_id, old.paper_id, old.student_id, old.started_at, old.deadline_at, old.submitted_at,
      old.left_count, old.question_order, old.option_orders) then
    raise exception 'a child''s online attempt is the child''s' using errcode = 'check_violation';
  end if;
  if new.state is distinct from old.state or new.voided_by is distinct from old.voided_by or new.voided_at is distinct from old.voided_at then
    if new.state <> 'voided' or old.state = 'voided' then
      raise exception 'an online attempt is only voided' using errcode = 'check_violation';
    end if;
    if job <> '' or me is null or me = '00000000-0000-0000-0000-000000000000'::uuid then
      raise exception 'an online attempt is voided by a person' using errcode = '42501';
    end if;
    new.voided_by := me;
    new.voided_at := now();
  end if;
  if new.sheet_id is distinct from old.sheet_id then
    if old.sheet_id is not null or new.sheet_id is null or job = ''
       or not exists (select 1 from marking_sheets s where s.school_id = new.school_id and s.sheet_id = new.sheet_id and s.paper_id = new.paper_id and s.source = 'online') then
      raise exception 'an online attempt''s script is named once, by the marking job' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.online_attempts_rules() from public, anon, authenticated, service_role;
create trigger online_attempts_rules before update on online_attempts for each row execute function public.online_attempts_rules();

-- Once a child has started a paper's online test, its questions as the child read them are fixed (7. above).
create function public.online_questions_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  paper uuid := case when tg_op = 'INSERT' then new.paper_id else old.paper_id end;
  school uuid := case when tg_op = 'INSERT' then new.school_id else old.school_id end;
begin
  if not exists (select 1 from online_attempts a where a.school_id = school and a.paper_id = paper) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'UPDATE'
     or (new.prompt, new.options, new.kind, new.label, new.position, new.component, new.max_marks, new.choice_group)
        is distinct from (old.prompt, old.options, old.kind, old.label, old.position, old.component, old.max_marks, old.choice_group) then
    raise exception 'a paper''s questions are fixed once a child has started its online test: only the answers and marking steps may be corrected' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.online_questions_fixed() from public, anon, authenticated, service_role;
create trigger online_questions_fixed before insert or update or delete on marking_questions for each row execute function public.online_questions_fixed();

-- A paper a child has started online stays online.
create function public.online_paper_sitting_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.sitting is distinct from old.sitting
     and exists (select 1 from online_attempts a where a.school_id = old.school_id and a.paper_id = old.paper_id) then
    raise exception 'a paper a child has started online stays online' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.online_paper_sitting_fixed() from public, anon, authenticated, service_role;
create trigger online_paper_sitting_fixed before update of sitting on exam_papers for each row execute function public.online_paper_sitting_fixed();

-- ---- 5. Rights and row rules -------------------------------------------------------------------------------------------

revoke all on online_tests, online_attempts, online_answers from public, anon, authenticated, service_role, nca_super;
grant select, insert, update, delete on online_tests to app_user;
grant select on online_attempts to app_user;
grant update (state, voided_by, voided_at, sheet_id) on online_attempts to app_user;
grant select on online_answers to app_user;

do $$
declare
  t text;
begin
  for t in select unnest(array['online_tests', 'online_attempts', 'online_answers']) loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I_tenant_isolation on %I using (school_id = (current_setting(''app.current_tenant_id'', true))::uuid)', t, t);
  end loop;
end $$;

-- A parent session reads and writes none of them (C230-D): the guardian's functions below answer for a family.
create policy online_tests_no_parent on online_tests as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy online_attempts_no_parent on online_attempts as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy online_answers_no_parent on online_answers as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

create policy online_tests_readers on online_tests as restrictive for select using (public.may_read_marking(paper_id));
create policy online_tests_writers on online_tests as restrictive for insert with check (public.may_mark_paper(paper_id));
create policy online_tests_changers on online_tests as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy online_tests_removers on online_tests as restrictive for delete using (public.may_mark_paper(paper_id));

create policy online_attempts_readers on online_attempts as restrictive for select using (public.may_read_marking(paper_id));
create policy online_attempts_changers on online_attempts as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));

create policy online_answers_readers on online_answers as restrictive for select using (public.may_read_marking(paper_id));

-- ---- 6. Marking: the jobs ------------------------------------------------------------------------------------------------

-- Queues the marking of one ended attempt (the key names the attempt, and what was asked again), once the deployed
-- runner handles 'online.mark'. Called by the functions below only.
create function public.online_mark_enqueue(p_school_id uuid, p_attempt_id uuid, p_again text) returns boolean
language sql security definer set search_path = public, pg_temp as $$
  with made as (
    insert into jobs (type, payload, idempotency_key, school_id, max_attempts)
    select 'online.mark', jsonb_build_object('attemptId', p_attempt_id), 'online.mark:' || p_attempt_id || coalesce(':' || p_again, ''), p_school_id, 3
     where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'online.mark')
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select exists (select 1 from made)
$$;
revoke all on function public.online_mark_enqueue(uuid, uuid, text) from public, anon, authenticated, service_role, app_user, nca_super;

-- The sweep (the platform's job, 'online.sweep'): attempts past their deadline are timed out (what was saved is what
-- counts), and every ended attempt without a script is queued for marking (a queued one is not queued twice). At most
-- 2000 a run. How many it ended and how many it queued.
create function public.online_attempts_sweep() returns table (timed_out integer, queued integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n_out integer;
  n_queued integer := 0;
  a record;
begin
  with due as (
    select school_id, attempt_id from online_attempts where state = 'open' and deadline_at < now() order by deadline_at limit 2000 for update skip locked
  )
  update online_attempts o set state = 'timed_out', submitted_at = o.deadline_at
    from due where o.school_id = due.school_id and o.attempt_id = due.attempt_id;
  get diagnostics n_out = row_count;
  for a in select o.school_id, o.attempt_id from online_attempts o where o.sheet_id is null and o.state in ('submitted', 'timed_out') order by o.submitted_at limit 2000 loop
    if public.online_mark_enqueue(a.school_id, a.attempt_id, null) then
      n_queued := n_queued + 1;
    end if;
  end loop;
  return query select n_out, n_queued;
end $$;
revoke all on function public.online_attempts_sweep() from public, anon, authenticated, service_role, app_user;
grant execute on function public.online_attempts_sweep() to nca_super;

-- Every two minutes, once the deployed runner handles it (the key is the two minutes, in UTC).
create function public.online_sweep_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'online.sweep', jsonb_build_object('at', t.m), 'online.sweep:' || t.m, 2
    from (select to_char(date_trunc('minute', now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI') as m) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'online.sweep')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.online_sweep_enqueue() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('online-tests-sweep', '*/2 * * * *', 'select public.online_sweep_enqueue()');
  end if;
end $$;

-- A person asked for an online script to be marked again (src/lib/marking/review.ts, askToMarkAgain, has set it
-- waiting): its marking is queued under a key of that moment. For whoever may mark the paper.
create function public.online_queue_marking(p_sheet_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  a record;
begin
  select o.school_id, o.attempt_id, o.paper_id, s.state, ((extract(epoch from s.updated_at) * 1000000)::bigint)::text as changed into a
    from online_attempts o join marking_sheets s on s.school_id = o.school_id and s.sheet_id = o.sheet_id
   where o.school_id = v_school and o.sheet_id = p_sheet_id and s.source = 'online';
  if a.attempt_id is null or not public.may_read_marking(a.paper_id) then
    return 'not_found';
  end if;
  if not public.may_mark_paper(a.paper_id) then
    return 'not_allowed';
  end if;
  if a.state <> 'waiting' then
    return 'state';
  end if;
  return case when public.online_mark_enqueue(a.school_id, a.attempt_id, a.changed) then 'queued' else 'off' end;
end $$;
revoke all on function public.online_queue_marking(uuid) from public, anon, authenticated, service_role;
grant execute on function public.online_queue_marking(uuid) to app_user;

-- ---- 7. The guardian's functions (the Family app's child mode, through School Link) --------------------------------------

-- The tests of the guardian's own consented children's classes that are opened and not yet closed (upcoming or open
-- now), and any the child is still sitting: names, times and the child's own attempt's state only. Never a question.
create function public.guardian_online_tests()
returns table (test_id uuid, student_id uuid, exam_name text, subject_name text, opens_at timestamptz, closes_at timestamptz, minutes integer,
               questions integer, attempt_state text, deadline_at timestamptz, server_now timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.test_id, s.student_id, e.name, sb.name, t.opens_at, t.closes_at, t.minutes,
         (select count(*)::integer from public.marking_questions q where q.school_id = t.school_id and q.paper_id = t.paper_id),
         a.state, a.deadline_at, now()
    from public.students s
    join public.exam_papers p on p.school_id = s.school_id and p.class_id = s.class_id and p.sitting = 'online'
    join public.online_tests t on t.school_id = p.school_id and t.paper_id = p.paper_id
    join public.exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
    join public.subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id
    left join public.online_attempts a on a.school_id = t.school_id and a.test_id = t.test_id and a.student_id = s.student_id
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and s.student_id = any ((select public.guardian_student_ids())::uuid[])
     and t.opened_at is not null
     and ((t.closed_at is null and t.closes_at > now()) or (a.state = 'open' and a.deadline_at > now()))
     and not public.exam_class_frozen(p.school_id, p.exam_id, p.class_id)
     and not exists (select 1 from public.exam_withdrawals w where w.school_id = s.school_id and w.exam_id = p.exam_id and w.student_id = s.student_id)
   order by t.opens_at, sb.name, t.test_id
$$;
revoke all on function public.guardian_online_tests() from public, anon, authenticated, service_role;
grant execute on function public.guardian_online_tests() to app_user;

-- The guardian's own consented child's attempt, locked for this change; null when it is not theirs.
create function public.guardian_online_attempt(p_attempt_id uuid, p_student_id uuid) returns public.online_attempts
language plpgsql security definer set search_path = '' as $$
declare
  a public.online_attempts;
begin
  if coalesce(current_setting('app.current_role', true), '') <> 'parent' or nullif(current_setting('app.current_user_id', true), '') is null
     or p_attempt_id is null or p_student_id is null or not (p_student_id = any ((select public.guardian_student_ids())::uuid[])) then
    return null;
  end if;
  select * into a from public.online_attempts o
   where o.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid and o.attempt_id = p_attempt_id and o.student_id = p_student_id
   for update;
  return a;
end $$;
revoke all on function public.guardian_online_attempt(uuid, uuid) from public, anon, authenticated, service_role, app_user;

-- Starts the child's one attempt, or gives back the one already open. outcome: 'started' (made now), 'open' (already
-- being sat), 'done' (submitted, timed out or voided: never a second), 'not_yet' (before it opens), 'closed' (closed or
-- past its closing time), 'not_found' (not a test of this guardian's child's class, opened, with questions).
create function public.guardian_online_start(p_test_id uuid, p_student_id uuid)
returns table (outcome text, attempt_id uuid, started_at timestamptz, deadline_at timestamptz, server_now timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  t record;
  a public.online_attempts;
  v_seed text := gen_random_uuid()::text;
  v_order uuid[];
  v_options jsonb;
begin
  if coalesce(current_setting('app.current_role', true), '') <> 'parent' or v_school is null or p_test_id is null or p_student_id is null
     or not (p_student_id = any ((select public.guardian_student_ids())::uuid[])) then
    return query select 'not_found'::text, null::uuid, null::timestamptz, null::timestamptz, now();
    return;
  end if;
  select o.school_id, o.test_id, o.paper_id, o.opens_at, o.closes_at, o.closed_at, o.shuffle into t
    from public.online_tests o
    join public.exam_papers p on p.school_id = o.school_id and p.paper_id = o.paper_id and p.sitting = 'online'
    join public.students s on s.school_id = p.school_id and s.class_id = p.class_id and s.student_id = p_student_id
   where o.school_id = v_school and o.test_id = p_test_id and o.opened_at is not null
     and not public.exam_class_frozen(p.school_id, p.exam_id, p.class_id)
     and not exists (select 1 from public.exam_withdrawals w where w.school_id = s.school_id and w.exam_id = p.exam_id and w.student_id = s.student_id)
     and exists (select 1 from public.marking_questions q where q.school_id = o.school_id and q.paper_id = o.paper_id);
  if t.test_id is null then
    return query select 'not_found'::text, null::uuid, null::timestamptz, null::timestamptz, now();
    return;
  end if;
  select * into a from public.online_attempts o where o.school_id = v_school and o.test_id = p_test_id and o.student_id = p_student_id for update;
  if a.attempt_id is not null then
    if a.state = 'open' and a.deadline_at <= now() then
      update public.online_attempts o set state = 'timed_out', submitted_at = o.deadline_at where o.school_id = v_school and o.attempt_id = a.attempt_id;
      perform public.online_mark_enqueue(v_school, a.attempt_id, null);
      a.state := 'timed_out';
    end if;
    return query select case when a.state = 'open' then 'open' else 'done' end, a.attempt_id, a.started_at, a.deadline_at, now();
    return;
  end if;
  if now() < t.opens_at then
    return query select 'not_yet'::text, null::uuid, null::timestamptz, null::timestamptz, now();
    return;
  end if;
  if t.closed_at is not null or now() >= t.closes_at then
    return query select 'closed'::text, null::uuid, null::timestamptz, null::timestamptz, now();
    return;
  end if;
  -- The order the child reads the questions in: the paper's order; shuffled, each section's questions (a choice
  -- group's kept together) in an order of this attempt's own. Each choice question's options likewise.
  select array_agg(q.question_id order by
           case when t.shuffle then coalesce(q.section, '') else '' end,
           case when t.shuffle then md5(v_seed || coalesce(q.choice_group, q.question_id::text)) else '' end,
           q.position)
    into v_order
    from public.marking_questions q where q.school_id = v_school and q.paper_id = t.paper_id;
  select coalesce(jsonb_object_agg(x.question_id, x.keys), '{}'::jsonb) into v_options
    from (select q.question_id,
                 (select jsonb_agg(o ->> 'key' order by case when t.shuffle then md5(v_seed || q.question_id::text || (o ->> 'key')) else o ->> 'key' end)
                    from jsonb_array_elements(q.options) o) as keys
            from public.marking_questions q
           where q.school_id = v_school and q.paper_id = t.paper_id and jsonb_array_length(q.options) > 0) x;
  insert into public.online_attempts (school_id, test_id, paper_id, student_id, deadline_at, question_order, option_orders)
  values (v_school, t.test_id, t.paper_id, p_student_id, now() + interval '1 minute', v_order, v_options)
  on conflict (school_id, test_id, student_id) do nothing;
  select * into a from public.online_attempts o where o.school_id = v_school and o.test_id = p_test_id and o.student_id = p_student_id;
  return query select 'started'::text, a.attempt_id, a.started_at, a.deadline_at, now();
end $$;
revoke all on function public.guardian_online_start(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.guardian_online_start(uuid, uuid) to app_user;

-- The questions of the child's open attempt, in its own order, as a family may see them: the number, section, kind and
-- how it is answered, the words, a choice question's options (key and words only, in the attempt's order; `multi`
-- when more than one is to be chosen), the marks, the internal-choice group and its count, and the child's own saved
-- answer and mark-to-review. NEVER the correct answer, the answer key or the marking steps. Nothing once the attempt
-- has ended.
create function public.guardian_online_questions(p_attempt_id uuid, p_student_id uuid)
returns table (question_id uuid, n integer, label text, section text, kind text, input text, prompt text, options jsonb, multi boolean,
               max_marks numeric, choice_group text, group_count integer, answer jsonb, flagged boolean, seq integer)
language sql stable security definer set search_path = '' as $$
  select q.question_id, o.n::integer, q.label, q.section, q.kind,
         case when q.kind = 'objective' and jsonb_array_length(q.options) > 0 then 'choice'
              when q.kind = 'numerical' and q.correct ? 'value' then 'number'
              else 'text' end,
         q.prompt,
         case when jsonb_array_length(q.options) > 0 then
           (select jsonb_agg(jsonb_build_object('key', k.key, 'text', (select x ->> 'text' from jsonb_array_elements(q.options) x where x ->> 'key' = k.key limit 1)) order by k.i)
              from jsonb_array_elements_text(coalesce(a.option_orders -> q.question_id::text, (select jsonb_agg(x ->> 'key') from jsonb_array_elements(q.options) x))) with ordinality k(key, i))
         else '[]'::jsonb end,
         q.kind = 'objective' and coalesce(jsonb_array_length(q.correct -> 'keys'), 0) > 1,
         q.max_marks, q.choice_group,
         case when q.choice_group is not null and jsonb_typeof(ms.choice_counts -> q.choice_group) = 'number' then (ms.choice_counts ->> q.choice_group)::integer end,
         w.answer, coalesce(w.flagged, false), coalesce(w.seq, 0)
    from public.online_attempts a
    cross join lateral unnest(a.question_order) with ordinality o(question_id, n)
    join public.marking_questions q on q.school_id = a.school_id and q.question_id = o.question_id
    left join public.marking_setups ms on ms.school_id = a.school_id and ms.paper_id = a.paper_id
    left join public.online_answers w on w.school_id = a.school_id and w.attempt_id = a.attempt_id and w.question_id = q.question_id
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and a.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and a.attempt_id = p_attempt_id and a.student_id = p_student_id
     and p_student_id = any ((select public.guardian_student_ids())::uuid[])
     and a.state = 'open' and a.deadline_at > now()
   order by o.n
$$;
revoke all on function public.guardian_online_questions(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.guardian_online_questions(uuid, uuid) to app_user;

-- Saves one answer (or clears it: p_answer null) and its mark-to-review, as given. 'saved'; 'closed' after the
-- deadline or once the attempt has ended; 'bad_answer' for an answer that is not this question's kind (a choice of its
-- own options, at most one unless more are to be chosen; a number; words of at most 4000 characters); 'not_found'.
-- A save older than the one kept (its count p_seq is not higher) changes nothing and is 'saved': the newer stays.
create function public.guardian_online_save(p_attempt_id uuid, p_student_id uuid, p_question_id uuid, p_answer jsonb, p_flagged boolean, p_seq integer)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  a public.online_attempts;
  q record;
  v_answer jsonb := p_answer;
  v_keys text[];
begin
  a := public.guardian_online_attempt(p_attempt_id, p_student_id);
  if a.attempt_id is null or p_question_id is null or not (p_question_id = any (a.question_order)) then
    return 'not_found';
  end if;
  if a.state <> 'open' or now() > a.deadline_at then
    return 'closed';
  end if;
  if p_seq is null or p_seq < 1 or p_seq > 1000000000 then
    return 'bad_answer';
  end if;
  select qq.kind, qq.options, qq.correct into q from public.marking_questions qq where qq.school_id = a.school_id and qq.question_id = p_question_id;
  if v_answer is not null and jsonb_typeof(v_answer) <> 'object' then
    return 'bad_answer';
  end if;
  if v_answer is not null then
    if q.kind = 'objective' and jsonb_array_length(q.options) > 0 then
      if v_answer - 'keys' <> '{}'::jsonb or jsonb_typeof(v_answer -> 'keys') <> 'array' then
        return 'bad_answer';
      end if;
      select array_agg(distinct k) into v_keys from jsonb_array_elements_text(v_answer -> 'keys') k;
      if v_keys is null then
        v_answer := null;
      elsif cardinality(v_keys) <> jsonb_array_length(v_answer -> 'keys')
         or exists (select 1 from jsonb_array_elements(v_answer -> 'keys') k where jsonb_typeof(k) <> 'string')
         or exists (select 1 from unnest(v_keys) k where not exists (select 1 from jsonb_array_elements(q.options) o where o ->> 'key' = k))
         or (cardinality(v_keys) > 1 and coalesce(jsonb_array_length(q.correct -> 'keys'), 0) <= 1) then
        return 'bad_answer';
      else
        v_answer := jsonb_build_object('keys', (select jsonb_agg(k order by k) from unnest(v_keys) k));
      end if;
    elsif q.kind = 'numerical' and q.correct ? 'value' then
      if v_answer - 'value' <> '{}'::jsonb or jsonb_typeof(v_answer -> 'value') <> 'number' or abs((v_answer ->> 'value')::numeric) > 1000000000000 then
        return 'bad_answer';
      end if;
    else
      if v_answer - 'text' <> '{}'::jsonb or jsonb_typeof(v_answer -> 'text') <> 'string' or char_length(v_answer ->> 'text') > 4000 then
        return 'bad_answer';
      end if;
      if btrim(v_answer ->> 'text') = '' then
        v_answer := null;
      end if;
    end if;
  end if;
  insert into public.online_answers (school_id, attempt_id, paper_id, question_id, answer, flagged, seq, saved_at)
  values (a.school_id, a.attempt_id, a.paper_id, p_question_id, v_answer, coalesce(p_flagged, false), p_seq, now())
  on conflict (school_id, attempt_id, question_id) do update
     set answer = excluded.answer, flagged = excluded.flagged, seq = excluded.seq, saved_at = excluded.saved_at
   where public.online_answers.seq < excluded.seq;
  return 'saved';
end $$;
revoke all on function public.guardian_online_save(uuid, uuid, uuid, jsonb, boolean, integer) from public, anon, authenticated, service_role;
grant execute on function public.guardian_online_save(uuid, uuid, uuid, jsonb, boolean, integer) to app_user;

-- Submits the attempt: 'submitted' before the deadline; 'timed_out' after it (what was saved counts); 'done' when it
-- had already ended; 'not_found'. Either way its marking is queued.
create function public.guardian_online_submit(p_attempt_id uuid, p_student_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  a public.online_attempts;
  v_state text;
begin
  a := public.guardian_online_attempt(p_attempt_id, p_student_id);
  if a.attempt_id is null then
    return 'not_found';
  end if;
  if a.state <> 'open' then
    return 'done';
  end if;
  v_state := case when now() <= a.deadline_at then 'submitted' else 'timed_out' end;
  update public.online_attempts o set state = v_state, submitted_at = least(now(), o.deadline_at)
   where o.school_id = a.school_id and o.attempt_id = a.attempt_id;
  perform public.online_mark_enqueue(a.school_id, a.attempt_id, null);
  return v_state;
end $$;
revoke all on function public.guardian_online_submit(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.guardian_online_submit(uuid, uuid) to app_user;

-- The child left the test screen once more: counted while the attempt is open. 'noted', 'closed' or 'not_found'.
create function public.guardian_online_left(p_attempt_id uuid, p_student_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  a public.online_attempts;
begin
  a := public.guardian_online_attempt(p_attempt_id, p_student_id);
  if a.attempt_id is null then
    return 'not_found';
  end if;
  if a.state <> 'open' or now() > a.deadline_at then
    return 'closed';
  end if;
  update public.online_attempts o set left_count = least(o.left_count + 1, 10000) where o.school_id = a.school_id and o.attempt_id = a.attempt_id;
  return 'noted';
end $$;
revoke all on function public.guardian_online_left(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.guardian_online_left(uuid, uuid) to app_user;
