-- F1-1 (C257): signing in like a modern app.
--
-- 1. trusted_devices: "Trust this browser for 30 days". One row per browser or app a person ticked it on, bound to the
--    person and to what that browser proved: 'authenticator' (it passed the authenticator app's code) or 'email' (it
--    passed an emailed code). The browser holds a signed token naming the row (src/lib/auth/devices.ts); the row is
--    what makes it count, so "forget" works from any device, and the account page lists them. A row ends when it
--    expires (30 days, never lengthened), is forgotten, or the person changes their password or signs out everywhere.
--    Kept exactly like `sessions`: no row level security, reachable only through app_backend's own grant, and nobody
--    else's (the same revokes as 20260917090000 and the sessions fix).
-- 2. sessions.persistent: "Keep me signed in". On (the default), the session renews itself while used and ends after
--    30 days without use. Off, its cookies end when the browser closes, and the server ends it after 12 hours without
--    use (src/lib/auth/refresh.ts).

create table trusted_devices (
  device_id    uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(user_id) on delete cascade,
  proof        text not null check (proof in ('authenticator', 'email')),
  label        text not null check (char_length(label) between 1 and 80),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index idx_trusted_devices_user on trusted_devices(user_id) where revoked_at is null;

grant select, insert, update on trusted_devices to app_backend;
alter table trusted_devices disable row level security;
revoke select, insert, update, delete on trusted_devices from app_user, nca_super;
revoke select, insert, update, delete, truncate, references, trigger on trusted_devices from anon, authenticated;

alter table sessions add column persistent boolean not null default true;
