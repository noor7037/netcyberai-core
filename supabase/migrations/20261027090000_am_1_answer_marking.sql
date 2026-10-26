-- AI answer-sheet marking and exam numbers (docs/35; Decision Log C347–C352; slice AM-1).
--
-- 1. Exam numbers and withdrawals (C348). An exam's candidates are its classes' rolls (P6's own rule: students
--    'active' or 'pending_consent' in a class with a paper of the exam) minus the children the office withdrew from it.
--    Counted from the rows every time (exam_candidate_counts), never typed. A school that uses exam numbers turns them
--    on per exam: the database gives each candidate one number, unique in the exam, in class order then roll order,
--    and a child who joins a class of an open exam later gets the next one at once. A number is never reused or
--    changed, a withdrawn child keeps theirs, and the prefix is fixed once a number is issued. Official roll numbers
--    are never touched.
-- 2. AI marking (C347). Under a P6 paper: its setup and questions; the uploads of scripts and their page pictures; one
--    script (sheet) per child, matched to a candidate; and a mark per question, the AI's and the teacher's kept apart.
--    Nothing here is a mark: a person's approval writes `marks` through saveMarks (src/lib/exams/marks.ts), and the
--    database now refuses any mark written in a job's session (app.current_job set), so no AI run can.
--    Who reads and writes follows exam_papers (docs/27 §3 rule 6): the principal, the school admin and the academic
--    coordinator every paper; a teacher the papers of their own classes; writes by whoever may enter that paper's
--    marks (may_enter_marks), never while the paper's class is published (C215). The school's marking jobs run as its
--    office (withSchoolJobContext, role principal, no person), so they pass the same rules.
-- 3. Families (C351). A guardian reads, read only, their own consented child's APPROVED scripts of a publication in
--    force (C333's guardian_publications() and guardian_student_ids(), reused): the script, its question marks, its
--    pages and the paper's questions. Setups and uploads never. A private report link (marking_report_links) is read
--    only through marking_report() by the platform role, as certificate copies are (C228).
-- 4. The AI tasks (C349): control.ai_profiles gains exams.read_pages and exams.mark, both carrying a child's words
--    (the minors check applies), switched off with no provider until Noor chooses one in Control → AI. School staff
--    read them, as they read Copilot's (C284).

-- ---- 1. Exam numbers and withdrawals ---------------------------------------------------------------------------------

alter table exams
  add column numbering text not null default 'roll',
  add column seat_prefix text not null default '',
  add constraint exams_numbering check (numbering in ('roll', 'seat')),
  add constraint exams_seat_prefix check (seat_prefix ~ '^[A-Z0-9]{0,6}$');

create table exam_withdrawals (
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  student_id uuid not null,
  reason text not null,
  withdrawn_by uuid not null,
  withdrawn_at timestamptz not null default now(),
  primary key (school_id, exam_id, student_id),
  foreign key (school_id, exam_id) references exams(school_id, exam_id) on delete cascade,
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, withdrawn_by) references users(school_id, user_id),
  constraint exam_withdrawals_reason check (char_length(btrim(reason)) between 3 and 300)
);

create table exam_seat_numbers (
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  student_id uuid not null,
  seq integer not null,
  seat_no text not null,
  issued_at timestamptz not null default now(),
  primary key (school_id, exam_id, student_id),
  unique (school_id, exam_id, seq),
  unique (school_id, exam_id, seat_no),
  foreign key (school_id, exam_id) references exams(school_id, exam_id) on delete cascade,
  foreign key (school_id, student_id) references students(school_id, student_id),
  constraint exam_seat_numbers_seq check (seq between 1 and 99999),
  constraint exam_seat_numbers_format check (seat_no ~ '^[A-Z0-9]{1,12}$')
);

