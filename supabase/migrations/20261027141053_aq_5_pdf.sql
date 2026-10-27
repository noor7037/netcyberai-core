-- AQ-5 (docs/36 §1.4, C366): the checked paper as a PDF on WhatsApp.
--
-- At "Tell parents on WhatsApp" the office's browser makes each child's checked papers of the publication into one
-- PDF and hands it to the app, which keeps it here until it is sent: result_pdfs is that copy's record. The file is in
-- the school's own folder of the store (<school>/result-pdfs/<publication>/<pdf>.pdf, held by a check); the row has
-- its hash, size and the name it is sent under (the exam, class and roll, never the child's name).
--
--   - Made by the principal or the school admin (the two who may press Send, TELL_ROLES of
--     src/lib/marking/result-send.ts, as marking_report_links and exam_outputs), in their own name, for the
--     publication in force of the exam and class, for a child on that class. Read by the same two. Never changed or
--     removed by a school's session: a new one is made only when no copy of it is kept.
--   - At most one kept copy per publication and child (one row while its file is stored).
--   - The send-gate's queued send (src/lib/whatsapp/gate.ts, as the platform role) reaches it only through the
--     definer functions below, and only for the message's own child, while the result is published and the school
--     lets families see the checked answer sheets: it claims the copy before giving it to Meta, records Meta's media id
--     once (a retry never gives it twice), and records when a message with it was sent. Then the file is deleted.
--   - An hourly job (marking.result_pdfs_sweep, src/lib/marking/checked-pdf-store.ts) deletes every copy that was sent,
--     or made more than seven days ago, through the one storage module, and records it deleted.
--
-- DEPLOY SAFETY, as C210 and C237: the sweep is queued only once the deployed runner lists 'marking.result_pdfs_sweep'
-- among the job types it handles (platform_settings 'jobs.handlers').

create table result_pdfs (
  pdf_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  publication_id uuid not null,
  storage_key text not null,
  file_name text not null,
  sha256 text not null,
  bytes integer not null,
  made_by uuid not null,
  made_at timestamptz not null default now(),
  upload_claimed_at timestamptz,
  media_id text,
  uploaded_at timestamptz,
  sent_at timestamptz,
  deleted_at timestamptz,
  unique (school_id, pdf_id),
  unique (storage_key),
  foreign key (school_id, exam_id) references exams(school_id, exam_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, publication_id) references exam_publications(school_id, publication_id),
  foreign key (school_id, made_by) references users(school_id, user_id),
  constraint result_pdfs_key check (storage_key = school_id::text || '/result-pdfs/' || publication_id::text || '/' || pdf_id::text || '.pdf'),
  constraint result_pdfs_sha check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint result_pdfs_bytes check (bytes between 1 and 4000000),
  constraint result_pdfs_file_name check (file_name ~ '^[A-Za-z0-9_-]{1,80}\.pdf$'),
  constraint result_pdfs_media check (media_id is null or media_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  constraint result_pdfs_uploaded check ((media_id is null) = (uploaded_at is null))
);
create unique index result_pdfs_one_kept on result_pdfs (school_id, publication_id, student_id) where deleted_at is null;
create index result_pdfs_due on result_pdfs (made_at) where deleted_at is null;

revoke all on result_pdfs from public, anon, authenticated, service_role;
revoke all on result_pdfs from app_user, nca_super;
grant select, insert on result_pdfs to app_user;
alter table result_pdfs enable row level security;
alter table result_pdfs force row level security;
create policy result_pdfs_tenant_isolation on result_pdfs using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read by the two who may press Send; nobody else of the school.
create policy result_pdfs_office on result_pdfs as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);
-- Made by one of them, in their own name, for the publication in force of its exam and class, for a child of that class.
create policy result_pdfs_made_by_office on result_pdfs as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and made_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  and exists (select 1 from exam_publications x
               where x.school_id = result_pdfs.school_id and x.publication_id = result_pdfs.publication_id
                 and x.exam_id = result_pdfs.exam_id and x.class_id = result_pdfs.class_id and x.reopened_at is null)
  and exists (select 1 from students s
               where s.school_id = result_pdfs.school_id and s.student_id = result_pdfs.student_id
                 and s.class_id = result_pdfs.class_id and s.status in ('active', 'pending_consent'))
);
create policy result_pdfs_never_changed on result_pdfs as restrictive for update using (false);
create policy result_pdfs_never_removed on result_pdfs as restrictive for delete using (false);
create policy result_pdfs_no_parent on result_pdfs as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- A new copy starts as only made: what happens to it at Meta is the send-gate's to record. Once made, its file, its
-- child and its publication never change; a media id is given once; a sent copy stays sent; a deleted copy stays deleted.
create function public.result_pdfs_rules() returns trigger
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
  if (new.pdf_id, new.school_id, new.exam_id, new.class_id, new.student_id, new.publication_id, new.storage_key, new.file_name, new.sha256, new.bytes, new.made_by, new.made_at)
     is distinct from (old.pdf_id, old.school_id, old.exam_id, old.class_id, old.student_id, old.publication_id, old.storage_key, old.file_name, old.sha256, old.bytes, old.made_by, old.made_at) then
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
revoke all on function public.result_pdfs_rules() from public, anon, authenticated, service_role, app_user, nca_super;
create trigger result_pdfs_rules before insert or update on result_pdfs for each row execute function public.result_pdfs_rules();

