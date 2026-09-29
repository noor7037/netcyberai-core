-- Phase 0 step 2 (docs/14_BACKEND_BUILD_PLAN.md §2): make a clean replay of
-- this directory and the live dev database identical.
--
-- Method: every file here replayed in filename order into the new, empty
-- project netcyberai-prod (rkpfkqpotmpupbjfambg), 40 of 40 applied without
-- an error; then scripts/catalog_snapshot.sql run on both. 14 of 18
-- categories were already identical (455 columns, 207 constraints, 129
-- indexes, 79 policies, 48 relations, 1,817 relation grants, 312 default
-- ACL entries, types, triggers, schema grants, roles, extensions, the
-- storage bucket). The rest, and what this file does about each:
--
-- D1. Dev only: event trigger `ensure_rls` and its function
--     rls_auto_enable(), Supabase's "enable RLS on new tables" option,
--     switched on for dev from the dashboard and never recorded here.
--     Kept and codified, so every environment has it: Supabase's default
--     privileges give anon/authenticated full CRUD on every new table in
--     `public`, so a table created without its own `enable row level
--     security` would otherwise be open to the public anon key. It is also
--     the likely origin of the RLS-enabled-with-no-policy state on
--     `sessions` that 20260921120000 found with "origin unknown": that table
--     is created without an enable statement, and this trigger enables RLS
--     on exactly such a table. Body copied byte for byte from dev's
--     pg_get_functiondef. EXECUTE stays with the owner only (why:
--     20260929061317).
-- D2. whatsapp_config_set_credentials / whatsapp_config_get_credentials:
--     same logic, SECURITY DEFINER, search_path and grants on both, but
--     different body text. Dev still runs the live-only migration
--     fix_whatsapp_config_tenant_check_null_bypass, whose bodies are the
--     20260922060000 bodies without their explanatory comments. Recreated
--     below with this directory's text, so both match byte for byte.
--     CREATE OR REPLACE keeps the owner and the grants.
-- D3. Dev only: postgres holds INHERIT memberships in app_backend, app_user
--     and nca_super, granted by postgres. No migration creates them, no
--     Decision Log entry records them, and nothing needs them (postgres
--     owns every object those roles are granted on). Revoked. postgres keeps
--     the ADMIN membership Supabase itself grants when a role is created.
--
-- Every statement is safe on both databases: on prod D2 and D3 change
-- nothing, on dev D1 changes nothing.

-- D1 -------------------------------------------------------------------

create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end
$$;

-- D2 -------------------------------------------------------------------

create or replace function whatsapp_config_set_credentials(
  p_school_id uuid,
  p_waba_id text,
  p_phone_number_id text,
  p_phone_number_display text,
  p_access_token text,
  p_webhook_verify_token text,
  p_configured_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_config_id uuid;
  v_access_secret_id uuid;
  v_webhook_secret_id uuid;
  v_existing record;
begin
  -- IS DISTINCT FROM, not <>: Postgres's three-valued logic means
  -- `p_school_id <> NULL` evaluates to NULL, not TRUE, so `IF NULL THEN
  -- raise exception` is treated as false and silently PASSES -- found
  -- live while building this prompt's own VERIFY fixtures (calling this
  -- function with app.current_tenant_id entirely unset let the write
  -- through instead of rejecting it). IS DISTINCT FROM is NULL-safe: it
  -- never itself returns NULL, so a missing tenant GUC now fails closed
  -- instead of silently bypassing the check it exists to enforce.
  if p_school_id is null or p_school_id is distinct from current_setting('app.current_tenant_id', true)::uuid then
    raise exception 'cannot configure WhatsApp credentials for a different school';
  end if;

  select * into v_existing from school_whatsapp_configs where school_id = p_school_id;

  if v_existing.id is not null and v_existing.access_token_secret_id is not null then
    perform vault.update_secret(v_existing.access_token_secret_id, p_access_token, null, null, null);
    v_access_secret_id := v_existing.access_token_secret_id;
  else
    v_access_secret_id := vault.create_secret(p_access_token, 'whatsapp_access_token:' || p_school_id::text, 'Prompt H WhatsApp send-gate', null);
  end if;

  if v_existing.id is not null and v_existing.webhook_verify_token_secret_id is not null then
    perform vault.update_secret(v_existing.webhook_verify_token_secret_id, p_webhook_verify_token, null, null, null);
    v_webhook_secret_id := v_existing.webhook_verify_token_secret_id;
  else
    v_webhook_secret_id := vault.create_secret(p_webhook_verify_token, 'whatsapp_webhook_verify_token:' || p_school_id::text, 'Prompt H WhatsApp send-gate', null);
  end if;

  insert into school_whatsapp_configs (school_id, waba_id, phone_number_id, phone_number_display, access_token_secret_id, webhook_verify_token_secret_id, status, configured_by, updated_at)
  values (p_school_id, p_waba_id, p_phone_number_id, p_phone_number_display, v_access_secret_id, v_webhook_secret_id, 'pending_verification', p_configured_by, now())
  on conflict (school_id) do update set
    waba_id = excluded.waba_id,
    phone_number_id = excluded.phone_number_id,
    phone_number_display = excluded.phone_number_display,
    access_token_secret_id = excluded.access_token_secret_id,
    webhook_verify_token_secret_id = excluded.webhook_verify_token_secret_id,
    status = 'pending_verification',
    configured_by = excluded.configured_by,
    updated_at = now()
  returning id into v_config_id;

  return v_config_id;
end;
$$;

create or replace function whatsapp_config_get_credentials(p_config_id uuid)
returns table(access_token text, webhook_verify_token text)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_school_id uuid;
  v_access_secret_id uuid;
  v_webhook_secret_id uuid;
begin
  select school_id, access_token_secret_id, webhook_verify_token_secret_id
    into v_school_id, v_access_secret_id, v_webhook_secret_id
    from school_whatsapp_configs where id = p_config_id;

  -- Same IS DISTINCT FROM fix as whatsapp_config_set_credentials above.
  if v_school_id is null or v_school_id is distinct from current_setting('app.current_tenant_id', true)::uuid then
    raise exception 'WhatsApp config not found for this school';
  end if;

  return query
    select
      (select decrypted_secret from vault.decrypted_secrets where id = v_access_secret_id),
      (select decrypted_secret from vault.decrypted_secrets where id = v_webhook_secret_id);
end;
$$;

-- D3 -------------------------------------------------------------------

do $$
declare
  r text;
begin
  foreach r in array array['app_backend', 'app_user', 'nca_super'] loop
    if exists (
      select 1 from pg_auth_members m
      where m.roleid = r::regrole and m.member = 'postgres'::regrole and m.grantor = 'postgres'::regrole
    ) then
      execute format('revoke %I from postgres granted by postgres', r);
    end if;
  end loop;
end
$$;