-- Issues the missing numbers of an exam with numbers on and still open: each candidate without one gets the next, in
-- class order (src/lib/classes/class-order.ts, the same SQL) then roll order (P6's ROLL_ORDER). The exam's row is
-- locked, so two writers never take one number. Definer: called from the triggers below, whoever writes; it answers
-- for the exam's own school only.
create function public.issue_exam_seat_numbers(p_exam_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school uuid;
  v_prefix text;
  v_last integer;
  v_issued integer;
begin
  select e.school_id, e.seat_prefix into v_school, v_prefix
    from exams e where e.exam_id = p_exam_id and e.numbering = 'seat' and e.status = 'open'
     for update;
  if not found then
    return 0;
  end if;
  select coalesce(max(x.seq), 0) into v_last from exam_seat_numbers x where x.school_id = v_school and x.exam_id = p_exam_id;
  insert into exam_seat_numbers (school_id, exam_id, student_id, seq, seat_no)
  select v_school, p_exam_id, t.student_id, v_last + t.n, v_prefix || lpad((v_last + t.n)::text, 4, '0')
    from (
      select s.student_id,
             row_number() over (
               order by coalesce(array_position(array['NURSERY', 'LKG', 'UKG'], substring(upper(btrim(coalesce(nullif(btrim(c.grade), ''), c.name, ''))) from '^(NURSERY|LKG|UKG|[0-9]{1,2})')) - 1,
                                 2 + substring(upper(btrim(coalesce(nullif(btrim(c.grade), ''), c.name, ''))) from '^(NURSERY|LKG|UKG|[0-9]{1,2})')::int, 1000),
                        coalesce(nullif(upper(btrim(c.section)), ''), regexp_replace(regexp_replace(upper(btrim(coalesce(c.name, ''))), '^(NURSERY|LKG|UKG|[0-9]{1,2})', ''), '[^A-Z0-9]', '', 'g')) collate "C",
                        coalesce(c.name, '') collate "C", c.class_id,
                        case when s.roll_no ~ '^[0-9]{1,9}$' then s.roll_no::int end nulls last, s.roll_no nulls last, s.name, s.student_id
             ) as n
        from students s
        join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       where s.school_id = v_school
         and s.status in ('active', 'pending_consent')
         and s.class_id in (select p.class_id from exam_papers p where p.school_id = v_school and p.exam_id = p_exam_id)
         and not exists (select 1 from exam_seat_numbers x where x.school_id = v_school and x.exam_id = p_exam_id and x.student_id = s.student_id)
         and not exists (select 1 from exam_withdrawals w where w.school_id = v_school and w.exam_id = p_exam_id and w.student_id = s.student_id)
    ) t;
  get diagnostics v_issued = row_count;
  return v_issued;
end $$;
revoke all on function public.issue_exam_seat_numbers(uuid) from public, anon, authenticated, service_role;

create function public.exam_numbers_on_paper() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.issue_exam_seat_numbers(new.exam_id);
  return null;
end $$;
revoke all on function public.exam_numbers_on_paper() from public, anon, authenticated, service_role;
create trigger exam_numbers_on_paper after insert on exam_papers for each row execute function public.exam_numbers_on_paper();

create function public.exam_numbers_on_exam() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.seat_prefix is distinct from old.seat_prefix
     and exists (select 1 from exam_seat_numbers x where x.school_id = old.school_id and x.exam_id = old.exam_id) then
    raise exception 'an exam''s number prefix is fixed once a number is issued' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.exam_numbers_on_exam() from public, anon, authenticated, service_role;
create trigger exam_numbers_prefix_fixed before update of seat_prefix on exams for each row execute function public.exam_numbers_on_exam();

create function public.exam_numbers_turned_on() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.issue_exam_seat_numbers(new.exam_id);
  return null;
end $$;
revoke all on function public.exam_numbers_turned_on() from public, anon, authenticated, service_role;
create trigger exam_numbers_turned_on after update of numbering on exams for each row
  when (new.numbering = 'seat' and old.numbering is distinct from 'seat') execute function public.exam_numbers_turned_on();

-- A child who joins a class (a new record, a move, or a record made active) is given the next number of every open
-- exam with numbers on that has a paper for the class.
create function public.exam_numbers_on_student() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e uuid;
begin
  if new.class_id is null or new.status not in ('active', 'pending_consent') then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id and old.status in ('active', 'pending_consent') then
    return null;
  end if;
  for e in select distinct p.exam_id from exam_papers p join exams x on x.school_id = p.school_id and x.exam_id = p.exam_id
            where p.school_id = new.school_id and p.class_id = new.class_id and x.numbering = 'seat' and x.status = 'open' loop
    perform public.issue_exam_seat_numbers(e);
  end loop;
  return null;
end $$;
revoke all on function public.exam_numbers_on_student() from public, anon, authenticated, service_role;
create trigger exam_numbers_on_student after insert or update of class_id, status on students for each row execute function public.exam_numbers_on_student();

-- A child whose withdrawal is taken back is a candidate again, and gets a number if they never had one.
create function public.exam_numbers_on_return() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.issue_exam_seat_numbers(old.exam_id);
  return null;
end $$;
revoke all on function public.exam_numbers_on_return() from public, anon, authenticated, service_role;
create trigger exam_numbers_on_return after delete on exam_withdrawals for each row execute function public.exam_numbers_on_return();

-- An exam's candidates, per class of its papers: on the roll, withdrawn, candidates (on the roll and not withdrawn)
-- and numbered. Numbers only; it answers for an exam the person may read (the office every class, a teacher their own).
create function public.exam_candidate_counts(p_exam_id uuid)
returns table (class_id uuid, on_roll integer, withdrawn integer, candidates integer, numbered integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select k.class_id,
         count(s.student_id)::integer,
         count(s.student_id) filter (where w.student_id is not null)::integer,
         count(s.student_id) filter (where w.student_id is null)::integer,
         count(s.student_id) filter (where w.student_id is null and x.student_id is not null)::integer
    from (select distinct p.school_id, p.class_id from exam_papers p
           where p.exam_id = p_exam_id
             and p.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
             and (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
                  or (current_setting('app.current_role', true) = 'teacher' and p.class_id = any (public.teacher_own_class_ids())))) k
    left join students s on s.school_id = k.school_id and s.class_id = k.class_id and s.status in ('active', 'pending_consent')
    left join exam_withdrawals w on w.school_id = k.school_id and w.exam_id = p_exam_id and w.student_id = s.student_id
    left join exam_seat_numbers x on x.school_id = k.school_id and x.exam_id = p_exam_id and x.student_id = s.student_id
   group by k.class_id
$$;
revoke all on function public.exam_candidate_counts(uuid) from public, anon, authenticated, service_role;
grant execute on function public.exam_candidate_counts(uuid) to app_user;

-- ---- 2. AI marking ----------------------------------------------------------------------------------------------------

-- One rule in one place for the marking tables: whether the person may read a paper (the office every paper, a teacher
-- the papers of their own classes) and whether they may mark it (may_enter_marks, and its class not published).
create function public.may_read_marking(p_paper_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from exam_papers p
     where p.paper_id = p_paper_id
       and p.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
       and (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
            or (current_setting('app.current_role', true) = 'teacher' and p.class_id = any (public.teacher_own_class_ids())))
  )
$$;
revoke all on function public.may_read_marking(uuid) from public, anon, authenticated, service_role;
grant execute on function public.may_read_marking(uuid) to app_user;

create function public.may_mark_paper(p_paper_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from exam_papers p
     where p.paper_id = p_paper_id
       and p.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
       and public.may_enter_marks(p.class_id, p.subject_id)
       and not public.exam_class_frozen(p.school_id, p.exam_id, p.class_id)
  )
$$;
revoke all on function public.may_mark_paper(uuid) from public, anon, authenticated, service_role;
grant execute on function public.may_mark_paper(uuid) to app_user;

create table marking_setups (
  school_id uuid not null references schools(school_id),
  paper_id uuid not null,
  language text not null default 'en',
  guidance text not null default '',
  choice_counts jsonb not null default '{}'::jsonb,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, paper_id),
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id) on delete cascade,
  foreign key (school_id, updated_by) references users(school_id, user_id),
  constraint marking_setups_language check (language in ('en', 'hi', 'mixed')),
  constraint marking_setups_guidance check (char_length(guidance) <= 2000),
  constraint marking_setups_choice check (jsonb_typeof(choice_counts) = 'object')
);

create table marking_questions (
  school_id uuid not null references schools(school_id),
  question_id uuid not null default gen_random_uuid(),
  paper_id uuid not null,
  position integer not null,
  label text not null,
  component text not null,
  max_marks numeric(5,1) not null,
  choice_group text,
  unit_id uuid,
  kind text not null default 'short',
  prompt text not null default '',
  answer_key text not null default '',
  steps jsonb not null default '[]'::jsonb,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, question_id),
  unique (school_id, paper_id, label),
  unique (school_id, paper_id, position) deferrable initially deferred,
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id) on delete cascade,
  foreign key (school_id, unit_id) references syllabus_units(school_id, unit_id) on delete set null (unit_id),
  foreign key (school_id, updated_by) references users(school_id, user_id),
  constraint marking_questions_position check (position between 1 and 200),
  constraint marking_questions_label check (label ~ '^[0-9A-Za-z][0-9A-Za-z().-]{0,11}$'),
  constraint marking_questions_max check (max_marks > 0 and max_marks <= 100 and max_marks * 10 = trunc(max_marks * 10)),
  constraint marking_questions_group check (choice_group is null or choice_group ~ '^[A-Z]{1,2}$'),
  constraint marking_questions_kind check (kind in ('objective', 'short', 'long', 'numerical', 'diagram')),
  constraint marking_questions_prompt check (char_length(prompt) <= 4000),
  constraint marking_questions_key check (char_length(answer_key) <= 8000),
  constraint marking_questions_steps check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 12)
);

