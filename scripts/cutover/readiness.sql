-- Production cutover readiness (docs/18_PRODUCTION_CUTOVER.md §3 step 1;
-- Decision Log C111). Read-only: counts and names only, no row contents,
-- no secret values. Run on both projects and compare; on prod before "go"
-- every data count is 0 and vault_runner_secrets is 0.
select
  (select count(*) from supabase_migrations.schema_migrations) as migration_rows,
  (select string_agg(rolname || ':login=' || rolcanlogin || ',bypassrls=' || rolbypassrls, '; ' order by rolname)
     from pg_roles where rolname in ('app_backend', 'app_user', 'nca_super')) as app_roles,
  (select string_agg(jobname || ' ' || schedule, '; ' order by jobname) from cron.job) as cron_jobs,
  (select string_agg(extname || '@' || extnamespace::regnamespace, ', ' order by extname) from pg_extension) as extensions,
  (select count(*) from vault.secrets where name like 'jobs_runner%') as vault_runner_secrets,
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.users) as app_users,
  (select count(*) from public.users where role = 'super_admin') as platform_admins,
  (select count(*) from schools) as schools,
  (select count(*) from schools where is_test_fixture) as test_schools,
  (select count(*) from students) as students,
  (select count(*) from leads) as leads,
  (select count(*) from school_applications) as applications,
  (select count(*) from staff_invitations) as invitations,
  (select count(*) from jobs) as jobs,
  (select count(*) from storage.objects) as storage_objects,
  (select value::text from platform_settings where key = 'onboarding.approval_mode') as approval_mode;
