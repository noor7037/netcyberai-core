-- W14-F: report cards made on publish for every child, kept as a file like the checked papers' PDF.
--
-- result_pdfs held one kind of file: a child's checked papers, kept until sent on WhatsApp (aq_5_pdf). It now also
-- holds each child's report card of a publication, made by a job ('exam.report_card') queued when the class is
-- published, one per child, idempotent on the exam, the class, the child and the version. Its file sits in the same
-- school folder (<school>/result-pdfs/<publication>/<pdf>.pdf, the same check). Nothing else about the table changes.
--
--   - kind: 'checked' (every row so far) or 'report_card'. One kept copy per publication, child and kind.
--   - Made by the job in the school's own session (app.current_job 'exams.report_cards', the role 'principal', no
--     person): in the name of whoever published the result, for the publication in force, for a child of the class.
--     The office may still make any kind in its own name, as before.
--   - Read by the principal and the school admin, as before; a report card also by the academic coordinator and the
--     class teacher, who already download the class's report cards. A parent reads no row (result_pdfs_no_parent
--     stays): a guardian's own child's report card of a publication in force reaches the Family app only through
--     guardian_report_cards(), below.
--   - Never sent on WhatsApp: the send-gate's rule (result_pdf_may_go) takes checked papers only.
--   - Kept until the school's retention date for answer-sheet pictures (its "script_days", else 45 days) counted from
--     the publication; a reopened publication's cards stay until that date too (superseded, never shown to families),
--     then the hourly sweep deletes them like the checked papers'.
--   - The state on the publish page reads the jobs through report_card_jobs(), and "try again" through
--     report_card_jobs_retry(): for the school's own publication, for those who may see or publish its report cards.

alter table result_pdfs add column kind text not null default 'checked';
alter table result_pdfs add constraint result_pdfs_kind check (kind in ('checked', 'report_card'));
drop index result_pdfs_one_kept;
create unique index result_pdfs_one_kept on result_pdfs (school_id, publication_id, student_id, kind) where deleted_at is null;

-- The kind is part of what a copy was made as.
create or replace function public.result_pdfs_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.made_at := now();
    new.upload_claimed_at := null;
    new.media_id := null;
    new.uploaded_at := null;
    new.sent_at := null;
    new.deleted_at := null;
    return new;
  end if;
  if (new.pdf_id, new.school_id, new.exam_id, new.class_id, new.student_id, new.publication_id, new.storage_key, new.file_name, new.sha256, new.bytes, new.made_by, new.made_at, new.kind)
     is distinct from (old.pdf_id, old.school_id, old.exam_id, old.class_id, old.student_id, old.publication_id, old.storage_key, old.file_name, old.sha256, old.bytes, old.made_by, old.made_at, old.kind) then
    raise exception 'a result PDF stays the file it was made as' using errcode = 'check_violation';
  end if;
  if old.media_id is not null and new.media_id is distinct from old.media_id then
    raise exception 'a result PDF is given to WhatsApp once' using errcode = 'check_violation';
  end if;
  if old.sent_at is not null and new.sent_at is distinct from old.sent_at then
    raise exception 'a sent result PDF stays sent' using errcode = 'check_violation';
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'a deleted result PDF stays deleted' using errcode = 'check_violation';
  end if;
  return new;
end $$;

