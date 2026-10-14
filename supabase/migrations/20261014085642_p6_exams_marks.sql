-- P6 slice 9b (C214): exams and marks entry (docs/27 sections 3 and 5, row 9b).
--
-- 1. exams gains a status ('open' while marks are entered; 'published' is
--    left for the report-card slice, C215), the term it counts for (a name
--    from the grading scheme's terms, or none), who made it and when. An
--    exam's session is its own school's (a composite key). No two exams of a
--    session have the same name.
-- 2. exam_papers: one paper of an exam for one class and one subject, with
--    its date, the chapters it assesses (unit ids from syllabus_units of that
--    class and subject), its components with their maxima (and their share
--    of the subject, copied from the grading scheme when the scheme has
--    components), who made it, and who finished entering its marks and when.
--    A paper's exam, class and subject never change; its components and
--    maxima are fixed once a mark is entered.
-- 3. marks: one row a paper, component and child (a unique index): a score,
--    or "absent", or "exempt". Absent and exempt are not marks: they carry no
--    score. The trigger holds 0 <= score <= that component's maximum, to one
--    decimal place, fills in the paper's exam, subject and maximum, keeps who
--    entered it and when, and refuses a mark of an exam that is not open. A
--    mark's paper, component and child never change.
--    BACKFILL: the marks already recorded (the test database holds 1 exam
--    and 414) become papers with a single component, "Marks", whose maximum
--    is the largest maximum recorded for that exam, class and subject; each
--    mark keeps its own score and maximum. Nothing is dropped. The migration
--    stops, changing nothing, if a recorded mark could not be placed that way
--    (a second mark for the same exam, child and subject; a child in no
--    class; a maximum or a score that breaks the rules above): a person
--    decides those first.
--
-- Who reads and writes (docs/27 section 3 rule 6):
--   the principal, the school admin and the academic coordinator read every
--     exam, paper and mark of the school, make and change exams and papers,
--     and enter any mark;
--   a teacher reads the exams, papers and marks of their own classes
--     (teacher_own_class_ids()), and enters marks only for a paper of a class
--     and subject they teach (teacher_subjects) or of the class they are
--     class teacher of (may_enter_marks()); a teacher changes nothing about a
--     paper except recording that its marks are entered;
--   an accountant reads nothing (rule 5: fees are never a learning signal);
--   the existing parent scope on marks stays (parent_scope_marks): a parent
--     account reads only its own children's marks;
--   the platform role holds no right on these tables.
--   Every write is in the writer's own name. The audit rows of exams
--   ('exam.%', 'exam_paper.%') follow the same three roles, or the person
--   who acted.
-- Read by src/lib/exams/** (the exams screen, marks entry, the class result)
-- and My Day's "marks to enter" card.

-- 1. Exams.
alter table exams
  add column status text not null default 'open',
  add column term text,
  add column created_by uuid,
  add column created_at timestamptz not null default now(),
  add constraint exams_status check (status in ('open', 'published')),
  add constraint exams_term check (term is null or char_length(btrim(term)) between 1 and 60),
  add constraint exams_created_by_fkey foreign key (school_id, created_by) references users(school_id, user_id),
  add constraint exams_school_session_fkey foreign key (school_id, session_id) references academic_sessions(school_id, session_id);
-- A name a person can read. NOT VALID: checked for every exam made or renamed from now on; the exam already
-- recorded is kept as it is.
alter table exams add constraint exams_name_length check (char_length(btrim(name)) between 1 and 120) not valid;
create unique index uq_exams_name_per_session on exams (school_id, coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

create function public.exams_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null and current_user in ('app_user', 'nca_super') then
      raise exception 'an exam says who made it' using errcode = 'check_violation';
    end if;
    new.created_at := now();
    return new;
  end if;
  if (new.exam_id, new.school_id, new.created_by, new.created_at) is distinct from (old.exam_id, old.school_id, old.created_by, old.created_at) then
    raise exception 'who made an exam, and when, never changes' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.exams_rules() from public, anon, authenticated, service_role;
create trigger exams_rules before insert or update on exams for each row execute function public.exams_rules();

-- 2. Papers.
-- The rules of a paper's components. Null when they keep them, or the first rule they break.
create function public.exam_paper_components_problem(components jsonb) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when jsonb_typeof(components) is distinct from 'array' then 'the components are a list'
    when jsonb_array_length(components) not between 1 and 12 then 'a paper has 1 to 12 components'
    when exists (select 1 from jsonb_array_elements(components) c
                  where case when jsonb_typeof(c) <> 'object' then true
                             when jsonb_typeof(c -> 'key') is distinct from 'string' or (c ->> 'key') !~ '^[a-z0-9][a-z0-9-]{0,39}$' then true
                             when jsonb_typeof(c -> 'name') is distinct from 'string' or char_length(btrim(c ->> 'name')) not between 1 and 60 then true
                             when jsonb_typeof(c -> 'max') is distinct from 'number' then true
                             when (c ->> 'max')::numeric <= 0 or (c ->> 'max')::numeric > 1000 or (c ->> 'max')::numeric <> round((c ->> 'max')::numeric, 1) then true
                             when coalesce(jsonb_typeof(c -> 'share'), 'null') not in ('null', 'number') then true
                             when jsonb_typeof(c -> 'share') = 'number' and ((c ->> 'share')::numeric <= 0 or (c ->> 'share')::numeric > 100) then true
                             else false end)
      then 'every component has a key, a name of 1 to 60 characters, a maximum above 0 and up to 1000 to one decimal place, and a share above 0 and up to 100, or none'
    when exists (select 1 from jsonb_array_elements(components) c group by c ->> 'key' having count(*) > 1) then 'two components have the same key'
  end
$$;
revoke all on function public.exam_paper_components_problem(jsonb) from public, anon, authenticated, service_role;
-- Called from the trigger below, as the role that writes.
grant execute on function public.exam_paper_components_problem(jsonb) to app_user;

create table exam_papers (
  paper_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  paper_date date,
  unit_ids uuid[] not null default '{}',
  components jsonb not null,
  entered_by uuid,
  entered_at timestamptz,
  created_by uuid, -- null only on the papers this migration backfills
  created_at timestamptz not null default now(),
  unique (school_id, paper_id),
  -- One paper of an exam for a class and a subject.
  unique (school_id, exam_id, class_id, subject_id),
  foreign key (school_id, exam_id) references exams(school_id, exam_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, subject_id) references subjects(school_id, subject_id),
  foreign key (school_id, entered_by) references users(school_id, user_id),
  foreign key (school_id, created_by) references users(school_id, user_id),
  constraint exam_papers_entered check ((entered_by is null) = (entered_at is null)),
  constraint exam_papers_units check (cardinality(unit_ids) <= 60)
);
create index idx_exam_papers_class on exam_papers (school_id, class_id);

create function public.exam_papers_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  problem text;
  units_changed boolean;
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
begin
  problem := exam_paper_components_problem(new.components);
  if problem is not null then
    raise exception 'exam paper: %', problem using errcode = 'check_violation';
  end if;
  units_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    units_changed := new.unit_ids is distinct from old.unit_ids;
  end if;
  if units_changed then
    if (select count(distinct u) from unnest(new.unit_ids) u) <> cardinality(new.unit_ids) then
      raise exception 'a chapter is listed once on a paper' using errcode = 'check_violation';
    end if;
    -- Read as the person writing, who reads the syllabus map of the paper's class.
    if exists (select 1 from unnest(new.unit_ids) u
                where not exists (select 1 from syllabus_units su
                                   where su.school_id = new.school_id and su.unit_id = u and su.class_id = new.class_id and su.subject_id = new.subject_id)) then
      raise exception 'a paper''s chapters are units of the syllabus map of its class and subject' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.created_by is null and current_user in ('app_user', 'nca_super') then
      raise exception 'a paper says who made it' using errcode = 'check_violation';
    end if;
    new.entered_by := null;
    new.entered_at := null;
    new.created_at := now();
    return new;
  end if;
  if (new.paper_id, new.school_id, new.exam_id, new.class_id, new.subject_id, new.created_by, new.created_at)
     is distinct from (old.paper_id, old.school_id, old.exam_id, old.class_id, old.subject_id, old.created_by, old.created_at) then
    raise exception 'a paper''s exam, class and subject, and who made it, never change' using errcode = 'check_violation';
  end if;
  if new.components is distinct from old.components and exists (select 1 from marks m where m.school_id = old.school_id and m.paper_id = old.paper_id) then
    raise exception 'a paper''s components and maxima are fixed once a mark is entered' using errcode = 'check_violation';
  end if;
  -- A teacher records only that the marks are entered: never the date, the chapters or the maxima.
  if coalesce(current_setting('app.current_role', true), '') = 'teacher'
     and (new.paper_date, new.unit_ids, new.components) is distinct from (old.paper_date, old.unit_ids, old.components) then
    raise exception 'a teacher records only that a paper''s marks are entered' using errcode = 'insufficient_privilege';
  end if;
  if new.entered_by is distinct from old.entered_by then
    if new.entered_by is not null and current_user in ('app_user', 'nca_super') and new.entered_by is distinct from me then
      raise exception 'a paper is recorded as entered in one''s own name' using errcode = 'check_violation';
    end if;
    -- Entered means every child on the roll has a mark, absent or exempt for every component (exam_paper_progress,
    -- below: counted over the whole roll).
    if new.entered_by is not null and current_user in ('app_user', 'nca_super')
       and exists (select 1 from exam_paper_progress(new.paper_id) g where g.roll = 0 or g.entered < g.roll) then
      raise exception 'a paper is recorded as entered only when every child on its roll has a mark, absent or exempt' using errcode = 'check_violation';
    end if;
    new.entered_at := case when new.entered_by is null then null else now() end;
  else
    -- When it was entered is written by this trigger only.
    new.entered_at := old.entered_at;
  end if;
  return new;
end $$;
revoke all on function public.exam_papers_rules() from public, anon, authenticated, service_role;
create trigger exam_papers_rules before insert or update on exam_papers for each row execute function public.exam_papers_rules();

-- 3. Marks.
alter table marks
  add column paper_id uuid,
  add column component text,
  add column kind text not null default 'score',
  add column entered_by uuid,
  add column updated_at timestamptz not null default now(),
  alter column score drop not null;

-- The backfill, checked first: it stops, changing nothing, rather than guess.
do $$
declare
  twice integer;
  classless integer;
  bad_max integer;
  outside integer;
begin
  select count(*) into twice from (select 1 from marks group by school_id, exam_id, student_id, subject_id having count(*) > 1) d;
  select count(*) into classless from marks m join students s on s.school_id = m.school_id and s.student_id = m.student_id where s.class_id is null;
  select count(*) into bad_max from marks where not (max_score > 0 and max_score <= 1000 and max_score = round(max_score, 1));
  select count(*) into outside from marks where score < 0 or score > max_score;
  if twice + classless + bad_max + outside > 0 then
    raise exception 'P6 9b: the recorded marks were not moved into papers, and nothing was changed. % are a second mark for the same exam, child and subject; % are of a child in no class; % have a maximum that is not above 0 and up to 1000 to one decimal place; % lie outside 0 to their maximum. A person decides each before this migration runs.', twice, classless, bad_max, outside;
  end if;
end $$;

insert into exam_papers (school_id, exam_id, class_id, subject_id, components)
select m.school_id, m.exam_id, s.class_id, m.subject_id,
       jsonb_build_array(jsonb_build_object('key', 'marks', 'name', 'Marks', 'max', max(m.max_score), 'share', null))
  from marks m join students s on s.school_id = m.school_id and s.student_id = m.student_id
 group by m.school_id, m.exam_id, s.class_id, m.subject_id;

update marks m set paper_id = p.paper_id, component = 'marks', updated_at = m.created_at
  from students s, exam_papers p
 where s.school_id = m.school_id and s.student_id = m.student_id
   and p.school_id = m.school_id and p.exam_id = m.exam_id and p.class_id = s.class_id and p.subject_id = m.subject_id;

alter table marks
  alter column paper_id set not null,
  alter column component set not null,
  add constraint marks_school_paper_fkey foreign key (school_id, paper_id) references exam_papers(school_id, paper_id),
  add constraint marks_entered_by_fkey foreign key (school_id, entered_by) references users(school_id, user_id),
  add constraint marks_kind check (kind in ('score', 'absent', 'exempt')),
  -- Absent and exempt are not marks: no score. A score is a mark.
  add constraint marks_score_only_when_scored check ((kind = 'score') = (score is not null)),
  add constraint marks_component_key check (component ~ '^[a-z0-9][a-z0-9-]{0,39}$');
-- One mark a paper, component and child.
create unique index uq_marks_paper_component_child on marks (school_id, paper_id, component, student_id);

create function public.marks_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  paper record;
  part jsonb;
  top numeric;
  v_school uuid;
  v_paper uuid;
begin
  if tg_op = 'DELETE' then
    v_school := old.school_id;
    v_paper := old.paper_id;
  else
    v_school := new.school_id;
    v_paper := new.paper_id;
  end if;
  if tg_op = 'UPDATE' then
    if (new.mark_id, new.school_id, new.paper_id, new.component, new.student_id) is distinct from (old.mark_id, old.school_id, old.paper_id, old.component, old.student_id) then
      raise exception 'a mark''s paper, component and child never change: clear it and enter another' using errcode = 'check_violation';
    end if;
  end if;
  -- Read as the person writing: a paper they cannot read is no paper of theirs.
  select p.exam_id, p.subject_id, p.class_id, p.components, e.status into paper
    from exam_papers p join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
   where p.school_id = v_school and p.paper_id = v_paper;
  if not found then
    raise exception 'a mark belongs to a paper of an exam' using errcode = 'foreign_key_violation';
  end if;
  if paper.status <> 'open' then
    raise exception 'the marks of this exam are no longer open for entry' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  select c into part from jsonb_array_elements(paper.components) c where c ->> 'key' = new.component;
  if part is null then
    raise exception 'a mark is for one of its paper''s components' using errcode = 'check_violation';
  end if;
  top := (part ->> 'max')::numeric;
  new.exam_id := paper.exam_id;
  new.subject_id := paper.subject_id;
  new.max_score := top;
  if new.kind = 'score' then
    if new.score is null or new.score < 0 or new.score > top then
      raise exception 'a mark lies between 0 and its component''s maximum of %', top using errcode = 'check_violation';
    end if;
    if new.score <> round(new.score, 1) then
      raise exception 'a mark has at most one decimal place' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from students s where s.school_id = new.school_id and s.student_id = new.student_id and s.class_id = paper.class_id) then
      raise exception 'a mark is for a child of its paper''s class' using errcode = 'check_violation';
    end if;
  end if;
  -- Who entered it and when: the person writing, now. When it was first recorded never changes.
  if current_user in ('app_user', 'nca_super') then
    new.entered_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.marks_rules() from public, anon, authenticated, service_role;
create trigger marks_rules before insert or update or delete on marks for each row execute function public.marks_rules();

-- Who may enter the marks of a paper of this class and subject: the principal, the school admin, the academic
-- coordinator; a teacher who teaches that subject in that class (teacher_subjects), or is its class teacher. One
-- rule in one place: the policies below and the app (src/lib/exams) ask this. SECURITY DEFINER with a pinned
-- search_path, like teacher_own_class_ids(): it reads teacher_subjects, teachers and classes once, without
-- re-entering their policies, and answers only for the signed-in person in the current school.
create function public.may_enter_marks(p_class_id uuid, p_subject_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when nullif(current_setting('app.current_tenant_id', true), '') is null then false
    when coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator') then true
    when coalesce(current_setting('app.current_role', true), '') = 'teacher' then
      exists (select 1 from teacher_subjects ts
                join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
               where ts.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
                 and ts.class_id = p_class_id and ts.subject_id = p_subject_id
                 and t.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
      or exists (select 1 from classes c
                  where c.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
                    and c.class_id = p_class_id
                    and c.class_teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
    else false
  end
$$;
revoke all on function public.may_enter_marks(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.may_enter_marks(uuid, uuid) to app_user;

-- How far a paper's entry has come: the children on its class's roll, and how many of them have a mark, absent or
-- exempt for every component. Counted over the whole roll, whoever asks (the academic coordinator does not read a
-- child whose consent is waiting, yet the paper is not entered until that child has a mark too); it answers only
-- for a paper the person may read, and gives numbers only.
create function public.exam_paper_progress(p_paper_id uuid) returns table (roll integer, entered integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*)::integer from students s
           where s.school_id = p.school_id and s.class_id = p.class_id and s.status in ('active', 'pending_consent')),
         (select count(*)::integer from students s
           where s.school_id = p.school_id and s.class_id = p.class_id and s.status in ('active', 'pending_consent')
             and (select count(*) from marks m where m.school_id = p.school_id and m.paper_id = p.paper_id and m.student_id = s.student_id) >= jsonb_array_length(p.components))
    from exam_papers p
   where p.paper_id = p_paper_id
     and p.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
          or (current_setting('app.current_role', true) = 'teacher' and p.class_id = any (public.teacher_own_class_ids())))
$$;
revoke all on function public.exam_paper_progress(uuid) from public, anon, authenticated, service_role;
grant execute on function public.exam_paper_progress(uuid) to app_user;

-- Rights: the app's role reads and writes; row level security and the triggers decide what. The platform role
-- holds nothing here.
revoke all on exams, exam_papers, marks from public, anon, authenticated, service_role;
revoke all on exams, exam_papers, marks from app_user, nca_super;
grant select, insert, update, delete on exams, exam_papers, marks to app_user;

alter table exam_papers enable row level security;
alter table exam_papers force row level security;
create policy exam_papers_tenant_isolation on exam_papers using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Exams: read by the three roles that run them, and by a teacher when a paper of the exam is of their own classes.
create policy exams_readers on exams as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (
    current_setting('app.current_role', true) = 'teacher'
    and exists (select 1 from exam_papers p
                 where p.school_id = exams.school_id and p.exam_id = exams.exam_id
                   and p.class_id in (select unnest(public.teacher_own_class_ids())))
  )
);
create policy exams_made_by_office on exams as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy exams_changed_by_office on exams as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']));
create policy exams_removed_by_office on exams as restrictive for delete
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']));

-- Papers: read by the three roles, and by a teacher for their own classes. Made and removed by the three roles,
-- in their own name. Changed by whoever may enter its marks: a teacher only to record that they are entered (the
-- trigger above).
create policy exam_papers_readers on exam_papers as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (current_setting('app.current_role', true) = 'teacher' and class_id in (select unnest(public.teacher_own_class_ids())))
);
create policy exam_papers_made_by_office on exam_papers as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy exam_papers_changed_by_who_may on exam_papers as restrictive for update
  using (public.may_enter_marks(class_id, subject_id))
  with check (public.may_enter_marks(class_id, subject_id));
create policy exam_papers_removed_by_office on exam_papers as restrictive for delete
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']));

-- Marks: read by the three roles, by a teacher for the papers of their own classes, and (the existing
-- parent_scope_marks narrows it to their own children) by a parent account. Entered, changed and cleared only by
-- whoever may enter the paper's marks, in their own name.
create policy marks_readers on marks as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'parent'])
  or (
    current_setting('app.current_role', true) = 'teacher'
    and exists (select 1 from exam_papers p
                 where p.school_id = marks.school_id and p.paper_id = marks.paper_id
                   and p.class_id in (select unnest(public.teacher_own_class_ids())))
  )
);
create policy marks_entered_by_who_may on marks as restrictive for insert with check (
  entered_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  and exists (select 1 from exam_papers p
               where p.school_id = marks.school_id and p.paper_id = marks.paper_id
                 and public.may_enter_marks(p.class_id, p.subject_id))
);
create policy marks_changed_by_who_may on marks as restrictive for update
  using (exists (select 1 from exam_papers p
                  where p.school_id = marks.school_id and p.paper_id = marks.paper_id
                    and public.may_enter_marks(p.class_id, p.subject_id)))
  with check (
    entered_by = nullif(current_setting('app.current_user_id', true), '')::uuid
    and exists (select 1 from exam_papers p
                 where p.school_id = marks.school_id and p.paper_id = marks.paper_id
                   and public.may_enter_marks(p.class_id, p.subject_id))
  );
create policy marks_cleared_by_who_may on marks as restrictive for delete
  using (exists (select 1 from exam_papers p
                  where p.school_id = marks.school_id and p.paper_id = marks.paper_id
                    and public.may_enter_marks(p.class_id, p.subject_id)));

-- Every role of a school reads its own audit rows (audit_read_own_school). An exam's rows say who made it, who
-- changed its papers and who entered a paper's marks; they follow the exams: the three roles that run them, or
-- the person who acted. RESTRICTIVE, as for Early Warning (C209).
create policy audit_exam_rows_office_or_actor on audit_log as restrictive for select
  using (
    split_part(event_action, '.', 1) not in ('exam', 'exam_paper')
    or current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );

-- Exams is partly built (its grading scheme, exams and marks entry): on for every school, as the default plan
-- gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'exams', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
