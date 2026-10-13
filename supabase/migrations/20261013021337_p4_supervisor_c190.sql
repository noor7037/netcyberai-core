-- P4, supervisor's decisions on C183-C189 (C190).
--
-- 1. An interrupted send is UNCERTAIN, not failed: nobody knows whether it
--    went. It is never sent again. If the provider later says where a
--    message to that number got to, and it is the only uncertain message to
--    that number, the notice moves it forward.
-- 2. Nobody but the erasure function (to come, audited) removes a message
--    log row: DELETE is taken from the app's roles now.
-- 3. A guardian may have a language they prefer; the school has a default
--    (a setting); English otherwise. A template version in a language other
--    than English is sent only once a reader of that language has reviewed
--    its wording: a flag per version, with who and when.
-- 4. held_inbound: a message from a number that is a guardian's in more
--    than one school, none of which wrote to it in the last 24 hours. The
--    parent is asked which school it is about. Until they answer, their
--    words and number are kept ENCRYPTED (AES-256-GCM in the app, the
--    messaging key), for at most 24 hours; then the message is delivered to
--    the school chosen, or dropped, and the ciphertext is erased either way.
--    Only the platform role can read or write this table.

-- 1.
alter type comm_status add value if not exists 'uncertain';
create or replace function public.communication_log_forward_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  was text := old.status::text;
  now_is text := new.status::text;
  rank constant jsonb := '{"queued": 0, "uncertain": 1, "sent": 2, "delivered": 3, "read": 4}';
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
  if now_is = 'failed' and was in ('sent', 'uncertain') then
    return new;
  end if;
  if rank ? was and rank ? now_is and (rank ->> now_is)::int > (rank ->> was)::int then
    return new;
  end if;
  raise exception 'a message''s state only moves forward (% to % is refused)', was, now_is using errcode = 'check_violation';
end $$;

-- 2.
revoke delete on communication_log from app_user, nca_super;

-- 3.
alter table parents add column preferred_language text check (preferred_language is null or preferred_language in ('en', 'hi'));
alter table whatsapp_templates add column wording_reviewed boolean not null default false;
alter table whatsapp_templates add column wording_reviewed_by uuid;
alter table whatsapp_templates add column wording_reviewed_at timestamptz;
alter table whatsapp_templates add column wording_reviewed_note text check (wording_reviewed_note is null or char_length(btrim(wording_reviewed_note)) between 1 and 200);
alter table whatsapp_templates add constraint whatsapp_templates_review_says_who check (wording_reviewed = (wording_reviewed_by is not null) and wording_reviewed = (wording_reviewed_at is not null) and wording_reviewed = (wording_reviewed_note is not null));

-- 4.
create table held_inbound (
  held_id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stand-in', 'meta')),
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 200),
  phone_digest text not null check (phone_digest ~ '^[0-9a-f]{64}$'),
  school_ids uuid[] not null check (cardinality(school_ids) between 2 and 10),
  ciphertext text check (ciphertext is null or char_length(ciphertext) between 1 and 12000),
  iv text check (iv is null or char_length(iv) = 16),
  tag text check (tag is null or char_length(tag) = 24),
  key_version int check (key_version is null or key_version >= 1),
  received_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'held' check (status in ('held', 'delivered', 'dropped')),
  asked_at timestamptz,
  question_message_id text,
  chosen_school_id uuid references schools(school_id),
  reason text check (reason is null or char_length(reason) between 1 and 200),
  decided_at timestamptz,
  unique (provider, provider_message_id),
  check (expires_at > received_at and expires_at <= received_at + interval '24 hours'),
  -- The words are kept only while the question is open; once it is decided they are gone.
  check ((status = 'held') = (ciphertext is not null and iv is not null and tag is not null and key_version is not null)),
  check ((status = 'delivered') = (chosen_school_id is not null)),
  check ((status = 'held') = (decided_at is null)),
  check (status <> 'dropped' or reason is not null)
);
create unique index held_inbound_one_open_per_number on held_inbound (phone_digest) where status = 'held';
revoke all on held_inbound from public, anon, authenticated, service_role, app_user;
grant select, insert, update on held_inbound to nca_super;
alter table held_inbound enable row level security;
alter table held_inbound force row level security;
create policy held_inbound_nobody on held_inbound as restrictive for all using (false);
create policy held_inbound_platform on held_inbound for all to nca_super using (true) with check (true);
