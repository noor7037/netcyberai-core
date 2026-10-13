-- P4 slice 7b (C183): delivery states.
--
-- 1. webhook_events says what became of each notice: whether its signature
--    held, and what it did. A notice is stored once (payload_hash is unique)
--    and never changed.
-- 2. A message's state only moves forward: sent -> delivered -> read, or
--    sent -> failed. A notice that arrives late or out of order can never
--    move it back, and a message the gate held back (blocked_*) never
--    becomes sent by a notice. Held in the database, whoever writes. What a
--    message was (school, phone, template, its provider's id once given,
--    its trigger key) never changes either.

-- 1.
alter table webhook_events add column signature_ok boolean;
alter table webhook_events add column outcome text check (outcome is null or char_length(outcome) between 1 and 200);

-- 2.
create function public.communication_log_forward_only() returns trigger
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
  if now_is = was then
    return new;
  end if;
  if now_is = 'failed' and was in ('queued', 'sent') then
    return new;
  end if;
  if rank ? was and rank ? now_is and (rank ->> now_is)::int > (rank ->> was)::int then
    return new;
  end if;
  raise exception 'a message''s state only moves forward (% to % is refused)', was, now_is using errcode = 'check_violation';
end $$;
revoke all on function public.communication_log_forward_only() from public;
create trigger communication_log_forward_only before update on communication_log for each row execute function public.communication_log_forward_only();
