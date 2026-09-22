-- =====================================================================
-- Pre-Prompt-I hardening, GAP 3 -- recompute_fee_status() still
-- references the pre-rename column name. Found live, by accident, while
-- building real negative-test evidence for the accounting-RLS/payments
-- append-only fixes in this same PR: an INSERT into `payments` fails
-- outright with "column amount_paise does not exist", because this
-- trigger function (created in migration 2, 20260917072616_fee_engine.sql)
-- was never updated when
-- 20260921085859_jurisdiction_timezone_currency_statutory_label.sql
-- (Pre-F Architecture Hardening, Stage 1b) renamed
-- fees_ledger.amount_paise and payments.amount_paise to amount_minor.
--
-- Impact: since that rename landed, no row has ever been insertable,
-- updatable, or deletable in `payments` -- the AFTER trigger fires
-- unconditionally on every payments write and crashes before the
-- statement can complete. This has nothing to do with RLS or grants;
-- it is a plain broken column reference, inherited, present since the
-- currency migration, not introduced by this PR or by Prompt I. Fixed
-- here because the payments-related hardening in this same PR cannot
-- otherwise be exercised or verified at all.
-- =====================================================================

create or replace function recompute_fee_status() returns trigger as $$
declare
  v_fee_id uuid;
  v_amount bigint;
  v_due date;
  v_paid bigint;
  v_new_status fee_status;
begin
  v_fee_id := coalesce(new.fee_id, old.fee_id);

  select amount_minor, due_date into v_amount, v_due
    from fees_ledger where fee_id = v_fee_id;

  select coalesce(sum(amount_minor), 0) into v_paid
    from payments where fee_id = v_fee_id;

  if v_amount = 0 then
    v_new_status := 'waived';
  elsif v_paid >= v_amount then
    v_new_status := 'paid';
  elsif v_paid > 0 then
    v_new_status := 'partial';
  elsif v_due < current_date then
    v_new_status := 'overdue';
  else
    v_new_status := 'pending';
  end if;

  update fees_ledger set status = v_new_status, updated_at = now() where fee_id = v_fee_id;
  return null;
end;
$$ language plpgsql;
