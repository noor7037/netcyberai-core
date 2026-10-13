-- P4 slice 7d (C185): the outbox.
--
-- 1. A queued message knows when it may next be tried, how often it has
--    been, and whether it is being sent right now (set and committed before
--    the provider is asked, so an interrupted send is never repeated).
-- 2. A school session may queue a WhatsApp message of its own school, as it
--    may an invitation, a bulk run or a ticket notice. Nothing else about
--    jobs changes: no read, no update, no other type.
-- 3. A queued message has not said anything yet: its version, language and
--    values are settled when it is sent. From then on they never change, as
--    before. A queued message may also be stopped by a rule (queued to
--    blocked); nothing else about states moving forward changes.

-- 1.
alter table communication_log add column not_before timestamptz;
alter table communication_log add column attempts int not null default 0 check (attempts >= 0);
alter table communication_log add column sending_at timestamptz;
create index idx_communication_log_queued on communication_log (not_before) where status = 'queued';

-- 2.
alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify', 'whatsapp.send')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );

-- 3.
create or replace function public.communication_log_forward_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  was text := old.status::text;
  now_is text := new.status::text;
  rank constant jsonb := '{"queued": 0, "sent": 1, "delivered": 2, "read": 3}';
begin
  if (new.school_id, new.channel, new.created_at) is distinct from (old.school_id, old.channel, old.created_at)
     or new.to_phone is distinct from old.to_phone or new.template_name is distinct from old.template_name or new.dedupe_key is distinct from old.dedupe_key
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
