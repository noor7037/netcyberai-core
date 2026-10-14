-- P6 slice 9c (C215): publishing an exam for a class, report cards, Personal Best and Most Improved (docs/27
-- sections 3 and 5, row 9c).
--
-- 1. exam_publications: one row each time an exam is published for a class: its version (1, 2, ... for that exam
--    and class), the grading scheme kept with it (the version in force at that moment and a copy of it, filled in
--    by the trigger, so a later change of the scheme never rewrites a report card), who published it and when, and,
--    once the principal reopens it, who reopened it, when and why. A publication is never removed and, once
--    reopened, never changed: publishing the class again makes the next version. At most one publication of an exam
--    and class is in force (not reopened): a unique index. An exam is published for a class only when it has papers
--    for that class, every one of them is entered (C214), and the school has a grading scheme.
--    `recognition` keeps, for each child, what the report card says about Personal Best and Most Improved, worked
--    out by the app from src/lib/recognition.ts when it publishes (each child compared only with their own earlier
--    published exams). It is kept with the publication like the scheme, so the card does not change afterwards; it
--    is shown only while the school's plan has the 'personal-best' feature (C212), which is read when a card is
--    drawn.
-- 2. The marks of a published class and exam are frozen by the database: no mark, paper or remark of that exam and
--    class is added, changed or removed while a publication of it is in force, whoever writes (the triggers read
--    the row's own school). The principal reopens it, with a reason; then marks can be corrected, and it is
--    published again as the next version.
-- 3. report_remarks: the class teacher's remark on a child's report card for an exam, one a child and exam. Frozen
--    with the class's marks once it is published.
--
-- Who reads and writes (docs/27 section 3 rules 2, 4, 5 and 6):
--   the principal, the school admin and the academic coordinator read every publication and remark; a teacher reads
--     those of their own classes (teacher_own_class_ids()); the accountant reads nothing (fees are never a
--     learning signal); the platform role holds no right on these tables;
--   the principal, the school admin and the academic coordinator publish, in their own name;
--   only the principal reopens, in their own name, with a reason;
--   only the class teacher of the class writes, changes or clears a remark, in their own name.
--   Publishing, reopening and saving remarks are audited ('exam.published', 'exam.reopened', 'exam.remarks_saved';
--   never the words of a remark); those rows follow C214's restrictive audit policy on 'exam.%': the three roles that
--   run exams, or the person who acted.
-- Read by src/lib/exams/publish.ts and src/lib/exams/report-card.ts (the report cards screen and the report card
-- PDF), and by the exams screens of C214 to say a class is published and its marks are closed.

-- 1. Publications.
create table exam_publications (
  publication_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  class_id uuid not null,
  version integer not null check (version >= 1),
  scheme_version integer not null,
  scheme jsonb not null,
  recognition jsonb not null default '{}'::jsonb,
  published_by uuid not null,
  published_at timestamptz not null default now(),
  reopened_by uuid,
  reopened_at timestamptz,
  reopen_reason text,
  unique (school_id, publication_id),
  unique (school_id, exam_id, class_id, version),
  foreign key (school_id, exam_id) references exams(school_id, exam_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, scheme_version) references grading_schemes(school_id, version),
  foreign key (school_id, published_by) references users(school_id, user_id),
  foreign key (school_id, reopened_by) references users(school_id, user_id),
  constraint exam_publications_reopened check ((reopened_by is null) = (reopened_at is null) and (reopened_at is null) = (reopen_reason is null)),
  constraint exam_publications_reason check (reopen_reason is null or char_length(btrim(reopen_reason)) between 5 and 500),
  constraint exam_publications_recognition check (jsonb_typeof(recognition) = 'object' and pg_column_size(recognition) <= 262144)
);
-- One publication of an exam and class in force at a time.
create unique index uq_exam_publications_in_force on exam_publications (school_id, exam_id, class_id) where reopened_at is null;
create index idx_exam_publications_class on exam_publications (school_id, class_id);

-- Publishing a class and writing its marks, papers or remarks take turns: a writer holds a shared transaction lock on
-- the exam and class, the publisher an exclusive one (the app takes it before it reads anything to publish; the
-- trigger below takes it again). A mark saved in the same moment as a publish is either in before the publish reads
-- the marks, or refused after it. One key in one place.
create function public.exam_class_lock_key(p_exam_id uuid, p_class_id uuid) returns bigint
language sql immutable set search_path = public, pg_temp as $$
  select hashtextextended('exam-class:' || p_exam_id::text || ':' || p_class_id::text, 0)
$$;
revoke all on function public.exam_class_lock_key(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.exam_class_lock_key(uuid, uuid) to app_user;

create function public.exam_publications_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  kept record;
  papers integer;
  waiting integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'a publication is never removed: the principal reopens it, with a reason' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(public.exam_class_lock_key(new.exam_id, new.class_id));
    -- Read as the person publishing (the office reads every class's papers and the scheme).
    select count(*)::integer, count(*) filter (where p.entered_at is null)::integer into papers, waiting
      from exam_papers p where p.school_id = new.school_id and p.exam_id = new.exam_id and p.class_id = new.class_id;
    if papers = 0 then
      raise exception 'an exam is published for a class it has papers for' using errcode = 'check_violation';
    end if;
    if waiting > 0 then
      raise exception 'an exam is published for a class only when every paper of it is entered' using errcode = 'check_violation';
    end if;
    -- The scheme in force now is the one kept, copied as it is.
    select g.version, g.scheme into kept from grading_schemes g where g.school_id = new.school_id order by g.version desc limit 1;
    if not found then
      raise exception 'an exam is published by the school''s grading scheme: save one first' using errcode = 'check_violation';
    end if;
    if exists (select 1 from exam_publications x where x.school_id = new.school_id and x.exam_id = new.exam_id and x.class_id = new.class_id and x.reopened_at is null) then
      raise exception 'this exam is already published for this class: the principal reopens it first' using errcode = 'unique_violation';
    end if;
    new.scheme_version := kept.version;
    new.scheme := kept.scheme;
    new.version := coalesce((select max(x.version) from exam_publications x where x.school_id = new.school_id and x.exam_id = new.exam_id and x.class_id = new.class_id), 0) + 1;
    new.published_at := now();
    new.reopened_by := null;
    new.reopened_at := null;
    new.reopen_reason := null;
    return new;
  end if;
  -- An update is a reopening, once, with a reason; nothing else about a publication changes.
  if old.reopened_at is not null then
    raise exception 'a reopened publication does not change: publish the class again' using errcode = 'check_violation';
  end if;
  if (new.publication_id, new.school_id, new.exam_id, new.class_id, new.version, new.scheme_version, new.scheme, new.recognition, new.published_by, new.published_at)
     is distinct from (old.publication_id, old.school_id, old.exam_id, old.class_id, old.version, old.scheme_version, old.scheme, old.recognition, old.published_by, old.published_at) then
    raise exception 'a publication is only reopened: what was published never changes' using errcode = 'check_violation';
  end if;
  if new.reopened_by is null or new.reopen_reason is null then
    raise exception 'a publication is reopened by a person, with a reason' using errcode = 'check_violation';
  end if;
  new.reopen_reason := btrim(new.reopen_reason);
  new.reopened_at := now();
  return new;
end $$;
revoke all on function public.exam_publications_rules() from public, anon, authenticated, service_role;
create trigger exam_publications_rules before insert or update or delete on exam_publications for each row execute function public.exam_publications_rules();

-- 2. The freeze. Whether a publication of an exam and class is in force, by the row's own school: one rule in one
-- place, asked by the triggers below. SECURITY DEFINER with a pinned search_path: it answers whoever writes, even
-- one who does not read the publication, and gives a yes or no only. Not callable by the app's role.
create function public.exam_class_frozen(p_school_id uuid, p_exam_id uuid, p_class_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from exam_publications x
                  where x.school_id = p_school_id and x.exam_id = p_exam_id and x.class_id = p_class_id and x.reopened_at is null)
$$;
revoke all on function public.exam_class_frozen(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- The same answer for the app, for the signed-in person's own school and the roles that read exams: the exams
-- screens close a published class's papers with it (src/lib/exams).
create function public.exam_class_published(p_exam_id uuid, p_class_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when nullif(current_setting('app.current_tenant_id', true), '') is null then false
    when coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin', 'academic_coordinator', 'teacher') then false
    else public.exam_class_frozen(nullif(current_setting('app.current_tenant_id', true), '')::uuid, p_exam_id, p_class_id)
  end
$$;
revoke all on function public.exam_class_published(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.exam_class_published(uuid, uuid) to app_user;

-- Marks: neither added, changed nor cleared while their class and exam are published. Fires before C214's
-- marks_rules (triggers fire in name order).
create function public.marks_frozen_when_published() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  paper record;
begin
  for paper in
    select p.school_id, p.exam_id, p.class_id from exam_papers p
     where (tg_op <> 'INSERT' and p.school_id = old.school_id and p.paper_id = old.paper_id)
        or (tg_op <> 'DELETE' and p.school_id = new.school_id and p.paper_id = new.paper_id)
  loop
    perform pg_advisory_xact_lock_shared(public.exam_class_lock_key(paper.exam_id, paper.class_id));
    if public.exam_class_frozen(paper.school_id, paper.exam_id, paper.class_id) then
      raise exception 'the marks of a published class are frozen: the principal reopens it, with a reason, before a mark changes' using errcode = 'object_not_in_prerequisite_state';
    end if;
  end loop;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
revoke all on function public.marks_frozen_when_published() from public, anon, authenticated, service_role;
create trigger marks_frozen_when_published before insert or update or delete on marks for each row execute function public.marks_frozen_when_published();

-- Papers: none added to, changed in or removed from a published class and exam (its maxima, date and chapters are
-- part of the result). Fires before C214's exam_papers_rules.
create function public.exam_papers_frozen_when_published() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then
    perform pg_advisory_xact_lock_shared(public.exam_class_lock_key(old.exam_id, old.class_id));
    if public.exam_class_frozen(old.school_id, old.exam_id, old.class_id) then
      raise exception 'the papers of a published class are frozen: the principal reopens it, with a reason, first' using errcode = 'object_not_in_prerequisite_state';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    perform pg_advisory_xact_lock_shared(public.exam_class_lock_key(new.exam_id, new.class_id));
    if public.exam_class_frozen(new.school_id, new.exam_id, new.class_id) then
      raise exception 'the papers of a published class are frozen: the principal reopens it, with a reason, first' using errcode = 'object_not_in_prerequisite_state';
    end if;
    return new;
  end if;
  return old;
end $$;
revoke all on function public.exam_papers_frozen_when_published() from public, anon, authenticated, service_role;
create trigger exam_papers_frozen_when_published before insert or update or delete on exam_papers for each row execute function public.exam_papers_frozen_when_published();

-- 3. Remarks.
create table report_remarks (
  remark_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  remark text not null,
  written_by uuid not null,
  written_at timestamptz not null default now(),
  unique (school_id, remark_id),
  -- One remark a child and exam.
  unique (school_id, exam_id, student_id),
  foreign key (school_id, exam_id) references exams(school_id, exam_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, written_by) references users(school_id, user_id),
  constraint report_remarks_length check (char_length(btrim(remark)) between 1 and 500)
);
create index idx_report_remarks_class on report_remarks (school_id, exam_id, class_id);

create function public.report_remarks_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.remark_id, new.school_id, new.exam_id, new.class_id, new.student_id) is distinct from (old.remark_id, old.school_id, old.exam_id, old.class_id, old.student_id) then
    raise exception 'a remark''s exam, class and child never change' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    -- Read as the class teacher, who reads their own class's papers and children.
    if not exists (select 1 from exam_papers p where p.school_id = new.school_id and p.exam_id = new.exam_id and p.class_id = new.class_id) then
      raise exception 'a remark is for a class the exam has papers for' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from students s where s.school_id = new.school_id and s.student_id = new.student_id and s.class_id = new.class_id) then
      raise exception 'a remark is for a child of that class' using errcode = 'check_violation';
    end if;
  end if;
  new.remark := btrim(new.remark);
  new.written_at := now();
  return new;
end $$;
revoke all on function public.report_remarks_rules() from public, anon, authenticated, service_role;
create trigger report_remarks_rules before insert or update or delete on report_remarks for each row execute function public.report_remarks_rules();

create function public.report_remarks_frozen_when_published() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then
    perform pg_advisory_xact_lock_shared(public.exam_class_lock_key(old.exam_id, old.class_id));
    if public.exam_class_frozen(old.school_id, old.exam_id, old.class_id) then
      raise exception 'the remarks of a published class are frozen: the principal reopens it, with a reason, first' using errcode = 'object_not_in_prerequisite_state';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    perform pg_advisory_xact_lock_shared(public.exam_class_lock_key(new.exam_id, new.class_id));
    if public.exam_class_frozen(new.school_id, new.exam_id, new.class_id) then
      raise exception 'the remarks of a published class are frozen: the principal reopens it, with a reason, first' using errcode = 'object_not_in_prerequisite_state';
    end if;
    return new;
  end if;
  return old;
end $$;
revoke all on function public.report_remarks_frozen_when_published() from public, anon, authenticated, service_role;
create trigger report_remarks_frozen_when_published before insert or update or delete on report_remarks for each row execute function public.report_remarks_frozen_when_published();

-- Whether the signed-in person is the class teacher of a class of their own school. SECURITY DEFINER with a pinned
-- search_path, like teacher_own_class_ids(): it reads classes once, without re-entering its policies, and answers
-- only for the signed-in person in the current school.
create function public.is_class_teacher_of(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
     and exists (select 1 from classes c
                  where c.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
                    and c.class_id = p_class_id
                    and c.class_teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
$$;
revoke all on function public.is_class_teacher_of(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_class_teacher_of(uuid) to app_user;

-- Rights: the app's role reads and writes; row level security and the triggers decide what. A publication is never
-- deleted. The platform role holds nothing here.
revoke all on exam_publications, report_remarks from public, anon, authenticated, service_role;
revoke all on exam_publications, report_remarks from app_user, nca_super;
grant select, insert, update on exam_publications to app_user;
grant select, insert, update, delete on report_remarks to app_user;

alter table exam_publications enable row level security;
alter table exam_publications force row level security;
alter table report_remarks enable row level security;
alter table report_remarks force row level security;

create policy exam_publications_tenant_isolation on exam_publications using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy report_remarks_tenant_isolation on report_remarks using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Publications: read by the three roles that run exams, and by a teacher for their own classes. Published by the
-- three roles in their own name; reopened only by the principal, in their own name.
create policy exam_publications_readers on exam_publications as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (current_setting('app.current_role', true) = 'teacher' and class_id in (select unnest(public.teacher_own_class_ids())))
);
create policy exam_publications_published_by_office on exam_publications as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and published_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy exam_publications_reopened_by_principal on exam_publications as restrictive for update
  using (current_setting('app.current_role', true) = 'principal')
  with check (
    current_setting('app.current_role', true) = 'principal'
    and reopened_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  );
create policy exam_publications_never_removed on exam_publications as restrictive for delete using (false);

-- Remarks: read by the three roles and by a teacher for their own classes; written, changed and cleared only by the
-- class's class teacher, in their own name.
create policy report_remarks_readers on report_remarks as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (current_setting('app.current_role', true) = 'teacher' and class_id in (select unnest(public.teacher_own_class_ids())))
);
create policy report_remarks_written_by_class_teacher on report_remarks as restrictive for insert with check (
  public.is_class_teacher_of(class_id)
  and written_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy report_remarks_changed_by_class_teacher on report_remarks as restrictive for update
  using (public.is_class_teacher_of(class_id))
  with check (
    public.is_class_teacher_of(class_id)
    and written_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  );
create policy report_remarks_cleared_by_class_teacher on report_remarks as restrictive for delete
  using (public.is_class_teacher_of(class_id));
