-- P3 6h-1 part 2 (C175): telling the verifiers, reopening a "not found",
-- and keeping a test school a test school while it holds test money.
--
-- 1. A report records when the verifiers were emailed about it. (Reminder
--    and principal-alert times are already on the row: each at most once.)
-- 2. A "not found" can be reopened by a person, with a reason, and by
--    nothing else: it goes back to waiting. Every other decided report
--    still cannot be decided again.
-- 3. A school with test-mode evidence cannot be un-marked as a test school:
--    its test receipts would then look like real money.

-- 1.
alter table payment_reports add column notified_at timestamptz;

-- 2.
alter table payment_reports add column reopened_by uuid;
alter table payment_reports add column reopened_at timestamptz;
alter table payment_reports add column reopen_reason text check (reopen_reason is null or char_length(btrim(reopen_reason)) between 1 and 300);
alter table payment_reports add constraint payment_reports_reopen_is_whole check ((reopened_by is null) = (reopened_at is null) and (reopened_by is null) = (reopen_reason is null));
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
  if old.status in ('verified', 'not_found', 'withdrawn') and (new.status, new.decided_by, new.amount_seen_minor, new.evidence_id) is distinct from (old.status, old.decided_by, old.amount_seen_minor, old.evidence_id) then
    raise exception 'a decided payment report is not decided again' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- 3. With the owner's rights, so the answer does not depend on which rows the caller may see.
create function public.schools_keep_test_flag() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.is_test_fixture and not new.is_test_fixture and exists (select 1 from payment_evidence e where e.school_id = old.school_id and e.mode = 'test') then
    raise exception 'this school holds test-mode payments and stays a test school' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.schools_keep_test_flag() from public;
create trigger schools_keep_test_flag before update of is_test_fixture on schools for each row execute function public.schools_keep_test_flag();
