-- G6 (C379): each provider's model ids, for the model pickers in Control → AI and the Quality Lab. The founder typed a
-- display name ("Claude Sonnet 4.5") where the vendor's id was needed, and was refused. The list comes from the same
-- free model-list request that tests a key and the 15-minute health probe already make (adapters/connection.ts): only
-- ids that pass the model rule are kept, at most 300. ok = false: the last fetch failed or gave no readable list, and the
-- pickers say "list unavailable" (free typing still works, under the same rule).
--
-- Control's own table, the platform role's only. No function, no policy for any other role.

create table control.ai_model_lists (
  provider_id text primary key references control.ai_providers (provider_id),
  models text[] not null default '{}' check (cardinality(models) <= 300),
  ok boolean not null,
  fetched_at timestamptz not null default now()
);
alter table control.ai_model_lists enable row level security;
alter table control.ai_model_lists force row level security;
revoke all on control.ai_model_lists from public, anon, authenticated, service_role, app_user, family_app;
grant select, insert, update, delete on control.ai_model_lists to nca_super;
