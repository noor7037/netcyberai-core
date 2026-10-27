-- AQ-3 (docs/36 §1.2, C364): bubble (OMR) sheets, read in the teacher's browser by rules.
--
-- 1. bubble_sheets: the sheets printed for a paper sat with a bubble sheet (exam_papers.sitting 'bubble'): one per
--    candidate, numbered by the database in roll order (issue_bubble_sheets, as issue_exam_seat_numbers numbers an
--    exam), and blank sheets for a late joiner, who shades the roll number. A number is never reused or changed. Each
--    sheet keeps the fingerprint of the answer grid it was printed with (src/lib/bubbles/layout.ts): once the questions
--    change, printing again gives the child a new number and the old sheet is marked replaced, so a sheet printed for
--    other questions is never read against these. While a sheet is printed, how the paper is sat stays 'bubble'.
-- 2. bubble_reads: one row per read sheet page: what the teacher's browser read on it (the sheet number, the roll
--    number shaded, the options filled per question, the questions with an unclear bubble or two marks, how sure, and
--    the answer grid it was read against), and
--    the child the server resolved or a person chose. What was read never changes. On a paper of only choice questions
--    the read makes the child's script (marking_sheets.source 'bubble'); on a mixed paper it fills the child's
--    answer-book script's choice questions by rules (src/lib/bubbles/apply.ts). One live read per child and paper.
-- 3. A person who changes whose an answer-book script is takes the bubble marks off it with the old child: one child's
--    bubbles never stay on another child's script.
--
-- Who reads and writes follows exam_papers, as every marking table does (am_1_answer_marking): may_read_marking and
-- may_mark_paper; never a parent; the platform role holds nothing. No delete: a number is never reused, and a read
-- stays as the record of what the sheet showed (its picture goes with the paper's pictures, C230-AJ). Nothing here is a
-- mark: a person's approval writes marks (saveMarks).

-- ---- 1. The printed sheets ---------------------------------------------------------------------------------------------

create table bubble_sheets (
  school_id uuid not null references schools(school_id),
  paper_id uuid not null,
  sheet_no integer not null,
  student_id uuid,
  layout text not null,
  printed_by uuid not null,
  printed_at timestamptz not null default now(),
  replaced_at timestamptz,
  primary key (school_id, paper_id, sheet_no),
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id) on delete cascade,
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, printed_by) references users(school_id, user_id),
  constraint bubble_sheets_no check (sheet_no between 1 and 9999),
  constraint bubble_sheets_layout check (layout ~ '^v[0-9]{1,3}-[0-9]{1,3}-[0-9a-f]{8}$')
);
-- One sheet in use per child and paper.
create unique index bubble_sheets_one_per_child on bubble_sheets (school_id, paper_id, student_id) where student_id is not null and replaced_at is null;

-- A sheet is printed for a candidate of a paper sat with a bubble sheet, by a person, in their own name; afterwards only
-- its being replaced is recorded, once.
create function public.bubble_sheets_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  job text := coalesce(current_setting('app.current_job', true), '');
begin
  if tg_op = 'UPDATE' then
    if (new.school_id, new.paper_id, new.sheet_no, new.student_id, new.layout, new.printed_by, new.printed_at)
       is distinct from (old.school_id, old.paper_id, old.sheet_no, old.student_id, old.layout, old.printed_by, old.printed_at)
       or old.replaced_at is not null or new.replaced_at is null then
      raise exception 'a printed bubble sheet stays as printed; only its being replaced is recorded' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if job <> '' or me is null or me = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'bubble sheets are printed by a person' using errcode = '42501';
  end if;
  if not exists (select 1 from exam_papers p where p.school_id = new.school_id and p.paper_id = new.paper_id and p.sitting = 'bubble') then
    raise exception 'bubble sheets are printed for a paper sat with a bubble sheet' using errcode = 'check_violation';
  end if;
  if new.student_id is not null and not exists (
      select 1 from students s join exam_papers p on p.school_id = s.school_id and p.class_id = s.class_id
       where s.school_id = new.school_id and s.student_id = new.student_id and p.paper_id = new.paper_id
         and s.status in ('active', 'pending_consent')) then
    raise exception 'a bubble sheet is a child''s on its paper''s class roll' using errcode = 'check_violation';
  end if;
  if current_user in ('app_user', 'nca_super') then
    new.printed_by := me;
    new.printed_at := now();
  end if;
  new.replaced_at := null;
  return new;