create table marking_uploads (
  school_id uuid not null references schools(school_id),
  upload_id uuid not null default gen_random_uuid(),
  paper_id uuid not null,
  mode text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  primary key (school_id, upload_id),
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id),
  foreign key (school_id, created_by) references users(school_id, user_id),
  constraint marking_uploads_mode check (mode in ('per_file', 'combined'))
);

create table marking_sheets (
  school_id uuid not null references schools(school_id),
  sheet_id uuid not null default gen_random_uuid(),
  paper_id uuid not null,
  upload_id uuid not null,
  student_id uuid,
  matched_by text not null default 'none',
  match_note jsonb not null default '{}'::jsonb,
  state text not null default 'waiting',
  flags text[] not null default '{}',
  failure text,
  attempts integer not null default 0,
  ai_provider text,
  ai_model text,
  prompt_version text,
  marked_at timestamptz,
  ai_confidence numeric(3,2),
  strengths text,
  improve text,
  practice jsonb not null default '[]'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, sheet_id),
  unique (school_id, sheet_id, paper_id),
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id),
  foreign key (school_id, upload_id) references marking_uploads(school_id, upload_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, approved_by) references users(school_id, user_id),
  constraint marking_sheets_matched_by check (matched_by in ('seat', 'roll', 'name', 'teacher', 'none')),
  constraint marking_sheets_state check (state in ('waiting', 'marking', 'marked', 'failed', 'approved', 'set_aside')),
  constraint marking_sheets_flags check (flags <@ array['identity', 'two_scripts', 'missing_page', 'unreadable', 'not_all_read', 'unsure', 'changed']::text[]),
  constraint marking_sheets_failure check (failure is null or failure ~ '^[a-z_]{2,40}$'),
  constraint marking_sheets_confidence check (ai_confidence is null or ai_confidence between 0 and 1),
  constraint marking_sheets_strengths check (strengths is null or char_length(strengths) <= 1000),
  constraint marking_sheets_improve check (improve is null or char_length(improve) <= 1000),
  constraint marking_sheets_practice check (jsonb_typeof(practice) = 'array' and jsonb_array_length(practice) <= 8),
  constraint marking_sheets_approved check ((approved_by is null) = (approved_at is null)),
  constraint marking_sheets_approved_state check (state <> 'approved' or (approved_at is not null and student_id is not null)),
  constraint marking_sheets_matched check ((student_id is null) = (matched_by = 'none'))
);
-- One live script per child and paper: two scripts read as one child are both left unmatched for the teacher.
create unique index marking_sheets_one_per_child on marking_sheets (school_id, paper_id, student_id) where student_id is not null and state <> 'set_aside';
create index marking_sheets_paper on marking_sheets (school_id, paper_id, state);

