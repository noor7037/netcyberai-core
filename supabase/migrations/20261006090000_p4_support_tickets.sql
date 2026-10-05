-- PR-4 (C126): Raise Ticket. A school asks NetCyberAI for help; the founder
-- answers from a queue in Control.
--
--   support_tickets             one row per ticket, with its status
--   support_ticket_messages     the replies, append-only
--   support_ticket_attachments  screenshots (the file is in FileStorage,
--                               under the school's own prefix), append-only
--
-- A school sees only its own tickets (tenant isolation). Inside a school,
-- the principal and school admin see every ticket; anyone else sees the
-- tickets they raised (RESTRICTIVE). The founder reads and answers all of
-- them as nca_super. The status machine is enforced here too: a trigger
-- refuses a move that is not in the table of src/lib/contracts/tickets.ts.

create table support_tickets (
  ticket_id        uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools (school_id),
  raised_by        uuid not null,
  raised_role      text not null check (raised_role in ('principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator')),
  category         text not null check (category in ('not_working', 'how_to', 'data_correction', 'sign_in', 'billing', 'other')),
  module_id        text check (module_id ~ '^[a-z][a-z0-9-]{0,39}$'),
  subject          text not null check (char_length(subject) between 3 and 150),
  body             text not null check (char_length(body) between 10 and 5000),
  status           text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_school', 'resolved', 'closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  resolved_at      timestamptz,
  closed_at        timestamptz,
  unique (school_id, ticket_id)
);
create index idx_support_tickets_school on support_tickets (school_id, last_activity_at desc);
create index idx_support_tickets_queue on support_tickets (status, last_activity_at desc);
create index idx_support_tickets_raiser on support_tickets (raised_by, created_at desc);

create table support_ticket_messages (
  message_id     uuid primary key default gen_random_uuid(),
  school_id      uuid not null,
  ticket_id      uuid not null,
  author_user_id uuid not null,
  author_side    text not null check (author_side in ('school', 'platform')),
  body           text not null check (char_length(body) between 1 and 5000),
  created_at     timestamptz not null default now(),
  foreign key (school_id, ticket_id) references support_tickets (school_id, ticket_id)
);
create index idx_support_ticket_messages_ticket on support_ticket_messages (ticket_id, created_at);

create table support_ticket_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  ticket_id     uuid not null,
  storage_key   text not null unique,
  file_name     text not null check (char_length(file_name) between 1 and 120),
  mime_type     text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes    int not null check (size_bytes between 1 and 5242880),
  uploaded_by   uuid not null,
  uploaded_side text not null check (uploaded_side in ('school', 'platform')),
  created_at    timestamptz not null default now(),
  foreign key (school_id, ticket_id) references support_tickets (school_id, ticket_id),
  -- The file sits under its own school's prefix, whoever wrote the row.
  check (storage_key like school_id::text || '/tickets/' || ticket_id::text || '/%')
);
create index idx_support_ticket_attachments_ticket on support_ticket_attachments (ticket_id, created_at);

-- ---- the status machine ----------------------------------------------------------
-- The same table as TICKET_TRANSITIONS (test/support/tickets.test.ts checks
-- every pair against this trigger). A school session (app_user) may only
-- confirm a resolved ticket closed, reopen, or answer a ticket waiting on it.
create or replace function support_ticket_status_guard() returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  move text := old.status || '>' || new.status;
begin
  if new.status is distinct from old.status then
    if move not in (
      'open>in_progress', 'open>waiting_on_school', 'open>resolved',
      'in_progress>waiting_on_school', 'in_progress>resolved',
      'waiting_on_school>in_progress', 'waiting_on_school>resolved',
      'resolved>closed', 'resolved>open',
      'closed>open'
    ) then
      raise exception 'ticket status cannot go from % to %', old.status, new.status using errcode = 'check_violation';
    end if;
    if current_user = 'app_user' and move not in ('waiting_on_school>in_progress', 'resolved>closed', 'resolved>open', 'closed>open') then
      raise exception 'a school cannot move a ticket from % to %', old.status, new.status using errcode = 'insufficient_privilege';
    end if;
    new.resolved_at := case when new.status = 'resolved' then now() when new.status = 'open' then null else old.resolved_at end;
    new.closed_at := case when new.status = 'closed' then now() when new.status = 'open' then null else old.closed_at end;
  else
    new.resolved_at := old.resolved_at;
    new.closed_at := old.closed_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger support_ticket_status_guard_trigger before update on support_tickets
  for each row execute function support_ticket_status_guard();

-- ---- grants ----------------------------------------------------------------------
revoke all on support_tickets, support_ticket_messages, support_ticket_attachments from public, anon, authenticated, service_role, app_backend;
revoke all on support_tickets, support_ticket_messages, support_ticket_attachments from app_user, nca_super;
grant select, insert on support_tickets, support_ticket_messages, support_ticket_attachments to app_user, nca_super;
-- A ticket's text, school and raiser never change: only its status moves.
grant update (status, last_activity_at) on support_tickets to app_user, nca_super;
-- Replies and screenshots are append-only (scripts/check_append_only_grants.py).
revoke update, delete on support_ticket_messages, support_ticket_attachments from app_user, anon, authenticated, nca_super;

-- ---- row level security ----------------------------------------------------------
alter table support_tickets enable row level security;
alter table support_tickets force row level security;
alter table support_ticket_messages enable row level security;
alter table support_ticket_messages force row level security;
alter table support_ticket_attachments enable row level security;
alter table support_ticket_attachments force row level security;

create policy support_tickets_tenant_isolation on support_tickets for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Inside the school: the office sees every ticket, anyone else their own.
create policy support_tickets_own_or_office on support_tickets as restrictive for all
  using (
    current_setting('app.current_role', true) in ('principal', 'school_admin')
    or raised_by = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );
-- A ticket is raised in one's own name and role, and starts open.
create policy support_tickets_raise_as_self on support_tickets as restrictive for insert
  with check (
    raised_by = (nullif(current_setting('app.current_user_id', true), ''))::uuid
    and raised_role = current_setting('app.current_role', true)
    and status = 'open'
  );

create policy support_ticket_messages_tenant_read on support_ticket_messages for select
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy support_ticket_messages_tenant_insert on support_ticket_messages for insert
  with check (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Only on a ticket this person can see (the subquery runs under
-- support_tickets' own policies), in their own name, as the school.
create policy support_ticket_messages_visible_ticket on support_ticket_messages as restrictive for all
  using (exists (select 1 from support_tickets t where t.ticket_id = support_ticket_messages.ticket_id))
  with check (
    exists (select 1 from support_tickets t where t.ticket_id = support_ticket_messages.ticket_id)
    and author_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
    and author_side = 'school'
  );

create policy support_ticket_attachments_tenant_read on support_ticket_attachments for select
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy support_ticket_attachments_tenant_insert on support_ticket_attachments for insert
  with check (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy support_ticket_attachments_visible_ticket on support_ticket_attachments as restrictive for all
  using (exists (select 1 from support_tickets t where t.ticket_id = support_ticket_attachments.ticket_id))
  with check (
    exists (select 1 from support_tickets t where t.ticket_id = support_ticket_attachments.ticket_id)
    and uploaded_by = (nullif(current_setting('app.current_user_id', true), ''))::uuid
    and uploaded_side = 'school'
  );
