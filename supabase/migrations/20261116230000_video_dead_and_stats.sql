-- Video cache follow-up (16 Nov 2026). Public video facts and counters only; nothing about a child.
--
-- content.video_picks.dead_at: set when YouTube says a picked video was removed or made private (an oEmbed check made when
-- the pick is served and was last checked over 7 days ago). A dead pick is never served again. checked_at: the last check.
-- content.mark_video_dead / content.touch_video_checked: the only writers for the family role (security definer).
--
-- content.video_cache_hours: per hour, how many answers were served from the cache (hits: no YouTube call), how many ran
-- a YouTube search (misses) and how many picks were found dead, so the YouTube calls saved can be counted
-- (content.video_cache_summary, Control only).

alter table content.video_picks add column checked_at timestamptz;
alter table content.video_picks add column dead_at timestamptz;

create function content.mark_video_dead(p_video_id text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_video_id !~ '^[A-Za-z0-9_-]{11}$' then return 0; end if;
  update content.video_picks set dead_at = now(), checked_at = now() where video_id = p_video_id and dead_at is null;
  get diagnostics n = row_count;
  if n > 0 then
    insert into content.video_cache_hours as h (hour, dead) values (date_trunc('hour', now()), n)
    on conflict (hour) do update set dead = h.dead + n;
  end if;
  return n;
end
$$;

create function content.touch_video_checked(p_video_id text)
returns void
language sql security definer set search_path = '' as $$
  update content.video_picks set checked_at = now() where video_id = p_video_id and p_video_id ~ '^[A-Za-z0-9_-]{11}$'
$$;

create table content.video_cache_hours (
  hour timestamptz primary key,
  hits integer not null default 0,
  misses integer not null default 0,
  dead integer not null default 0
);
alter table content.video_cache_hours enable row level security;
alter table content.video_cache_hours force row level security;
revoke all on content.video_cache_hours from public, anon, authenticated, app_user, family_app;
grant select, delete on content.video_cache_hours to nca_super;

create function content.note_video_cache(p_kind text)
returns void
language sql security definer set search_path = '' as $$
  insert into content.video_cache_hours as h (hour, hits, misses)
  select date_trunc('hour', now()), (p_kind = 'hit')::int, (p_kind = 'miss')::int where p_kind in ('hit', 'miss')
  on conflict (hour) do update set hits = h.hits + (p_kind = 'hit')::int, misses = h.misses + (p_kind = 'miss')::int
$$;

create function content.video_cache_summary(p_hours integer)
returns table (hour timestamptz, hits integer, misses integer, dead integer)
language sql stable security definer set search_path = '' as $$
  select h.hour, h.hits, h.misses, h.dead from content.video_cache_hours h
   where h.hour >= date_trunc('hour', now()) - make_interval(hours => least(greatest(p_hours, 1), 24 * 31))
   order by h.hour desc
$$;

revoke all on function content.mark_video_dead(text) from public;
revoke all on function content.touch_video_checked(text) from public;
revoke all on function content.note_video_cache(text) from public;
revoke all on function content.video_cache_summary(integer) from public;
grant execute on function content.mark_video_dead(text) to family_app, nca_super;
grant execute on function content.touch_video_checked(text) to family_app, nca_super;
grant execute on function content.note_video_cache(text) to family_app, nca_super;
grant execute on function content.video_cache_summary(integer) to nca_super;
