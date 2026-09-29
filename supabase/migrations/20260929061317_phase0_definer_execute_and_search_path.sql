-- Phase 0 step 1 (docs/14_BACKEND_BUILD_PLAN.md §2): close the three
-- SECURITY DEFINER functions the Supabase security advisor flags as
-- callable through the public REST API, and pin search_path on the two
-- trigger functions it flags as role-mutable.
--
-- Root cause of the grants: Supabase's platform default privileges give
-- anon, authenticated and service_role an explicit EXECUTE on every new
-- function in `public`. 20260922060000_prompt_h_whatsapp_send_gate.sql ran
-- `revoke all ... from public`, which removes only the PUBLIC pseudo-role
-- entry, not those three explicit grants -- so both credential functions
-- stayed callable at /rest/v1/rpc/*. (Not exploitable today: both refuse
-- a caller without the app's tenant setting. The grant was still wrong.)
--
-- Who keeps EXECUTE on the credential functions: app_user, unchanged. The
-- app never calls them as app_backend: both call sites
-- (src/app/api/app/whatsapp-config/route.ts, src/lib/whatsapp/gate.ts) run
-- inside withTenantContext, which does `set local role app_user` first,
-- and app_backend's membership in app_user is NOINHERIT. Granting
-- app_backend EXECUTE would widen access (routes that run as app_backend
-- with no SET ROLE, like /api/public/leads, could then reach them), so it
-- is deliberately not granted. service_role loses it too: the service-role
-- client is allowlisted for Storage only (scripts/check_service_role.py)
-- and nothing calls these over REST.
--
-- rls_auto_enable(): Supabase's "enable RLS on new tables" event-trigger
-- function (event trigger `ensure_rls`). Postgres does not check EXECUTE
-- when an event trigger fires, so no role needs the grant; revoking it
-- closes /rest/v1/rpc/rls_auto_enable without changing what the trigger
-- does. It exists only on a project where that feature is switched on,
-- hence the guard.
--
-- search_path: audit_hash_chain() calls extensions.digest() (Decision Log
-- C45's schema fix), so `extensions` stays on its path even though the call
-- is already schema-qualified. pg_temp goes last so a temporary object can
-- never shadow a real one.

revoke execute on function public.whatsapp_config_get_credentials(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.whatsapp_config_set_credentials(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.whatsapp_config_get_credentials(uuid) to app_user;
grant execute on function public.whatsapp_config_set_credentials(uuid, text, text, text, text, text, uuid) to app_user;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end
$$;

alter function public.recompute_fee_status() set search_path = public, pg_temp;
alter function public.audit_hash_chain() set search_path = public, extensions, pg_temp;
