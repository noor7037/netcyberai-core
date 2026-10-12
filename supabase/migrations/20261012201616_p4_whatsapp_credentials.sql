-- P4 slice 7e (C186): the platform's WhatsApp account.
--
-- One number serves every school (docs/25 §5). Its credentials are held as
-- payment credentials are: encrypted in the app (AES-256-GCM, the key in
-- the server's environment), one row, write-only. The phone number id and
-- the business account id are not secrets and are kept in the clear so the
-- founder can see which account is connected. `enabled` is the switch: off
-- when saved, on only after a connection test has passed, and off again
-- whenever the credentials are replaced.
--
-- No school role has any right here: only the platform role reads or
-- writes, and row level security is forced with no policy for anyone else.
create table whatsapp_credentials (
  provider text primary key check (provider = 'meta'),
  phone_number_id text not null check (phone_number_id ~ '^[0-9]{5,30}$'),
  waba_id text not null check (waba_id ~ '^[0-9]{5,30}$'),
  ciphertext text not null check (char_length(ciphertext) between 1 and 8000),
  iv text not null check (char_length(iv) = 16),
  tag text not null check (char_length(tag) = 24),
  key_version int not null check (key_version >= 1),
  token_last4 text not null check (char_length(token_last4) = 4),
  enabled boolean not null default false,
  saved_by uuid not null,
  saved_at timestamptz not null default now(),
  tested_at timestamptz,
  test_ok boolean,
  test_message text check (test_message is null or char_length(test_message) <= 200),
  enabled_by uuid,
  enabled_at timestamptz,
  check ((tested_at is null) = (test_ok is null)),
  -- Switched on only after a test that passed.
  check (enabled = false or test_ok is true)
);
revoke all on whatsapp_credentials from public, anon, authenticated, service_role, app_user;
grant select, insert, update on whatsapp_credentials to nca_super;
alter table whatsapp_credentials enable row level security;
alter table whatsapp_credentials force row level security;
create policy whatsapp_credentials_nobody on whatsapp_credentials as restrictive for all using (false);
create policy whatsapp_credentials_platform on whatsapp_credentials for all to nca_super using (true) with check (true);
