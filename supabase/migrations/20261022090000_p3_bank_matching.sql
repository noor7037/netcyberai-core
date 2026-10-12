-- P3 6h-2 part 2 (C177): statement rows are matched to payments.
--
-- 1. A credit whose evidence is a bank statement row must have that row.
--    Checked when the transaction ends: the evidence is written first, the
--    row is tied to it next, and a credit "from the bank" with no bank line
--    behind it cannot be committed, by anyone, by hand or by code.
-- 2. A report marked "not found" may become verified when the bank's own
--    line turns up (a person confirms it; the evidence is the bank row).
--    Nothing else about a decided report changes.

-- 1.
create function public.bank_evidence_has_its_row() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from bank_credit_rows b where b.school_id = new.school_id and b.evidence_id = new.evidence_id and b.amount_minor = new.amount_minor) then
    raise exception 'a credit from a bank statement needs its bank row' using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function public.bank_evidence_has_its_row() from public;
create constraint trigger payment_evidence_bank_row after insert on payment_evidence
  deferrable initially deferred for each row when (new.source = 'bank_statement_row')
  execute function public.bank_evidence_has_its_row();

-- 2.
create or replace function public.payment_reports_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.link_id, new.utr, new.amount_minor, new.reported_at) is distinct from (old.school_id, old.link_id, old.utr, old.amount_minor, old.reported_at) then
    raise exception 'a payment report is never edited' using errcode = 'check_violation';
  end if;
  -- The one way back: "not found" to waiting, by a named person with a reason, newly given.
  if old.status = 'not_found' and new.status = 'reported' and new.reopened_by is not null and new.reopen_reason is not null
     and new.reopened_at is distinct from old.reopened_at and new.evidence_id is null and new.decided_by is null then
    return new;
  end if;
  -- "Not found", then found in the bank statement: verified on the bank row's evidence, by a named person.
  if old.status = 'not_found' and new.status = 'verified' and new.decided_by is not null and new.evidence_id is not null
     and exists (select 1 from payment_evidence v where v.evidence_id = new.evidence_id and v.school_id = new.school_id and v.source = 'bank_statement_row') then
    return new;
  end if;
  if old.status in ('verified', 'not_found', 'withdrawn') and (new.status, new.decided_by, new.amount_seen_minor, new.evidence_id) is distinct from (old.status, old.decided_by, old.amount_seen_minor, old.evidence_id) then
    raise exception 'a decided payment report is not decided again' using errcode = 'check_violation';
  end if;
  return new;
end $$;
