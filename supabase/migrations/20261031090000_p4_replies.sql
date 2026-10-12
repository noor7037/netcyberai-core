-- P4 slice 7f (C187): parents' replies, threaded to the school.
--
-- 1. message_threads: one conversation per school and phone number.
-- 2. inbound_messages: what a parent wrote. One platform number serves every
--    school, so a message is given to a school only when its number is a
--    guardian's on record there (and, if in several schools, the one that
--    last wrote to it). A number no school knows is recorded as having
--    written, without its words and without the number: it is never matched
--    by guess.
-- 3. whatsapp_opt_outs: a parent who writes STOP gets no more WhatsApp
--    messages from that school on that number. WhatsApp only: the consent
--    ledger is not touched. The office lifts it when the parent asks, with a
--    reason.
-- 4. A free-text reply by staff is a message like any other: one row in the
--    message log, with its words and its thread, sent through the one gate.
--
-- Who reads: the principal and school admin, every thread; a teacher, only
-- the threads of guardians of children in their own classes. Nobody else.

create table message_threads (
  thread_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  parent_id uuid not null,
  last_inbound_at timestamptz not null,
  last_outbound_at timestamptz,
  unread int not null default 0 check (unread >= 0),
  created_at timestamptz not null default now(),
  unique (school_id, phone),
  unique (school_id, thread_id),
  foreign key (school_id, parent_id) references parents(school_id, parent_id)
);
create table inbound_messages (
  message_id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(school_id),
  thread_id uuid,
  provider text not null check (provider in ('stand-in', 'meta')),
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 200),
  body text check (body is null or char_length(body) between 1 and 4096),
  is_stop boolean not null default false,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_message_id),
  foreign key (school_id, thread_id) references message_threads(school_id, thread_id),
  -- Given to a school with its words, or to none without them.
  check ((school_id is null) = (thread_id is null)),
  check ((school_id is null) = (body is null))
);
create index idx_inbound_thread on inbound_messages (thread_id, received_at) where thread_id is not null;
create table whatsapp_opt_outs (
  opt_out_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  stopped_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid,
  lift_reason text check (lift_reason is null or char_length(btrim(lift_reason)) between 1 and 300),
  check ((lifted_at is null) = (lifted_by is null) and (lifted_at is null) = (lift_reason is null))
);
create unique index whatsapp_opt_outs_one_open on whatsapp_opt_outs (school_id, phone) where lifted_at is null;

revoke all on message_threads, inbound_messages, whatsapp_opt_outs from public, anon, authenticated, service_role;
grant select, update on message_threads to app_user;
grant select on inbound_messages to app_user;
grant select, update on whatsapp_opt_outs to app_user;
grant select, insert, update on message_threads, whatsapp_opt_outs to nca_super;
grant select, insert on inbound_messages to nca_super;
alter table message_threads enable row level security;
alter table message_threads force row level security;
alter table inbound_messages enable row level security;
alter table inbound_messages force row level security;
alter table whatsapp_opt_outs enable row level security;
alter table whatsapp_opt_outs force row level security;
create policy message_threads_tenant_isolation on message_threads using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy inbound_messages_tenant_isolation on inbound_messages using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy whatsapp_opt_outs_tenant_isolation on whatsapp_opt_outs using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The office reads every thread; a teacher, the guardians of their own classes; nobody else.
create policy message_threads_staff on message_threads as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and exists (
    select 1 from parent_student_map m join students s on s.school_id = m.school_id and s.student_id = m.student_id
     where m.school_id = message_threads.school_id and m.parent_id = message_threads.parent_id and s.class_id in (select unnest(public.teacher_own_class_ids()))))
);
create policy inbound_messages_staff on inbound_messages as restrictive for all using (
  exists (select 1 from message_threads t where t.school_id = inbound_messages.school_id and t.thread_id = inbound_messages.thread_id)
);
-- Staff who may see a conversation may see that its number asked to stop; only the office lifts it.
create policy whatsapp_opt_outs_staff on whatsapp_opt_outs as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'teacher', 'super_admin'])
);
create policy whatsapp_opt_outs_office on whatsapp_opt_outs as restrictive for update using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
);
-- A thread is whose it is; only its "read" count and times move.
create function public.message_threads_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.phone, new.parent_id, new.created_at) is distinct from (old.school_id, old.phone, old.parent_id, old.created_at) then
    raise exception 'whose a conversation is never changes' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.message_threads_fixed() from public;
create trigger message_threads_fixed before update on message_threads for each row execute function public.message_threads_fixed();
-- An opt-out is lifted once, by a named person with a reason; nothing else about it changes.
create function public.whatsapp_opt_outs_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.phone, new.stopped_at) is distinct from (old.school_id, old.phone, old.stopped_at) or old.lifted_at is not null then
    raise exception 'an opt-out is only ever lifted, once' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.whatsapp_opt_outs_fixed() from public;
create trigger whatsapp_opt_outs_fixed before update on whatsapp_opt_outs for each row execute function public.whatsapp_opt_outs_fixed();

-- 4.
alter table communication_log add column thread_id uuid;
alter table communication_log add column body text check (body is null or char_length(body) between 1 and 4096);
alter table communication_log add column sent_by uuid;
alter table communication_log add constraint communication_log_school_thread_fkey foreign key (school_id, thread_id) references message_threads(school_id, thread_id);
-- Free text is a reply in a thread, never a message out of nowhere.
alter table communication_log add constraint communication_log_free_text_is_a_reply check (body is null or thread_id is not null);
create index idx_communication_log_thread on communication_log (thread_id, created_at) where thread_id is not null;

create or replace function public.communication_log_forward_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  was text := old.status::text;
  now_is text := new.status::text;
  rank constant jsonb := '{"queued": 0, "sent": 1, "delivered": 2, "read": 3}';
begin
  if (new.school_id, new.channel, new.created_at) is distinct from (old.school_id, old.channel, old.created_at)
     or new.to_phone is distinct from old.to_phone or new.template_name is distinct from old.template_name or new.dedupe_key is distinct from old.dedupe_key
     or new.body is distinct from old.body or new.thread_id is distinct from old.thread_id or new.sent_by is distinct from old.sent_by
     or (old.provider_message_id is not null and new.provider_message_id is distinct from old.provider_message_id) then
    raise exception 'what a message was never changes' using errcode = 'check_violation';
  end if;
  if was <> 'queued' and (new.template_version is distinct from old.template_version or new.language is distinct from old.language or new.template_params is distinct from old.template_params) then
    raise exception 'what a message was never changes' using errcode = 'check_violation';
  end if;
  if now_is = was then
    return new;
  end if;
  if was = 'queued' and (now_is = 'failed' or now_is like 'blocked_%') then
    return new;
  end if;
  if now_is = 'failed' and was = 'sent' then
    return new;
  end if;
  if rank ? was and rank ? now_is and (rank ->> now_is)::int > (rank ->> was)::int then
    return new;
  end if;
  raise exception 'a message''s state only moves forward (% to % is refused)', was, now_is using errcode = 'check_violation';
end $$;
