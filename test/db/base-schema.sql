-- The slice of the live schema the B2 migration builds on (C98), for the
-- PGlite flow and RLS tests: the same enums, roles, columns that matter,
-- policies and audit hash chain as the dev and prod projects (read from
-- dev on 2026-09-30). The B2 migration file itself is then applied
-- verbatim on top.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role app_backend nologin;
create role app_user nologin;
create role nca_super nologin bypassrls;

create type user_role as enum ('super_admin', 'school_admin', 'principal', 'teacher', 'accountant', 'parent', 'student', 'academic_coordinator');
create type board_type as enum ('CBSE', 'ICSE', 'STATE', 'IB', 'OTHER');
create type tenant_type as enum ('school', 'coaching', 'college');
create type onboarding_stage as enum ('tenant_created', 'admin_invited', 'data_imported', 'data_validated', 'consent_collection', 'configuration', 'training', 'pilot_outbound_approved', 'go_live');

create table schools (
  school_id uuid primary key default gen_random_uuid(),
  name text not null,
  board board_type not null default 'STATE',
  tenant_type tenant_type not null default 'school',
  is_pilot boolean not null default true,
  pilot_allow_outbound boolean not null default false,
  onboarding_stage onboarding_stage not null default 'tenant_created',
  jurisdiction text not null,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  user_id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(school_id),
  email text,
  phone text,
  role user_role not null,
  display_name text not null,
  is_active boolean not null default true,
  token_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_users_school_email on users(school_id, email) where email is not null;

create table memberships (
  membership_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id),
  school_id uuid not null references schools(school_id),
  role user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, school_id)
);

create table audit_log (
  audit_id bigserial primary key,
  occurred_at timestamptz not null default now(),
  school_id uuid,
  actor_user_id uuid,
  actor_role user_role,
  event_action text not null,
  target_type text,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  prev_hash text,
  row_hash text,
  created_at timestamptz not null default now()
);

create or replace function audit_hash_chain() returns trigger
language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(hashtext(coalesce(new.school_id::text, '__platform__')));
  new.occurred_at := clock_timestamp();
  select row_hash into prev from audit_log where school_id is not distinct from new.school_id order by occurred_at desc limit 1;
  new.prev_hash := coalesce(prev, '0');
  new.row_hash := encode(extensions.digest(coalesce(new.prev_hash,'') || new.event_action || coalesce(new.target_id,'') || new.occurred_at::text, 'sha256'), 'hex');
  return new;
end $$;
create trigger audit_hash_chain_trigger before insert on audit_log for each row execute function audit_hash_chain();

grant usage on schema public, extensions to app_user, nca_super, app_backend, anon, authenticated;
grant execute on all functions in schema extensions to app_user, nca_super;
grant select, insert, update, delete on schools, users, memberships to app_user, nca_super;
grant select, insert on audit_log to app_user, nca_super;
grant usage on sequence audit_log_audit_id_seq to app_user, nca_super;
-- Supabase's defaults: anon and authenticated get every new public table.
alter default privileges in schema public grant all on tables to anon, authenticated, app_user, nca_super;

alter table schools enable row level security;
alter table users enable row level security;
alter table memberships enable row level security;
alter table audit_log enable row level security;
create policy schools_tenant_isolation on schools using (school_id = (current_setting('app.current_tenant_id', true))::uuid or current_setting('app.current_role', true) = 'super_admin');
create policy users_tenant_isolation on users using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy memberships_tenant_isolation on memberships using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy audit_insert_only on audit_log for insert with check (true);
create policy audit_read_own_school on audit_log for select using (school_id = (current_setting('app.current_tenant_id', true))::uuid or current_setting('app.current_role', true) = 'super_admin');
