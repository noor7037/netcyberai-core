-- Career Hub (15 Nov 2026). Separate from Step 1 future_listings.
-- Every content row starts pending. Families read a row only when it is approved and its review day
-- is not more than 180 days past (India). Approval does not require a fetched source: basis is
-- general_knowledge and the official site is optional. Nothing is deleted.

create table content.career_fields (
  field_id text primary key check (field_id ~ '^[a-z0-9_]+$' and length(field_id) <= 40),
  name_en text not null check (length(name_en) between 1 and 80 and name_en !~ '[<>]'),
  name_hi text not null check (length(name_hi) between 1 and 80 and name_hi !~ '[<>]'),
  sort smallint not null,
  basis text not null default 'general_knowledge' check (basis in ('general_knowledge', 'official')),
  official_url text check (official_url is null or (official_url ~ '^https://[^[:space:]<>"]+$' and length(official_url) <= 500)),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or (length(reject_reason) between 1 and 400 and reject_reason !~ '[<>]')),
  review_due date not null,
  content_hash text not null check (length(content_hash) = 64),
  import_batch text check (import_batch is null or length(import_batch) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

create table content.careers (
  career_id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$' and length(slug) <= 80),
  field_id text not null references content.career_fields (field_id),
  title_en text not null check (length(title_en) between 1 and 160 and title_en !~ '[<>]'),
  title_hi text not null check (length(title_hi) between 1 and 160 and title_hi !~ '[<>]'),
  summary_en text not null check (length(summary_en) between 1 and 800 and summary_en !~ '[<>]'),
  summary_hi text not null check (length(summary_hi) between 1 and 800 and summary_hi !~ '[<>]'),
  level text not null check (level in ('entry', 'skilled', 'supervisor', 'professional', 'senior', 'top')),
  nco2015_code text check (nco2015_code is null or length(nco2015_code) <= 40),
  isco08_code text check (isco08_code is null or isco08_code ~ '^[0-9]{4}$'),
  onet_soc_code text check (onet_soc_code is null or length(onet_soc_code) <= 20),
  min_level text not null check (min_level in ('class10', 'class12_sci_pcm', 'class12_sci_pcb', 'class12_commerce', 'class12_arts', 'class12_vocational', 'iti', 'diploma', 'ug', 'pg', 'phd')),
  gov_group text check (gov_group is null or gov_group in ('D', 'C', 'B', 'A')),
  streams text[] not null check (cardinality(streams) >= 1 and streams <@ array['science-pcm', 'science-pcb', 'commerce', 'arts', 'vocational']::text[]),
  horizon_en text check (horizon_en is null or (length(horizon_en) between 1 and 400 and horizon_en !~ '[<>]')),
  horizon_hi text check (horizon_hi is null or (length(horizon_hi) between 1 and 400 and horizon_hi !~ '[<>]')),
  compete_en text not null check (length(compete_en) between 1 and 1500 and compete_en !~ '[<>]'),
  compete_hi text not null check (length(compete_hi) between 1 and 1500 and compete_hi !~ '[<>]'),
  basis text not null default 'general_knowledge' check (basis in ('general_knowledge', 'official')),
  official_url text check (official_url is null or (official_url ~ '^https://[^[:space:]<>"]+$' and length(official_url) <= 500)),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or (length(reject_reason) between 1 and 400 and reject_reason !~ '[<>]')),
  review_due date not null,
  content_hash text not null check (length(content_hash) = 64),
  import_batch text check (import_batch is null or length(import_batch) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
create index idx_content_careers_field on content.careers (field_id, level, review_state);

create table content.career_steps (
  step_id uuid primary key default gen_random_uuid(),
  step_key text not null unique check (length(step_key) between 1 and 120),
  career_id uuid not null references content.careers (career_id),
  lane text not null check (lane in ('after_10', 'entrance', 'bachelor', 'first_job', 'years')),
  sort smallint not null check (sort between 1 and 20),
  requirement_en text not null check (length(requirement_en) between 1 and 900 and requirement_en !~ '[<>]'),
  requirement_hi text not null check (length(requirement_hi) between 1 and 900 and requirement_hi !~ '[<>]'),
  exam_name_en text check (exam_name_en is null or (length(exam_name_en) between 1 and 120 and exam_name_en !~ '[<>]')),
  exam_name_hi text check (exam_name_hi is null or (length(exam_name_hi) between 1 and 120 and exam_name_hi !~ '[<>]')),
  future_series_key text check (future_series_key is null or (length(future_series_key) between 1 and 80 and future_series_key !~ '[<>]')),
  basis text not null default 'general_knowledge' check (basis in ('general_knowledge', 'official')),
  official_url text check (official_url is null or (official_url ~ '^https://[^[:space:]<>"]+$' and length(official_url) <= 500)),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or (length(reject_reason) between 1 and 400 and reject_reason !~ '[<>]')),
  review_due date not null,
  content_hash text not null check (length(content_hash) = 64),
  import_batch text check (import_batch is null or length(import_batch) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
create index idx_content_career_steps_career on content.career_steps (career_id, lane, sort);

create table content.career_parallel_actions (
  action_id uuid primary key default gen_random_uuid(),
  action_key text not null unique check (length(action_key) between 1 and 200),
  career_id uuid not null references content.careers (career_id),
  stage text not null check (stage in ('during_10', 'during_12', 'during_bachelor')),
  type text not null check (type in ('skill', 'project', 'competition', 'olympiad', 'hackathon', 'certification', 'internship', 'apprenticeship', 'portfolio')),
  title_en text not null check (length(title_en) between 1 and 160 and title_en !~ '[<>]'),
  title_hi text not null check (length(title_hi) between 1 and 160 and title_hi !~ '[<>]'),
  detail_en text not null check (length(detail_en) between 1 and 800 and detail_en !~ '[<>]'),
  detail_hi text not null check (length(detail_hi) between 1 and 800 and detail_hi !~ '[<>]'),
  effort text not null check (effort in ('light', 'medium', 'heavy')),
  cost text not null check (cost in ('free', 'paid', 'mixed')),
  basis text not null default 'general_knowledge' check (basis in ('general_knowledge', 'official')),
  official_url text check (official_url is null or (official_url ~ '^https://[^[:space:]<>"]+$' and length(official_url) <= 500)),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or (length(reject_reason) between 1 and 400 and reject_reason !~ '[<>]')),
  review_due date not null,
  content_hash text not null check (length(content_hash) = 64),
  import_batch text check (import_batch is null or length(import_batch) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
create index idx_content_career_actions_career on content.career_parallel_actions (career_id, stage);

create table content.career_cross_pathways (
  cross_id uuid primary key default gen_random_uuid(),
  cross_key text not null unique check (length(cross_key) between 1 and 80),
  via_en text not null check (length(via_en) between 1 and 300 and via_en !~ '[<>]'),
  via_hi text not null check (length(via_hi) between 1 and 300 and via_hi !~ '[<>]'),
  conditions_en text not null check (length(conditions_en) between 1 and 900 and conditions_en !~ '[<>]'),
  conditions_hi text not null check (length(conditions_hi) between 1 and 900 and conditions_hi !~ '[<>]'),
  streams text[] not null check (streams <@ array['science-pcm', 'science-pcb', 'commerce', 'arts', 'vocational']::text[]),
  to_slugs text[] not null,
  any_graduate boolean not null default false,
  basis text not null default 'general_knowledge' check (basis in ('general_knowledge', 'official')),
  official_url text check (official_url is null or (official_url ~ '^https://[^[:space:]<>"]+$' and length(official_url) <= 500)),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or (length(reject_reason) between 1 and 400 and reject_reason !~ '[<>]')),
  review_due date not null,
  content_hash text not null check (length(content_hash) = 64),
  import_batch text check (import_batch is null or length(import_batch) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

create table content.career_lateral_routes (
  route_id uuid primary key default gen_random_uuid(),
  route_key text not null unique check (length(route_key) between 1 and 80),
  from_kind text not null check (from_kind in ('portfolio', 'skills', 'experience', 'certification', 'apprenticeship')),
  detail_en text not null check (length(detail_en) between 1 and 400 and detail_en !~ '[<>]'),
  detail_hi text not null check (length(detail_hi) between 1 and 400 and detail_hi !~ '[<>]'),
  example_en text not null check (length(example_en) between 1 and 500 and example_en !~ '[<>]'),
  example_hi text not null check (length(example_hi) between 1 and 500 and example_hi !~ '[<>]'),
  to_slug text not null references content.careers (slug),
  min_experience_years numeric check (min_experience_years is null or min_experience_years >= 0),
  degree_required boolean,
  basis text not null default 'general_knowledge' check (basis in ('general_knowledge', 'official')),
  official_url text check (official_url is null or (official_url ~ '^https://[^[:space:]<>"]+$' and length(official_url) <= 500)),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or (length(reject_reason) between 1 and 400 and reject_reason !~ '[<>]')),
  review_due date not null,
  content_hash text not null check (length(content_hash) = 64),
  import_batch text check (import_batch is null or length(import_batch) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

create table content.career_region_notes (
  note_id uuid primary key default gen_random_uuid(),
  note_key text not null unique check (length(note_key) between 1 and 80),
  career_id uuid not null references content.careers (career_id),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  framework text not null check (length(framework) between 1 and 40),
  framework_code text check (framework_code is null or length(framework_code) <= 40),
  note_en text not null check (length(note_en) between 1 and 800 and note_en !~ '[<>]'),
  note_hi text not null check (length(note_hi) between 1 and 800 and note_hi !~ '[<>]'),
  basis text not null default 'general_knowledge' check (basis in ('general_knowledge', 'official')),
  official_url text check (official_url is null or (official_url ~ '^https://[^[:space:]<>"]+$' and length(official_url) <= 500)),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or (length(reject_reason) between 1 and 400 and reject_reason !~ '[<>]')),
  review_due date not null,
  content_hash text not null check (length(content_hash) = 64),
  import_batch text check (import_batch is null or length(import_batch) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

-- Family read: approved, and not more than 180 days past the review day. No writes. No deletes.
alter table content.career_fields enable row level security;
alter table content.career_fields force row level security;
revoke all on content.career_fields from public, anon, authenticated, service_role, app_user;
create policy career_fields_family_read on content.career_fields as permissive for select to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180);
create policy career_fields_family_only on content.career_fields as restrictive for all to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180) with check (false);
grant select on content.career_fields to family_app;
grant select, insert, update on content.career_fields to nca_super;

alter table content.careers enable row level security;
alter table content.careers force row level security;
revoke all on content.careers from public, anon, authenticated, service_role, app_user;
create policy careers_family_read on content.careers as permissive for select to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180);
create policy careers_family_only on content.careers as restrictive for all to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180) with check (false);
grant select on content.careers to family_app;
grant select, insert, update on content.careers to nca_super;

alter table content.career_steps enable row level security;
alter table content.career_steps force row level security;
revoke all on content.career_steps from public, anon, authenticated, service_role, app_user;
create policy career_steps_family_read on content.career_steps as permissive for select to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180);
create policy career_steps_family_only on content.career_steps as restrictive for all to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180) with check (false);
grant select on content.career_steps to family_app;
grant select, insert, update on content.career_steps to nca_super;

alter table content.career_parallel_actions enable row level security;
alter table content.career_parallel_actions force row level security;
revoke all on content.career_parallel_actions from public, anon, authenticated, service_role, app_user;
create policy career_parallel_actions_family_read on content.career_parallel_actions as permissive for select to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180);
create policy career_parallel_actions_family_only on content.career_parallel_actions as restrictive for all to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180) with check (false);
grant select on content.career_parallel_actions to family_app;
grant select, insert, update on content.career_parallel_actions to nca_super;

