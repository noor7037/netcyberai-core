-- P3 6d (C163): overdue as a stored fact, by India's date and the balance.
--
-- 1. One rule for a due's status, used by the payments trigger and nowhere
--    re-typed: nothing to pay is waived; paid in full is paid; past its date
--    with anything still owed is overdue (part paid or not); otherwise part
--    paid or pending. "Today" is always passed in: India's date.
-- 2. The payments trigger used the server's date (UTC) and showed a part-paid
--    fee past its date as part paid. It now uses India's date and this rule.
-- 3. A late fee is a new due line that names the line it is for; one at most.
-- 4. fee_status_runs: one row per school and night, written by the nightly
--    job: how many dues it marked overdue, the late fees it raised, and the
--    result of the reconciliation check.
-- 5. The clock: each night just after midnight in India a job is queued; the
--    job sweeper already running every minute hands it to the app.

-- 1.
create function public.fee_status_for(p_amount bigint, p_paid bigint, p_due date, p_today date) returns fee_status
language sql immutable set search_path = public, pg_temp as $$
  select (case when p_amount = 0 then 'waived'
               when p_paid >= p_amount then 'paid'
               when p_due < p_today then 'overdue'
               when p_paid > 0 then 'partial'
               else 'pending' end)::fee_status
$$;
revoke all on function public.fee_status_for(bigint, bigint, date, date) from public;
grant execute on function public.fee_status_for(bigint, bigint, date, date) to app_user, nca_super;

-- 2.
create or replace function public.recompute_fee_status() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_fee_id uuid;
begin
  v_fee_id := coalesce(new.fee_id, old.fee_id);
  update fees_ledger l
     set status = fee_status_for(l.amount_minor, (select coalesce(sum(p.amount_minor), 0) from payments p where p.fee_id = l.fee_id)::bigint, l.due_date, (now() at time zone 'Asia/Kolkata')::date)
   where l.fee_id = v_fee_id;
  return coalesce(new, old);
end $$;

-- 3.
alter table fees_ledger add column late_fee_for uuid;
alter table fees_ledger add constraint fees_ledger_late_fee_for_fkey foreign key (school_id, late_fee_for) references fees_ledger(school_id, fee_id);
alter table fees_ledger add constraint fees_ledger_late_fee_has_no_head check (late_fee_for is null or (head_id is null and late_fee_for <> fee_id));
create unique index fees_ledger_one_late_fee_per_due on fees_ledger (school_id, late_fee_for) where late_fee_for is not null;

-- 4.
create table fee_status_runs (
  run_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  run_date date not null,
  marked_overdue int not null check (marked_overdue >= 0),
  late_fees_raised int not null check (late_fees_raised >= 0),
  late_fee_minor bigint not null check (late_fee_minor >= 0),
  problems int not null check (problems >= 0),
  balance_minor bigint not null,
  created_at timestamptz not null default now(),
  unique (school_id, run_date)
);
revoke all on fee_status_runs from public, anon, authenticated;
grant select on fee_status_runs to app_user;
grant select, insert on fee_status_runs to nca_super;
alter table fee_status_runs enable row level security;
alter table fee_status_runs force row level security;
create policy fee_status_runs_tenant_isolation on fee_status_runs using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy fee_status_runs_finance on fee_status_runs as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));

-- 5. Queues tonight's job once (the idempotency key is India's date).
create function public.fees_nightly_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  values ('fees.nightly', jsonb_build_object('date', ((now() at time zone 'Asia/Kolkata')::date)::text), 'fees.nightly:' || ((now() at time zone 'Asia/Kolkata')::date)::text, 8)
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.fees_nightly_enqueue() from public;
-- 18:35 UTC is 00:05 in India. cron.schedule upserts by name. Where there is
-- no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fees-nightly', '35 18 * * *', 'select public.fees_nightly_enqueue()');
  end if;
end $$;
