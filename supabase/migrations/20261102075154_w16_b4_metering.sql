-- W16-B4 (docs/AI_TUTOR_AGENT_PROGRESS.md, Programme W16, decision 8; the proposal's M10): the tutor's use metered per child
-- per India day as text turns, voice minutes and photo doubts, capped by the Family plan, and the daily ops job.
--   1. family.day_counts.text_turns: the questions the tutor answered for a child today. Voice (voice_seconds) and photo
--      doubts (photo_questions) were already counted there; the usage ledger holds no child, so text turns could not be
--      derived and get the one column. Family sessions already hold the table's rights (own account only, forced RLS).
--   2. family.tutor_day_totals(day): the day's totals across all families, counts only, for Control's tile row and the
--      daily job. A definer function the platform role may call, as family.m2_counts(): day_counts is closed to it.
--   3. control.ai_ops_daily: one row a day written by the ai.ops_daily job (text turns, voice minutes, photo doubts,
--      quizzes made, reports sent, failures, cost, and the dead tutor jobs it retried, so none is retried twice). Counts
--      and ids only; the platform role (nca_super) reads and writes it, no other role.
--   4. public.ai_ops_daily_enqueue(): once a day at 00:20 India, only once the deployed runner can run the job.
-- No setting is seeded: the three caps and the Plus multiplier read from Control when set, else the older settings, else
-- the built-in numbers (src/lib/family/tutor-meter.ts), so no family's day changes until the founder sets a number.
-- Rollback: drop the job, the function(s), the table and the column; no existing row is changed.

alter table family.day_counts add column text_turns integer not null default 0 check (text_turns between 0 and 100000);

create function family.tutor_day_totals(p_day date)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'children', count(*) filter (where text_turns + voice_seconds + photo_questions > 0),
    'text_turns', coalesce(sum(text_turns), 0),
    'voice_seconds', coalesce(sum(voice_seconds), 0),
    'photo_doubts', coalesce(sum(photo_questions), 0)
  ) from family.day_counts where day = p_day
$$;
revoke all on function family.tutor_day_totals(date) from public, anon, authenticated, service_role;
grant execute on function family.tutor_day_totals(date) to nca_super;

create table control.ai_ops_daily (
  day date primary key,
  children integer not null default 0 check (children >= 0),
  text_turns integer not null default 0 check (text_turns >= 0),
  voice_minutes numeric(10, 1) not null default 0 check (voice_minutes >= 0),
  photo_doubts integer not null default 0 check (photo_doubts >= 0),
  quizzes integer not null default 0 check (quizzes >= 0),
  reports integer not null default 0 check (reports >= 0),
  failures integer not null default 0 check (failures >= 0),
  -- Null: no attempt that day had a price, so the cost is unknown (none is invented).
  cost_usd numeric(14, 6) check (cost_usd is null or cost_usd >= 0),
  retried uuid[] not null default '{}' check (cardinality(retried) <= 500),
  written_at timestamptz not null default now()
);
alter table control.ai_ops_daily enable row level security;
alter table control.ai_ops_daily force row level security;
revoke all on control.ai_ops_daily from public, anon, authenticated, service_role, app_user, family_app, nca_super;
grant select, insert, update on control.ai_ops_daily to nca_super;
-- nca_super has BYPASSRLS (as for control.ai_qc_results), so no policy is needed; with forced RLS no other role sees a row.

-- Today's job (India date in the key), once, only once the deployed runner can run it (as ai_upkeep_enqueue).
create function public.ai_ops_daily_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'ai.ops_daily', jsonb_build_object('date', t.d), 'ai.ops_daily:' || t.d, 4
    from (select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as d) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'ai.ops_daily')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.ai_ops_daily_enqueue() from public, anon, authenticated, service_role;

-- 18:50 UTC is 00:20 in India. cron.schedule upserts by name. Where there is no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ai-ops-daily', '50 18 * * *', 'select public.ai_ops_daily_enqueue()');
  end if;
end $$;