-- Whether a copy may still go to a family now: its publication is still in force, the child is on the roll with the
-- school's consent for the records (or the school is a test school), and the school lets families see the checked
-- answer sheets (the report link's own rules, marking_report). Called by the definer functions below only.
create function public.result_pdf_may_go(p_school_id uuid, p_pdf_id uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1
      from result_pdfs p
      join exam_publications x on x.school_id = p.school_id and x.publication_id = p.publication_id and x.reopened_at is null
      join students st on st.school_id = p.school_id and st.student_id = p.student_id and st.status = 'active'
      join schools sc on sc.school_id = p.school_id
     where p.school_id = p_school_id and p.pdf_id = p_pdf_id
       and public.families_see_scripts(p.school_id)
       and (sc.is_test_fixture
            or coalesce((select cl.granted from consent_ledger cl
                          where cl.school_id = p.school_id and cl.student_id = st.student_id and cl.purpose = 'core_records'
                          order by cl.created_at desc limit 1), false)))
$$;
revoke all on function public.result_pdf_may_go(uuid, uuid) from public, anon, authenticated, service_role, app_user, nca_super;

-- The send-gate, as a queued message with a PDF is about to go (every rule of the gate has already passed): the copy of
-- the message's own child, as one of
--   'ready'  given to WhatsApp before: its media id, given again as it is;
--   'upload' not given yet, and now claimed by this send for ten minutes: the file to give;
--   'busy'   another send of the same copy is giving it now: this one waits a little;
--   'gone'   not kept any more, not this child's, or no longer to go (the rules above): nothing is given.
-- For the platform role only.
create function public.result_pdf_take(p_school_id uuid, p_pdf_id uuid, p_student_id uuid)
returns table (state text, storage_key text, sha256 text, file_name text, media_id text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r result_pdfs%rowtype;
begin
  select * into r from result_pdfs p where p.school_id = p_school_id and p.pdf_id = p_pdf_id and p.student_id = p_student_id for update;
  if not found or not public.result_pdf_may_go(p_school_id, p_pdf_id) then
    return query select 'gone'::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if r.media_id is not null then
    return query select 'ready'::text, null::text, null::text, r.file_name, r.media_id;
    return;
  end if;
  if r.deleted_at is not null then
    return query select 'gone'::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if r.upload_claimed_at is not null and r.upload_claimed_at > now() - interval '10 minutes' then
    return query select 'busy'::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  update result_pdfs p set upload_claimed_at = now() where p.pdf_id = r.pdf_id;
  return query select 'upload'::text, r.storage_key, r.sha256, r.file_name, null::text;
end $$;
revoke all on function public.result_pdf_take(uuid, uuid, uuid) from public, anon, authenticated, service_role, app_user;
grant execute on function public.result_pdf_take(uuid, uuid, uuid) to nca_super;

-- Meta took the file: its media id, recorded once, and the claim ends. Whether it was recorded now.
create function public.result_pdf_uploaded(p_school_id uuid, p_pdf_id uuid, p_media_id text) returns boolean
language sql security definer set search_path = public, pg_temp as $$
  with done as (
    update result_pdfs p set media_id = p_media_id, uploaded_at = now(), upload_claimed_at = null
     where p.school_id = p_school_id and p.pdf_id = p_pdf_id and p.media_id is null
    returning 1
  )
  select exists (select 1 from done)
$$;
revoke all on function public.result_pdf_uploaded(uuid, uuid, text) from public, anon, authenticated, service_role, app_user;
grant execute on function public.result_pdf_uploaded(uuid, uuid, text) to nca_super;

-- Giving the file did not work: the claim ends, so a later try may give it.
create function public.result_pdf_release(p_school_id uuid, p_pdf_id uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update result_pdfs p set upload_claimed_at = null where p.school_id = p_school_id and p.pdf_id = p_pdf_id and p.media_id is null
$$;
revoke all on function public.result_pdf_release(uuid, uuid) from public, anon, authenticated, service_role, app_user;
grant execute on function public.result_pdf_release(uuid, uuid) to nca_super;

-- A message with the copy was sent: recorded once. The file to delete now, while it is still stored (else nothing).
create function public.result_pdf_sent(p_school_id uuid, p_pdf_id uuid) returns text
language sql security definer set search_path = public, pg_temp as $$
  update result_pdfs p set sent_at = coalesce(p.sent_at, now())
   where p.school_id = p_school_id and p.pdf_id = p_pdf_id
  returning case when p.deleted_at is null then p.storage_key end
$$;
revoke all on function public.result_pdf_sent(uuid, uuid) from public, anon, authenticated, service_role, app_user;
grant execute on function public.result_pdf_sent(uuid, uuid) to nca_super;

-- The copies due to be deleted: every one sent, and every one made more than seven days ago; oldest first, at most
-- p_limit (up to 1000). For the platform role (the sweep and the send) only.
create function public.result_pdfs_due(p_limit integer)
returns table (school_id uuid, pdf_id uuid, storage_key text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.school_id, p.pdf_id, p.storage_key
    from result_pdfs p
   where p.deleted_at is null and (p.sent_at is not null or p.made_at < now() - interval '7 days')
   order by p.made_at, p.pdf_id
   limit least(greatest(coalesce(p_limit, 0), 0), 1000)
$$;
revoke all on function public.result_pdfs_due(integer) from public, anon, authenticated, service_role, app_user;
grant execute on function public.result_pdfs_due(integer) to nca_super;

-- Records that these copies' files were deleted (called only after the store deleted them); how many it recorded.
create function public.result_pdfs_gone(p_pdf_ids uuid[]) returns integer
language sql security definer set search_path = public, pg_temp as $$
  with done as (
    update result_pdfs p set deleted_at = now()
     where p.pdf_id = any (coalesce(p_pdf_ids, '{}'::uuid[])) and p.deleted_at is null
    returning 1
  )
  select count(*)::int from done
$$;
revoke all on function public.result_pdfs_gone(uuid[]) from public, anon, authenticated, service_role, app_user;
grant execute on function public.result_pdfs_gone(uuid[]) to nca_super;

-- This hour's sweep, once (the idempotency key is the hour in UTC), once the deployed runner handles it.
create function public.result_pdfs_sweep_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'marking.result_pdfs_sweep', jsonb_build_object('hour', t.h), 'marking.result_pdfs_sweep:' || t.h, 3
    from (select to_char(date_trunc('hour', now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24') as h) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'marking.result_pdfs_sweep')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.result_pdfs_sweep_enqueue() from public, anon, authenticated, service_role, app_user, nca_super;

-- Fifty minutes past every hour. Where there is no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('marking-result-pdfs-sweep', '50 * * * *', 'select public.result_pdfs_sweep_enqueue()');
  end if;
end $$;
