-- W4-3 (C387): the entries of the family app's three hubs (Career Hub, Exam Portal, Schemes & Scholarships), added in
-- Control → Content → Hubs. NetCyberAI staff write; nothing is ever deleted (an entry is withdrawn). No personal data.
--
-- Nothing shows without a source link and a day it was checked, and an entry expires at its review date: families read
-- only a published entry whose review day (India) has not passed. The columns hold the first two for every row.
--
-- Who reaches what: nca_super selects, inserts and updates (no delete); family_app selects the published, unexpired
-- entries only; app_user, anon, authenticated, service_role and public hold nothing.

create table content.hub_entries (
  entry_id uuid primary key default gen_random_uuid(),
  hub text not null check (hub in ('careers', 'exams_portal', 'opportunities')),
  title_en text not null check (length(title_en) between 1 and 160),
  title_hi text check (title_hi is null or length(title_hi) between 1 and 160),
  body_en text not null check (length(body_en) between 1 and 1200),
  body_hi text check (body_hi is null or length(body_hi) between 1 and 1200),
  scope text not null check (scope in ('national', 'state')),
  state_code text check (state_code is null or state_code ~ '^IN-[A-Z]{2}$'),
  class_from smallint not null check (class_from between -2 and 12),
  class_to smallint not null check (class_to between -2 and 12),
  source_url text not null check (source_url ~ '^https://[^[:space:]<>"]+$' and length(source_url) <= 500),
  verified_on date not null,
  review_on date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  check ((scope = 'state') = (state_code is not null)),
  check (class_from <= class_to),
  check (review_on > verified_on),
  check (title_en !~ '[<>]' and body_en !~ '[<>]' and coalesce(title_hi, '') !~ '[<>]' and coalesce(body_hi, '') !~ '[<>]')
);
create index idx_content_hub_entries_hub on content.hub_entries (hub, status, review_on);

alter table content.hub_entries enable row level security;
alter table content.hub_entries force row level security;
revoke all on content.hub_entries from public, anon, authenticated, service_role, app_user;

-- Families read the published entries that have not reached their review day (India date), and never write.
create policy hub_entries_family_read on content.hub_entries as permissive for select to family_app
  using (status = 'published' and review_on >= (now() at time zone 'Asia/Kolkata')::date);
create policy hub_entries_family_only on content.hub_entries as restrictive for all to family_app
  using (status = 'published' and review_on >= (now() at time zone 'Asia/Kolkata')::date) with check (false);
grant select on content.hub_entries to family_app;
-- Control (nca_super bypasses row security; these grants are its only rights here): no delete.
grant select, insert, update on content.hub_entries to nca_super;
