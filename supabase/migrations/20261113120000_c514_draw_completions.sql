-- C514, the syllabus-linked drawing templates.
--
-- family.draw_completions: a template a child finished (the child's own tap on Done), one row per child per template, so
-- the parent's view and the weekly report can count completed templates. Ids and a time only: never the drawing, a
-- score or any text. Own account only, twice (a permissive and a restrictive policy), and on a child's own phone that
-- child only, like every child-keyed family table (M1-1, Z1). Removed with the child (the foreign key cascades).
--
-- family.child_settings.draw_open: the parent's "Allow all drawing activities" for the child (default off: the templates
-- that need a parent stay locked). A column, not a key of the child's own settings object, so the child's Settings
-- screen (which writes only `settings`) cannot turn it on; it is written by a parent-mode route only. The table's own
-- policies already hold it to its account and child.

create table family.draw_completions (
  account_id uuid not null,
  child_id uuid not null,
  template_id text not null check (template_id ~ '^[a-z0-9][a-z0-9.-]{2,79}$'),
  completed_at timestamptz not null default now(),
  primary key (child_id, template_id),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_draw_completions_account on family.draw_completions (account_id, completed_at);

alter table family.draw_completions enable row level security;
alter table family.draw_completions force row level security;
revoke all on family.draw_completions from public, anon, authenticated, app_user, nca_super;

create policy draw_completions_own on family.draw_completions as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy draw_completions_own_only on family.draw_completions as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy draw_completions_one_child on family.draw_completions as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

grant select, insert, delete on family.draw_completions to family_app;

alter table family.child_settings add column draw_open boolean not null default false;