create table marking_pages (
  school_id uuid not null references schools(school_id),
  page_id uuid not null default gen_random_uuid(),
  upload_id uuid not null,
  paper_id uuid not null,
  file_no integer not null,
  page_no integer not null,
  storage_key text not null,
  sha256 text not null,
  bytes integer not null,
  width integer not null,
  height integer not null,
  state text not null default 'new',
  reading jsonb,
  sheet_id uuid,
  sheet_position integer,
  created_at timestamptz not null default now(),
  primary key (school_id, page_id),
  unique (school_id, upload_id, file_no, page_no),
  unique (storage_key),
  foreign key (school_id, upload_id) references marking_uploads(school_id, upload_id),
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id),
  foreign key (school_id, sheet_id) references marking_sheets(school_id, sheet_id) on delete set null (sheet_id),
  constraint marking_pages_file_no check (file_no between 1 and 500),
  constraint marking_pages_page_no check (page_no between 1 and 200),
  constraint marking_pages_key check (storage_key = school_id::text || '/marking/' || paper_id::text || '/' || page_id::text || '.jpg'),
  constraint marking_pages_sha check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint marking_pages_bytes check (bytes between 1 and 3000000),
  constraint marking_pages_size check (width between 200 and 4000 and height between 200 and 4000),
  constraint marking_pages_state check (state in ('new', 'read', 'blank', 'unreadable', 'duplicate', 'failed')),
  constraint marking_pages_sheet check ((sheet_id is null) = (sheet_position is null))
);
create index marking_pages_paper_sha on marking_pages (school_id, paper_id, sha256);
create index marking_pages_sheet on marking_pages (school_id, sheet_id, sheet_position);

