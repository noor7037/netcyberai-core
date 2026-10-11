-- P3 6c (C160): payments at the counter, receipts, reversals.
--
--   1. A receipt: one numbered record of money received, covering one or
--      more payments (one per due it was put against).
--   2. Payments stay append-only. A wrong payment is corrected by a
--      reversal: a row with the opposite amount that names the payment it
--      reverses. Nothing is edited or deleted.
--   3. The database itself refuses a payment larger than what is still
--      owed on its due, a reversal that is not the exact opposite of an
--      unreversed payment of the same due, and a second reversal.

-- 1.
create table receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  receipt_no text not null check (char_length(receipt_no) between 1 and 40),
  student_id uuid not null,
  family_id uuid,
  total_minor bigint not null check (total_minor > 0),
  currency char(3) not null default 'INR',
  method text not null check (method in ('cash', 'upi', 'card', 'netbanking', 'cheque')),
  reference text check (reference is null or char_length(reference) between 1 and 80),
  -- Who chose where the money went: the oldest due first, or the office picked.
  allocation text not null default 'oldest_first' check (allocation in ('oldest_first', 'chosen')),
  -- An id made by the screen for one press of "Take payment": the same press arriving twice is one receipt.
  client_ref uuid,
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason text check (reversal_reason is null or char_length(btrim(reversal_reason)) between 1 and 300),
  unique (school_id, receipt_id),
  unique (school_id, receipt_no),
  unique (school_id, client_ref),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, family_id) references families(school_id, family_id),
  foreign key (school_id, issued_by) references users(school_id, user_id),
  foreign key (school_id, reversed_by) references users(school_id, user_id),
  check ((reversed_at is null) = (reversed_by is null) and (reversed_at is null) = (reversal_reason is null))
);
create index idx_receipts_school_issued on receipts(school_id, issued_at desc);
create index idx_receipts_student on receipts(school_id, student_id);

revoke all on receipts from public, anon, authenticated;
grant select, insert, update on receipts to app_user, nca_super;
alter table receipts enable row level security;
alter table receipts force row level security;
create policy receipts_tenant_isolation on receipts using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy receipts_finance on receipts as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy receipts_issue_as_self on receipts as restrictive
  for insert with check (issued_by = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- A receipt is written once. The only later change is its reversal, once.
create or replace function receipts_only_reversal_changes() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if old.reversed_at is not null then raise exception 'a reversed receipt is not changed again' using errcode = '23514'; end if;
  if (new.receipt_no, new.student_id, new.family_id, new.total_minor, new.currency, new.method, new.reference, new.allocation, new.client_ref, new.issued_by, new.issued_at)
     is distinct from (old.receipt_no, old.student_id, old.family_id, old.total_minor, old.currency, old.method, old.reference, old.allocation, old.client_ref, old.issued_by, old.issued_at) then
    raise exception 'a receipt is not changed after it is issued' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger receipts_only_reversal_changes before update on receipts for each row execute function receipts_only_reversal_changes();

-- 2.
alter table payments add column receipt_id uuid;
alter table payments add column reverses_payment_id uuid;
alter table payments add constraint payments_school_id_payment_id_key unique (school_id, payment_id);
alter table payments add constraint payments_school_receipt_fkey foreign key (school_id, receipt_id) references receipts(school_id, receipt_id);
alter table payments add constraint payments_school_reverses_fkey foreign key (school_id, reverses_payment_id) references payments(school_id, payment_id);
create unique index payments_one_reversal_per_payment on payments (reverses_payment_id) where reverses_payment_id is not null;
alter table payments drop constraint payments_amount_paise_check;
alter table payments add constraint payments_amount_sign check ((reverses_payment_id is null and amount_minor > 0) or (reverses_payment_id is not null and amount_minor < 0));

-- 3.
create or replace function payments_guard() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $$
declare
  v_net bigint;
  v_paid bigint;
  v_orig record;
begin
  -- One due at a time: two payments on the same due wait for each other.
  select amount_minor into v_net from fees_ledger where fee_id = new.fee_id and school_id = new.school_id for update;
  if v_net is null then raise exception 'the due of this payment does not exist in this school' using errcode = '23503'; end if;
  if new.reverses_payment_id is not null then
    select fee_id, amount_minor, reverses_payment_id into v_orig from payments where payment_id = new.reverses_payment_id and school_id = new.school_id;
    if v_orig is null or v_orig.reverses_payment_id is not null or v_orig.fee_id <> new.fee_id or new.amount_minor <> -v_orig.amount_minor then
      raise exception 'a reversal is the exact opposite of one unreversed payment of the same due' using errcode = '23514';
    end if;
    return new;
  end if;
  select coalesce(sum(amount_minor), 0) into v_paid from payments where fee_id = new.fee_id;
  if v_paid + new.amount_minor > v_net then
    raise exception 'a payment cannot be more than what is still owed on its due' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger payments_guard before insert on payments for each row execute function payments_guard();

-- 4. The accountant issues receipts, so the accountant may take the next
--    receipt number. Every other number sequence stays the office's.
drop policy school_sequences_office_write on school_sequences;
create policy school_sequences_office_write on school_sequences as restrictive for all
  using (true)
  with check (
    current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin')
    or (current_setting('app.current_role', true) = 'accountant' and sequence_key = 'receipt')
  );

-- 5. A correction to the P2 and P3 migrations (found while testing this
--    one). Both databases give the app's role every right on a new table by
--    default, so `grant select, insert ...` in those migrations narrowed
--    nothing: the role could also update and delete. Row level security
--    still applied, and the app never issues such statements, but the
--    tables were not append-only at the grant level as their migrations
--    said. The rights each table was meant to have are set here, by
--    removing the others.
revoke delete on receipts from app_user;
revoke delete on client_operations from app_user;
revoke update, delete on usage_events from app_user;
revoke delete on attendance_correction_requests from app_user;
revoke update on syllabus_units from app_user;
revoke delete on pulse_followups from app_user;
revoke delete on homework, homework_targets, homework_status from app_user;
revoke update, delete on homework_attachments from app_user;
revoke update, delete on recovery_plans from app_user;
revoke update, delete on ai_usage, teaching_notes from app_user;

