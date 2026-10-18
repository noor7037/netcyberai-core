-- C237 (wave C236, L2; C235-D2's "later slice"): the scheduled sweep of record documents sent and never confirmed.
--
-- A paper sent straight to the file store (C235-D2) first lands at "<school>/record-documents/pending/<uuid>.<ext>".
-- If the page is closed before "confirm", or the upload link is used after its ticket's ten minutes, the file stays
-- there unchecked: no row and no link reaches it. Until now it went only when someone at that school asked to send
-- another paper. Now one job an hour removes, for every school, the pending files older than PENDING_DEAD_SECONDS
-- (15 minutes: every ticket that could still confirm them has stopped working), through the one storage module
-- (src/lib/jobs/pending-sweep.ts). Kept files are never touched: only files directly under a school's pending folder
-- are listed. Each school where something went gets one audit row with the count only: no names, no keys.
--
-- DEPLOY SAFETY, as C210: this reaches the database before the code that runs the job, and a job with no handler
-- dies at once. The deployed runner writes the job types it handles to platform_settings 'jobs.handlers'
-- (src/lib/jobs/handled-types.ts); the enqueue function queues only once 'record_documents.pending_sweep' is there.
--
-- Who may call it: pg_cron (the database owner) only. Nothing else changes: no table, no policy, no grant.

-- This hour's sweep, once (the idempotency key is the hour in UTC).
create function public.record_documents_pending_sweep_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'record_documents.pending_sweep', jsonb_build_object('hour', t.h), 'record_documents.pending_sweep:' || t.h, 3
    from (select to_char(date_trunc('hour', now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24') as h) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'record_documents.pending_sweep')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.record_documents_pending_sweep_enqueue() from public, anon, authenticated, service_role;

-- Five minutes past every hour. cron.schedule upserts by name. Where there is no scheduler (the test harness),
-- nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('record-documents-pending-sweep', '5 * * * *', 'select public.record_documents_pending_sweep_enqueue()');
  end if;
end $$;
