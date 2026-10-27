-- AQ-2 (docs/36 §1.1; Decision Log C362, C363): question papers made from what was taught, and the school's question
-- bank.
--
--   1. question_bank: the school's questions per grade and subject, by chapter and topic, written by its teachers, kept
--      from papers, or written by the AI. An AI question is a draft until a teacher keeps a paper it is on; only kept
--      questions are offered again. School staff read it; staff add to it; its writer or the office changes or retires a
--      question; a draft is removed, a kept question only retired. A school job adds AI drafts in the name of the person
--      who asked for the paper.
--   2. marking_questions.bank_id: the bank question a paper's question came from (none: written on the paper).
--   3. The paper's questions written by a school job (papers.make) carry the name of the person who asked for them:
--      marking_questions_rules keeps the writer a job names, where a person always writes in their own name.
--   4. marking_setups.kept_at / kept_by: the teacher kept the paper. "Kept" belongs to the paper, not to one making of
--      it: a paper made by hand is kept too, and a paper changed after it was kept is kept again before it prints
--      (src/lib/papers/keep.ts compares kept_at with the questions' last change). keep_paper() is the one way to keep:
--      it turns the paper's AI drafts into kept bank questions, puts the teacher's own worded questions in the bank,
--      and counts each bank question's kept papers.
--   5. paper_generations: one making of a paper's questions (papers.make, a long job, C353): at most one waiting or
--      working per paper; the blueprint and plan it was made from, kept as they were; the AI provider, model and prompt
--      version used; who asked. Read and written as the paper's marking is (exam_papers' rule, as am_1's tables).
--   6. The AI task exams.write_questions (C363): the syllabus, class level, subject and language only, never a child's
--      words, so it is not a minors task. It starts on the provider the marking tasks use on the test site (Workers AI),
--      switched on, changeable in Control → AI. School staff read it, as the marking tasks.
--   7. A school session queues papers.make, as it queues the marking jobs.

-- ---- 1. The question bank ----------------------------------------------------------------------------------------------

create table question_bank (
  school_id uuid not null references schools(school_id),
  bank_id uuid not null default gen_random_uuid(),
  grade text not null, -- the class level as the school names it (classes.grade, else the class's name)
  subject_id uuid not null,
  chapter text not null,
  topic text not null default '',
  kind text not null,
  max_marks numeric(5,1) not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct jsonb,
  answer_key text not null default '',
  steps jsonb not null default '[]'::jsonb,
  difficulty text,
  language text not null default 'en',
  source text not null,
  state text not null default 'draft',
  created_by uuid not null,
  used_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, bank_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, created_by) references users(school_id, user_id),
  constraint question_bank_grade check (char_length(grade) between 1 and 40),
  constraint question_bank_chapter check (char_length(chapter) between 1 and 120),
  constraint question_bank_topic check (char_length(topic) <= 200),
  constraint question_bank_kind check (kind in ('objective', 'short', 'long', 'numerical', 'diagram')),
  constraint question_bank_max check (max_marks > 0 and max_marks <= 100 and max_marks * 10 = trunc(max_marks * 10)),
  constraint question_bank_prompt check (char_length(prompt) between 1 and 4000),
  constraint question_bank_key check (char_length(answer_key) <= 8000),
  constraint question_bank_steps check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 12),
  -- As marking_questions (aq_1_shared): options only on an objective question; a correct answer only where rules mark it.
  constraint question_bank_options check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) in (0, 2, 3, 4, 5, 6)
    and (jsonb_array_length(options) = 0 or kind = 'objective')
    and octet_length(options::text) <= 4000
    and not (options @? '$[*] ? (!(@.key like_regex "^[A-F]$") || @.text.type() != "string")')
  ),
  constraint question_bank_correct check (
    correct is null
    or (kind = 'objective' and jsonb_array_length(options) > 0 and jsonb_typeof(correct -> 'keys') = 'array'
        and jsonb_array_length(correct -> 'keys') between 1 and 6
        and not (correct @? '$.keys[*] ? (!(@ like_regex "^[A-F]$"))'))
    or (kind = 'numerical' and jsonb_typeof(correct -> 'value') = 'number'
        and (correct -> 'tolerance' is null or (jsonb_typeof(correct -> 'tolerance') = 'number' and (correct ->> 'tolerance')::numeric >= 0)))
  ),
  constraint question_bank_difficulty check (difficulty is null or difficulty in ('easy', 'medium', 'hard')),
  constraint question_bank_language check (language in ('en', 'hi')),
  constraint question_bank_source check (source in ('teacher', 'ai', 'paper')),
  constraint question_bank_state check (state in ('draft', 'kept', 'retired')),
  constraint question_bank_used check (used_count >= 0)
);
-- What a paper asks of the bank: kept questions of a grade, subject and chapter, of a kind and marks.
create index question_bank_find on question_bank (school_id, subject_id, grade, chapter, kind, max_marks) where state = 'kept';

