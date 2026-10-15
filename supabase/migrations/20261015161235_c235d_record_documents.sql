-- C235-D: documents on a staff member's and a student's record, with versions (founder, 2026-10-15).
--
-- The school keeps scanned papers on a person's record: a government ID, an academic certificate, a transcript, an
-- experience letter or another official paper. One model for staff (teachers included) and students:
--
--   record_documents          one paper on one record: its kind, its name, who added it and when. It belongs to a
--                             student (student_id) or to a member of staff (staff_user_id), never both.
--   record_document_versions  each file uploaded for that paper. A new upload is a new version; the earlier ones are
--                             kept, each with who uploaded it and when. The number is given here (a trigger), never
--                             by the caller: one more than the last, under a lock per paper, so two uploads at once
--                             never share a number.
--
-- What is stored (checked here as well as in the app): a PDF, JPEG or PNG of at most 10 MB, under the school's own
-- prefix in the private bucket ("<schoolId>/record-documents/..."), never a path the caller chose; a name with no
-- Aadhaar number in it (public.no_aadhaar_number, the one rule's twin). The file's own name is not kept. The app runs
-- the Aadhaar upload check (C232 part A) before a file is stored, so an Aadhaar card is never kept here either.
-- Nothing is changed after it is written (no UPDATE right): a paper is replaced by a new version, or removed whole.
--
-- Who (row level security, the twin of src/lib/documents/record-documents.ts):
--   - the principal and the school admin add papers and versions, remove papers, and read every paper of the school;
--   - a member of staff reads the papers on their own staff record;
--   - a student's papers are read, as the student's record is: by the academic coordinator and the accountant, and by
--     a teacher only for a child of a class they teach or are class teacher of (public.teacher_own_class_ids());
--   - a parent session reads and writes nothing here (deny by default, C230-D).
-- The audit rows of these papers and of list exports name people by id: the office, or the person who acted, reads them.

create table record_documents (
  document_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid,
  staff_user_id uuid,
  kind text not null check (kind in ('government_id', 'academic_certificate', 'transcript', 'experience_letter', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 120 and title !~ '[[:cntrl:]]' and public.no_aadhaar_number(title)),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check ((student_id is null) <> (staff_user_id is null)),
  unique (school_id, document_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, staff_user_id) references users(school_id, user_id),
  foreign key (school_id, created_by) references users(school_id, user_id)
);
create index idx_record_documents_student on record_documents(school_id, student_id) where student_id is not null;
create index idx_record_documents_staff on record_documents(school_id, staff_user_id) where staff_user_id is not null;

create table record_document_versions (
  version_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  document_id uuid not null,
  version_no integer not null check (version_no >= 1),
  storage_key text not null unique check (storage_key like school_id::text || '/record-documents/%' and storage_key !~ '\.\.'),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  unique (document_id, version_no),
  foreign key (school_id, document_id) references record_documents(school_id, document_id),
  foreign key (school_id, uploaded_by) references users(school_id, user_id)
);
create index idx_record_document_versions_document on record_document_versions(school_id, document_id, version_no desc);

-- The version number and the time are the database's, never the caller's.
create function public.record_document_versions_number() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('record_document:' || new.document_id::text, 0));
  select coalesce(max(v.version_no), 0) + 1 into new.version_no
    from record_document_versions v where v.school_id = new.school_id and v.document_id = new.document_id;
  new.uploaded_at := now();
  return new;
end $$;
revoke all on function public.record_document_versions_number() from public, anon, authenticated, service_role;
create trigger record_document_versions_number before insert on record_document_versions
  for each row execute function public.record_document_versions_number();

-- Grants and row level security ---------------------------------------------------------------------------------------
revoke all on record_documents, record_document_versions from public, anon, authenticated, service_role;
revoke all on record_documents, record_document_versions from app_user, nca_super;
grant select, insert, delete on record_documents to app_user;
grant select, insert, delete on record_document_versions to app_user;

alter table record_documents enable row level security;
alter table record_documents force row level security;
alter table record_document_versions enable row level security;
alter table record_document_versions force row level security;

create policy record_documents_tenant_isolation on record_documents using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy record_document_versions_tenant_isolation on record_document_versions using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Who reads a paper.
create policy record_documents_readers on record_documents as restrictive for select
  using (
    coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin')
    or staff_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or (student_id is not null and coalesce(current_setting('app.current_role', true), '') in ('academic_coordinator', 'accountant'))
    or (student_id is not null and coalesce(current_setting('app.current_role', true), '') = 'teacher'
        and student_id in (select s.student_id from students s
                            where s.school_id = record_documents.school_id
                              and s.class_id in (select unnest(public.teacher_own_class_ids()))))
  );
-- A version is read by whoever reads its paper (that table's own rules apply inside the subquery).
create policy record_document_versions_readers on record_document_versions as restrictive for select
  using (exists (select 1 from record_documents d
                  where d.school_id = record_document_versions.school_id and d.document_id = record_document_versions.document_id));

-- Added by the office, in its own name; removed by the office.
create policy record_documents_added_by_office on record_documents as restrictive for insert
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin')
              and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy record_documents_removed_by_office on record_documents as restrictive for delete
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy record_document_versions_added_by_office on record_document_versions as restrictive for insert
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin')
              and uploaded_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy record_document_versions_removed_by_office on record_document_versions as restrictive for delete
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));

-- A parent session: nothing here (C230-D, deny by default).
create policy record_documents_no_parent on record_documents as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy record_document_versions_no_parent on record_document_versions as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- The audit rows of the papers and of the list exports name people and records by id: the office, or the person who acted.
create policy audit_record_document_rows_office_or_actor on audit_log as restrictive for select
  using (
    split_part(event_action, '.', 1) not in ('record_document', 'list_export')
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );
