-- W21-M7 (docs/42, Medium: Documents): the certificate request -> fee clearance -> issue -> delivery flow.
--
-- certificate_requests (baseline, unused until now) becomes the request. It is made by the office or by a linked
-- guardian in the Family app, for the guardian's own child, with a kind (transfer, bonafide, character, study) and a
-- short reason (the purpose a bonafide or study certificate prints). A request goes requested -> issued -> ready ->
-- collected, and every step is an event (certificate_request_events) with who and when.
--
-- 1. certificate_requests: new columns (requested_via, who asked, reason, stage, the fee hold, the principal's
--    waiver with its reason, the certificate issued for it, the step times). The legacy `state` column is left alone.
--    A guardian's rows are forced: via 'app', their own parent id, stage 'requested', nothing else filled. Only the
--    principal waives (in their own name), and a stage only moves forward.
-- 2. Rules by role (restrictive, beside the baseline tenant rule): the principal and the school admin read and write;
--    a guardian reads the requests of their own children (guardian_student_ids()) and inserts one for their own
--    child, as themselves; never updates or deletes. Nobody else (teacher, accountant, ...) reads them any more.
-- 3. certificate_request_events: append-only (no update, no delete is granted). The office writes in its own name;
--    the platform role writes the system and download events; a trigger writes 'requested'. A guardian reads the
--    events of the requests they read. A download is one event with a random nonce, unique: a signed link works once.
-- 4. certificates_issued: a guardian reads the certificate issued for their own child (the number and the state shown
--    on the Family card). The office rule keeps insert and update office-only through its WITH CHECK.
-- 5. public.certificate_request_copy(request): the platform role's ONE read of the PDF's place for a request whose
--    certificate is ready and live (the platform role holds nothing on certificate_copies).

alter table certificate_requests alter column cert_type drop default;
alter table certificate_requests add constraint certificate_requests_kind_check check (cert_type in ('transfer', 'bonafide', 'character', 'study')) not valid;
alter table certificate_requests add column requested_via text not null default 'office' check (requested_via in ('office', 'app'));
alter table certificate_requests add column requested_by_parent_id uuid;
alter table certificate_requests add column requested_by_user_id uuid;
alter table certificate_requests add column reason text check (reason is null or (char_length(btrim(reason)) between 1 and 90 and public.no_aadhaar_number(reason)));
alter table certificate_requests add column stage text not null default 'requested' check (stage in ('requested', 'issued', 'ready', 'collected'));
alter table certificate_requests add column held_owed_minor bigint check (held_owed_minor is null or held_owed_minor > 0);
alter table certificate_requests add column waiver_reason text check (waiver_reason is null or (char_length(btrim(waiver_reason)) between 1 and 300 and public.no_aadhaar_number(waiver_reason)));
alter table certificate_requests add column waived_by uuid;
alter table certificate_requests add column waived_at timestamptz;
alter table certificate_requests add column certificate_id uuid;
alter table certificate_requests add column issued_at timestamptz;
alter table certificate_requests add column ready_at timestamptz;
alter table certificate_requests add column collected_at timestamptz;
alter table certificate_requests add column collected_by uuid;
alter table certificate_requests add constraint certificate_requests_school_cert_key unique (school_id, cert_id);
alter table certificate_requests add constraint certificate_requests_parent_fkey foreign key (school_id, requested_by_parent_id) references parents(school_id, parent_id);
alter table certificate_requests add constraint certificate_requests_user_fkey foreign key (school_id, requested_by_user_id) references users(school_id, user_id);
alter table certificate_requests add constraint certificate_requests_waived_by_fkey foreign key (school_id, waived_by) references users(school_id, user_id);
alter table certificate_requests add constraint certificate_requests_collected_by_fkey foreign key (school_id, collected_by) references users(school_id, user_id);
alter table certificate_requests add constraint certificate_requests_certificate_fkey foreign key (school_id, certificate_id) references certificates_issued(school_id, certificate_id);
alter table certificate_requests add constraint certificate_requests_waiver check ((waiver_reason is null) = (waived_by is null) and (waived_by is null) = (waived_at is null));
alter table certificate_requests add constraint certificate_requests_stage_shape check ((stage = 'requested') = (certificate_id is null) and (stage <> 'collected' or collected_by is not null));
-- One open request of a kind and reason per child.
create unique index certificate_requests_one_open on certificate_requests (school_id, student_id, cert_type, lower(btrim(coalesce(reason, ''))))
  where stage <> 'collected';
create index idx_certificate_requests_child on certificate_requests (school_id, student_id, created_at desc);

create function public.certificate_requests_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  role_now text := coalesce(current_setting('app.current_role', true), '');
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  rank_of constant text[] := array['requested', 'issued', 'ready', 'collected'];
begin
  if tg_op = 'INSERT' then
    if role_now = 'parent' then
      new.requested_via := 'app'; new.requested_by_parent_id := me; new.requested_by_user_id := null;
    elsif role_now in ('principal', 'school_admin') then
      new.requested_via := 'office'; new.requested_by_user_id := me; new.requested_by_parent_id := null;
    elsif current_user = 'app_user' then
      raise exception 'a certificate is requested by the office or by a guardian' using errcode = '42501';
    end if;
    new.reason := nullif(btrim(new.reason), '');
    new.stage := 'requested'; new.held_owed_minor := null; new.certificate_id := null;
    new.waiver_reason := null; new.waived_by := null; new.waived_at := null;
    new.issued_at := null; new.ready_at := null; new.collected_at := null; new.collected_by := null;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;
  if role_now = 'parent' then
    raise exception 'a guardian does not change a request' using errcode = '42501';
  end if;
  if (new.cert_id, new.school_id, new.student_id, new.cert_type, new.reason, new.requested_via, new.requested_by_parent_id, new.requested_by_user_id, new.created_at)
     is distinct from (old.cert_id, old.school_id, old.student_id, old.cert_type, old.reason, old.requested_via, old.requested_by_parent_id, old.requested_by_user_id, old.created_at) then
    raise exception 'a request is not rewritten' using errcode = 'check_violation';
  end if;
  if array_position(rank_of, new.stage) < array_position(rank_of, old.stage) then
    raise exception 'a request only moves forward' using errcode = 'check_violation';
  end if;
  if old.waived_by is not null and (new.waiver_reason, new.waived_by, new.waived_at) is distinct from (old.waiver_reason, old.waived_by, old.waived_at) then
    raise exception 'a waiver stands as it was given' using errcode = 'check_violation';
  end if;
  if old.waived_by is null and new.waived_by is not null then
    if current_user = 'app_user' and (role_now <> 'principal' or new.waived_by is distinct from me) then
      raise exception 'only the principal waives the fee clearance, in their own name' using errcode = '42501';
    end if;
    new.waived_at := now();
  end if;
  if new.stage is distinct from old.stage then
    if new.stage = 'issued' then
      new.issued_at := now();
    elsif new.stage = 'ready' then
      new.ready_at := now();
    elsif new.stage = 'collected' then
      new.collected_at := now();
      if current_user = 'app_user' and new.collected_by is distinct from me then
        raise exception 'collected is marked in the office person''s own name' using errcode = '42501';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.certificate_requests_write() from public, anon, authenticated, service_role;
create trigger certificate_requests_write before insert or update on certificate_requests for each row execute function public.certificate_requests_write();

create table certificate_request_events (
  event_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  request_id uuid not null,
  kind text not null check (kind in ('requested', 'held', 'released', 'waived', 'issued', 'ready', 'downloaded', 'collected')),
  actor text not null check (actor in ('guardian', 'office', 'system')),
  actor_user_id uuid,
  actor_parent_id uuid,
  nonce text check (nonce is null or nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  at timestamptz not null default now(),
  foreign key (school_id, request_id) references certificate_requests(school_id, cert_id),
  foreign key (school_id, actor_user_id) references users(school_id, user_id),
  foreign key (school_id, actor_parent_id) references parents(school_id, parent_id),
  check ((actor = 'office') = (actor_user_id is not null)),
  check (nonce is null or kind = 'downloaded')
);
create unique index certificate_request_events_nonce on certificate_request_events (nonce) where nonce is not null;
create index idx_certificate_request_events_request on certificate_request_events (school_id, request_id, at);
revoke all on certificate_request_events from public, anon, authenticated, service_role, app_user, nca_super;
grant select, insert on certificate_request_events to app_user, nca_super;
alter table certificate_request_events enable row level security;
alter table certificate_request_events force row level security;
create policy certificate_request_events_tenant_isolation on certificate_request_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy certificate_request_events_who on certificate_request_events as restrictive for select
  using (current_setting('app.current_role', true) in ('principal', 'school_admin')
         or (current_setting('app.current_role', true) = 'parent' and request_id in (select r.cert_id from certificate_requests r)));
create policy certificate_request_events_office_writes on certificate_request_events as restrictive for insert
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin') and actor = 'office' and actor_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- The request's first event, written by the database for whoever asked.
create function public.certificate_requests_first_event() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into certificate_request_events (school_id, request_id, kind, actor, actor_user_id, actor_parent_id)
  values (new.school_id, new.cert_id, 'requested', case when new.requested_via = 'app' then 'guardian' else 'office' end, new.requested_by_user_id, new.requested_by_parent_id);
  return new;
end $$;
revoke all on function public.certificate_requests_first_event() from public, anon, authenticated, service_role;
create trigger certificate_requests_first_event after insert on certificate_requests for each row execute function public.certificate_requests_first_event();

-- 2. Who reads and writes the requests. Every table once refused a parent outright (certificate_requests_no_parent,
--    c230d): that rule now lets a guardian read the requests of their own children and ask for one for their own child,
--    as themselves; the rule below keeps every other role (teacher, accountant, ...) out; a guardian never changes or
--    deletes a request.
alter policy certificate_requests_no_parent on certificate_requests
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent' or student_id = any (public.guardian_student_ids()))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent'
              or (requested_by_parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid and student_id = any (public.guardian_student_ids())));
create policy certificate_requests_who on certificate_requests as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'parent'))
  with check (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'parent'));
create policy certificate_requests_parent_no_change on certificate_requests as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy certificate_requests_parent_no_delete on certificate_requests as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- 4. The guardian reads the certificate issued for their own child (the c230d rule refused a parent outright). Insert,
--    update and delete stay with the office; the office rule stays as it was.
alter policy certificates_issued_no_parent on certificates_issued
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent' or (erased_at is null and student_id = any (public.guardian_student_ids())))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy certificates_issued_office on certificates_issued
  using (current_setting('app.current_role', true) in ('principal', 'school_admin')
         or (current_setting('app.current_role', true) = 'parent' and erased_at is null and student_id = any (public.guardian_student_ids())))
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy certificates_issued_parent_no_change on certificates_issued as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy certificates_issued_parent_no_delete on certificates_issued as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- 5. Where the PDF of a ready request is, for the platform role's download (the signed link checks the rest).
create function public.certificate_request_copy(p_request_id uuid)
returns table (school_id uuid, student_id uuid, copy_id uuid, storage_key text, number text, cert_type text)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.school_id, r.student_id, k.copy_id, k.storage_key, c.number, c.cert_type
    from certificate_requests r
    join certificates_issued c on c.school_id = r.school_id and c.certificate_id = r.certificate_id
    join lateral (select x.copy_id, x.storage_key from certificate_copies x where x.school_id = c.school_id and x.certificate_id = c.certificate_id order by x.made_at desc limit 1) k on true
   where r.cert_id = p_request_id and r.stage in ('ready', 'collected') and c.withdrawn_at is null and c.erased_at is null
$$;
revoke all on function public.certificate_request_copy(uuid) from public, anon, authenticated, service_role;
grant execute on function public.certificate_request_copy(uuid) to nca_super;

-- 6. The emails of the Family accounts linked (link open) to a school child, for the "ready" notice. The school side
--    never names a family table: the job that sends the notice (src/lib/family/certificate-ready.ts) calls this.
create function family.certificate_ready_emails(p_school_id uuid, p_student_id uuid)
returns table (account_id uuid, email text, ui_language text)
language sql stable security definer set search_path = '' as $$
  select distinct a.account_id, a.email, a.ui_language
    from family.child_links cl
    join family.school_links sl on sl.link_id = cl.link_id and sl.revoked_at is null and sl.school_id = p_school_id
    join family.accounts a on a.account_id = cl.account_id
   where cl.student_id = p_student_id
   limit 10
$$;
revoke all on function family.certificate_ready_emails(uuid, uuid) from public, anon, authenticated, app_user, family_app, service_role;
grant execute on function family.certificate_ready_emails(uuid, uuid) to nca_super;

-- 7. What a child owes and whether the fee clearance is given, for the platform role's re-read of held requests (the
--    fee counter's own function answers staff roles only). The same sum and the same override rule as
--    feeClearance() (src/lib/fees/clearance.ts): nothing owed, or the counter's latest override covers what is owed.
create function public.certificate_request_dues(p_school_id uuid, p_student_id uuid)
returns table (owed_minor bigint, cleared boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.owed,
         o.owed <= 0 or coalesce((select ov.owed_minor from fee_clearance_overrides ov where ov.school_id = p_school_id and ov.student_id = p_student_id order by ov.decided_at desc limit 1) >= o.owed, false)
    from (select public.student_owed_minor(p_school_id, p_student_id) as owed) o
   where exists (select 1 from students s where s.school_id = p_school_id and s.student_id = p_student_id)
$$;
revoke all on function public.certificate_request_dues(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.certificate_request_dues(uuid, uuid) to nca_super;
