-- M3-8a (C338; 07 "M3, the rest", M3-8; the supervisor's answer 1 in C230-AD: until Firebase exists, Web Push and
-- unread counts): what is new from a connected school, counted in the app.
--
-- 1. family.school_seen: when the parent last looked at each kind of the school's news (homework, notices, results)
--    for one link. What is new is counted when it is read, as the guardian (src/lib/school-link, readSchoolNews), from
--    what the school's own rules already let that guardian see; nothing of the school's is copied here.
-- 2. family.notify_off: the kinds the parent turned off (homework, notices, results, tonight). An off kind is not
--    counted, and is never pushed (M3-8b).
-- Both the family's own rows: row level security enabled and forced, the account's own rows only.

create table family.school_seen (
  account_id uuid not null,
  link_id uuid not null references family.school_links (link_id) on delete cascade,
  kind text not null check (kind in ('homework', 'notices', 'results')),
  seen_at timestamptz not null,
  primary key (account_id, link_id, kind)
);
create table family.notify_off (
  account_id uuid not null references family.accounts (account_id) on delete cascade,
  kind text not null check (kind in ('homework', 'notices', 'results', 'tonight')),
  off_at timestamptz not null default now(),
  primary key (account_id, kind)
);
alter table family.school_seen enable row level security;
alter table family.school_seen force row level security;
alter table family.notify_off enable row level security;
alter table family.notify_off force row level security;
revoke all on family.school_seen, family.notify_off from public, anon, authenticated, app_user, nca_super;
create policy school_seen_own on family.school_seen as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy school_seen_own_only on family.school_seen as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy notify_off_own on family.notify_off as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy notify_off_own_only on family.notify_off as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, update, delete on family.school_seen, family.notify_off to family_app;