create table marking_marks (
  school_id uuid not null references schools(school_id),
  sheet_id uuid not null,
  paper_id uuid not null,
  question_id uuid not null,
  attempted boolean,
  ai_marks numeric(5,1),
  ai_steps jsonb not null default '[]'::jsonb,
  ai_note text,
  ai_reason text,
  error_type text,
  confidence numeric(3,2),
  page_id uuid,
  y_from real,
  y_to real,
  marks numeric(5,1),
  note text,
  changed_by uuid,
  changed_at timestamptz,
  primary key (school_id, sheet_id, question_id),
  foreign key (school_id, sheet_id, paper_id) references marking_sheets(school_id, sheet_id, paper_id) on delete cascade,
  foreign key (school_id, question_id) references marking_questions(school_id, question_id) on delete cascade,
  foreign key (school_id, page_id) references marking_pages(school_id, page_id) on delete set null (page_id),
  foreign key (school_id, changed_by) references users(school_id, user_id),
  constraint marking_marks_ai check (ai_marks is null or (ai_marks >= 0 and ai_marks * 10 = trunc(ai_marks * 10))),
  constraint marking_marks_marks check (marks is null or (marks >= 0 and marks * 10 = trunc(marks * 10))),
  constraint marking_marks_steps check (jsonb_typeof(ai_steps) = 'array' and jsonb_array_length(ai_steps) <= 12),
  constraint marking_marks_note check (ai_note is null or char_length(ai_note) <= 1000),
  constraint marking_marks_reason check (ai_reason is null or char_length(ai_reason) <= 1500),
  constraint marking_marks_teacher_note check (note is null or char_length(note) <= 1000),
  constraint marking_marks_error check (error_type is null or error_type in ('none', 'concept', 'calculation', 'incomplete', 'presentation', 'language', 'misread', 'not_attempted')),
  constraint marking_marks_confidence check (confidence is null or confidence between 0 and 1),
  constraint marking_marks_place check (y_from is null or (y_from between 0 and 1 and y_to between 0 and 1 and y_to >= y_from)),
  constraint marking_marks_changed check ((changed_by is null) = (changed_at is null))
);

-- A paper's questions: their part is one of the paper's components; their unit is of the paper's class and subject; a
-- step gives at most the question's marks; and once a script of the paper is approved, what a total is made of (the
-- part, the marks, the group, the order) is fixed. Who wrote it and when: the person writing, now.
create function public.marking_questions_rules() returns trigger
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
    new.updated_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.marking_questions_rules() from public, anon, authenticated, service_role;
create trigger marking_questions_rules before insert or update or delete on marking_questions for each row execute function public.marking_questions_rules();

