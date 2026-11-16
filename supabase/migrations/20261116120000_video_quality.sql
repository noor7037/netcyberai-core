-- The video finder's quality pass (Noor, 16 Nov 2026). No child's data anywhere in this file: videos, channels and
-- scores only.
--
-- content.video_channels.no_ads: Control marks a channel that runs no ads on its videos; the finder ranks it first. Ads
-- are never stripped or blocked in code: the embed is YouTube's own privacy-enhanced player.
--
-- content.video_picks.promo_share: the share of a video SponsorBlock's community marked as sponsor, self-promotion or
-- "subscribe" segments (0 to 1), kept with the pick so the next read needs no lookup; null when unknown. A video above
-- 0.15 is never kept. content.save_video_picks is replaced to save it (and nothing else changes in it).
--
-- content.curated_topic_videos: videos a person chose per class, subject and topic (seeded from the reviewed topic map
-- by scripts/seed_curated_videos.ts). The finder shows a matching one first, after the same live checks as any video
-- (embedding, privacy, age restriction, paid placement). Families read it only through content.curated_videos.
--
-- content.video_reviews: Gemini's one review of each video ever (src/lib/family/video-review.ts), keyed by the video.
-- A video judged below 4 for child safety or below 3 for accuracy is never shown (content.video_hidden). Written only by
-- the platform role; Control's Re-review deletes the row and asks again.
--
-- Settings: family.video_min_views (the fewest views a found video may have) and family.video_reviews_per_day (the
-- most videos Gemini reviews in an India day). The review's AI profile, family.video_review, defaults to Gemini.

alter table content.video_channels add column no_ads boolean not null default false;

alter table content.video_picks add column promo_share real check (promo_share is null or (promo_share >= 0 and promo_share <= 1));

create or replace function content.save_video_picks(p_topic text, p_language text, p_picks jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) > 5 then
    raise exception 'bad picks' using errcode = 'check_violation';
  end if;
  delete from content.video_picks where topic_key = p_topic and language = p_language and status = 'auto';
  insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, start_s, captions, score, promo_share)
  select p_topic, p_language, x.video_id, x.channel_id, x.channel_title, x.title, x.duration_s, coalesce(x.start_s, 0), x.captions, x.score, x.promo_share
    from jsonb_to_recordset(p_picks) as x(video_id text, channel_id text, channel_title text, title text, duration_s integer, start_s integer, captions boolean, score real, promo_share real)
   where not exists (select 1 from content.video_picks p where p.topic_key = p_topic and p.language = p_language and p.video_id = x.video_id)
     and not exists (select 1 from content.video_channels c where c.channel_id = x.channel_id and c.kind = 'blocked')
  -- Two requests saving the same topic at once: the second keeps what the first wrote.
  on conflict (topic_key, language, video_id) do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function content.save_video_picks(text, text, jsonb) from public;
grant execute on function content.save_video_picks(text, text, jsonb) to family_app, nca_super;

create table content.curated_topic_videos (
  curated_id bigint generated always as identity primary key,
  channel_id text not null check (channel_id ~ '^[A-Za-z0-9_-]{2,40}$'),
  -- As the topic map gives it: a class ("7"), a range ("6-12") or a pre-school stage ("LKG-UKG").
  class text not null check (length(class) between 1 and 20),
  subject text not null check (length(subject) between 1 and 80),
  chapter_number text not null default '' check (length(chapter_number) <= 20),
  chapter_name text not null default '' check (length(chapter_name) <= 200),
  topic text not null check (length(topic) between 1 and 200),
  question_type text not null default '' check (length(question_type) <= 40),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (length(title) between 1 and 300),
  url text not null check (url ~ '^https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]{11}'),
  duration_s integer not null check (duration_s between 1 and 36000),
  language text not null check (language in ('en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as')),
  active boolean not null default true,
  added_at timestamptz not null default now(),
  unique (video_id, topic, language)
);
create index idx_content_curated_topic_videos_language on content.curated_topic_videos (language) where active;
alter table content.curated_topic_videos enable row level security;
alter table content.curated_topic_videos force row level security;
revoke all on content.curated_topic_videos from public, anon, authenticated, app_user;
grant select, insert, update, delete on content.curated_topic_videos to nca_super;

-- The active curated videos in one language, for the finder (the class, subject and topic are matched in code).
create function content.curated_videos(p_language text)
returns table (video_id text, channel_id text, class text, subject text, chapter_name text, topic text, title text, duration_s integer)
language sql stable security definer set search_path = '' as $$
  select c.video_id, c.channel_id, c.class, c.subject, c.chapter_name, c.topic, c.title, c.duration_s
    from content.curated_topic_videos c
   where c.active and c.language = p_language
   order by c.curated_id
   limit 2000
$$;
revoke all on function content.curated_videos(text) from public;
grant execute on function content.curated_videos(text) to family_app, nca_super;

create table content.video_reviews (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  accuracy smallint not null check (accuracy between 1 and 5),
  clarity smallint not null check (clarity between 1 and 5),
  class_fit smallint not null check (class_fit between 1 and 5),
  clickbait smallint not null check (clickbait between 1 and 5),
  child_safety smallint not null check (child_safety between 1 and 5),
  reason text not null default '' check (length(reason) <= 200),
  model text not null check (model ~ '^[A-Za-z0-9._:/-]{1,80}$'),
  reviewed_at timestamptz not null default now()
);
create index idx_content_video_reviews_at on content.video_reviews (reviewed_at);
alter table content.video_reviews enable row level security;
alter table content.video_reviews force row level security;
revoke all on content.video_reviews from public, anon, authenticated, app_user;
grant select, insert, update, delete on content.video_reviews to nca_super;

-- Whether Gemini's review hides a video (below 4 for child safety, below 3 for accuracy). No review: not hidden.
create function content.video_hidden(p_video_id text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from content.video_reviews r where r.video_id = p_video_id and (r.child_safety < 4 or r.accuracy < 3))
$$;
revoke all on function content.video_hidden(text) from public;
grant execute on function content.video_hidden(text) to family_app, nca_super;

insert into control.settings (key, value) values
  ('family.video_min_views', '5000'::jsonb),
  ('family.video_reviews_per_day', '100'::jsonb)
on conflict (key) do nothing;

-- The video judge: Gemini by default (only Gemini can watch a YouTube address). It is sent a public video's address,
-- never a child's words. Control may switch it off or change its model.
insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, carries_child_words, max_output_tokens)
values ('family.video_review', 'gemini', 'gemini-3.8-flash', 'v1', false, 400)
on conflict (profile_id) do nothing;
