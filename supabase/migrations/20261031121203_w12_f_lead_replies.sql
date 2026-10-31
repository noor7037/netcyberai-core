-- Replies to website leads, and the switch for the automatic first reply (W12-F).
-- Why: a new lead gets the "we received your request" receipt at once, and then, two minutes later, a first reply
-- that reads like a person wrote it (the two next steps and the founder's WhatsApp number). Every reply the lead is
-- sent, the automatic one and the founder's own from Control -> Leads, is kept here, written by the email job only
-- after the email service accepted the message, so the Leads panel shows what was really sent and when.
-- Additive only: one new table, one new setting row. Nothing existing changes.

-- 1. The replies. channel is email only for now (WhatsApp waits for the Meta payment method). kind: 'first_reply'
--    is the automatic one (by is null), 'manual' a reply a NetCyberAI staff member typed (by is that person).
--    body is the text that was sent, at most 4000 characters. provider_id is the email service's id for the message.
create table lead_replies (
  reply_id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(lead_id) on delete cascade,
  channel text not null default 'email' check (channel in ('email')),
  kind text not null check (kind in ('first_reply', 'manual')),
  sent_at timestamptz not null default now(),
  provider_id text,
  body text not null check (char_length(body) <= 4000),
  "by" uuid references users(user_id),
  constraint lead_replies_by_matches_kind check ((kind = 'first_reply') = ("by" is null))
);
create index idx_lead_replies_lead on lead_replies(lead_id, sent_at desc);
-- One automatic reply per lead, however often its job runs.
create unique index lead_replies_one_first_reply on lead_replies(lead_id) where kind = 'first_reply';
-- One row per message the email service accepted: a job that ran twice (the service returns the first id again for
-- the same key) records it once.
create unique index lead_replies_provider_id on lead_replies(provider_id) where provider_id is not null;

-- 2. Who reaches it. Only the platform role (nca_super: NetCyberAI staff sessions and the job runner) holds a grant,
--    and only to read and add: a sent reply is never changed or removed. No school role, the public intake role or
--    the API roles hold anything.
revoke all on lead_replies from public, anon, authenticated, app_user, app_backend;
grant select, insert on lead_replies to nca_super;

alter table lead_replies enable row level security;
alter table lead_replies force row level security;

-- Same shape as the leads policies (20260925061202_leads_table.sql, 20261028134900_leads_contact_notes_import.sql):
-- a super_admin session reads and adds. nca_super bypasses RLS anyway; the policies state the intended access.
create policy lead_replies_super_admin_read on lead_replies
  for select using (current_setting('app.current_role', true) = 'super_admin');
create policy lead_replies_super_admin_insert on lead_replies
  for insert with check (current_setting('app.current_role', true) = 'super_admin');
-- The email job, as the platform role with no session: reads whether a reply was already sent, and records one.
create policy lead_replies_platform_read on lead_replies
  for select to nca_super using (true);
create policy lead_replies_platform_insert on lead_replies
  for insert to nca_super with check (true);

-- 3. The switch: 'on' (the default) queues the automatic first reply for every new lead; 'off' queues none. Changed
--    in Control -> Leads by a super_admin, audited as leads.auto_reply_changed. A missing row reads as 'on'.
insert into control.settings (key, value) values ('leads.auto_reply', '"on"'::jsonb)
on conflict (key) do nothing;
