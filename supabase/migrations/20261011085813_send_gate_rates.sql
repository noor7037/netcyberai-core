-- C140 (T7): the send-gate records each message's category, cost and GST
-- from message_rate_table (the rate valid on the day it is sent), not from
-- a number written in the code.
--
-- 1. A template says which billing category its messages fall in
--    (Meta's four: marketing, utility, authentication, service). Existing
--    templates are utility: the only ones in use are attendance alerts.
-- 2. A message's log row says which rate it was costed with (rate_id), and
--    on what basis (cost_basis):
--      rate_table         costed from message_rate_table
--      rate_not_verified  billable, but no verified rate was on record for
--                         its category on that day: cost left at zero
--      not_billable       blocked or failed: nothing to pay
--
-- Additive: three nullable or defaulted columns. No rate is inserted here:
-- a rate goes in only once it has been verified on Meta's official pricing
-- page, with that source and date in verified_source / verified_at.
-- The gate reads message_rate_table as app_user (policy
-- message_rate_table_read_all); the grant below makes that explicit.

alter table whatsapp_templates add column if not exists billing_category text not null default 'utility';
alter table whatsapp_templates drop constraint if exists whatsapp_templates_billing_category_known;
alter table whatsapp_templates add constraint whatsapp_templates_billing_category_known
  check (billing_category in ('marketing', 'utility', 'authentication', 'service'));

alter table communication_log add column if not exists rate_id uuid references message_rate_table(rate_id);
alter table communication_log add column if not exists cost_basis text;
alter table communication_log drop constraint if exists communication_log_cost_basis_known;
alter table communication_log add constraint communication_log_cost_basis_known
  check (cost_basis is null or cost_basis in ('rate_table', 'rate_not_verified', 'not_billable'));

grant select on message_rate_table to app_user, nca_super;

comment on column whatsapp_templates.billing_category is 'Meta billing category of this template''s messages: marketing, utility, authentication or service.';
comment on column communication_log.rate_id is 'The message_rate_table row this message was costed with; null when not billable or no verified rate was on record.';
comment on column communication_log.cost_basis is 'rate_table, rate_not_verified (billable, cost unknown) or not_billable.';
