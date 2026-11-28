-- C557: the parent's Tech & AI Lab choices for one child, from the parent area (the English course's per-child pattern,
-- family.english_enrolments): the class the course is shown for (null: the child's own class) and the topic areas
-- switched off (hidden from the child; their lessons and progress are kept, nothing is deleted).
create table family.tech_settings (
  account_id uuid not null,
  child_id uuid primary key,
  course_class smallint check (course_class is null or course_class between -2 and 12),
  strands_off text[] not null default '{}' check (cardinality(strands_off) <= 15 and strands_off <@ array['hw', 'elec', 'os', 'sw', 'prog', 'web', 'net', 'cloud', 'data', 'cyber', 'robo', 'ai', 'ds', 'cit', 'career']::text[]),
  updated_at timestamptz not null default now(),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_tech_settings_account on family.tech_settings (account_id);
alter table family.tech_settings enable row level security;
alter table family.tech_settings force row level security;
revoke all on family.tech_settings from public, anon, authenticated, app_user, nca_super;
create policy tech_settings_own on family.tech_settings as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy tech_settings_own_only on family.tech_settings as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy tech_settings_one_child on family.tech_settings as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);
grant select, insert, update on family.tech_settings to family_app;
