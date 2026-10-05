-- C124 (founder): the reason the founder types for an entitlement change is
-- founder-only. School roles must never be able to read it.
--
-- Before this, the reason sat in audit_log.after_state of the
-- 'entitlement.%' rows, and audit_read_own_school lets every role of a
-- school read its own audit rows. Three parts:
--
--   1. entitlement_change_reasons: the reason lives here, one row per audit
--      row. Only nca_super (the founder's path) holds any grant on it.
--   2. A RESTRICTIVE policy on audit_log: any 'entitlement.%' row that
--      carries a reason (the older rows; audit_log is append-only, they are
--      not edited) is hidden from every role subject to row level security.
--   3. audit_hash_chain becomes SECURITY DEFINER: it reads the previous
--      row's hash as the table owner, so a row hidden from the caller can
--      never fork the chain.
--
-- audit_log stays append-only: no row is updated or deleted here, and no
-- grant on it changes. The hash covers prev_hash, event_action, target_id
-- and occurred_at, none of which this touches.

-- ---- 1. the founder-only table ------------------------------------------------
create table entitlement_change_reasons (
  audit_id   bigint primary key references audit_log (audit_id),
  school_id  uuid not null references schools (school_id),
  reason     text not null check (char_length(reason) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- Supabase's default privileges give every new public table to anon,
-- authenticated, service_role, app_user and nca_super: take all of it back,
-- then grant the founder's path read and insert only (append-only).
revoke all on entitlement_change_reasons from public, anon, authenticated, service_role, app_backend, app_user, nca_super;
revoke update, delete on entitlement_change_reasons from app_user, anon, authenticated, nca_super;
grant select, insert on entitlement_change_reasons to nca_super;

alter table entitlement_change_reasons enable row level security;
alter table entitlement_change_reasons force row level security;

-- Scoped `to nca_super` (BYPASSRLS anyway), so no other role can ever match
-- a policy on this table, whatever it sets app.current_role to.
create policy entitlement_change_reasons_platform_read on entitlement_change_reasons for select to nca_super using (true);
create policy entitlement_change_reasons_platform_insert on entitlement_change_reasons for insert to nca_super with check (true);

-- The reasons already written, copied (not moved: audit_log is append-only).
insert into entitlement_change_reasons (audit_id, school_id, reason, created_at)
select audit_id, school_id, left(after_state ->> 'reason', 2000), occurred_at
from audit_log
where event_action like 'entitlement.%'
  and school_id is not null
  and jsonb_typeof(after_state -> 'reason') = 'string'
  and char_length(after_state ->> 'reason') >= 1
on conflict (audit_id) do nothing;

-- ---- 2. an entitlement audit row that carries a reason ----------------------------
-- RESTRICTIVE, for every role, with no super_admin clause: the founder reads
-- as nca_super (BYPASSRLS), so nothing a school role can set opens it.
-- It covers the older rows and any row a deployment from before C124 still
-- writes (so this migration is safe to apply before or after the code, and
-- across a rollback): such a row is hidden, never refused.
create policy audit_founder_reason_hidden on audit_log as restrictive for select
  using (
    not (
      event_action like 'entitlement.%'
      and (coalesce(after_state ? 'reason', false) or coalesce(before_state ? 'reason', false))
    )
  );

-- ---- 3. the hash chain reads the previous row as the table owner -------------------
-- Same body as before; only SECURITY DEFINER is new. Without it the lookup
-- of the previous hash ran under the caller's row level security, so a row
-- the caller cannot see (part 2, or a platform row for a school role) was
-- skipped and the next row chained to the wrong one.
create or replace function audit_hash_chain() returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  prev text;
begin
  perform pg_advisory_xact_lock(hashtext(coalesce(new.school_id::text, '__platform__')));
  new.occurred_at := clock_timestamp();

  select row_hash into prev from audit_log
    where school_id is not distinct from new.school_id
    order by occurred_at desc limit 1;
  new.prev_hash := coalesce(prev, '0');
  new.row_hash := encode(
    extensions.digest(coalesce(new.prev_hash,'') || new.event_action || coalesce(new.target_id,'') || new.occurred_at::text, 'sha256'),
    'hex'
  );
  return new;
end;
$$;
-- A trigger function is never called directly; the trigger still fires for
-- every role (EXECUTE is checked when a trigger is created, not when it fires).
revoke execute on function audit_hash_chain() from public, anon, authenticated, service_role;
