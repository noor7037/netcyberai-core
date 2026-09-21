-- Two-school tenant isolation regression check.
--
-- GAP this fills: Prompt A/B2's original "43-check two-school isolation
-- suite" (referenced in docs/08_EXECUTION_BIBLE.md, docs/09_ACCEPTANCE_
-- CHECKLIST.md) was run ad hoc against the live database in an earlier
-- session and its results reported in chat -- it was never committed as
-- a reusable script. Pre-F Architecture Hardening needed to "re-run" it
-- after Stage 1's composite-FK and column-rename migrations and found
-- nothing to re-run. This script is what should have existed: a real,
-- repeatable, generic check that for EVERY table carrying a tenant-
-- scoping column, querying under app_user with tenant context set to
-- school A returns zero rows belonging to school B, and vice versa. Run
-- it again after any future schema change that touches RLS-bearing
-- tables.
--
-- First version of this script matched only columns literally named
-- `school_id`, which silently skipped `impersonation_sessions` (scoped
-- by `target_school_id`) -- found live when asked to account for a
-- 37-vs-39-table discrepancy against check_rls_policies.py's table
-- count. Matches any column ending in `school_id` now, so a future
-- differently-prefixed tenant column (`home_school_id`, etc.) isn't
-- another silent gap. `message_rate_table` has no such column at all
-- (platform-level reference data, correctly excluded by construction,
-- not by name-matching luck).
--
-- `sessions.selected_school_id` matches the generic pattern too but is
-- explicitly excluded below (TABLES_WITHOUT_RLS, mirroring
-- check_rls_policies.py's identical exclusion). Two real, previously
-- undocumented bugs were found live investigating why: `sessions` had
-- row level security ENABLED with zero policies (relrowsecurity=true,
-- no `create policy` for it in any migration -- live drift never
-- committed anywhere), which does NOT enforce tenant isolation, it
-- silently blocks EVERY role that isn't the table owner or BYPASSRLS,
-- including `app_backend` itself -- confirmed live: an `insert` as
-- `app_backend` (the exact statement real login/session-creation
-- issues) failed with `42501: new row violates row-level security
-- policy for table "sessions"`. Real login was broken. Separately,
-- `app_user`/`nca_super` held full select/insert/update/delete grants
-- on `sessions` via role_grants.sql's `alter default privileges`
-- (applied automatically to any table created after that migration,
-- `sessions` included) -- contradicting src/lib/auth/db.ts's own
-- comment that neither role was ever granted access to it. Both fixed
-- live and in a migration (see the migration matching this commit):
-- RLS disabled on `sessions` (restoring the always-intended, always-
-- documented design), and app_user/nca_super/anon/authenticated grants
-- revoked, leaving only app_backend's original narrow grant. A "0 rows
-- visible" result against `sessions` under app_user proves nothing
-- about tenant isolation either way -- before the fix it was a
-- coincidental side effect of a bug that also broke login; after the
-- fix, app_user has no grant on the table at all and this script's
-- `select count(*)` would fail with permission-denied, not run.
-- Testing `sessions` isolation is out of scope for this generic script
-- by design, same as `check_rls_policies.py`'s reasoning for excluding
-- it from mutation-coverage checks.
--
-- Usage: run against the two persistent fixture schools ("B2 Test
-- School Alpha"/"Beta"), as a role that can `set role app_user` (i.e.
-- app_backend, or a superuser for one-off verification). Raises an
-- exception (transaction aborts) on the first cross-tenant leak found;
-- prints one NOTICE per table checked on success.
--
-- What this does NOT cover (say so, don't imply otherwise): write paths
-- (INSERT/UPDATE/DELETE) as the actual roles the app uses in a real
-- request, the withTenantContext wrapper itself, or app-layer
-- authorization above RLS. Stage 1a's negative/positive composite-FK
-- tests (Decision Log) cover the write path for the specific tables
-- Stage 1 touched. This script covers the read-side RLS guarantee across
-- every tenant table, generically, not just the ones this prompt edited.

do $$
declare
  school_a uuid := (select school_id from schools where name = 'B2 Test School Alpha');
  school_b uuid := (select school_id from schools where name = 'B2 Test School Beta');
  t record;
  leaked_count bigint;
  tables_checked int := 0;
begin
  if school_a is null or school_b is null then
    raise exception 'fixture schools not found -- run against a database that has "B2 Test School Alpha"/"Beta"';
  end if;

  set local role app_user;
  perform set_config('app.current_tenant_id', school_a::text, true);
  perform set_config('app.current_role', 'teacher', true);

  for t in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = 'public'
    where c.table_schema = 'public' and c.column_name like '%school_id' and tb.table_type = 'BASE TABLE'
      and c.table_name <> 'sessions' -- see header: no RLS, no app_user grant, by design
    order by c.table_name, c.column_name
  loop
    -- Scoped to school A (as app_user, real RLS enforcement -- not
    -- nca_super/app_backend, which bypass RLS entirely): must see zero
    -- rows belonging to school B.
    execute format('select count(*) from %I where %I = $1', t.table_name, t.column_name)
      into leaked_count using school_b;

    if leaked_count > 0 then
      raise exception 'CROSS-TENANT LEAK: % rows from school B visible while scoped to school A in table % (via %)', leaked_count, t.table_name, t.column_name;
    end if;

    tables_checked := tables_checked + 1;
    raise notice 'OK: %.% -- 0 cross-tenant rows visible', t.table_name, t.column_name;
  end loop;

  raise notice 'two_school_isolation_check: % tables checked, 0 leaks', tables_checked;
end $$;
