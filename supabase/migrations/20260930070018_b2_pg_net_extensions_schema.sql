-- =====================================================================
-- B2 (Decision Log C97): pg_net registered in the `extensions` schema, not
-- `public` (Supabase security advisor 0014, extension_in_public, raised by
-- 20260930064005_b2_jobs_scheduler). pg_net cannot be moved in place, so it
-- is reinstalled; its functions stay in the `net` schema, so
-- jobs_sweeper_tick() is unchanged. Only in-flight request rows (at most a
-- minute's sweeper call) are dropped with it.
-- =====================================================================
drop extension if exists pg_net;
create extension pg_net with schema extensions;