end $$;
revoke all on function public.bubble_sheets_rules() from public, anon, authenticated, service_role;
create trigger bubble_sheets_rules before insert or update on bubble_sheets for each row execute function public.bubble_sheets_rules();

-- Prints a paper's sheets: every candidate without a sheet for these questions gets the next number, in roll order (P6's
-- ROLL_ORDER, src/lib/exams/papers.ts); a child whose sheet was printed for other questions gets a new one (the old is
-- marked replaced, blank sheets too); then `p_blanks` blank sheets. Answers the candidates' sheets in roll order, then
-- the blank sheets printed now. The paper is locked for the call, so two printings never take one number. Invoker's
-- rights: the person's own row rules decide (whoever may mark the paper).
create function public.issue_bubble_sheets(p_paper_id uuid, p_layout text, p_blanks integer)
returns table (sheet_no integer, student_id uuid)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  v_exam uuid;
  v_class uuid;
  v_last integer;
  v_issued integer;
begin
  if p_blanks is null or p_blanks < 0 or p_blanks > 200 then
    raise exception 'from 0 to 200 blank sheets at a time' using errcode = 'check_violation';
  end if;
  if p_layout is null or p_layout !~ '^v[0-9]{1,3}-[0-9]{1,3}-[0-9a-f]{8}$' then
    raise exception 'a bubble sheet names the answer grid it is printed with' using errcode = 'check_violation';
  end if;
  select p.exam_id, p.class_id into v_exam, v_class from exam_papers p where p.school_id = v_school and p.paper_id = p_paper_id and p.sitting = 'bubble';
  if not found then
    raise exception 'bubble sheets are printed for a paper sat with a bubble sheet' using errcode = 'check_violation';
  end if;
  if not public.may_mark_paper(p_paper_id) then
    raise exception 'bubble sheets are printed by whoever may mark the paper' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('bubble-sheets:' || p_paper_id::text));
  update bubble_sheets b set replaced_at = now()
   where b.school_id = v_school and b.paper_id = p_paper_id and b.replaced_at is null and b.layout <> p_layout;
  select coalesce(max(b.sheet_no), 0) into v_last from bubble_sheets b where b.school_id = v_school and b.paper_id = p_paper_id;
  insert into bubble_sheets (school_id, paper_id, sheet_no, student_id, layout)
  select v_school, p_paper_id, v_last + t.n, t.student_id, p_layout
    from (
      select s.student_id,
             row_number() over (order by case when s.roll_no ~ '^[0-9]{1,9}$' then s.roll_no::int end nulls last, s.roll_no nulls last, s.name, s.student_id) as n
        from students s
       where s.school_id = v_school and s.class_id = v_class and s.status in ('active', 'pending_consent')
         and not exists (select 1 from exam_withdrawals w where w.school_id = v_school and w.exam_id = v_exam and w.student_id = s.student_id)
         and not exists (select 1 from bubble_sheets b where b.school_id = v_school and b.paper_id = p_paper_id and b.student_id = s.student_id and b.replaced_at is null)
    ) t
   where v_last + t.n <= 9999;
  get diagnostics v_issued = row_count;
  if v_last + v_issued + p_blanks > 9999 then
    raise exception 'a paper has at most 9999 bubble sheets' using errcode = 'check_violation';
  end if;
  insert into bubble_sheets (school_id, paper_id, sheet_no, student_id, layout)
  select v_school, p_paper_id, v_last + v_issued + g, null, p_layout from generate_series(1, p_blanks) g;
  return query
    select b.sheet_no, b.student_id
      from bubble_sheets b join students s on s.school_id = b.school_id and s.student_id = b.student_id
     where b.school_id = v_school and b.paper_id = p_paper_id and b.replaced_at is null
       and s.class_id = v_class and s.status in ('active', 'pending_consent')
       and not exists (select 1 from exam_withdrawals w where w.school_id = v_school and w.exam_id = v_exam and w.student_id = s.student_id)
     order by case when s.roll_no ~ '^[0-9]{1,9}$' then s.roll_no::int end nulls last, s.roll_no nulls last, s.name, s.student_id;
  return query
    select b.sheet_no, b.student_id from bubble_sheets b
     where b.school_id = v_school and b.paper_id = p_paper_id and b.student_id is null and b.sheet_no > v_last + v_issued
     order by b.sheet_no;
end $$;
revoke all on function public.issue_bubble_sheets(uuid, text, integer) from public, anon, authenticated, service_role, nca_super;
grant execute on function public.issue_bubble_sheets(uuid, text, integer) to app_user;

