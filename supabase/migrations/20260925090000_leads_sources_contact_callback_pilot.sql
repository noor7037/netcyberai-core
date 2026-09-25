-- Widen leads.source for the public website's Contact, Request a
-- Callback and Start a Pilot flows. These are real submissions into the
-- same pre-tenant pipeline as Get Started / Book a Demo (reached only via
-- withBackendConnection as app_backend; RLS policies unchanged), so the
-- Control Plane onboarding view sees every inbound request in one list.
-- Additive only: every existing row already satisfies the new check.
alter table leads drop constraint if exists leads_source_check;
alter table leads add constraint leads_source_check
  check (source in ('get_started', 'book_demo', 'contact', 'callback', 'start_pilot'));
