-- P5 slice 8i (C208): School Health Auditor v1.
--
-- school_health_runs: the dated record of a school's check-ups. One row a
-- school and India date: the version of the rules, what each check said
-- (results: one object a check with its id, its state, its count and the
-- screen it opened), and how many passed of how many applied.
--   - THE OFFICE'S OWN SESSION WRITES IT, when a person runs a check-up. The
--     first of the day inserts; "Check again" the same day rewrites that
--     day's row. No job writes it and nothing is queued.
--   - A ROW IS WRITTEN FOR INDIA'S TODAY ONLY, and A PAST DAY'S ROW NEVER
--     CHANGES (the trigger): the trend is what was found on each day.
--   - Written in the person's own name (the policies), at the database's own
--     time (the trigger).
--   - Counts only: no name, number or word of any person is stored here.
--   - No delete.
--
-- Who reads and writes: the principal and the school admin of the school.
-- Nobody else reads any row, and the platform role holds no right on the
-- table.
--
-- recorded_by is a person who exists, held to the session's own user by the
-- policies. It is not tied to this school's staff list: a principal whose
-- account was made at another school and who signs in here through a
-- membership runs a check-up like any other principal.

create table school_health_runs (
  run_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  run_date date not null,
  rule_version integer not null check (rule_version >= 1),
  results jsonb not null check (jsonb_typeof(results) = 'array'),
  passed integer not null check (passed >= 0),
  applicable integer not null,
  recorded_by uuid not null references users(user_id),
  recorded_at timestamptz not null default now(),
  unique (school_id, run_date),
  -- "N of M" is what the checks said, and nothing else: N is the checks that pass, M the checks that apply
  -- (every check that is not "not set up"). The two numbers cannot be written apart from the results.
  constraint school_health_runs_n_of_m check (
    passed = jsonb_array_length(jsonb_path_query_array(results, '$[*] ? (@.state == "passes")'))
    and applicable = jsonb_array_length(results) - jsonb_array_length(jsonb_path_query_array(results, '$[*] ? (@.state == "not_set_up")'))
  )
);

-- The rules a check cannot hold: they compare the row with the clock and with what it was.
create function public.school_health_runs_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if tg_op = 'UPDATE' then
    if (new.run_id, new.school_id, new.run_date) is distinct from (old.run_id, old.school_id, old.run_date) then
      raise exception 'a check-up stays with its school and its day' using errcode = 'check_violation';
    end if;
    if old.run_date <> today then
      raise exception 'a past day''s check-up never changes' using errcode = 'check_violation';
    end if;
  elsif new.run_date <> today then
    raise exception 'a check-up is recorded for today only' using errcode = 'check_violation';
  end if;
  new.recorded_at := now();
  return new;
end $$;
revoke all on function public.school_health_runs_rules() from public, anon, authenticated, service_role;
create trigger school_health_runs_rules before insert or update on school_health_runs for each row execute function public.school_health_runs_rules();

revoke all on school_health_runs from public, anon, authenticated, service_role;
revoke all on school_health_runs from app_user, nca_super;
grant select, insert, update on school_health_runs to app_user;

alter table school_health_runs enable row level security;
alter table school_health_runs force row level security;
create policy school_health_runs_tenant_isolation on school_health_runs using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read, and so change: the principal and the school admin. Nobody else reads any row.
create policy school_health_runs_office on school_health_runs as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
);
-- Recorded in one's own name: the first check-up of the day, and "Check again".
create policy school_health_runs_recorded_as_self on school_health_runs as restrictive for insert with check (
  recorded_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy school_health_runs_rewritten_as_self on school_health_runs as restrictive for update with check (
  recorded_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);

-- The auditor is partly built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'school-auditor', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