-- While a sheet of the paper is printed (and not replaced), the paper stays sat with a bubble sheet.
create function public.exam_papers_bubble_sitting() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.sitting = 'bubble' and new.sitting is distinct from old.sitting
     and exists (select 1 from bubble_sheets b where b.school_id = old.school_id and b.paper_id = old.paper_id and b.replaced_at is null) then
    raise exception 'a paper whose bubble sheets are printed stays sat with a bubble sheet' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.exam_papers_bubble_sitting() from public, anon, authenticated, service_role;
create trigger exam_papers_bubble_sitting before update of sitting on exam_papers for each row execute function public.exam_papers_bubble_sitting();

-- ---- 2. What was read on each sheet --------------------------------------------------------------------------------------

create table bubble_reads (
  school_id uuid not null references schools(school_id),
  read_id uuid not null default gen_random_uuid(),
  paper_id uuid not null,
  page_id uuid not null,
  layout text not null,
  sheet_no integer,
  roll_no text,
  student_id uuid,
  matched_by text not null default 'none',
  sheet_id uuid,
  answers jsonb not null default '{}'::jsonb,
  unclear text[] not null default '{}',
  multiple text[] not null default '{}',
  confidence numeric(3,2) not null,
  state text not null default 'live',
  read_by uuid not null,
  read_at timestamptz not null default now(),
  primary key (school_id, read_id),
  unique (school_id, page_id),
  foreign key (school_id, paper_id) references exam_papers(school_id, paper_id),
  foreign key (school_id, page_id) references marking_pages(school_id, page_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, sheet_id) references marking_sheets(school_id, sheet_id) on delete set null (sheet_id),
  foreign key (school_id, read_by) references users(school_id, user_id),
  constraint bubble_reads_layout check (layout ~ '^v[0-9]{1,3}-[0-9]{1,3}-[0-9a-f]{8}$'),
  constraint bubble_reads_sheet_no check (sheet_no is null or sheet_no between 1 and 9999),
  constraint bubble_reads_roll check (roll_no is null or roll_no ~ '^[0-9]{1,4}$'),
  constraint bubble_reads_matched_by check (matched_by in ('bubble', 'roll', 'teacher', 'none')),
  constraint bubble_reads_matched check ((student_id is null) = (matched_by = 'none')),
  constraint bubble_reads_answers check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 8000),
  constraint bubble_reads_lists check (cardinality(unclear) <= 100 and cardinality(multiple) <= 100),
  constraint bubble_reads_confidence check (confidence between 0 and 1),
  constraint bubble_reads_state check (state in ('live', 'set_aside')),
  constraint bubble_reads_aside check (state = 'live' or (student_id is null and sheet_id is null))
);
-- One live read per child and paper: a second read of one child waits, unmatched, for a person.
create unique index bubble_reads_one_per_child on bubble_reads (school_id, paper_id, student_id) where student_id is not null and state = 'live';
create index bubble_reads_paper on bubble_reads (school_id, paper_id, state);
create index bubble_reads_sheet on bubble_reads (school_id, sheet_id) where sheet_id is not null;

