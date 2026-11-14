-- C522, videos for every tutor answer.
--
-- content.video_picks: the picks may now be kept in any language a child can choose (src/lib/family/languages.ts), not
-- only English and Hindi, so a Tamil search's picks are cached as Tamil.
--
-- content.video_topic_searches: one row per topic key and language, shared by every family and school, saying when that
-- topic was last searched and how many picks it found (null while the search runs). It is the search's claim and the
-- negative cache: a request searches only after claiming the row (content.claim_video_topic), so two children asking the
-- same thing at once spend one search, and a topic that found nothing is not searched again for p_empty_days. The day's
-- quota (content.take_video_search, family.video_searches_per_day) stays the hard limit over every path. No child's data.
--
-- family.video_clicks: a child's taps on "See video", one row per child, video and India day with a count. Ids, the
-- topic key and times only. Own account only, twice (a permissive and a restrictive policy), and on a child's own phone
-- that child only, as family.draw_completions (C514). Removed with the child (the foreign key cascades). Control reads
-- totals only, through family.video_click_summary (no id leaves it).

alter table content.video_picks drop constraint video_picks_language_check;
alter table content.video_picks add constraint video_picks_language_check
  check (language in ('en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as'));

create table content.video_topic_searches (
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  language text not null check (language in ('en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as')),
  searched_at timestamptz not null default now(),
  found integer check (found between 0 and 10),
  primary key (topic_key, language)
);
alter table content.video_topic_searches enable row level security;
alter table content.video_topic_searches force row level security;
revoke all on content.video_topic_searches from public, anon, authenticated, app_user;
grant select on content.video_topic_searches to nca_super;

-- Claims one search of a topic: true when this request may search it now. Free when never searched; when a search that
-- found something is more than a day old (its picks went stale or were rejected); when one that found nothing is older
-- than p_empty_days; or when one was claimed and never finished (ten minutes). The row lock of the insert makes a
-- second identical request wait for the first and then see its claim.
create function content.claim_video_topic(p_topic text, p_language text, p_empty_days integer)
returns boolean
language sql security definer set search_path = '' as $$
  with claimed as (
    insert into content.video_topic_searches as s (topic_key, language) values (p_topic, p_language)
    on conflict (topic_key, language) do update set searched_at = now(), found = null
      where (s.found is null and s.searched_at < now() - interval '10 minutes')
         or (s.found = 0 and s.searched_at < now() - make_interval(days => greatest(p_empty_days, 0)))
         or (s.found > 0 and s.searched_at < now() - interval '1 day')
    returning 1
  )
  select exists (select 1 from claimed)
$$;
revoke all on function content.claim_video_topic(text, text, integer) from public;
grant execute on function content.claim_video_topic(text, text, integer) to family_app, nca_super;

-- Finishes a claim: how many picks the search kept (0 is the negative cache), or null when no search could run (no key,
-- the day's searches spent, the provider down), which frees the claim for a later request.
create function content.finish_video_topic(p_topic text, p_language text, p_found integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_found is null then
    delete from content.video_topic_searches s where s.topic_key = p_topic and s.language = p_language and s.found is null;
  else
    update content.video_topic_searches s set found = least(greatest(p_found, 0), 10), searched_at = now()
     where s.topic_key = p_topic and s.language = p_language and s.found is null;
  end if;
end
$$;
revoke all on function content.finish_video_topic(text, text, integer) from public;
grant execute on function content.finish_video_topic(text, text, integer) to family_app, nca_super;

create table family.video_clicks (
  account_id uuid not null,
  child_id uuid not null,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  day date not null,
  clicks integer not null default 1 check (clicks between 1 and 1000),
  last_at timestamptz not null default now(),
  primary key (child_id, video_id, day),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_video_clicks_account on family.video_clicks (account_id, day);
create index idx_family_video_clicks_day on family.video_clicks (day);

alter table family.video_clicks enable row level security;
alter table family.video_clicks force row level security;
revoke all on family.video_clicks from public, anon, authenticated, app_user, nca_super;

create policy video_clicks_own on family.video_clicks as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy video_clicks_own_only on family.video_clicks as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy video_clicks_one_child on family.video_clicks as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

grant select, insert, update on family.video_clicks to family_app;

-- Control's read: totals over every family, never a child's id, an account, a video or a topic. All time, the seven
-- India days to p_today, and how many children clicked in them.
create function family.video_click_summary(p_today date)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', (select coalesce(sum(clicks), 0) from family.video_clicks),
    'week', (select coalesce(sum(clicks), 0) from family.video_clicks where day > p_today - 7 and day <= p_today),
    'childrenWeek', (select count(distinct child_id) from family.video_clicks where day > p_today - 7 and day <= p_today)
  )
$$;
revoke all on function family.video_click_summary(date) from public;
grant execute on function family.video_click_summary(date) to nca_super;
