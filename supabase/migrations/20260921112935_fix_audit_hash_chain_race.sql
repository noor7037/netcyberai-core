-- Stage 2a (Pre-F Architecture Hardening): audit_hash_chain() race fix.
--
-- Two problems in the previous trigger, both from Decision Log C40's
-- own lesson that "a passing gate proves only what it measured" (C39's
-- Task 0 tested tenant GUCs, not this):
--
-- 1. No lock around the "read previous hash" step: two concurrent
--    inserts for the same school both see the same prior row_hash
--    under MVCC snapshot isolation (neither sees the other's uncommitted
--    row), so both compute a row_hash chained off the SAME prev_hash --
--    forking the chain instead of extending it linearly.
-- 2. occurred_at's column default is now(), which returns the
--    TRANSACTION's start time, cached for the whole transaction -- not
--    when the row is actually being chained. Two transactions that
--    started in one order can commit (and therefore chain) in the
--    other order, so `order by occurred_at desc limit 1` is not
--    guaranteed to return the row this insert should actually chain
--    off of.
--
-- Fix: a per-school (or per-platform-event, for NULL school_id)
-- pg_advisory_xact_lock serializes concurrent inserts -- the second
-- transaction blocks here until the first commits and releases the
-- lock, at which point it correctly sees the first's row. Once inserts
-- are serialized this way, occurred_at is overridden with
-- clock_timestamp() (the actual wall-clock time at execution, not the
-- transaction-start-cached now()) so the stored ordering matches the
-- real serialization order the lock now guarantees.
--
-- [GAP] Verified live for sequential inserts only (chain links
-- correctly, no regression) -- see docs/10_DECISION_LOG.md. Genuine
-- concurrent-transaction proof (two real overlapping sessions) was
-- attempted via dblink and refused for lack of a usable password on
-- this managed Postgres instance; this sandbox cannot open a second
-- raw connection itself (Decision Log C38). Not claimed as proven
-- under real concurrency.
create or replace function audit_hash_chain() returns trigger as $$
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
$$ language plpgsql;
