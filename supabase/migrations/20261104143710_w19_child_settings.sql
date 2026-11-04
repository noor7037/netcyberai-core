-- W19-C: the child's own settings (read aloud, the tutor's face, motion, hands-free listening, voice speed), one row
-- per child, written from the child's Settings screen behind the family session only. No text the child typed, no
-- audio: a small object of on/off switches and one speed, checked by the server before it is written.
-- Own account only, twice (a permissive and a restrictive policy), and on a child's own phone that child only, like
-- every child-keyed family table (M1-1, Z1). The language stays on the child (family.children.language).
create table family.child_settings (
  account_id uuid not null,
  child_id uuid not null,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (child_id),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_child_settings_account on family.child_settings (account_id);

alter table family.child_settings enable row level security;
alter table family.child_settings force row level security;
revoke all on family.child_settings from public, anon, authenticated, app_user, nca_super;

create policy child_settings_own on family.child_settings as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_settings_own_only on family.child_settings as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_settings_one_child on family.child_settings as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

grant select, insert, update, delete on family.child_settings to family_app;
