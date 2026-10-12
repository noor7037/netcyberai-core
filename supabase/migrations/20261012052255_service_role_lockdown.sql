-- service_role holds nothing in schema public (C167).
--
-- service_role is the role behind the server's secret key. The app uses that
-- key for two things only, both outside this schema: Supabase Auth's admin
-- calls (invites, one-time links) and file storage. Yet the role held every
-- right, TRUNCATE included, on 78 of 82 public tables, and it bypasses row
-- level security, so a leaked key could read or erase every school's data
-- through the REST API. Now a leaked key reaches sign-in administration and
-- files, not the tables.
--
-- Nothing in schemas auth or storage is touched: those are where the role
-- does its work.

revoke all on all tables in schema public from service_role;
revoke all on all sequences in schema public from service_role;
revoke all on all functions in schema public from service_role;

-- Nothing by default either, for what migrations create from here on.
alter default privileges for role postgres in schema public revoke all on tables from service_role;
alter default privileges for role postgres in schema public revoke all on sequences from service_role;
alter default privileges for role postgres in schema public revoke all on functions from service_role;
-- The same for objects made by supabase_admin, where this role may say so
-- (refused on Supabase, as in C161; nothing in public is made by it).
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from service_role';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from service_role';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from service_role';
exception when insufficient_privilege then
  raise notice 'default privileges of supabase_admin in public were not changed: not permitted for this role';
end $$;
