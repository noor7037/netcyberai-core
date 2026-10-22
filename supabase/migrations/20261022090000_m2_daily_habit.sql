-- M2, the daily habit (docs/family-app/07 §1; 11 L3, L4, L5, L8, R7, R9; Decision Log C275; slice M2-1).
--
-- family: the mastery loop's returns to a topic (revisits), the day's plan (built once a day and kept steady; done when
-- every item has a checked answer that day), the parent's reward jar, the per-day counts behind the photo and voice
-- caps, and each child's weekly goal. Own account only, twice (a permissive and a restrictive policy), like every family
-- table (M1-1). No photo, no audio and no text a child typed is kept in any of them.
--
-- content: the video finder's picks per topic and language, the channels it searches first, and the day's search
-- count. No personal data. Families read the picks; they write them only through two narrow functions that the server
-- calls with what the video provider returned, never with anything a phone sent.
--
-- control: M2's settings, the YouTube provider (its key is sealed like an AI key, 10 §3), and the homework helper and
-- voice input profiles, off until Control chooses a provider cleared for minors.

-- ---- family -------------------------------------------------------------------------------------------------------

-- A wrong answer brings the topic back after 3 and 10 days (Control settings; 02 §4.2). Step 1 is the first return,
-- step 2 the second. A return is done by a checked answer on the topic on or after its day.
create table family.revisits (
  account_id uuid not null,
  child_id uuid not null,
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  step smallint not null check (step in (1, 2)),
  set_on date not null,
  due_on date not null,
  done_on date,
  primary key (child_id, topic_key, step),
  check (due_on > set_on),
  check (done_on is null or done_on >= set_on),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_revisits_due on family.revisits (child_id, due_on) where done_on is null;
create index idx_family_revisits_account on family.revisits (account_id);

-- The day's plan (11 L5): due returns, then weak topics, then the next topic of the syllabus, within the minutes Control
-- sets. Built the first time the day is asked for and kept for the day, so it does not move while the child works; the
-- next day is built fresh from that day, so missed days never pile up. Done when every item has a checked answer that
-- day (the Focus Lock reads this in M2b).
create table family.plan_days (
  account_id uuid not null,
  child_id uuid not null,
  day date not null,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 12),
  minutes smallint not null check (minutes between 0 and 90),
  completed_at timestamptz,
  primary key (child_id, day),
  check (completed_at is null or jsonb_array_length(items) > 0),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_plan_days_account on family.plan_days (account_id);

-- The family reward jar (11 R7): the parent writes the reward and the number of plan days that fill it; the parent
-- gives it. NetCyberAI never holds or moves money. One open jar per child.
create table family.reward_jars (
  jar_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  reward text not null check (length(reward) between 1 and 80),
  target_days smallint not null check (target_days between 3 and 60),
  started_on date not null,
  filled_on date,
  given_on date,
  created_at timestamptz not null default now(),
  check (filled_on is null or filled_on >= started_on),
  check (given_on is null or filled_on is not null),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create unique index uq_family_reward_jar_open on family.reward_jars (child_id) where given_on is null;
create index idx_family_reward_jars_account on family.reward_jars (account_id);

-- Per child per India day: photo questions asked (the homework helper's cap, 11 L3) and seconds of voice input (a
-- question spoken instead of typed; the English course's voice practice keeps its own cap in family.english_days).
create table family.day_counts (
  account_id uuid not null,
  child_id uuid not null,
  day date not null,
  photo_questions smallint not null default 0 check (photo_questions between 0 and 1000),
  voice_seconds integer not null default 0 check (voice_seconds between 0 and 86400),
  primary key (child_id, day),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_day_counts_account on family.day_counts (account_id);

-- The parent's weekly goal: days in seven with the plan done (11 R7: a goal, never a streak).
alter table family.children add column weekly_goal smallint not null default 5 check (weekly_goal between 1 and 7);
grant update (weekly_goal) on family.children to family_app;

alter table family.revisits enable row level security;
alter table family.revisits force row level security;
alter table family.plan_days enable row level security;
alter table family.plan_days force row level security;
alter table family.reward_jars enable row level security;
alter table family.reward_jars force row level security;
alter table family.day_counts enable row level security;
alter table family.day_counts force row level security;
revoke all on family.revisits, family.plan_days, family.reward_jars, family.day_counts from public, anon, authenticated, app_user, nca_super;
create policy revisits_own on family.revisits as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy revisits_own_only on family.revisits as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy plan_days_own on family.plan_days as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy plan_days_own_only on family.plan_days as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy reward_jars_own on family.reward_jars as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy reward_jars_own_only on family.reward_jars as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy day_counts_own on family.day_counts as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy day_counts_own_only on family.day_counts as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, update, delete on family.revisits, family.plan_days, family.reward_jars, family.day_counts to family_app;

-- ---- content ------------------------------------------------------------------------------------------------------

-- Channels the video finder searches first (official, or approved by a reviewer), and channels it never shows.
create table content.video_channels (
  channel_id text primary key check (channel_id ~ '^[A-Za-z0-9_-]{2,40}$'),
  title text not null check (length(title) between 1 and 120),
  kind text not null check (kind in ('official', 'approved', 'blocked')),
  added_by uuid not null,
  added_at timestamptz not null default now()
);

-- The best few videos per topic and language (03 §8), from the provider's metadata only. A reviewer pins or rejects a
-- pick; an automatic pick is refreshed or dropped within the provider's storage rules (family.video_pick_days).
create table content.video_picks (
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  language text not null check (language in ('en', 'hi')),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id text not null check (channel_id ~ '^[A-Za-z0-9_-]{2,40}$'),
  channel_title text not null check (length(channel_title) between 1 and 120),
  title text not null check (length(title) between 1 and 200),
  duration_s integer not null check (duration_s between 1 and 36000),
  start_s integer not null default 0 check (start_s >= 0),
  captions boolean not null,
  score real not null,
  status text not null default 'auto' check (status in ('auto', 'pinned', 'rejected')),
  fetched_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  primary key (topic_key, language, video_id),
  check ((status = 'auto') = (reviewed_by is null)),
  check (start_s < duration_s)
);
create index idx_content_video_picks_topic on content.video_picks (topic_key, language, score desc);

-- Searches spent per India day, against the provider's daily quota (family.video_searches_per_day).
create table content.video_searches (
  day date primary key,
  searches integer not null default 0 check (searches >= 0)
);

alter table content.video_channels enable row level security;
alter table content.video_channels force row level security;
alter table content.video_picks enable row level security;
alter table content.video_picks force row level security;
alter table content.video_searches enable row level security;
alter table content.video_searches force row level security;
revoke all on content.video_channels, content.video_picks, content.video_searches from public, anon, authenticated, app_user;
-- Families read the picks a reviewer has not rejected, and never write them directly.
create policy video_picks_family_read on content.video_picks as permissive for select to family_app
  using (status <> 'rejected');
create policy video_picks_family_only on content.video_picks as restrictive for all to family_app
  using (status <> 'rejected') with check (false);
grant select on content.video_picks to family_app;
-- Control (nca_super bypasses row security; these grants are its only rights here).
grant select, insert, update, delete on content.video_channels, content.video_picks to nca_super;
grant select on content.video_searches to nca_super;

-- Takes one search from today's quota: true when one was left. The only way a request touches the count.
create function content.take_video_search(p_day date, p_limit integer)
returns boolean
language sql security definer set search_path = '' as $$
  with taken as (
    insert into content.video_searches as s (day, searches) select p_day, 1 where p_limit > 0
    on conflict (day) do update set searches = s.searches + 1 where s.searches < p_limit
    returning searches
  )
  select exists (select 1 from taken)
$$;
revoke all on function content.take_video_search(date, integer) from public;
grant execute on function content.take_video_search(date, integer) to family_app, nca_super;

-- Replaces a topic's automatic picks with what the provider returned (the server builds the list; no phone sends one).
-- Pinned and rejected picks stay as a reviewer left them. Each row is checked here as well as by the table.
create function content.save_video_picks(p_topic text, p_language text, p_picks jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) > 5 then
    raise exception 'bad picks' using errcode = 'check_violation';
  end if;
  delete from content.video_picks where topic_key = p_topic and language = p_language and status = 'auto';
  insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, start_s, captions, score)
  select p_topic, p_language, x.video_id, x.channel_id, x.channel_title, x.title, x.duration_s, coalesce(x.start_s, 0), x.captions, x.score
    from jsonb_to_recordset(p_picks) as x(video_id text, channel_id text, channel_title text, title text, duration_s integer, start_s integer, captions boolean, score real)
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

-- ---- control ------------------------------------------------------------------------------------------------------

-- M2's limits, changed in Control (11 L3, L5, L8, L9; 02 §4.2).
insert into control.settings (key, value) values
  ('family.plan_minutes', '20'::jsonb),
  ('family.revisit_first_days', '3'::jsonb),
  ('family.revisit_second_days', '10'::jsonb),
  ('family.photo_questions_per_day', '3'::jsonb),
  ('family.voice_input_seconds_per_day', '120'::jsonb),
  ('family.video_searches_per_day', '90'::jsonb),
  ('family.video_pick_days', '30'::jsonb),
  ('family.offline_pack_days', '14'::jsonb)
on conflict (key) do nothing;

-- The video provider's key is entered in Control → AI and sealed like an AI key (10 §3). A search sends a topic's
-- title, never a child's words, so it needs no clearance for minors.
insert into control.ai_providers (provider_id) values ('youtube') on conflict (provider_id) do nothing;

-- The homework helper reads a photo (vision) and voice input hears a child (speech to text): both carry a child's words,
-- so each runs only on a provider cleared for minors (the trigger on this table refuses any other).
insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words) values
  ('family.homework', null, null, true),
  ('family.voice_input', null, null, true)
on conflict (profile_id) do nothing;