-- Scripts: the child is a candidate on the paper's class roll; an approval is a person's, in their own name, now; and
-- approving is done again after any later change.
create function public.marking_sheets_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  job text := coalesce(current_setting('app.current_job', true), '');
begin
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
revoke all on function public.marking_sheets_rules() from public, anon, authenticated, service_role;
create trigger marking_sheets_rules before insert or update on marking_sheets for each row execute function public.marking_sheets_rules();

-- Question marks: never above the question's marks; a teacher's change is in their own name, now.
create function public.marking_marks_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  q record;
begin
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
revoke all on function public.marking_marks_rules() from public, anon, authenticated, service_role;
create trigger marking_marks_rules before insert or update on marking_marks for each row execute function public.marking_marks_rules();

-- Rights: the app's role reads and writes; row level security and the triggers decide what. The platform role holds
-- nothing here.
revoke all on exam_withdrawals, exam_seat_numbers, marking_setups, marking_questions, marking_uploads, marking_sheets, marking_pages, marking_marks
  from public, anon, authenticated, service_role;
grant select, insert, delete on exam_withdrawals to app_user;
grant select on exam_seat_numbers to app_user;
grant select, insert, update, delete on marking_setups, marking_questions, marking_uploads, marking_sheets, marking_pages, marking_marks to app_user;

do $$
declare
  t text;
begin
  for t in select unnest(array['exam_withdrawals', 'exam_seat_numbers', 'marking_setups', 'marking_questions', 'marking_uploads', 'marking_sheets', 'marking_pages', 'marking_marks']) loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I_tenant_isolation on %I using (school_id = (current_setting(''app.current_tenant_id'', true))::uuid)', t, t);
  end loop;
end $$;

-- Withdrawals and numbers: read like the exam (the office every class, a teacher their own classes' children);
-- withdrawals made and taken back by the office in its own name, never for a published class.
create policy exam_withdrawals_readers on exam_withdrawals as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (current_setting('app.current_role', true) = 'teacher'
      and exists (select 1 from students s where s.school_id = exam_withdrawals.school_id and s.student_id = exam_withdrawals.student_id
                    and s.class_id = any (public.teacher_own_class_ids())))
);
create policy exam_withdrawals_by_office on exam_withdrawals as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and withdrawn_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  and exists (select 1 from exams e where e.school_id = exam_withdrawals.school_id and e.exam_id = exam_withdrawals.exam_id and e.status = 'open')
  and exists (select 1 from students s join exam_papers p on p.school_id = s.school_id and p.class_id = s.class_id
               where s.school_id = exam_withdrawals.school_id and s.student_id = exam_withdrawals.student_id and p.exam_id = exam_withdrawals.exam_id
                 and not public.exam_class_published(p.exam_id, p.class_id))
);
create policy exam_withdrawals_undone_by_office on exam_withdrawals as restrictive for delete using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
);
create policy exam_seat_numbers_readers on exam_seat_numbers as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (current_setting('app.current_role', true) = 'teacher'
      and exists (select 1 from students s where s.school_id = exam_seat_numbers.school_id and s.student_id = exam_seat_numbers.student_id
                    and s.class_id = any (public.teacher_own_class_ids())))
  or (current_setting('app.current_role', true) = 'parent' and student_id = any ((select public.guardian_student_ids())::uuid[]))
);

-- The school's own switch (Exams settings, families_see_scripts; on unless the office turned it off): whether its
-- checked scripts reach families at all, held here as well as in the app.
create function public.families_see_scripts(p_school_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(ss.setting_values -> 'families_see_scripts') = 'boolean'
                               then (ss.setting_values ->> 'families_see_scripts')::boolean end
                     from public.school_settings ss where ss.school_id = p_school_id and ss.module_id = 'exams'), true)
$$;
revoke all on function public.families_see_scripts(uuid) from public, anon, authenticated, service_role;
grant execute on function public.families_see_scripts(uuid) to app_user, nca_super;

-- Families: the guardian's own consented children's approved scripts of a publication in force.
create function public.guardian_marking_sheets() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.sheet_id
    from public.marking_sheets s
    join public.exam_papers p on p.school_id = s.school_id and p.paper_id = s.paper_id
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and s.state = 'approved'
     and s.student_id = any ((select public.guardian_student_ids())::uuid[])
     and (p.exam_id, p.class_id) in (select g.exam_id, g.class_id from public.guardian_publications() g)
     and public.families_see_scripts(s.school_id)
