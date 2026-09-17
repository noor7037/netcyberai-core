-- =====================================================================
-- Migration 2 (Prompt A) — Complex Fee Engine
-- Source: docs/05_BUSINESS_LOGIC.md §2, docs/04_SYSTEM_DESIGN_PRD.md §3.3
-- Additive to db/schema.sql's flat fees_ledger. fee_heads, fee_structures,
-- fee_structure_items, fee_concessions, payments. fees_ledger.status
-- becomes DERIVED (see migration comment at end) from sum(payments) —
-- implemented as a trigger-maintained column (chosen over a view because
-- the existing idx_fees_school_status index on fees_ledger.status must
-- keep working for filtered listing queries; a view would need its own
-- materialization to be indexable the same way).
-- =====================================================================

alter type fee_status add value 'partial';

-- Fee heads: the named components a fee decomposes into.
-- form6_term maps an internal head to Haryana Form 6 terminology.
create table fee_heads (
  head_id        uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  name           text not null,              -- 'Tuition', 'Transport', 'Lab'
  form6_term     text,                        -- state-filing terminology, nullable
  is_mandatory   boolean not null default true,
  is_annual      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index idx_fee_heads_school on fee_heads(school_id);

-- Fee structure: what a given class pays, for a given academic year.
create table fee_structures (
  structure_id   uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  class_id       uuid references classes(class_id),
  academic_year  text not null,              -- '2026-27'
  effective_from date not null,
  created_by     uuid references users(user_id),
  created_at     timestamptz not null default now()
);
create index idx_fee_structures_school on fee_structures(school_id, academic_year);

create table fee_structure_items (
  item_id        uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  structure_id   uuid not null references fee_structures(structure_id),
  head_id        uuid not null references fee_heads(head_id),
  amount_paise   bigint not null,
  frequency      text not null check (frequency in ('monthly','quarterly','half_yearly','annual','one_time'))
);
create index idx_fee_items_school on fee_structure_items(school_id, structure_id);

-- Concessions: every discount is an explicit, approved, reasoned human decision.
create table fee_concessions (
  concession_id  uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  student_id     uuid not null references students(student_id),
  head_id        uuid references fee_heads(head_id),   -- null = applies to all heads
  kind           text not null check (kind in ('sibling','staff_ward','rte','negotiated','hardship','scholarship')),
  percent_off    numeric,                    -- use one of percent_off or amount_off_paise
  amount_off_paise bigint,
  reason         text not null,
  approved_by    uuid not null references users(user_id),
  valid_from     date not null,
  valid_to       date,
  created_at     timestamptz not null default now(),
  check (percent_off is not null or amount_off_paise is not null)
);
create index idx_concessions_school_student on fee_concessions(school_id, student_id);

-- Payments: N payments against 1 ledger line. Partial payment is first-class.
create table payments (
  payment_id     uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  fee_id         uuid not null references fees_ledger(fee_id),
  amount_paise   bigint not null check (amount_paise > 0),
  method         text not null check (method in ('cash','upi','card','netbanking','cheque','adjustment')),
  razorpay_payment_id text,
  received_by    uuid references users(user_id),      -- for cash, who took it
  received_at    timestamptz not null default now(),
  receipt_url    text,
  reconciled     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index idx_payments_school_fee on payments(school_id, fee_id);

-- ---------------------------------------------------------------------
-- fees_ledger.status: DERIVED, never set directly by application code.
-- Chosen implementation: trigger-maintained column (not a view), because
-- fees_ledger already has an index on (school_id, status, due_date) that
-- application list/filter queries depend on; a view recomputing status
-- on every read would lose that index's selectivity for a small dataset
-- multiplied across many schools. A trigger on payments (insert/update/
-- delete) recomputes and writes fees_ledger.status directly, so the
-- existing index keeps working and status is still never hand-set.
-- ---------------------------------------------------------------------
-- [GAP] "concession covers full amount -> waived" (05_BUSINESS_LOGIC.md
-- §2) cannot be implemented as a deterministic join here: fees_ledger is
-- flat (no head_id), while fee_concessions is per-head or per-student
-- across all heads, so a concession cannot be matched to one specific
-- fees_ledger row without ambiguity when a student has multiple fee
-- lines. The unambiguous, defensible rule implemented instead: a fee
-- whose amount_paise is 0 is 'waived' -- i.e. a concession is expected
-- to net out the amount at fee-generation time (Prompt I), not be
-- matched against a nonzero ledger line at status-read time. Prompt I
-- must decide, and document, how a full concession actually reaches
-- fees_ledger.amount_paise; this trigger only derives status from what's
-- already on the row.
create or replace function recompute_fee_status() returns trigger as $$
declare
  v_fee_id uuid;
  v_amount bigint;
  v_due date;
  v_paid bigint;
  v_new_status fee_status;
begin
  v_fee_id := coalesce(new.fee_id, old.fee_id);

  select amount_paise, due_date into v_amount, v_due
    from fees_ledger where fee_id = v_fee_id;

  select coalesce(sum(amount_paise), 0) into v_paid
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

create trigger payments_recompute_fee_status
  after insert or update or delete on payments
  for each row execute function recompute_fee_status();
