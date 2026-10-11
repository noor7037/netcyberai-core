-- P3 6b (C159): raising dues, concessions, RTE tagging.
--
--   1. A ledger line says what it is for (head, period) and how its amount
--      was reached: gross, concession, net. This closes the gap recorded in
--      the fee engine migration (a concession could not be matched to a
--      line). `amount_minor` stays the net, so every reader keeps working.
--   2. A concession is proposed, then approved or ended by a person; it is
--      never deleted.
--   3. RTE tagging on the student (D4, tagging only).
--   4. Fee data is read by the principal, the school admin and the
--      accountant (and a parent, their own children's, as before). Until now
--      any staff role in the school could read dues, payments and
--      concessions.

-- 1.
alter table fees_ledger add column head_id uuid;
alter table fees_ledger add column period_key text check (period_key is null or char_length(period_key) between 1 and 20);
alter table fees_ledger add column structure_id uuid;
alter table fees_ledger add column gross_minor bigint;
alter table fees_ledger add column concession_minor bigint not null default 0;
-- [{ "kind": text, "minor": bigint, "concessionId": uuid | null }]
alter table fees_ledger add column concession_detail jsonb not null default '[]'::jsonb check (jsonb_typeof(concession_detail) = 'array');
update fees_ledger set gross_minor = amount_minor where gross_minor is null;
alter table fees_ledger alter column gross_minor set not null;
alter table fees_ledger add constraint fees_ledger_adds_up check (gross_minor >= 0 and concession_minor >= 0 and amount_minor >= 0 and gross_minor - concession_minor = amount_minor);
alter table fees_ledger add constraint fees_ledger_school_head_fkey foreign key (school_id, head_id) references fee_heads(school_id, head_id);
alter table fees_ledger add constraint fees_ledger_school_structure_fkey foreign key (school_id, structure_id) references fee_structures(school_id, structure_id);
alter table fees_ledger add constraint fees_ledger_head_needs_period check ((head_id is null) = (period_key is null));
-- One line per student, head and period: raising dues twice makes no second line.
create unique index fees_ledger_one_per_student_head_period on fees_ledger (school_id, student_id, head_id, period_key) where head_id is not null;

-- A line that nets to nothing is waived from the start (the payments trigger
-- already says so once a payment event happens; nothing is ever paid on it).
create or replace function fees_ledger_initial_status() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  -- An older caller gives only the net: then nothing was conceded.
  if new.gross_minor is null then new.gross_minor := new.amount_minor + new.concession_minor; end if;
  if new.amount_minor = 0 and new.status = 'pending' then new.status := 'waived'; end if;
  return new;
end $$;
create trigger fees_ledger_initial_status before insert on fees_ledger for each row execute function fees_ledger_initial_status();

-- 2.
alter table fee_concessions add column status text not null default 'approved' check (status in ('proposed', 'approved', 'ended'));
alter table fee_concessions add column proposed_by uuid;
alter table fee_concessions add column decided_at timestamptz;
alter table fee_concessions alter column approved_by drop not null;
alter table fee_concessions add constraint fee_concessions_approved_has_approver check (status = 'proposed' or approved_by is not null);
alter table fee_concessions add constraint fee_concessions_one_measure check ((percent_off is null) <> (amount_off_minor is null));
alter table fee_concessions add constraint fee_concessions_percent_range check (percent_off is null or (percent_off > 0 and percent_off <= 100 and percent_off = round(percent_off, 2)));
alter table fee_concessions add constraint fee_concessions_amount_positive check (amount_off_minor is null or amount_off_minor > 0);
alter table fee_concessions add constraint fee_concessions_reason_length check (char_length(btrim(reason)) between 1 and 300);
alter table fee_concessions add constraint fee_concessions_dates check (valid_to is null or valid_to >= valid_from);
revoke delete on fee_concessions from app_user;
-- A due is never deleted. (Its status is still written by the payments trigger, as the caller.)
revoke delete on fees_ledger from app_user;

-- 3.
alter table students add column rte_admission boolean not null default false;
alter table students add column rte_entry_class text check (rte_entry_class is null or char_length(rte_entry_class) between 1 and 40);
alter table students add column rte_admitted_on date;
-- Only the principal or the school admin sets the RTE tag (a teacher may
-- update other fields of an own-class student).
create or replace function students_rte_office_only() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if (new.rte_admission, new.rte_entry_class, new.rte_admitted_on) is distinct from (old.rte_admission, old.rte_entry_class, old.rte_admitted_on)
     and current_user = 'app_user'
     and coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin', 'super_admin') then
    raise exception 'only the principal or the school admin sets the RTE tag' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger students_rte_office_only before update on students for each row execute function students_rte_office_only();

-- 4.
create policy fees_ledger_finance_read on fees_ledger as restrictive
  for select using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin', 'parent']));
create policy fees_ledger_finance_write on fees_ledger as restrictive
  for insert with check (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy payments_finance_read on payments as restrictive
  for select using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy fee_concessions_finance_read on fee_concessions as restrictive
  for select using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