$$;
revoke all on function public.guardian_marking_sheets() from public;
grant execute on function public.guardian_marking_sheets() to app_user;

-- Staff read through may_read_marking; a guardian only what guardian_marking_sheets() names; writes by whoever may
-- mark the paper, never a parent.
create policy marking_setups_readers on marking_setups as restrictive for select using (public.may_read_marking(paper_id));
create policy marking_setups_writers on marking_setups as restrictive for insert with check (public.may_mark_paper(paper_id));
create policy marking_setups_changers on marking_setups as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy marking_setups_removers on marking_setups as restrictive for delete using (public.may_mark_paper(paper_id));

create policy marking_questions_readers on marking_questions as restrictive for select using (
  public.may_read_marking(paper_id)
  or paper_id in (select s.paper_id from public.marking_sheets s where s.sheet_id in (select public.guardian_marking_sheets()))
);
create policy marking_questions_writers on marking_questions as restrictive for insert with check (public.may_mark_paper(paper_id));
create policy marking_questions_changers on marking_questions as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy marking_questions_removers on marking_questions as restrictive for delete using (public.may_mark_paper(paper_id));

create policy marking_uploads_readers on marking_uploads as restrictive for select using (public.may_read_marking(paper_id));
create policy marking_uploads_writers on marking_uploads as restrictive for insert with check (
  public.may_mark_paper(paper_id) and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy marking_uploads_changers on marking_uploads as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy marking_uploads_removers on marking_uploads as restrictive for delete using (public.may_mark_paper(paper_id));

create policy marking_sheets_readers on marking_sheets as restrictive for select using (
  public.may_read_marking(paper_id) or sheet_id in (select public.guardian_marking_sheets())
);
create policy marking_sheets_writers on marking_sheets as restrictive for insert with check (public.may_mark_paper(paper_id));
create policy marking_sheets_changers on marking_sheets as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy marking_sheets_removers on marking_sheets as restrictive for delete using (public.may_mark_paper(paper_id));

create policy marking_pages_readers on marking_pages as restrictive for select using (
  public.may_read_marking(paper_id) or sheet_id in (select public.guardian_marking_sheets())
);
create policy marking_pages_writers on marking_pages as restrictive for insert with check (public.may_mark_paper(paper_id));
create policy marking_pages_changers on marking_pages as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy marking_pages_removers on marking_pages as restrictive for delete using (public.may_mark_paper(paper_id));

create policy marking_marks_readers on marking_marks as restrictive for select using (
  public.may_read_marking(paper_id) or sheet_id in (select public.guardian_marking_sheets())
);
create policy marking_marks_writers on marking_marks as restrictive for insert with check (public.may_mark_paper(paper_id));
create policy marking_marks_changers on marking_marks as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy marking_marks_removers on marking_marks as restrictive for delete using (public.may_mark_paper(paper_id));

-- AI never writes a mark: a mark is added, changed or cleared only outside a job's session (C347).
create policy marks_by_a_person_insert on marks as restrictive for insert
  with check (coalesce(current_setting('app.current_job', true), '') = '');
create policy marks_by_a_person_update on marks as restrictive for update
  using (coalesce(current_setting('app.current_job', true), '') = '')
  with check (coalesce(current_setting('app.current_job', true), '') = '');
create policy marks_by_a_person_delete on marks as restrictive for delete
  using (coalesce(current_setting('app.current_job', true), '') = '');

-- The audit rows of marking follow the exams' rule: the three roles that run exams, or the person who acted.
alter policy audit_exam_rows_office_or_actor on audit_log
  using (
    split_part(event_action, '.', 1) not in ('exam', 'exam_paper', 'marking')
    or current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );

-- A school session queues its own marking jobs (the jobs read, group and mark in the school's own session).
alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify', 'whatsapp.send', 'ptm.remind', 'event.remind', 'complaint.escalate',
               'marking.read', 'marking.group', 'marking.mark')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );

-- ---- 3. The private report link (C351) ---------------------------------------------------------------------------------

