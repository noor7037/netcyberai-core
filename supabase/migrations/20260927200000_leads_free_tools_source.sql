-- Free certificate studio: "Create a free account" after three free
-- certificates is a seventh public lead source on the same pre-tenant
-- `leads` pipeline (Decision Log C78). It stores only the visitor's name,
-- school and contact details; no certificate content ever reaches the
-- server. Additive only: existing rows satisfy the widened check.
alter table leads drop constraint if exists leads_source_check;
alter table leads add constraint leads_source_check
  check (source in ('get_started', 'book_demo', 'contact', 'callback', 'start_pilot', 'quote', 'free_tools'));