-- A read is a page of a bubble upload of its own paper, recorded by a person in their own name; what was read never
-- changes; whose it is and whether it is set aside are a person's to change; the script it fills is of its paper.
create function public.bubble_reads_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  job text := coalesce(current_setting('app.current_job', true), '');
begin
  if tg_op = 'INSERT' then
    if job <> '' or me is null or me = '00000000-0000-0000-0000-000000000000'::uuid then
      raise exception 'a bubble sheet is read by a person' using errcode = '42501';
    end if;
    if not exists (select 1 from marking_pages g join marking_uploads u on u.school_id = g.school_id and u.upload_id = g.upload_id
                    where g.school_id = new.school_id and g.page_id = new.page_id and g.paper_id = new.paper_id and u.kind = 'bubble') then
      raise exception 'a bubble read is of a page of a bubble upload of its paper' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from exam_papers p where p.school_id = new.school_id and p.paper_id = new.paper_id and p.sitting = 'bubble') then
      raise exception 'bubble sheets are read for a paper sat with a bubble sheet' using errcode = 'check_violation';
    end if;
    if current_user in ('app_user', 'nca_super') then
      new.read_by := me;
      new.read_at := now();
    end if;
  else
    if (new.read_id, new.school_id, new.paper_id, new.page_id, new.layout, new.sheet_no, new.roll_no, new.answers, new.unclear, new.multiple, new.confidence, new.read_by, new.read_at)
       is distinct from (old.read_id, old.school_id, old.paper_id, old.page_id, old.layout, old.sheet_no, old.roll_no, old.answers, old.unclear, old.multiple, old.confidence, old.read_by, old.read_at) then
      raise exception 'what was read on a bubble sheet never changes' using errcode = 'check_violation';
    end if;
    if (new.student_id, new.matched_by, new.state) is distinct from (old.student_id, old.matched_by, old.state) and job <> '' then
      raise exception 'whose a bubble sheet is is a person''s to say' using errcode = '42501';
    end if;
  end if;
  if new.student_id is not null and (tg_op = 'INSERT' or new.student_id is distinct from old.student_id) and not exists (
      select 1 from students s join exam_papers p on p.school_id = s.school_id and p.class_id = s.class_id
       where s.school_id = new.school_id and s.student_id = new.student_id and p.paper_id = new.paper_id
         and s.status in ('active', 'pending_consent')) then
    raise exception 'a bubble sheet is a child''s on its paper''s class roll' using errcode = 'check_violation';
  end if;
  if new.sheet_id is not null and (tg_op = 'INSERT' or new.sheet_id is distinct from old.sheet_id) and not exists (
      select 1 from marking_sheets s where s.school_id = new.school_id and s.sheet_id = new.sheet_id and s.paper_id = new.paper_id) then
    raise exception 'a bubble read fills a script of its own paper' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.bubble_reads_rules() from public, anon, authenticated, service_role;
create trigger bubble_reads_rules before insert or update on bubble_reads for each row execute function public.bubble_reads_rules();

-- ---- 3. An answer-book script given to another child ---------------------------------------------------------------------

-- The bubble marks a script carried were read from its old child's sheet: they go with that child (the read waits for
-- the child's own script), and the script waits for its new child's sheet ('not_all_read'). A bubble paper's own script
-- (source 'bubble') is the sheet itself, so choosing its child changes nothing here.
create function public.marking_sheets_bubble_child() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.student_id is distinct from old.student_id and new.source = 'scan'
     and exists (select 1 from bubble_reads r where r.school_id = old.school_id and r.sheet_id = old.sheet_id) then
    update marking_marks m set attempted = null, ai_marks = null, confidence = null, error_type = null, page_id = null, y_from = null, y_to = null
     where m.school_id = old.school_id and m.sheet_id = old.sheet_id
       and m.question_id in (select q.question_id from marking_questions q
                              where q.school_id = old.school_id and q.paper_id = old.paper_id and q.kind = 'objective' and jsonb_array_length(q.options) >= 2);
    update bubble_reads r set sheet_id = null where r.school_id = old.school_id and r.sheet_id = old.sheet_id;
    if not ('not_all_read' = any (new.flags)) then
      new.flags := array_append(new.flags, 'not_all_read');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.marking_sheets_bubble_child() from public, anon, authenticated, service_role;
create trigger marking_sheets_bubble_child before update of student_id on marking_sheets for each row execute function public.marking_sheets_bubble_child();

-- ---- Rights and row rules ---------------------------------------------------------------------------------------------------

revoke all on bubble_sheets, bubble_reads from public, anon, authenticated, service_role, nca_super;
grant select, insert, update on bubble_sheets, bubble_reads to app_user;

do $$
declare
  t text;
begin
  for t in select unnest(array['bubble_sheets', 'bubble_reads']) loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I_tenant_isolation on %I using (school_id = (current_setting(''app.current_tenant_id'', true))::uuid)', t, t);
  end loop;
end $$;

create policy bubble_sheets_readers on bubble_sheets as restrictive for select using (public.may_read_marking(paper_id));
create policy bubble_sheets_writers on bubble_sheets as restrictive for insert with check (
  public.may_mark_paper(paper_id) and printed_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy bubble_sheets_changers on bubble_sheets as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy bubble_sheets_no_parent on bubble_sheets as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

create policy bubble_reads_readers on bubble_reads as restrictive for select using (public.may_read_marking(paper_id));
create policy bubble_reads_writers on bubble_reads as restrictive for insert with check (
  public.may_mark_paper(paper_id) and read_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy bubble_reads_changers on bubble_reads as restrictive for update using (public.may_mark_paper(paper_id)) with check (public.may_mark_paper(paper_id));
create policy bubble_reads_no_parent on bubble_reads as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