-- One link per child and publication: a long random value, kept only as its SHA-256; it opens the child's approved
-- scripts of that publication while the publication is in force, for 30 days.
create table marking_report_links (
  school_id uuid not null references schools(school_id),
  key_hash text not null,
  exam_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  publication_version integer not null,
  made_by uuid not null,
  made_at timestamptz not null default now(),
  primary key (key_hash),
  unique (school_id, exam_id, class_id, student_id, publication_version),
  foreign key (school_id, exam_id) references exams(school_id, exam_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, made_by) references users(school_id, user_id),
  constraint marking_report_links_hash check (key_hash ~ '^[0-9a-f]{64}$')
);
revoke all on marking_report_links from public, anon, authenticated, service_role;
grant select, insert on marking_report_links to app_user;
alter table marking_report_links enable row level security;
alter table marking_report_links force row level security;
create policy marking_report_links_tenant_isolation on marking_report_links using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy marking_report_links_office on marking_report_links as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
);
create policy marking_report_links_made_by_office on marking_report_links as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and made_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);

-- What a link opens: the school, the child's name and class, the exam, the grading scheme kept with the publication,
-- and each paper of the publication in force with the child's published marks; with, when the school lets families
-- see scripts, the approved script of each paper (its parts and internal choice for the totals, and the teacher's
-- words). Read by the platform role only, for the public page; marking_report_marks and marking_report_pages give
-- the same scripts' question marks and page pictures, and nothing else.
create function public.marking_report(p_key_hash text)
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
                              and public.families_see_scripts(l.school_id)
    left join marking_setups ms on ms.school_id = l.school_id and ms.paper_id = p.paper_id
   where p_key_hash ~ '^[0-9a-f]{64}$' and l.key_hash = p_key_hash and l.made_at > now() - interval '30 days'
$$;
revoke all on function public.marking_report(text) from public, anon, authenticated, service_role;
grant execute on function public.marking_report(text) to nca_super;

create function public.marking_report_marks(p_key_hash text)
returns table (sheet_id uuid, question_id uuid, q_position integer, label text, component text, max_marks numeric, choice_group text, prompt text,
               chapter text, topic text, attempted boolean, marks numeric, note text, error_type text, page_id uuid, y_from real, y_to real)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.sheet_id, q.question_id, q.position, q.label, q.component, q.max_marks, q.choice_group, q.prompt, u.chapter, u.topic,
         m.attempted, coalesce(m.marks, m.ai_marks), coalesce(m.note, m.ai_note), m.error_type, m.page_id, m.y_from, m.y_to
    from public.marking_report(p_key_hash) r
    join marking_marks m on m.school_id = r.school_id and m.sheet_id = r.sheet_id and r.sheet_id is not null
    join marking_questions q on q.school_id = m.school_id and q.question_id = m.question_id
    left join syllabus_units u on u.school_id = q.school_id and u.unit_id = q.unit_id
$$;
revoke all on function public.marking_report_marks(text) from public, anon, authenticated, service_role;
grant execute on function public.marking_report_marks(text) to nca_super;

create function public.marking_report_pages(p_key_hash text)
returns table (sheet_id uuid, page_id uuid, storage_key text, sheet_position integer, width integer, height integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select g.sheet_id, g.page_id, g.storage_key, g.sheet_position, g.width, g.height
    from public.marking_report(p_key_hash) r
    join marking_pages g on g.school_id = r.school_id and g.sheet_id = r.sheet_id
$$;
revoke all on function public.marking_report_pages(text) from public, anon, authenticated, service_role;
grant execute on function public.marking_report_pages(text) to nca_super;

-- ---- 4. The AI tasks (C349) ----------------------------------------------------------------------------------------------

insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words, enabled, max_output_tokens) values
  ('exams.read_pages', null, null, true, false, 2000),
  ('exams.mark', null, null, true, false, 12000)
on conflict (profile_id) do nothing;

alter policy ai_profiles_staff_read on control.ai_profiles
  using (profile_id in ('copilot.draft', 'parent_ai.home_help', 'exams.read_pages', 'exams.mark'));
alter policy ai_profiles_staff_only on control.ai_profiles
  using (profile_id in ('copilot.draft', 'parent_ai.home_help', 'exams.read_pages', 'exams.mark')) with check (false);
