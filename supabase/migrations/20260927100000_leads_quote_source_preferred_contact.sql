-- Pricing page "Get a custom quote" form: a sixth public lead source on
-- the same pre-tenant `leads` pipeline (no parallel lead system), plus
-- the visitor's preferred contact channel. Additive only: existing rows
-- satisfy the widened check and the new column is nullable.
alter table leads drop constraint if exists leads_source_check;
alter table leads add constraint leads_source_check
  check (source in ('get_started', 'book_demo', 'contact', 'callback', 'start_pilot', 'quote'));

alter table leads add column if not exists preferred_contact text;
alter table leads drop constraint if exists leads_preferred_contact_check;
alter table leads add constraint leads_preferred_contact_check
  check (preferred_contact is null or preferred_contact in ('phone', 'whatsapp', 'email'));
