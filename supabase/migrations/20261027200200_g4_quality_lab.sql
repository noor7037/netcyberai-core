-- G4 (C372): the Quality Lab (docs/37 §4 row G4; the execution brief §4.7, §15.3). The founder runs NetCyber-authored
-- made-up cases (data/ai-lab/*.json, kept in the repository and versioned by their own hash) against two to four
-- provider and model pairs side by side, scores each answer 1 to 5 and exports the table.
--
-- Control's own tables, the platform role's only (nca_super, the founder with the authenticator, through the route's
-- guard). No family, school or app role may read or write them, and nothing here is ever copied into a learner's
-- history, a family table, the content library or any shared answer cache: a lab answer stays in these two tables.
-- The cases are not copied into the database; a run keeps the dataset's version and the case ids it ran.

create table control.ai_eval_runs (
  run_id uuid primary key default gen_random_uuid(),
  dataset_version text not null check (dataset_version ~ '^[a-f0-9]{12}$'),
  case_ids text[] not null check (cardinality(case_ids) between 1 and 200),
  -- [{ "provider": "...", "model": "..." }], two to four pairs.
  models jsonb not null check (jsonb_typeof(models) = 'array' and jsonb_array_length(models) between 2 and 4),
  started_by uuid not null,
  started_at timestamptz not null default now()
);

-- One answer per case and model in a run: the words that came back (capped), the time, the tokens, whether the JSON
-- read and the deterministic check passed, the kind of failure, and the founder's score and note.
create table control.ai_eval_results (
  result_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references control.ai_eval_runs (run_id) on delete cascade,
  case_id text not null check (case_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  provider_id text not null check (provider_id ~ '^[a-z][a-z0-9_-]{1,39}$'),
  model text not null check (model ~ '^@?[A-Za-z0-9._:/-]{1,80}$'),
  output_text text not null default '' check (length(output_text) <= 20000),
  latency_ms integer not null check (latency_ms >= 0),
  first_token_ms integer check (first_token_ms is null or first_token_ms >= 0),
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  json_valid boolean,
  check_passed boolean,
  error_class text check (error_class is null or error_class in (
    'auth_failed', 'rate_limited', 'upstream_timeout', 'upstream_unavailable', 'model_unavailable', 'invalid_request',
    'content_rejected', 'output_schema_invalid', 'not_configured', 'unknown_provider_error')),
  score smallint check (score is null or score between 1 and 5),
  notes text check (notes is null or length(notes) <= 1000),
  scored_by uuid,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, case_id, provider_id, model)
);
create index ai_eval_results_run on control.ai_eval_results (run_id);

alter table control.ai_eval_runs enable row level security;
alter table control.ai_eval_runs force row level security;
alter table control.ai_eval_results enable row level security;
alter table control.ai_eval_results force row level security;

-- No policy for any role: the platform role bypasses row level security and is the only one granted anything.
revoke all on control.ai_eval_runs, control.ai_eval_results from public, anon, authenticated, service_role, app_user, family_app;
grant select, insert, update on control.ai_eval_runs, control.ai_eval_results to nca_super;
