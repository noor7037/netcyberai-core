-- W16-A5 (docs/AI_TUTOR_AGENT_PROGRESS.md, Programme W16; the proposal's M11 and the measurement half of M4).
--   1. control.ai_qc_results: the quality check each finished tutor answer took on the hot path (citation present, blocks
--      valid, board commands valid, first words on time, not hung, not too short, depth right for the class band). One
--      row per checked answer: the day, the profile, whether it passed, the codes of the problems it had, the time to
--      the first words and to the end, whether passages were given, and the band. Counts, codes and times only: never a
--      question, an answer, a child or an account. control.ai_reply_checks counts the safety checks a reply took (a row
--      holds a count, not a problem list), so this is a table of its own. Append-only, written only through
--      control.record_qc_result(), like the usage ledger; Control reads it as the platform role.
--      The first-words time is kept here because the usage ledger holds only an attempt's whole time.
--   2. control.ai_eval_results gains the rules grade of a Class 8 Science case (0 to 100) and the codes of what the grader
--      found wanting, so a run needs no second model to be scored.
--   3. Retention: control.ai_ledger_retention also removes ai_qc_results rows older than the 90 days kept.

create table control.ai_qc_results (
  qc_id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  day date not null,
  profile_id text not null check (profile_id ~ '^[a-z][a-z0-9_.]{2,59}$'),
  ok boolean not null,
  problems text[] not null default '{}' check (cardinality(problems) <= 12),
  first_text_ms integer check (first_text_ms is null or first_text_ms >= 0),
  whole_ms integer check (whole_ms is null or whole_ms >= 0),
  passages_given boolean not null default false,
  band text check (band is null or band in ('lkg_1', 'c2_5', 'c6_8', 'c9_10', 'c11_12')),
  check (ok = (cardinality(problems) = 0))
);
create index idx_ai_qc_results_day on control.ai_qc_results (day, profile_id);
create index idx_ai_qc_results_at on control.ai_qc_results (profile_id, at desc);

alter table control.ai_qc_results enable row level security;
alter table control.ai_qc_results force row level security;
revoke all on control.ai_qc_results from public, anon, authenticated, service_role, app_user, family_app, nca_super;
grant select on control.ai_qc_results to nca_super;

create function control.record_qc_result(
  p_day date, p_profile text, p_problems text[], p_first_text_ms integer, p_whole_ms integer, p_passages boolean, p_band text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  codes text[] := coalesce(p_problems, '{}');
begin
  insert into control.ai_qc_results (day, profile_id, ok, problems, first_text_ms, whole_ms, passages_given, band)
  values (p_day, p_profile, cardinality(codes) = 0, codes,
          case when p_first_text_ms is null then null else greatest(p_first_text_ms, 0) end,
          case when p_whole_ms is null then null else greatest(p_whole_ms, 0) end,
          coalesce(p_passages, false), p_band);
end $$;
revoke all on function control.record_qc_result(date, text, text[], integer, integer, boolean, text) from public, anon, authenticated, service_role;
grant execute on function control.record_qc_result(date, text, text[], integer, integer, boolean, text) to family_app, app_user, nca_super;

-- The rules grade of a Lab answer (the Class 8 Science set); null for a case graded by the founder's score alone.
alter table control.ai_eval_results
  add column rules_score smallint check (rules_score is null or rules_score between 0 and 100),
  add column rules_problems text[] check (rules_problems is null or cardinality(rules_problems) <= 12);

create or replace function control.ai_ledger_retention(p_today date, p_keep_days integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cutoff date;
  n integer := 0;
  m integer := 0;
  k integer := 0;
begin
  if p_today is null or p_keep_days is null or p_keep_days < 90 then
    raise exception 'ai_ledger_retention: keep at least 90 days' using errcode = 'check_violation';
  end if;
  cutoff := p_today - p_keep_days;
  delete from control.ai_usage_ledger where day < cutoff;
  get diagnostics n = row_count;
  delete from control.ai_reply_checks where day < cutoff;
  get diagnostics m = row_count;
  delete from control.ai_qc_results where day < cutoff;
  get diagnostics k = row_count;
  return n + m + k;
end $$;
