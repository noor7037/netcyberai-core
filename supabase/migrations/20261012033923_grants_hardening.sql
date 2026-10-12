-- Security hardening (C161): no rights for the public Supabase roles, and
-- no rights by default for anyone.
--
-- Found by the supervisor on both databases: on about 44 older tables the
-- Supabase roles `anon` and `authenticated` held SELECT, INSERT, UPDATE,
-- DELETE and TRUNCATE. Row level security blocks their rows, but TRUNCATE
-- is not covered by row level security. The app never uses those roles for
-- tables (supabase-js is used for sign-in and file storage only).
--
-- Root cause: the default privileges of schema public (pg_default_acl) give
-- every new table, sequence and function to anon, authenticated and
-- service_role, and every new table to app_user with all four rights. So a
-- migration's own `grant select, insert ...` narrowed nothing (C160).
--
-- From here on a new table, sequence or function grants nothing to anon,
-- authenticated or app_user: each migration grants what its table needs.
-- test/db/grants.test.ts pins the app role's rights on every public table
-- and fails if anon or authenticated can do anything.

-- 1. Take everything away from the public roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
-- Five trigger functions were executable by everyone (PUBLIC). A trigger
-- runs without that right; nobody calls them directly.
revoke all on function public.recompute_fee_status() from public;
revoke all on function public.fees_ledger_initial_status() from public;
revoke all on function public.students_rte_office_only() from public;
revoke all on function public.payments_guard() from public;
revoke all on function public.receipts_only_reversal_changes() from public;

-- 2. Nothing by default. (Objects made by `postgres`, which is who runs
--    migrations. `nca_super`, the founder's platform role, keeps its default.)
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, app_user;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, app_user;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- The same for objects made by supabase_admin, where this role may say so.
-- On Supabase `postgres` is not a member of supabase_admin, so this is
-- refused there and says so; nothing in public is made by supabase_admin.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from anon, authenticated';
exception when insufficient_privilege then
  raise notice 'default privileges of supabase_admin in public were not changed: not permitted for this role';
end $$;

-- 3. Two more tables held more than their own migrations gave them (the
--    same root cause as C160): rates are read by the school and written by
--    the platform; a staff invitation is never deleted.
revoke insert, update, delete on message_rate_table from app_user;
revoke delete on staff_invitations from app_user;

-- 4. The app role never needs these on any table.
revoke truncate, references, trigger on all tables in schema public from app_user;