-- A bank question's steps give at most its marks; its school, grade, subject and writer never change; a person writes
-- in their own name, and a school job (no person) in the name it gives, which must be a user of the school (the key).
create function public.question_bank_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  step jsonb;
  step_sum numeric := 0;
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
begin
  for step in select * from jsonb_array_elements(new.steps) loop
    if jsonb_typeof(step) <> 'object' or jsonb_typeof(step -> 'step') <> 'string' or char_length(step ->> 'step') not between 1 and 300
       or jsonb_typeof(step -> 'marks') <> 'number' or (step ->> 'marks')::numeric <= 0 then
      raise exception 'a marking step is a few words and the marks it gives' using errcode = 'check_violation';
    end if;
    step_sum := step_sum + (step ->> 'marks')::numeric;
  end loop;
  if step_sum > new.max_marks then
    raise exception 'a question''s steps give at most its marks' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if (new.school_id, new.bank_id, new.grade, new.subject_id, new.created_by, new.created_at)
       is distinct from (old.school_id, old.bank_id, old.grade, old.subject_id, old.created_by, old.created_at) then
      raise exception 'a bank question stays its school''s, of its grade and subject, by its writer' using errcode = 'check_violation';
    end if;
  elsif current_user in ('app_user', 'nca_super') and me is not null and me <> '00000000-0000-0000-0000-000000000000'::uuid then
    new.created_by := me;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.question_bank_rules() from public, anon, authenticated, service_role, app_user, nca_super;
create trigger question_bank_rules before insert or update on question_bank for each row execute function public.question_bank_rules();

-- ---- 2. Where a paper's question came from ------------------------------------------------------------------------------

alter table marking_questions add column bank_id uuid;
alter table marking_questions add constraint marking_questions_bank_fkey
  foreign key (school_id, bank_id) references question_bank(school_id, bank_id) on delete set null (bank_id);
create index marking_questions_bank on marking_questions (school_id, bank_id) where bank_id is not null;

-- ---- 3. A paper's questions written by a school job ---------------------------------------------------------------------

-- As am_1_answer_marking, with one change: a school job (app.current_job set, no person) writes in the name it gives
-- (papers.make: the person who asked for the paper), where a person's session always writes in their own name.
create or replace function public.marking_questions_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  paper record;
  step jsonb;
  step_sum numeric := 0;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from marking_sheets s where s.school_id = old.school_id and s.paper_id = old.paper_id and s.state = 'approved') then
      raise exception 'a question is not removed once a script of its paper is approved' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  select p.class_id, p.subject_id, p.components into paper from exam_papers p where p.school_id = new.school_id and p.paper_id = new.paper_id;
  if not exists (select 1 from jsonb_array_elements(paper.components) c where c ->> 'key' = new.component) then
    raise exception 'a question counts to one of its paper''s parts' using errcode = 'check_violation';
  end if;
  if new.unit_id is not null and not exists (select 1 from syllabus_units u where u.school_id = new.school_id and u.unit_id = new.unit_id
                                                and u.class_id = paper.class_id and u.subject_id = paper.subject_id) then
    raise exception 'a question''s topic is a unit of its paper''s class and subject' using errcode = 'check_violation';
  end if;
  for step in select * from jsonb_array_elements(new.steps) loop
    if jsonb_typeof(step) <> 'object' or jsonb_typeof(step -> 'step') <> 'string' or char_length(step ->> 'step') not between 1 and 300
       or jsonb_typeof(step -> 'marks') <> 'number' or (step ->> 'marks')::numeric <= 0 then
      raise exception 'a marking step is a few words and the marks it gives' using errcode = 'check_violation';
    end if;
    step_sum := step_sum + (step ->> 'marks')::numeric;
  end loop;
  if step_sum > new.max_marks then
    raise exception 'a question''s steps give at most its marks' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if (new.question_id, new.school_id, new.paper_id) is distinct from (old.question_id, old.school_id, old.paper_id) then
      raise exception 'a question stays on its paper' using errcode = 'check_violation';
    end if;
    if (new.component, new.max_marks, new.choice_group, new.position, new.label) is distinct from (old.component, old.max_marks, old.choice_group, old.position, old.label)
       and exists (select 1 from marking_sheets s where s.school_id = old.school_id and s.paper_id = old.paper_id and s.state = 'approved') then
      raise exception 'a question''s number, part, marks and group are fixed once a script of its paper is approved' using errcode = 'check_violation';
    end if;
  end if;
  if current_user in ('app_user', 'nca_super') then
    if coalesce(current_setting('app.current_job', true), '') <> ''
       and coalesce(nullif(current_setting('app.current_user_id', true), ''), '00000000-0000-0000-0000-000000000000') = '00000000-0000-0000-0000-000000000000' then
      null; -- a school job: the writer it named stays (the key holds it to a user of the school)
    else
      new.updated_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.marking_questions_rules() from public, anon, authenticated, service_role, app_user, nca_super;

