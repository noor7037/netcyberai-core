-- Tutor v21 (16 Nov 2026): one shared cache for the tutor's step pictures and 3D models (later animations and simulation
-- lookups), and a shared per-source counter so no outside picture source is asked past its free limit.
--
-- content.visual_cache: one row per kind, normalised English search words, subject and class band. A found picture is
-- kept for p_hit_s (24 hours; Pixabay's terms ask for that), a miss for p_miss_s (an hour). The row is also the claim:
-- content.visual_lookup claims a missing or stale row in the same statement (as content.claim_video_topic), so two
-- servers asking the same words at once spend one search; the other sees 'pending' (with the stale value, if any).
--
-- content.visual_source_usage: calls per counter ("bucket": a source, or the key several sources share) per minute,
-- hour, day and month. content.take_visual_call refuses a call that would pass a limit (a sliding estimate over the
-- current and previous window) or while the bucket is paused (content.visual_source_pauses, set on a 429).
-- content.visual_source_hours: per source and hour, calls, hits, skips and pauses, for Control
-- (content.visual_source_summary). Search words and public picture addresses only: nothing about a child.

create table content.visual_cache (
  kind text not null check (kind in ('photo', 'model3d', 'animation', 'sim')),
  query_key text not null check (length(query_key) between 1 and 120),
  subject text not null check (subject ~ '^[a-z_]{0,40}$'),
  class_band text not null check (class_band ~ '^[a-z0-9-]{0,12}$'),
  state text not null check (state in ('pending', 'hit', 'miss')),
  value jsonb check (value is null or (jsonb_typeof(value) = 'object' and pg_column_size(value) <= 8000)),
  fetched_at timestamptz,
  claimed_at timestamptz not null default now(),
  primary key (kind, query_key, subject, class_band)
);
create index visual_cache_fetched_idx on content.visual_cache (fetched_at);

create table content.visual_source_usage (
  bucket text not null check (bucket ~ '^[a-z0-9_]{1,40}$'),
  period text not null check (period in ('minute', 'hour', 'day', 'month')),
  started timestamptz not null,
  calls integer not null default 0 check (calls >= 0),
  primary key (bucket, period, started)
);

create table content.visual_source_pauses (
  bucket text primary key check (bucket ~ '^[a-z0-9_]{1,40}$'),
  until timestamptz not null,
  reason text not null check (length(reason) between 1 and 40)
);

create table content.visual_source_hours (
  source text not null check (source ~ '^[a-z0-9_]{1,40}$'),
  hour timestamptz not null,
  calls integer not null default 0,
  hits integer not null default 0,
  skips integer not null default 0,
  pauses integer not null default 0,
  primary key (source, hour)
);

-- Control reads (and may clear a cached pick); nca_super bypasses row security. Families go through the functions.
alter table content.visual_cache enable row level security;
alter table content.visual_cache force row level security;
revoke all on content.visual_cache from public, anon, authenticated, app_user, family_app;
grant select, delete on content.visual_cache to nca_super;
alter table content.visual_source_usage enable row level security;
alter table content.visual_source_usage force row level security;
revoke all on content.visual_source_usage from public, anon, authenticated, app_user, family_app;
grant select, delete on content.visual_source_usage to nca_super;
alter table content.visual_source_pauses enable row level security;
alter table content.visual_source_pauses force row level security;
revoke all on content.visual_source_pauses from public, anon, authenticated, app_user, family_app;
grant select, delete on content.visual_source_pauses to nca_super;
alter table content.visual_source_hours enable row level security;
alter table content.visual_source_hours force row level security;
revoke all on content.visual_source_hours from public, anon, authenticated, app_user, family_app;
grant select, delete on content.visual_source_hours to nca_super;

-- One lookup that also claims: ('hit', value) fresh; ('miss', null) a fresh miss; ('pending', value or null) another
-- request is searching (claimed within a minute); ('claimed', stale value or null) this request may search now.
create function content.visual_lookup(p_kind text, p_query text, p_subject text, p_band text, p_hit_s integer, p_miss_s integer)
returns table (state text, value jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r record;
begin
  insert into content.visual_cache as c (kind, query_key, subject, class_band, state, claimed_at)
  values (p_kind, p_query, p_subject, p_band, 'pending', now())
  on conflict (kind, query_key, subject, class_band) do update set state = 'pending', claimed_at = now()
    where (c.state = 'hit' and c.fetched_at < now() - make_interval(secs => greatest(p_hit_s, 0)))
       or (c.state = 'miss' and c.fetched_at < now() - make_interval(secs => greatest(p_miss_s, 0)))
       or (c.state = 'pending' and c.claimed_at < now() - interval '1 minute')
  returning c.value into r;
  if found then
    return query select 'claimed'::text, r.value;
    return;
  end if;
  return query select c.state, c.value from content.visual_cache c
    where c.kind = p_kind and c.query_key = p_query and c.subject = p_subject and c.class_band = p_band;
end
$$;

-- Keeps a search's answer (null: a miss). Only the request's own claim, or a row with no claim, is written.
create function content.visual_save(p_kind text, p_query text, p_subject text, p_band text, p_value jsonb)
returns void
language sql security definer set search_path = '' as $$
  insert into content.visual_cache as c (kind, query_key, subject, class_band, state, value, fetched_at, claimed_at)
  values (p_kind, p_query, p_subject, p_band, case when p_value is null then 'miss' else 'hit' end, p_value, now(), now())
  on conflict (kind, query_key, subject, class_band) do update
    set state = excluded.state, value = excluded.value, fetched_at = excluded.fetched_at
$$;

-- Frees a claim whose search could not run fully (a source paused, at its limit, or the answer's cap reached): no miss
-- is remembered, and a stale picture stays as it was (stale, so the next request searches again).
create function content.visual_release(p_kind text, p_query text, p_subject text, p_band text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from content.visual_cache c
    where c.kind = p_kind and c.query_key = p_query and c.subject = p_subject and c.class_band = p_band and c.state = 'pending' and c.value is null;
  update content.visual_cache c set state = 'hit'
    where c.kind = p_kind and c.query_key = p_query and c.subject = p_subject and c.class_band = p_band and c.state = 'pending' and c.value is not null;
end
$$;

-- Takes one call of `p_source` on counter `p_bucket`: 'ok' (counted), 'paused' (a 429 pause is running) or 'limit' (the
-- call would pass a limit). p_limits: per minute, hour, day and month; null is no limit. One bucket at a time (an
-- advisory lock), so two servers cannot both take the last call.
create function content.take_visual_call(p_bucket text, p_source text, p_limits integer[])
returns text
language plpgsql security definer set search_path = '' as $$
declare
  periods text[] := array['minute', 'hour', 'day', 'month'];
  i integer;
  cur_start timestamptz;
  span interval;
  cur_calls integer;
  prev_calls integer;
  frac double precision;
  hr timestamptz := date_trunc('hour', now());
begin
  perform pg_advisory_xact_lock(hashtext('visual_source:' || p_bucket));
  insert into content.visual_source_hours (source, hour) values (p_source, hr) on conflict do nothing;
  if exists (select 1 from content.visual_source_pauses p where p.bucket = p_bucket and p.until > now()) then
    update content.visual_source_hours set skips = skips + 1 where source = p_source and hour = hr;
    return 'paused';
  end if;
  for i in 1 .. 4 loop
    continue when coalesce(array_length(p_limits, 1), 0) < i or p_limits[i] is null;
    span := ('1 ' || periods[i])::interval;
    cur_start := date_trunc(periods[i], now());
    select coalesce(sum(u.calls) filter (where u.started = cur_start), 0), coalesce(sum(u.calls) filter (where u.started = cur_start - span), 0)
      into cur_calls, prev_calls
      from content.visual_source_usage u where u.bucket = p_bucket and u.period = periods[i] and u.started in (cur_start, cur_start - span);
    frac := extract(epoch from now() - cur_start) / extract(epoch from (cur_start + span) - cur_start);
    if cur_calls + prev_calls * (1 - frac) + 1 > p_limits[i] then
      update content.visual_source_hours set skips = skips + 1 where source = p_source and hour = hr;
      return 'limit';
    end if;
  end loop;
  for i in 1 .. 4 loop
    continue when coalesce(array_length(p_limits, 1), 0) < i or p_limits[i] is null;
    insert into content.visual_source_usage as u (bucket, period, started, calls) values (p_bucket, periods[i], date_trunc(periods[i], now()), 1)
      on conflict (bucket, period, started) do update set calls = u.calls + 1;
  end loop;
  update content.visual_source_hours set calls = calls + 1 where source = p_source and hour = hr;
  -- Old minute and hour windows are of no further use.
  delete from content.visual_source_usage u where u.bucket = p_bucket and u.period in ('minute', 'hour') and u.started < now() - interval '1 day';
  return 'ok';
end
$$;

-- A call that brought back a picture.
create function content.note_visual_hit(p_source text)
returns void
language sql security definer set search_path = '' as $$
  insert into content.visual_source_hours as h (source, hour, hits) values (p_source, date_trunc('hour', now()), 1)
  on conflict (source, hour) do update set hits = h.hits + 1
$$;

-- A 429 (or an equal refusal): every server leaves the bucket alone until the pause ends (at most a day).
create function content.pause_visual_source(p_bucket text, p_source text, p_seconds integer, p_reason text)
returns void
language sql security definer set search_path = '' as $$
  insert into content.visual_source_pauses as p (bucket, until, reason)
  values (p_bucket, now() + make_interval(secs => least(greatest(p_seconds, 1), 86400)), left(p_reason, 40))
  on conflict (bucket) do update set until = greatest(p.until, excluded.until), reason = excluded.reason;
  insert into content.visual_source_hours as h (source, hour, pauses) values (p_source, date_trunc('hour', now()), 1)
  on conflict (source, hour) do update set pauses = h.pauses + 1;
$$;

-- Control: each source's calls, hits, skips and pauses per hour over the last p_hours, and any pause still running.
create function content.visual_source_summary(p_hours integer)
returns table (source text, hour timestamptz, calls integer, hits integer, skips integer, pauses integer)
language sql stable security definer set search_path = '' as $$
  select h.source, h.hour, h.calls, h.hits, h.skips, h.pauses from content.visual_source_hours h
   where h.hour >= date_trunc('hour', now()) - make_interval(hours => least(greatest(p_hours, 1), 24 * 31))
   order by h.hour desc, h.source
$$;

revoke all on function content.visual_lookup(text, text, text, text, integer, integer) from public;
revoke all on function content.visual_save(text, text, text, text, jsonb) from public;
revoke all on function content.visual_release(text, text, text, text) from public;
revoke all on function content.take_visual_call(text, text, integer[]) from public;
revoke all on function content.note_visual_hit(text) from public;
revoke all on function content.pause_visual_source(text, text, integer, text) from public;
revoke all on function content.visual_source_summary(integer) from public;
grant execute on function content.visual_lookup(text, text, text, text, integer, integer) to family_app, nca_super;
grant execute on function content.visual_save(text, text, text, text, jsonb) to family_app, nca_super;
grant execute on function content.visual_release(text, text, text, text) to family_app, nca_super;
grant execute on function content.take_visual_call(text, text, integer[]) to family_app, nca_super;
grant execute on function content.note_visual_hit(text) to family_app, nca_super;
grant execute on function content.pause_visual_source(text, text, integer, text) to family_app, nca_super;
grant execute on function content.visual_source_summary(integer) to nca_super;
