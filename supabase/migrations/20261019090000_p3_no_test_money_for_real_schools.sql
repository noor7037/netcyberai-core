-- Test keys must never credit a real school (C173).
--
-- A payment made with a provider's TEST keys moves no money. Crediting it
-- to a real school would mark a fee paid that nobody paid. The app refuses
-- it in three places (switching the method on, opening a checkout, applying
-- a notice); this is the fourth, and it does not depend on the app:
--
-- 1. Every evidence row says whether it is test or live money.
-- 2. The database refuses test-mode evidence for any school that is not a
--    test-fixture school, whoever writes it.
-- 3. The mode, like the rest of what evidence says, never changes.

-- 1.
alter table payment_evidence add column mode text not null default 'live' check (mode in ('test', 'live'));

-- 2. Runs with the table owner's rights, so that the answer does not depend on which rows the caller may see.
create function public.payment_evidence_no_test_money() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.mode = 'test' and not coalesce((select s.is_test_fixture from schools s where s.school_id = new.school_id), false) then
    raise exception 'test-mode money is never credited to a real school' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.payment_evidence_no_test_money() from public;
create trigger payment_evidence_no_test_money before insert on payment_evidence for each row execute function public.payment_evidence_no_test_money();

-- 3.
create or replace function public.payment_evidence_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.source, new.external_id, new.amount_minor, new.created_at, new.mode) is distinct from (old.school_id, old.source, old.external_id, old.amount_minor, old.created_at, old.mode)
     or new.link_id is distinct from old.link_id or new.rule is distinct from old.rule or new.decided_by is distinct from old.decided_by or new.reason is distinct from old.reason
     or (old.receipt_id is not null and new.receipt_id is distinct from old.receipt_id) then
    raise exception 'payment evidence is never edited' using errcode = 'check_violation';
  end if;
  return new;
end $$;