-- ---- 4. A kept paper ----------------------------------------------------------------------------------------------------

alter table marking_setups add column kept_at timestamptz;
alter table marking_setups add column kept_by uuid;
alter table marking_setups add constraint marking_setups_kept_by_fkey foreign key (school_id, kept_by) references users(school_id, user_id);
alter table marking_setups add constraint marking_setups_kept check ((kept_at is null) = (kept_by is null));

-- ---- 5. Making a paper's questions --------------------------------------------------------------------------------------

create table paper_generations (
  school_id uuid not null references schools(school_id),
  generation_id uuid not null default gen_random_uuid(),
  paper_id uuid not null,
  kind text not null default 'paper', -- paper: a paper with no questions; again: replaces its questions; question: one question anew
  question_id uuid, -- the question written anew (kind 'question')
  state text not null default 'waiting',
  blueprint jsonb not null default '{}'::jsonb, -- the blueprint as it was used
  plan jsonb not null default '{}'::jsonb, -- the scope rule used, the chapters with their periods and marks, the slots
  result jsonb, -- how many questions came from the bank, from the AI, and were left for the teacher
  failure text,
  attempts integer not null default 0,
  ai_provider text,
  ai_model text,
  prompt_version text,
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  primary key (school_id, generation_id),
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id) on delete cascade,
  foreign key (school_id, requested_by) references users(school_id, user_id),
  constraint paper_generations_kind check (kind in ('paper', 'again', 'question') and ((kind = 'question') = (question_id is not null))),
  constraint paper_generations_state check (state in ('waiting', 'working', 'done', 'failed')),
  constraint paper_generations_failure check (failure is null or failure ~ '^[a-z_]{1,40}$'),
  constraint paper_generations_attempts check (attempts between 0 and 20),
  constraint paper_generations_blueprint check (jsonb_typeof(blueprint) = 'object' and octet_length(blueprint::text) <= 20000),
  constraint paper_generations_plan check (jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 200000),
  constraint paper_generations_result check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 4000)),
  constraint paper_generations_ai check (
    (ai_provider is null or ai_provider ~ '^[a-z0-9-]{1,40}$') and (ai_model is null or char_length(ai_model) <= 80)
    and (prompt_version is null or prompt_version ~ '^[a-z0-9.-]{1,32}$')
  )
);
-- One making at a time for a paper.
create unique index paper_generations_one_running on paper_generations (school_id, paper_id) where state in ('waiting', 'working');
create index paper_generations_paper on paper_generations (school_id, paper_id, created_at desc);

-- Who asked never changes; a finished making stays as it ended.
create function public.paper_generations_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if (new.school_id, new.generation_id, new.paper_id, new.kind, new.question_id, new.requested_by, new.created_at)
       is distinct from (old.school_id, old.generation_id, old.paper_id, old.kind, old.question_id, old.requested_by, old.created_at) then
      raise exception 'a making of a paper stays the one that was asked for' using errcode = 'check_violation';
    end if;
    if old.state in ('done', 'failed') and new.state is distinct from old.state then
      raise exception 'a finished making of a paper is not started again' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.paper_generations_rules() from public, anon, authenticated, service_role, app_user, nca_super;
