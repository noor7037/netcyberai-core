-- Prompt H Task 2: schema for the single WhatsApp send-gate.
--
-- Founder decision (confirmed, authorized): tenant-scoped WhatsApp
-- Business Accounts are supported but NOT mandatory. Platform-Default
-- with Optional Tenant Override -- most schools use a platform-owned
-- WABA (today: the mock provider, since no real platform WABA exists
-- yet either); a school that completes its own WABA onboarding
-- resolves to its own credentials instead. No school is ever blocked
-- on Meta verification to use the product.

create type whatsapp_config_status as enum ('not_configured', 'pending_verification', 'active', 'suspended', 'revoked');

-- Live credentials -- a leaked access_token lets someone send real
-- messages as that school to real parents. Treated with the same
-- suspicion `sessions`/`consent_ledger` got in Pre-F hardening: the
-- raw token is never stored in this table at all (or anywhere else in
-- Postgres in plaintext). Supabase Vault (pgsodium-backed) is
-- installed on this project (confirmed live: vault.create_secret /
-- vault.decrypted_secrets both round-tripped a real value before this
-- migration was written) -- preferred over pgcrypto's pgp_sym_encrypt
-- per the standing instruction to use Vault when available. The
-- columns below hold the *secret's own id* in vault.secrets, never
-- ciphertext directly; `app_user` has no USAGE on the `vault` schema
-- at all (confirmed live), so both write (whatsapp_config_set_credentials)
-- and read (whatsapp_config_get_credentials) go through the two
-- SECURITY DEFINER functions below -- the only two places in the whole
-- database that can ever produce or consume the plaintext token. The
-- application-code choke point (src/lib/whatsapp/gate.ts) is the only
-- module allowed to call whatsapp_config_get_credentials, mirroring the
-- SET ROLE choke point in db.ts; scripts/check_whatsapp_send_gate.py
-- enforces this mechanically the same way check_choke_point.py does
-- for SET ROLE.
create table school_whatsapp_configs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references schools(school_id),
  waba_id text,
  phone_number_id text,
  phone_number_display text,
  access_token_secret_id uuid references vault.secrets(id),
  webhook_verify_token_secret_id uuid references vault.secrets(id),
  status whatsapp_config_status not null default 'not_configured',
  configured_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table school_whatsapp_configs
  add constraint school_whatsapp_configs_school_configured_by_fkey
  foreign key (school_id, configured_by) references users(school_id, user_id);

alter table school_whatsapp_configs enable row level security;
alter table school_whatsapp_configs force row level security;

-- Any staff member in the school can see routing metadata (status,
-- phone_number_id, waba_id) -- not sensitive by itself, same as
-- knowing a fee structure exists. Writing it is a different question.
create policy school_whatsapp_configs_tenant_isolation on school_whatsapp_configs
  using (school_id = current_setting('app.current_tenant_id', true)::uuid);