alter policy result_pdfs_office on result_pdfs using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  or (kind = 'report_card' and (current_setting('app.current_role', true) = 'academic_coordinator' or public.is_class_teacher_of(class_id)))
);
alter policy result_pdfs_made_by_office on result_pdfs with check (
  (
    (current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
     and made_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
    or (kind = 'report_card'
        and current_setting('app.current_role', true) = 'principal'
        and coalesce(current_setting('app.current_job', true), '') = 'exams.report_cards'
        and made_by = (select x.published_by from exam_publications x where x.school_id = result_pdfs.school_id and x.publication_id = result_pdfs.publication_id))
  )
  and exists (select 1 from exam_publications x
               where x.school_id = result_pdfs.school_id and x.publication_id = result_pdfs.publication_id
                 and x.exam_id = result_pdfs.exam_id and x.class_id = result_pdfs.class_id and x.reopened_at is null)
  and exists (select 1 from students s
               where s.school_id = result_pdfs.school_id and s.student_id = result_pdfs.student_id
                 and s.class_id = result_pdfs.class_id and s.status in ('active', 'pending_consent'))
);

-- The send-gate's rule: a checked papers' copy only. A report card never goes on WhatsApp by this door.
create or replace function public.result_pdf_may_go(p_school_id uuid, p_pdf_id uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1
      from result_pdfs p
      join exam_publications x on x.school_id = p.school_id and x.publication_id = p.publication_id and x.reopened_at is null
      join students st on st.school_id = p.school_id and st.student_id = p.student_id and st.status = 'active'
      join schools sc on sc.school_id = p.school_id
     where p.school_id = p_school_id and p.pdf_id = p_pdf_id
       and p.kind = 'checked'
       and public.families_see_scripts(p.school_id)
       and (sc.is_test_fixture
            or coalesce((select cl.granted from consent_ledger cl
                          where cl.school_id = p.school_id and cl.student_id = st.student_id and cl.purpose = 'core_records'
                          order by cl.created_at desc limit 1), false)))
$$;

-- When a report card's file goes: the school's days for answer-sheet pictures (marking_picture_deadline's days),
-- counted from its publication.
create function public.report_card_pdf_deadline(p_school_id uuid, p_publication_id uuid) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select x.published_at + make_interval(days => coalesce((
           select least(365, greatest(30, round((s.setting_values ->> 'script_days')::numeric)::int))
             from school_settings s
            where s.school_id = p_school_id and s.module_id = 'exams' and jsonb_typeof(s.setting_values -> 'script_days') = 'number'), 45))
    from exam_publications x
   where x.school_id = p_school_id and x.publication_id = p_publication_id
$$;
revoke all on function public.report_card_pdf_deadline(uuid, uuid) from public, anon, authenticated, service_role, app_user, nca_super;

-- The copies due to be deleted: a checked papers' copy sent or made more than seven days ago, as before; a report
-- card once its date has passed.
create or replace function public.result_pdfs_due(p_limit integer)
returns table (school_id uuid, pdf_id uuid, storage_key text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.school_id, p.pdf_id, p.storage_key
    from result_pdfs p
   where p.deleted_at is null
     and ((p.kind = 'checked' and (p.sent_at is not null or p.made_at < now() - interval '7 days'))
          or (p.kind = 'report_card' and public.report_card_pdf_deadline(p.school_id, p.publication_id) < now()))
   order by p.made_at, p.pdf_id
   limit least(greatest(coalesce(p_limit, 0), 0), 1000)
$$;

-- A guardian's own consented children's report cards of a publication in force (the Family app's door). The file's
-- key is for the server to fetch it; nothing else of the row.
create function public.guardian_report_cards()
returns table (exam_id uuid, class_id uuid, student_id uuid, storage_key text, file_name text)
language sql stable security definer set search_path = '' as $$
  select p.exam_id, p.class_id, p.student_id, p.storage_key, p.file_name
    from public.result_pdfs p
    join public.exam_publications x on x.school_id = p.school_id and x.publication_id = p.publication_id and x.reopened_at is null
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and p.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and p.kind = 'report_card'
     and p.deleted_at is null
     and p.student_id = any ((select public.guardian_student_ids())::uuid[])
$$;
revoke all on function public.guardian_report_cards() from public, anon, authenticated, service_role, nca_super;
grant execute on function public.guardian_report_cards() to app_user;

-- The report-card jobs of one of the school's publications, a row a child: who it is for and how it stands. For the
-- office and the class's class teacher (as result_pdfs_office reads report cards).
create function public.report_card_jobs(p_publication_id uuid)
returns table (student_id uuid, status text)
language sql stable security definer set search_path = '' as $$
  select (j.payload ->> 'studentId')::uuid, j.status
    from public.exam_publications x
    join public.jobs j on j.school_id = x.school_id and j.type = 'exam.report_card' and j.payload ->> 'publicationId' = x.publication_id::text
   where x.publication_id = p_publication_id
     and x.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator') or public.is_class_teacher_of(x.class_id))
     and (j.payload ->> 'studentId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
revoke all on function public.report_card_jobs(uuid) from public, anon, authenticated, service_role, nca_super;
grant execute on function public.report_card_jobs(uuid) to app_user;

-- "Try again": the failed report-card jobs of the school's publication in force run again now, with one more attempt
-- (as the founder's retry, retryDeadJob). For those who publish (the office). How many were started again.
create function public.report_card_jobs_retry(p_publication_id uuid) returns integer
language sql volatile security definer set search_path = '' as $$
  with done as (
    update public.jobs j
       set status = 'pending', next_run_at = now(), locked_until = null, completed_at = null,
           max_attempts = greatest(j.max_attempts, j.attempts + 1), updated_at = now()
      from public.exam_publications x
     where x.publication_id = p_publication_id
       and x.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
       and x.reopened_at is null
       and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
       and j.school_id = x.school_id and j.type = 'exam.report_card' and j.payload ->> 'publicationId' = x.publication_id::text
       and j.status = 'dead'
    returning 1
  )
  select count(*)::integer from done
$$;
revoke all on function public.report_card_jobs_retry(uuid) from public, anon, authenticated, service_role, nca_super;
grant execute on function public.report_card_jobs_retry(uuid) to app_user;

-- Queued by the office in the school's own session when it publishes (or presses "make them" again).
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
    or (
      type = 'exam.report_card'
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
      and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
    )
  );