create trigger paper_generations_rules before update on paper_generations for each row execute function public.paper_generations_rules();

-- ---- Rights and row level security --------------------------------------------------------------------------------------

revoke all on question_bank, paper_generations from public, anon, authenticated, service_role, nca_super;
grant select, insert, update, delete on question_bank to app_user;
grant select, insert, update on paper_generations to app_user;

alter table question_bank enable row level security;
alter table question_bank force row level security;
create policy question_bank_tenant_isolation on question_bank using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
alter table paper_generations enable row level security;
alter table paper_generations force row level security;
create policy paper_generations_tenant_isolation on paper_generations using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- The bank: school staff who run or teach exams read it; they add to it in their own name (a school job adds AI drafts
-- in the name of the person who asked); its writer or the office changes or retires a question; a draft may be removed,
-- a kept question is retired instead.
create policy question_bank_readers on question_bank as restrictive for select using (
  coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
);
create policy question_bank_writers on question_bank as restrictive for insert with check (
  coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
  and (
    created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
    or (coalesce(current_setting('app.current_job', true), '') <> '' and source = 'ai' and state = 'draft')
  )
);
create policy question_bank_changers on question_bank as restrictive for update
  using (
    coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
    or (current_setting('app.current_role', true) = 'teacher' and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
  )
  with check (
    coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
    or (current_setting('app.current_role', true) = 'teacher' and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
  );
create policy question_bank_removers on question_bank as restrictive for delete using (
  state = 'draft'
  and (
    coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
    or (current_setting('app.current_role', true) = 'teacher' and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
  )
);
create policy question_bank_no_parent on question_bank as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- A paper's makings follow the paper, as its marking does: read by whoever reads the paper's marking, asked for in one's
-- own name and moved on by whoever may mark the paper (the school's job is its office), never once its class is
-- published.
create policy paper_generations_readers on paper_generations as restrictive for select using (public.may_read_marking(paper_id));
create policy paper_generations_writers on paper_generations as restrictive for insert with check (
  public.may_mark_paper(paper_id) and requested_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy paper_generations_changers on paper_generations as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy paper_generations_no_parent on paper_generations as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- ---- Keeping a paper ----------------------------------------------------------------------------------------------------

-- The teacher keeps the paper (C363): only a person who may mark it, while nothing is being made for it and every
-- question has its words. The paper's AI drafts become kept bank questions with the paper's words as they are now
-- ("from a paper"); its own worded questions with a topic enter the bank as kept; every bank question on it counts the
-- kept papers it is on; and the paper is stamped kept now. Answers how many of its questions are in the bank. The app
-- checks first that the questions make up the paper (src/lib/papers/keep.ts).
create function public.keep_paper(p_paper_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  v_me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  v_grade text;
  v_subject uuid;
  v_language text;
  q record;
  v_bank uuid;
  n integer;
begin
  if v_school is null or not public.may_mark_paper(p_paper_id) then
    raise exception 'not allowed to keep this paper' using errcode = '42501';
  end if;
  if v_me is null or coalesce(current_setting('app.current_job', true), '') <> ''
     or not exists (select 1 from users u where u.school_id = v_school and u.user_id = v_me) then
    raise exception 'a paper is kept by a person' using errcode = '42501';
  end if;
  if exists (select 1 from paper_generations g where g.school_id = v_school and g.paper_id = p_paper_id and g.state in ('waiting', 'working')) then
    raise exception 'a paper being made is kept once it is made' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from marking_questions mq where mq.school_id = v_school and mq.paper_id = p_paper_id)
     or exists (select 1 from marking_questions mq where mq.school_id = v_school and mq.paper_id = p_paper_id and btrim(mq.prompt) = '') then
    raise exception 'every question of a kept paper has its words' using errcode = 'check_violation';
  end if;
  select coalesce(nullif(btrim(c.grade), ''), btrim(c.name)), p.subject_id into v_grade, v_subject
    from exam_papers p join classes c on c.school_id = p.school_id and c.class_id = p.class_id
   where p.school_id = v_school and p.paper_id = p_paper_id;
  v_language := case when (select s.language from marking_setups s where s.school_id = v_school and s.paper_id = p_paper_id) = 'hi' then 'hi' else 'en' end;

  -- The paper's AI drafts become the school's, in the paper's words.
  update question_bank b
     set prompt = mq.prompt, options = mq.options, correct = mq.correct, answer_key = mq.answer_key, steps = mq.steps,
         kind = mq.kind, max_marks = mq.max_marks, difficulty = mq.difficulty,
         chapter = coalesce(u.chapter, b.chapter), topic = coalesce(u.topic, b.topic),
         state = 'kept', source = 'paper'
    from marking_questions mq
    left join syllabus_units u on u.school_id = mq.school_id and u.unit_id = mq.unit_id
   where mq.school_id = v_school and mq.paper_id = p_paper_id
     and b.school_id = v_school and b.bank_id = mq.bank_id and b.state = 'draft';

  -- The teacher's own worded questions with a topic enter the bank.
  for q in
    select mq.question_id, mq.kind, mq.max_marks, mq.prompt, mq.options, mq.correct, mq.answer_key, mq.steps, mq.difficulty, u.chapter, u.topic
      from marking_questions mq
      join syllabus_units u on u.school_id = mq.school_id and u.unit_id = mq.unit_id
     where mq.school_id = v_school and mq.paper_id = p_paper_id and mq.bank_id is null
  loop
    insert into question_bank (school_id, grade, subject_id, chapter, topic, kind, max_marks, prompt, options, correct, answer_key, steps, difficulty, language, source, state, created_by)
    values (v_school, v_grade, v_subject, q.chapter, q.topic, q.kind, q.max_marks, q.prompt, q.options, q.correct, q.answer_key, q.steps, q.difficulty, v_language, 'paper', 'kept', v_me)
    returning bank_id into v_bank;
    update marking_questions set bank_id = v_bank where school_id = v_school and question_id = q.question_id;
  end loop;

  insert into marking_setups (school_id, paper_id, updated_by, kept_at, kept_by) values (v_school, p_paper_id, v_me, now(), v_me)
  on conflict (school_id, paper_id) do update set kept_at = now(), kept_by = v_me;

  -- Each bank question on the paper: the kept papers it is on.
  update question_bank b
     set used_count = (select count(distinct mq.paper_id)::integer from marking_questions mq
                         join marking_setups s on s.school_id = mq.school_id and s.paper_id = mq.paper_id and s.kept_at is not null
                        where mq.school_id = b.school_id and mq.bank_id = b.bank_id),
         last_used_at = now()
   where b.school_id = v_school
     and b.bank_id in (select mq.bank_id from marking_questions mq where mq.school_id = v_school and mq.paper_id = p_paper_id and mq.bank_id is not null);

  select count(*)::integer into n from marking_questions mq where mq.school_id = v_school and mq.paper_id = p_paper_id and mq.bank_id is not null;
  return n;
end $$;
revoke all on function public.keep_paper(uuid) from public, anon, authenticated, service_role, nca_super;
grant execute on function public.keep_paper(uuid) to app_user;

-- ---- 6. The AI task -----------------------------------------------------------------------------------------------------

insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, max_output_tokens, carries_child_words, enabled)
values ('exams.write_questions', 'workers-ai', '@cf/meta/llama-4-scout-17b-16e-instruct', 'v1', 6000, false, true)
on conflict (profile_id) do nothing;

alter policy ai_profiles_staff_read on control.ai_profiles
  using (profile_id in ('copilot.draft', 'parent_ai.home_help', 'exams.read_pages', 'exams.mark', 'exams.write_questions'));
alter policy ai_profiles_staff_only on control.ai_profiles
  using (profile_id in ('copilot.draft', 'parent_ai.home_help', 'exams.read_pages', 'exams.mark', 'exams.write_questions')) with check (false);

-- ---- 7. A school session queues papers.make -----------------------------------------------------------------------------

alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify', 'whatsapp.send', 'ptm.remind', 'event.remind', 'complaint.escalate')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
    or (
      type in ('marking.read', 'marking.group', 'marking.mark', 'papers.make')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
      and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
    )
  );
