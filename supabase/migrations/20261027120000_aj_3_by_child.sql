-- AJ-3 (C230-AJ part 4): the teacher scans the class on the phone, child by child, in roll order, and never waits.
--
-- 1. A third upload mode, 'by_child': each file of the upload is one child's script, and the teacher said whose when
--    the pages were taken (the scan screen offers the exam's candidates in roll order). Every page of such an upload
--    names that child (`claimed_student_id`); a page of any other upload names none. The claimed child is on the
--    paper's class roll when the page is kept, one file is one child, and the claim never changes afterwards.
-- 2. A new flag, 'mismatch': the AI's reading of the sheet (a name, a roll number or an exam number written on it)
--    does not agree with the child the teacher chose. The script stays that child's: it is never moved to another
--    child by the reading. A person confirms the child or picks another (chooseChild), and until then the database
--    refuses to approve it, as it refuses a script with a page that may not be an answer page (am_7).
--
-- Nothing else changes: the reading and marking jobs run as before, and only a person's approval writes marks.

-- ---- 1. One file is one claimed child --------------------------------------------------------------------------------------

alter table marking_uploads drop constraint marking_uploads_mode;
alter table marking_uploads add constraint marking_uploads_mode check (mode in ('per_file', 'combined', 'by_child'));

alter table marking_pages add column claimed_student_id uuid;
alter table marking_pages add constraint marking_pages_claimed_student_fkey
  foreign key (school_id, claimed_student_id) references students(school_id, student_id);

-- The claim is written once, with the page, by the person who scanned it; the rest is checked here so a page sent any
-- other way than the scan screen cannot name a child the paper does not have.
create function public.marking_pages_claim() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  upload_mode text;
begin
  if tg_op = 'UPDATE' then
    if new.claimed_student_id is distinct from old.claimed_student_id then
      raise exception 'a page names the child it was scanned for, once' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  select u.mode into upload_mode from marking_uploads u where u.school_id = new.school_id and u.upload_id = new.upload_id;
  if upload_mode = 'by_child' and new.claimed_student_id is null then
    raise exception 'a page of a child-by-child upload names its child' using errcode = 'check_violation';
  end if;
  if upload_mode is distinct from 'by_child' and new.claimed_student_id is not null then
    raise exception 'only a child-by-child upload names a child on its pages' using errcode = 'check_violation';
  end if;
  if new.claimed_student_id is not null then
    if not exists (
        select 1 from students s join exam_papers p on p.school_id = s.school_id and p.class_id = s.class_id
         where s.school_id = new.school_id and s.student_id = new.claimed_student_id and p.paper_id = new.paper_id
           and s.status in ('active', 'pending_consent')) then
      raise exception 'the child a page names is on its paper''s class roll' using errcode = 'check_violation';
    end if;
    if exists (
        select 1 from marking_pages g
         where g.school_id = new.school_id and g.upload_id = new.upload_id and g.file_no = new.file_no
           and g.claimed_student_id is distinct from new.claimed_student_id) then
      raise exception 'one file of a child-by-child upload is one child' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.marking_pages_claim() from public, anon, authenticated, service_role;
create trigger marking_pages_claim before insert or update on marking_pages for each row execute function public.marking_pages_claim();

-- ---- 2. The sheet reads another child ------------------------------------------------------------------------------------

alter table marking_sheets drop constraint marking_sheets_flags;
alter table marking_sheets add constraint marking_sheets_flags
  check (flags <@ array['identity', 'two_scripts', 'missing_page', 'unreadable', 'not_all_read', 'unsure', 'changed', 'check_child', 'not_answer_page', 'mismatch']::text[]);

-- As am_7_followups', with one rule more: a script whose sheet reads another child is approved only once a person has
-- confirmed the child or chosen another (which takes the flag away).
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
    if 'mismatch' = any (new.flags) then
      raise exception 'a script whose sheet reads another child is settled before it is approved' using errcode = 'check_violation';
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
