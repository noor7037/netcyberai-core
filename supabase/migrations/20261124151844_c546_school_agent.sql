-- C546: the school agent. A school person asks in the app; the agent prepares a change request (an ordered list of the
-- school app's own API calls, run as that person) and checks it in a transaction that is always rolled back. The
-- person reviews what would change, opens it "live" in Preview (replayed and rolled back on every screen), and makes
-- it live in one transaction, all or nothing (src/lib/agent/engine.ts). Nothing here can reach another school: every
-- row is the school's own, read and written as app_user under the tenant and the person's role.
--
-- agent_requests: the change requests. agent_messages: the conversation, kept 90 days (the nightly delete below).
-- The new gateway workload school_agent.plan follows exams.write_questions's chain until Control gives it its own.
-- Students are sent to the model as tokens, never by name, but the requests still describe children's school records,
-- so it carries children's words: only a provider cleared for minors may serve it (C368).

create table agent_requests (
  request_id    uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  status        text not null default 'ready' check (status in ('ready', 'live', 'stale', 'failed', 'discarded', 'undone')),
  title         text not null check (length(title) between 1 and 200),
  summary       text not null default '' check (length(summary) <= 2000),
  steps         jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 60),
  tier          smallint not null check (tier in (1, 2)),
  preview       jsonb not null default '{}' check (jsonb_typeof(preview) = 'object'),
  diff_hash     text not null check (diff_hash ~ '^[0-9a-f]{64}$'),
  reverse_of    uuid references agent_requests(request_id),
  created_by    uuid not null,
  created_role  text not null,
  created_at    timestamptz not null default now(),
  approved_by   uuid,
  applied_at    timestamptz,
  updated_at    timestamptz not null default now(),
  unique (school_id, request_id)
);
create index agent_requests_school_recent on agent_requests (school_id, created_at desc);

create table agent_messages (
  message_id    uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  user_id       uuid not null,
  role          text not null check (role in ('person', 'agent')),
  body          text not null check (length(body) <= 8000),
  -- The student tokens in body and the names they stand for, so the person's screen shows names and the model never does.
  names         jsonb not null default '[]' check (jsonb_typeof(names) = 'array'),
  request_id    uuid references agent_requests(request_id),
  created_at    timestamptz not null default now()
);
create index agent_messages_user_recent on agent_messages (school_id, user_id, created_at desc);

revoke all on agent_requests, agent_messages from public, anon, authenticated, app_backend;
grant select, insert, update on agent_requests to app_user, nca_super;
grant select, insert on agent_messages to app_user, nca_super;
grant delete on agent_messages to nca_super;

alter table agent_requests enable row level security;
alter table agent_messages enable row level security;
alter table agent_requests force row level security;
alter table agent_messages force row level security;

create policy agent_requests_tenant_isolation on agent_requests for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid)
  with check (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The author sees their own; the principal and the school admin see every request of the school (they approve).
create policy agent_requests_author_or_office on agent_requests as restrictive for all
  using (
    created_by = (current_setting('app.current_user_id', true))::uuid
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
  )
  with check (
    created_by = (current_setting('app.current_user_id', true))::uuid
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
  );
create policy agent_requests_no_parent on agent_requests as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');

create policy agent_messages_tenant_isolation on agent_messages for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid)
  with check (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy agent_messages_own on agent_messages as restrictive for all
  using (user_id = (current_setting('app.current_user_id', true))::uuid)
  with check (user_id = (current_setting('app.current_user_id', true))::uuid);

insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, carries_child_words, max_output_tokens)
values ('school_agent.plan', null, null, 'v1', true, 4000)
on conflict (profile_id) do nothing;

alter policy ai_profiles_staff_read on control.ai_profiles
  using (profile_id in ('copilot.draft', 'parent_ai.home_help', 'exams.read_pages', 'exams.mark', 'exams.write_questions', 'students.register_ocr', 'school_agent.plan'));
alter policy ai_profiles_staff_only on control.ai_profiles
  using (profile_id in ('copilot.draft', 'parent_ai.home_help', 'exams.read_pages', 'exams.mark', 'exams.write_questions', 'students.register_ocr', 'school_agent.plan')) with check (false);

-- The conversation is kept 90 days (C394's period for AI records); change requests stay as the school's own record.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('agent-messages-retention', '40 21 * * *',
      $job$delete from public.agent_messages where created_at < now() - interval '90 days'$job$);
  end if;
end $$;
