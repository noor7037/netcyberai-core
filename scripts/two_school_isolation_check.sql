-- Two-school tenant isolation regression check.
--
-- GAP this fills: Prompt A/B2's original "43-check two-school isolation
-- suite" (referenced in docs/08_EXECUTION_BIBLE.md, docs/09_ACCEPTANCE_
-- CHECKLIST.md) was run ad hoc against the live database in an earlier
-- session and its results reported in chat -- it was never committed as
-- a reusable script. Pre-F Architecture Hardening needed to "re-run" it
-- after Stage 1's composite-FK and column-rename migrations and found
-- nothing to re-run. This script is what should have existed: a real,
-- repeatable, generic check that for EVERY table carrying school_id,
-- querying under app_user with tenant context set to school A returns
-- zero rows belonging to school B, and vice versa. Run it again after
-- any future schema change that touches RLS-bearing tables.
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
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = 'public'
    where c.table_schema = 'public' and c.column_name = 'school_id' and tb.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    -- Scoped to school A (as app_user, real RLS enforcement -- not
    -- nca_super/app_backend, which bypass RLS entirely): must see zero
    -- rows belonging to school B.
    execute format('select count(*) from %I where school_id = $1', t.table_name)
      into leaked_count using school_b;

    if leaked_count > 0 then
      raise exception 'CROSS-TENANT LEAK: % rows from school B visible while scoped to school A in table %', leaked_count, t.table_name;
    end if;

    tables_checked := tables_checked + 1;
    raise notice 'OK: % -- 0 cross-tenant rows visible', t.table_name;
  end loop;

  raise notice 'two_school_isolation_check: % tables checked, 0 leaks', tables_checked;
end $$;
