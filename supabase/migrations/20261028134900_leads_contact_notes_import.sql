-- Leads: country code, a dialable number, notes, and CSV import (W7-L).
-- Why: a real lead from Saudi Arabia left a local number (0503071760) with no
-- country code, so it could not be dialled. Every lead now stores the country
-- code the visitor chose and the number in international form (phone_e164,
-- '+' and digits), which the founder dials or WhatsApps from Control -> Leads.
-- `notes` and `status_changed_at` let the founder track each lead there, and
-- the 'import' source plus a super_admin INSERT policy let Control import a
-- CSV of leads gathered elsewhere. Additive only: existing rows keep their
-- values and satisfy the widened source check.

alter table leads
  add column country_code text not null default '+91',
  add column phone_e164 text,
  add column notes text,
  add column status_changed_at timestamptz;

-- Backfill: every row so far came from the Indian-default forms.
--   10 digits starting with 0 -> left null: a local number of an unknown
--     country (the Saudi case); the founder sets the country in Control.
--   10 digits                 -> +91 and the digits.
--   11 to 15 digits, not starting with 0 -> '+' and the digits (typed with
--     its country code).
--   anything else             -> left null.
update leads l
   set phone_e164 = case
         when d.digits ~ '^0' and length(d.digits) = 10 then null
         when length(d.digits) = 10 and l.country_code = '+91' then '+91' || d.digits
         when length(d.digits) between 11 and 15 and d.digits !~ '^0' then '+' || d.digits
         else null
       end
  from (select lead_id, regexp_replace(contact_phone, '\D', '', 'g') as digits from leads) d
 where d.lead_id = l.lead_id;

create index idx_leads_phone_e164 on leads(phone_e164);

alter table leads drop constraint if exists leads_source_check;
alter table leads add constraint leads_source_check
  check (source in ('get_started', 'book_demo', 'contact', 'callback', 'start_pilot', 'quote', 'free_tools', 'import'));

-- CSV import from Control -> Leads. Same shape as the super_admin read and
-- update policies in 20260925061202_leads_table.sql.
create policy leads_super_admin_insert on leads
  for insert with check (current_setting('app.current_role', true) = 'super_admin');
