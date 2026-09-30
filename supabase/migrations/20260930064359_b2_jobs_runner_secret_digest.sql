-- =====================================================================
-- B2 (Decision Log C97): how /api/jobs/run checks the sweeper's token.
--
-- The runner secret lives only in Supabase Vault ('jobs_runner_secret'),
-- generated inside the database, so no person, file or deploy setting ever
-- holds it. The app asks for its SHA-256 digest (never the secret) and
-- compares the caller's token's digest in constant time
-- (src/lib/jobs/runner-auth.ts). Rotating it is one statement:
--
--   select vault.update_secret((select id from vault.secrets where name = 'jobs_runner_secret'),
--                              encode(extensions.gen_random_bytes(32), 'hex'));
--
-- NULL when the secret is not set, and then every call is refused.
-- =====================================================================

create or replace function public.jobs_runner_secret_digest() returns bytea
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select extensions.digest(decrypted_secret, 'sha256')
  from vault.decrypted_secrets where name = 'jobs_runner_secret'
$$;

revoke execute on function public.jobs_runner_secret_digest() from public, anon, authenticated, service_role, app_user, app_backend;
grant execute on function public.jobs_runner_secret_digest() to nca_super;