-- RESTRICTIVE, not another permissive policy: fee_heads' own
-- accounting_write/update/delete policies (Pre-F hardening) are
-- PERMISSIVE and, being OR'd with that table's own ALL-command
-- tenant_isolation policy, do not actually narrow anything -- checked
-- live via pg_policies while designing this table, not assumed. A
-- RESTRICTIVE policy (AND'd on top) is the only mechanism that
-- genuinely narrows access below the tenant-isolation grant, the same
-- shape teacher_scope_attendance/parent_scope_attendance already use.
create policy school_whatsapp_configs_admin_write on school_whatsapp_configs as restrictive
  for insert with check (current_setting('app.current_role', true) in ('school_admin', 'principal'));
create policy school_whatsapp_configs_admin_update on school_whatsapp_configs as restrictive
  for update using (current_setting('app.current_role', true) in ('school_admin', 'principal'));
create policy school_whatsapp_configs_admin_delete on school_whatsapp_configs as restrictive
  for delete using (current_setting('app.current_role', true) in ('school_admin', 'principal'));

-- Stage 0b's own lesson applied proactively rather than waiting for a
-- third accidental discovery: role_grants.sql's `alter default
-- privileges` grants app_user/nca_super full CRUD on any new table
-- automatically, and Supabase's own project default separately grants
-- anon/authenticated the same. anon/authenticated have no legitimate
-- reason to touch this table at all -- revoked immediately, not
-- deferred to a future live-drift scan.
revoke all on school_whatsapp_configs from anon, authenticated;

-- Write path: upserts a school's own config and (re)encrypts its
-- credentials into Vault. SECURITY DEFINER so it can call
-- vault.create_secret/update_secret (app_user has no USAGE on the
-- vault schema, confirmed live) -- but still re-checks the tenant
-- explicitly against the CALLING session's own app.current_tenant_id
-- GUC (SECURITY DEFINER elevates the executing role for privilege
-- checks, it does not change session-level settings, so this read is
-- exactly as trustworthy as an ordinary RLS policy's own check) so a
-- SECURITY DEFINER function can never become a cross-tenant write
-- primitive.
create function whatsapp_config_set_credentials(
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

revoke all on function whatsapp_config_set_credentials(uuid, text, text, text, text, text, uuid) from public;
grant execute on function whatsapp_config_set_credentials(uuid, text, text, text, text, text, uuid) to app_user;

-- Read path: the ONLY way to get a plaintext credential back out.
-- Re-checks tenant ownership of the config row itself (not just the
-- id's existence) before ever touching vault.decrypted_secrets.
create function whatsapp_config_get_credentials(p_config_id uuid)
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

revoke all on function whatsapp_config_get_credentials(uuid) from public;
grant execute on function whatsapp_config_get_credentials(uuid) to app_user;

-- ---------------------------------------------------------------------
-- Template approval. No real Meta Business Manager exists yet (Task 0
-- confirmed zero real WhatsApp credentials anywhere in this project),
-- so no real approved template can exist either -- this is the
-- platform's own record of "which template names this gate will ever
-- send against," seeded with the one template Prompt H's own trigger
-- (attendance-absence) needs, in the same Platform-Default-with-
-- Optional-Override shape as the WABA config itself: school_id null =
-- platform default, applies to every school without its own row.
-- ---------------------------------------------------------------------
create type whatsapp_template_status as enum ('approved', 'pending', 'rejected');

create table whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(school_id),
  template_name text not null,
  status whatsapp_template_status not null default 'pending',
  created_at timestamptz not null default now()
);
create unique index idx_whatsapp_templates_platform_default on whatsapp_templates(template_name) where school_id is null;
create unique index idx_whatsapp_templates_school on whatsapp_templates(school_id, template_name) where school_id is not null;

alter table whatsapp_templates enable row level security;
alter table whatsapp_templates force row level security;

-- Platform-default rows (school_id is null) are visible to every
-- school; a school's own override row is visible only to that school.
create policy whatsapp_templates_read on whatsapp_templates
  for select using (school_id is null or school_id = current_setting('app.current_tenant_id', true)::uuid);
create policy whatsapp_templates_admin_write on whatsapp_templates as restrictive
  for insert with check (
    school_id = current_setting('app.current_tenant_id', true)::uuid
    and current_setting('app.current_role', true) in ('school_admin', 'principal')
  );

revoke all on whatsapp_templates from anon, authenticated;

insert into whatsapp_templates (school_id, template_name, status)
values (null, 'attendance_absence_notification', 'approved');

-- ---------------------------------------------------------------------
-- communication_log additions: the gate's own auditable attempt log
-- (Task 2c point 7) is this table, not a new one -- it already
-- carries exactly the right shape (comm_status already has
-- blocked_pilot/blocked_consent/blocked_budget/blocked_quiet_hours/
-- blocked_no_template, per docs/01_CONSTITUTION.md and
-- 08_EXECUTION_BIBLE.md's own "the send gate blocks and logs as
-- blocked_pilot" language -- the pilot check is not something this
-- prompt's own checklist named explicitly, but it is unmistakably part
-- of the SAME single send gate these docs already describe, and
-- skipping it here would silently reopen a gap Prompt A already closed
-- once). Idempotency needs a real dedupe key (Task 2c point 4); the
-- resolution-fallback trace (Task 2c point 6) needs somewhere to say
-- which provider actually handled a send and why a school-specific one
-- wasn't used.
-- ---------------------------------------------------------------------
alter table communication_log
  add column dedupe_key text,
  add column provider_used text,   -- 'school_specific' | 'platform_default'
  add column fallback_reason text, -- non-null only when a school-specific config existed but wasn't used
  add column reason text;          -- the specific, human-readable reason (Task 2c point 7) -- `status`
                                    -- (comm_status) only ever carried the CATEGORY
                                    -- (blocked_consent/blocked_budget/...), never the specific detail
                                    -- (which purpose, which budget numbers); found live during VERIFY
                                    -- when this column didn't exist yet and the gate's own `reason`
                                    -- string was never actually being persisted anywhere.

create unique index idx_commlog_dedupe_key on communication_log(school_id, dedupe_key) where dedupe_key is not null;
