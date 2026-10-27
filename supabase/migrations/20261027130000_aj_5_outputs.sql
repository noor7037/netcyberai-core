-- AJ-5 (C230-AJ part 5, slice E): one step from approved marks to every output.
--
-- 1. exam_outputs. After the principal (or the school admin or the academic coordinator) publishes a class, the principal
--    or the school admin presses one action on the class result: it makes the class's report cards and progress reports
--    (drawn from the publication, never stored), shows the progress report in the Family app, queues one WhatsApp
--    message per guardian through the send-gate's outbox and lets the Family app's push job tell the families. This table
--    is that action's record: one row per publication, never changed or removed. A reopened class has a new publication,
--    so its outputs are made again. A guardian reads it only through guardian_exam_outputs(): the (exam, class, version)
--    of their own children's classes for a publication in force, and when, nothing else.
-- 2. exam_certificates. Merit and participation certificates made from a published result, by the rules the school sets
--    in its Documents settings. Each is an ordinary certificate of the school's register (certificates_issued: the
--    school's number, seal and signature, QR check, withdrawal, erasure); this table only links it to the publication
--    and the child, one per kind, so a second press makes none. Ids only.
-- 3. The register learns the two kinds: 'merit' (MC) and 'participation' (PC). Neither asks the fee clearance (a
--    recognition of a child's work is never held for fees); both always carry the exam as their purpose, so a
--    second certificate of the kind for the same exam the same day is refused by the register's own index.
--
-- Read and written by src/lib/exams/publish-outputs.ts, src/lib/documents/result-certificates.ts and, as the guardian,
-- src/lib/school-link/progress.ts.

-- ---- 1. exam_outputs ---------------------------------------------------------------------------------------------------

create table exam_outputs (
  output_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  publication_id uuid not null,
  made_by uuid not null,
  made_at timestamptz not null default now(),
  unique (school_id, publication_id),
  foreign key (school_id, publication_id) references exam_publications(school_id, publication_id),
  foreign key (school_id, made_by) references users(school_id, user_id)
);
revoke all on exam_outputs from public, anon, authenticated, service_role;
revoke all on exam_outputs from app_user, nca_super;
grant select, insert on exam_outputs to app_user;
alter table exam_outputs enable row level security;
alter table exam_outputs force row level security;
create policy exam_outputs_tenant_isolation on exam_outputs using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read by the three roles that run exams; a teacher never.
create policy exam_outputs_readers on exam_outputs as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
);
-- Made by the principal or the school admin (the two who may tell parents), in their own name, for a publication in force.
create policy exam_outputs_made_by_office on exam_outputs as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and made_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  and exists (select 1 from exam_publications x where x.school_id = exam_outputs.school_id and x.publication_id = exam_outputs.publication_id and x.reopened_at is null)
);
create policy exam_outputs_never_changed on exam_outputs as restrictive for update using (false);
create policy exam_outputs_never_removed on exam_outputs as restrictive for delete using (false);
create policy exam_outputs_no_parent on exam_outputs as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- The guardian's view of it: the publications in force of their own children's classes (guardian_class_ids(), reused)
-- for which the outputs were made.
create function public.guardian_exam_outputs()
returns table (exam_id uuid, class_id uuid, version integer, made_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.exam_id, x.class_id, x.version, o.made_at
    from public.exam_outputs o
    join public.exam_publications x on x.school_id = o.school_id and x.publication_id = o.publication_id
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and o.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and x.reopened_at is null
     and x.class_id = any (public.guardian_class_ids())
$$;
revoke all on function public.guardian_exam_outputs() from public;
grant execute on function public.guardian_exam_outputs() to app_user;

-- ---- 2. the register learns merit and participation ----------------------------------------------------------------------

alter table certificates_issued drop constraint certificates_issued_cert_type_check;
alter table certificates_issued add constraint certificates_issued_cert_type_check check (cert_type in ('transfer', 'bonafide', 'character', 'study', 'merit', 'participation'));
alter table certificates_issued drop constraint certificates_issued_number_shape;
alter table certificates_issued add constraint certificates_issued_number_shape check (number ~ '^([A-Za-z0-9-]{1,12}/)?(TC|BC|CC|SC|MC|PC)/[0-9]{4,}$');
-- A merit or participation certificate is for an exam: its purpose (until a child's erasure blanks it).
alter table certificates_issued add constraint certificates_issued_result_purpose check (cert_type not in ('merit', 'participation') or purpose is not null or erased_at is not null);

-- The twin of certificateNumber() in src/lib/documents/certificate-rules.ts, with the two new letters.
create or replace function public.certificate_number(p_prefix text, p_type text, p_seq integer) returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_prefix || '/', '')
         || (case p_type when 'transfer' then 'TC' when 'bonafide' then 'BC' when 'character' then 'CC' when 'merit' then 'MC' when 'participation' then 'PC' else 'SC' end)
         || '/' || lpad(p_seq::text, greatest(4, length(p_seq::text)), '0')
$$;

-- A merit or participation certificate never waits for the fee clearance; the rest are as they were.
create or replace function public.certificate_needs_clearance(p_school_id uuid, p_type text) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select case when jsonb_typeof(s.setting_values -> ('clearance_' || p_type)) = 'boolean' then (s.setting_values ->> ('clearance_' || p_type))::boolean end
       from school_settings s where s.school_id = p_school_id and s.module_id = 'documents'),
    p_type not in ('transfer', 'merit', 'participation'))
$$;

-- ---- 3. exam_certificates ------------------------------------------------------------------------------------------------

create table exam_certificates (
  link_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  publication_id uuid not null,
  student_id uuid not null,
  kind text not null check (kind in ('merit', 'participation')),
  certificate_id uuid not null,
  made_by uuid not null,
  made_at timestamptz not null default now(),
  unique (school_id, publication_id, student_id, kind),
  unique (school_id, certificate_id),
  foreign key (school_id, publication_id) references exam_publications(school_id, publication_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, certificate_id) references certificates_issued(school_id, certificate_id),
  foreign key (school_id, made_by) references users(school_id, user_id)
);
revoke all on exam_certificates from public, anon, authenticated, service_role;
revoke all on exam_certificates from app_user, nca_super;
grant select, insert on exam_certificates to app_user;
alter table exam_certificates enable row level security;
alter table exam_certificates force row level security;
create policy exam_certificates_tenant_isolation on exam_certificates using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The register's own people: the principal and the school admin (certificates_issued_office).
create policy exam_certificates_office on exam_certificates as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);
create policy exam_certificates_made_by_office on exam_certificates as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and made_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy exam_certificates_never_changed on exam_certificates as restrictive for update using (false);
create policy exam_certificates_never_removed on exam_certificates as restrictive for delete using (false);
create policy exam_certificates_no_parent on exam_certificates as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
