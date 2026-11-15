-- Future tab, step 1 (founder, 15 Nov 2026): the listings behind the Career Hub, Exam Portal and Schemes & Scholarships.
-- Government listings only for now. Nothing shows to a family until a person approves it in Control (review_state =
-- 'approved'); the weekly agent of step 2 will write only to content.future_candidates, never to a listing.
--
-- Tables
--   content.future_listings        one row per series and cycle (a recurring exam is cloned forward as 'expected').
--   content.future_sources         the source registry for the later weekly agent. No scraper exists yet.
--   content.future_candidates      what the agent proposes (new or changed), with a field-by-field diff, awaiting review.
--   content.future_apply_domains   official sites outside .gov.in .nic.in .ac.in .edu.in .res.in that Apply may open.
--                                  Each is OFF until the founder switches it on in Control.
-- content.hub_entries is untouched and keeps working.
--
-- Phase 1 stores a class and a state only: no caste, income or gender field exists. Nothing is ever deleted: a listing is
-- withdrawn or archived. No personal data.

create table content.future_listings (
  listing_id uuid primary key default gen_random_uuid(),
  -- The id in the seed file: makes the import idempotent (a second run changes nothing).
  seed_id text unique check (seed_id is null or length(seed_id) between 1 and 120),
  hub text not null check (hub in ('careers', 'exams_portal', 'opportunities')),
  category text not null check (category in ('entrance_exam', 'olympiad', 'board_exam', 'scholarship', 'central_scheme', 'state_scheme', 'admission', 'career', 'recruitment')),
  provider_type text not null check (provider_type in ('state', 'central', 'board_exam_body', 'institution')),
  provider text not null check (length(provider) between 1 and 200),
  series_key text not null check (length(series_key) between 1 and 120),
  cycle text not null check (length(cycle) between 1 and 40),
  title_en text not null check (length(title_en) between 1 and 220),
  title_hi text check (title_hi is null or length(title_hi) between 1 and 220),
  summary_en text check (summary_en is null or length(summary_en) <= 280),
  summary_hi text check (summary_hi is null or length(summary_hi) <= 280),
  eligibility_en text check (eligibility_en is null or length(eligibility_en) <= 1500),
  eligibility_hi text check (eligibility_hi is null or length(eligibility_hi) <= 1500),
  benefit_en text check (benefit_en is null or length(benefit_en) <= 1500),
  benefit_hi text check (benefit_hi is null or length(benefit_hi) <= 1500),
  fee_en text check (fee_en is null or length(fee_en) <= 500),
  fee_hi text check (fee_hi is null or length(fee_hi) <= 500),
  -- [{ "kind": "last_date", "date": "2026-12-02", "end": null, "approx": false, "quote": "..." }]
  key_dates jsonb not null default '[]' check (jsonb_typeof(key_dates) = 'array'),
  -- The last day to apply, for the countdown (null when the listing has no deadline, or its dates are not out yet).
  last_date date,
  -- [{ "en": "...", "hi": "..." }]: names of papers to keep ready, never a number or an upload.
  documents jsonb not null default '[]' check (jsonb_typeof(documents) = 'array'),
  -- [{ "en": "...", "hi": "..." }]
  prepare_steps jsonb not null default '[]' check (jsonb_typeof(prepare_steps) = 'array'),
  classes smallint[] not null default '{}',
  prepare_classes smallint[] not null default '{}',
  future_classes smallint[] not null default '{}',
  -- {'ALL'} for central, or state codes as the app stores them ('IN-DL', 'IN-HR').
  states text[] not null check (cardinality(states) >= 1 and states <@ array['ALL','IN-AN','IN-AP','IN-AR','IN-AS','IN-BR','IN-CH','IN-CT','IN-DH','IN-DL','IN-GA','IN-GJ','IN-HR','IN-HP','IN-JK','IN-JH','IN-KA','IN-KL','IN-LA','IN-LD','IN-MP','IN-MH','IN-MN','IN-ML','IN-MZ','IN-NL','IN-OR','IN-PY','IN-PB','IN-RJ','IN-SK','IN-TN','IN-TG','IN-TR','IN-UP','IN-UT','IN-WB']),
  apply_url text check (apply_url is null or (apply_url ~ '^https://[^[:space:]<>"]+$' and length(apply_url) <= 500)),
  apply_url_status text not null default 'unchecked' check (apply_url_status in ('unchecked', 'ok', 'redirected', 'broken', 'parked', 'off_domain')),
  apply_url_last_checked timestamptz,
  source_url text not null check (source_url ~ '^https://[^[:space:]<>"]+$' and length(source_url) <= 500),
  source_hash text,
  last_verified_at date not null,
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  notes text check (notes is null or length(notes) <= 2000),
  -- A yearly series: when its cycle ends the daily job copies it forward as 'expected' (pending review).
  recurring boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'expected', 'upcoming', 'open', 'closing_soon', 'closed', 'in_progress', 'archived', 'withdrawn')),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected', 'changes_flagged')),
  review_note text check (review_note is null or length(review_note) <= 1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (title_en !~ '[<>]' and coalesce(title_hi, '') !~ '[<>]'),
  check (classes <@ array[-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  check (prepare_classes <@ array[-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  check (future_classes <@ array[-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,12]::smallint[])
);
create index idx_future_listings_family on content.future_listings (hub, review_state, status);
create index idx_future_listings_series on content.future_listings (series_key, cycle);

-- Families read approved listings that are still alive (and ones the agent flagged for a changed value: the approved values stay live until a person decides). The app computes the status again from the dates on every read,
-- so a status the daily job has not yet moved on never shows a closed item as open.
alter table content.future_listings enable row level security;
alter table content.future_listings force row level security;
revoke all on content.future_listings from public, anon, authenticated, service_role, app_user;
create policy future_listings_family_read on content.future_listings as permissive for select to family_app
  using (review_state in ('approved', 'changes_flagged') and status in ('expected', 'upcoming', 'open', 'closing_soon', 'in_progress'));
create policy future_listings_family_only on content.future_listings as restrictive for all to family_app
  using (review_state in ('approved', 'changes_flagged') and status in ('expected', 'upcoming', 'open', 'closing_soon', 'in_progress')) with check (false);
grant select on content.future_listings to family_app;
grant select, insert, update on content.future_listings to nca_super;

-- The sites Apply may open beyond the built-in official suffixes. Off until the founder switches each one on.
create table content.future_apply_domains (
  domain text primary key check (domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'),
  enabled boolean not null default false,
  who_en text not null check (length(who_en) between 1 and 200),
  note text check (note is null or length(note) <= 500),
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table content.future_apply_domains enable row level security;
alter table content.future_apply_domains force row level security;
revoke all on content.future_apply_domains from public, anon, authenticated, service_role, app_user;
create policy future_apply_domains_family_read on content.future_apply_domains as permissive for select to family_app using (enabled);
create policy future_apply_domains_family_only on content.future_apply_domains as restrictive for all to family_app using (enabled) with check (false);
grant select on content.future_apply_domains to family_app;
grant select, insert, update on content.future_apply_domains to nca_super;
insert into content.future_apply_domains (domain, who_en) values
  ('bseh.org.in', 'Board of School Education Haryana'),
  ('nid.edu', 'National Institute of Design'),
  ('iiseradmission.in', 'IISER admissions (IAT)'),
  ('n-csc.in', 'DST National Children''s Science Congress'),
  ('academic.cbseit.in', 'CBSE registration portal'),
  ('registration.buniyaadhry.com', 'Haryana Super-100 and Mission Buniyaad partner registration portal'),
  ('iapt.org.in', 'Indian Association of Physics Teachers (HBCSE Stage 1 partner)');

-- The registry the weekly agent of step 2 will read. Nothing fetches from it in step 1.
create table content.future_sources (
  source_id uuid primary key default gen_random_uuid(),
  tier smallint not null check (tier between 1 and 3),
  owner_body text not null check (length(owner_body) between 1 and 200),
  state_code text check (state_code is null or state_code ~ '^IN-[A-Z]{2}$'),
  url text not null unique check (url ~ '^https://[^[:space:]<>"]+$' and length(url) <= 500),
  method text not null check (method in ('rss', 'html', 'pdf', 'api')),
  hints jsonb not null default '{}',
  crawl_interval_days smallint not null default 7 check (crawl_interval_days between 1 and 90),
  robots_ok boolean,
  enabled boolean not null default false,
  last_fetch_at timestamptz,
  last_hash text,
  failures integer not null default 0 check (failures >= 0),
  created_at timestamptz not null default now()
);
alter table content.future_sources enable row level security;
alter table content.future_sources force row level security;
revoke all on content.future_sources from public, anon, authenticated, service_role, app_user, family_app;
grant select, insert, update on content.future_sources to nca_super;

-- What the agent proposes: a new listing (listing_id null) or a change to one, with the diff against the live row.
-- diff: { "field": { "old": ..., "new": ..., "quote": "the source sentence" } }
create table content.future_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  listing_id uuid references content.future_listings (listing_id),
  source_id uuid references content.future_sources (source_id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  diff jsonb not null default '{}' check (jsonb_typeof(diff) = 'object'),
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  state text not null default 'pending' check (state in ('pending', 'accepted', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_future_candidates_state on content.future_candidates (state, created_at);
alter table content.future_candidates enable row level security;
alter table content.future_candidates force row level security;
revoke all on content.future_candidates from public, anon, authenticated, service_role, app_user, family_app;
grant select, insert, update on content.future_candidates to nca_super;

-- The only door for the agent: it hands over a candidate and nothing else. It cannot touch a listing.
create function content.future_submit_candidate(p_listing uuid, p_source uuid, p_payload jsonb, p_diff jsonb, p_confidence numeric)
returns uuid language plpgsql security definer set search_path = content, pg_temp as $$
declare v uuid;
begin
  if p_listing is not null and not exists (select 1 from content.future_listings where listing_id = p_listing) then
    raise exception 'unknown listing';
  end if;
  insert into content.future_candidates (listing_id, source_id, payload, diff, confidence)
  values (p_listing, p_source, p_payload, coalesce(p_diff, '{}'), p_confidence) returning candidate_id into v;
  -- A change to a live listing flags it for review; its old values stay live until a person decides.
  if p_listing is not null then
    update content.future_listings set review_state = 'changes_flagged', updated_at = now()
     where listing_id = p_listing and review_state = 'approved';
  end if;
  return v;
end $$;
revoke all on function content.future_submit_candidate(uuid, uuid, jsonb, jsonb, numeric) from public, anon, authenticated, service_role, app_user, family_app;
grant execute on function content.future_submit_candidate(uuid, uuid, jsonb, jsonb, numeric) to nca_super;

-- Parents may turn the two new kinds of Future message off, and the push marks may hold them.
alter table family.notify_off drop constraint notify_off_kind_check;
alter table family.notify_off add constraint notify_off_kind_check check (kind in ('homework', 'notices', 'results', 'tonight', 'future_deadline', 'future_new'));
alter table family.push_sent drop constraint push_sent_kind_check;
alter table family.push_sent add constraint push_sent_kind_check check (kind in ('homework', 'notices', 'results', 'tonight', 'future_deadline', 'future_new'));

-- The daily expiry (00:15 India = 18:45 UTC): one job a day, queued once, and only once the deployed runner can run it.
create function public.future_expire_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'future.expire', jsonb_build_object('date', t.d), 'future.expire:' || t.d, 4
    from (select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as d) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'future.expire')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.future_expire_enqueue() from public, anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('future-expire-daily', '45 18 * * *', 'select public.future_expire_enqueue()');
  end if;
end $$;
