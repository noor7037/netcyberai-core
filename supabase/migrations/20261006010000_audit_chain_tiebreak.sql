-- C127: the audit hash chain's "previous row" is deterministic.
--
-- audit_hash_chain() took the newest row of the school by occurred_at alone.
-- Two rows of one school with the same occurred_at made "newest" ambiguous:
-- the next row could link to either, and the chain forked. Seen on the test
-- harness, whose clock ticks in milliseconds (26 of 40 runs of the C124
-- chain test); on Postgres the clock ticks in microseconds and each insert
-- holds the school's lock, so a tie is far less likely, but nothing ruled it
-- out. The tie is now broken by audit_id: of rows with the same time, the
-- one inserted last is the previous row. Anyone checking the chain reads it
-- in the same order: occurred_at, then audit_id.
--
-- Same function otherwise (SECURITY DEFINER and search_path as C124). No
-- audit row is changed; the hash inputs are the same.
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
    order by occurred_at desc, audit_id desc limit 1;
  new.prev_hash := coalesce(prev, '0');
  new.row_hash := encode(
    extensions.digest(coalesce(new.prev_hash,'') || new.event_action || coalesce(new.target_id,'') || new.occurred_at::text, 'sha256'),
    'hex'
  );
  return new;
end;
$$;
revoke execute on function audit_hash_chain() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
    where p.oid = 'public.audit_hash_chain()'::regprocedure and p.prosecdef and (r.rolbypassrls or r.rolsuper)
  ) then
    raise exception 'audit_hash_chain() must be SECURITY DEFINER and owned by a role that bypasses row level security';
  end if;
end $$;