alter table content.career_cross_pathways enable row level security;
alter table content.career_cross_pathways force row level security;
revoke all on content.career_cross_pathways from public, anon, authenticated, service_role, app_user;
create policy career_cross_pathways_family_read on content.career_cross_pathways as permissive for select to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180);
create policy career_cross_pathways_family_only on content.career_cross_pathways as restrictive for all to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180) with check (false);
grant select on content.career_cross_pathways to family_app;
grant select, insert, update on content.career_cross_pathways to nca_super;

alter table content.career_lateral_routes enable row level security;
alter table content.career_lateral_routes force row level security;
revoke all on content.career_lateral_routes from public, anon, authenticated, service_role, app_user;
create policy career_lateral_routes_family_read on content.career_lateral_routes as permissive for select to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180);
create policy career_lateral_routes_family_only on content.career_lateral_routes as restrictive for all to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180) with check (false);
grant select on content.career_lateral_routes to family_app;
grant select, insert, update on content.career_lateral_routes to nca_super;

alter table content.career_region_notes enable row level security;
alter table content.career_region_notes force row level security;
revoke all on content.career_region_notes from public, anon, authenticated, service_role, app_user;
create policy career_region_notes_family_read on content.career_region_notes as permissive for select to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180);
create policy career_region_notes_family_only on content.career_region_notes as restrictive for all to family_app
  using (review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180) with check (false);
grant select on content.career_region_notes to family_app;
grant select, insert, update on content.career_region_notes to nca_super;
