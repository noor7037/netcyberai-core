-- Curated simulations (Noor, 16 Nov 2026): the "Try it yourself" card in step 4 of an answer. The AI never searches the web for a
-- simulation: a person approved each one here, per class, subject, chapter, topic and language, after the page was fetched and
-- found to load and to allow embedding (scripts/sims/build_sims_csv.mjs, scripts/seed_curated_sims.ts). No child's data anywhere
-- in this file. Built like content.curated_topic_videos (20261116120000_video_quality.sql): row level security forced, the table
-- readable only by the platform role, families read the approved rows only through content.curated_sims().
--
-- source: which site the simulation is from (src/lib/family/sim-hosts.ts lists the hosts the app will embed).
-- embed_url / page_url: https addresses on that source's own host (the app checks them again before it draws a card).
-- preview: one of our own small pictures (/sims/<name>.jpg), so no third-party picture loads before a child taps; null: a drawn card.
-- approved: Control's switch for one row.

create table content.curated_topic_sims (
  sim_id bigint generated always as identity primary key,
  -- As the topic map gives it: a class ("7"), a range ("6-12") or a pre-school stage ("LKG-UKG").
  class text not null check (length(class) between 1 and 20),
  subject text not null check (length(subject) between 1 and 80),
  chapter_number text not null default '' check (length(chapter_number) <= 20),
  chapter_name text not null default '' check (length(chapter_name) <= 200),
  topic text not null check (length(topic) between 1 and 200),
  language text not null check (language in ('en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as')),
  source text not null check (source in ('phet', 'geogebra', 'nasa_eyes', 'hhmi', 'labxchange', 'concord', 'desmos', 'smithsonian3d', 'googlearts', 'wolfram')),
  title text not null check (length(title) between 1 and 160),
  embed_url text not null check (embed_url ~ '^https://[a-z0-9.-]+/[^[:space:]]*$' and length(embed_url) <= 600),
  page_url text not null check (page_url ~ '^https://[a-z0-9.-]+/[^[:space:]]*$' and length(page_url) <= 600),
  licence text not null default '' check (length(licence) <= 160),
  preview text check (preview is null or preview ~ '^/sims/[a-z0-9-]{2,80}\.jpg$'),
  approved boolean not null default true,
  added_at timestamptz not null default now(),
  unique (embed_url, class, subject, topic, language)
);
create index idx_content_curated_topic_sims_language on content.curated_topic_sims (language) where approved;
alter table content.curated_topic_sims enable row level security;
alter table content.curated_topic_sims force row level security;
revoke all on content.curated_topic_sims from public, anon, authenticated, app_user;
grant select, insert, update, delete on content.curated_topic_sims to nca_super;

-- The approved simulations in one language, for the answer's step 4 (the class, subject and topic are matched in code).
create function content.curated_sims(p_language text)
returns table (class text, subject text, chapter_name text, topic text, source text, title text, embed_url text, page_url text, licence text, preview text)
language sql stable security definer set search_path = '' as $$
  select c.class, c.subject, c.chapter_name, c.topic, c.source, c.title, c.embed_url, c.page_url, c.licence, c.preview
    from content.curated_topic_sims c
   where c.approved and c.language = p_language
   order by c.sim_id
   limit 3000
$$;
revoke all on function content.curated_sims(text) from public;
grant execute on function content.curated_sims(text) to family_app, nca_super;
