-- Catalog snapshot for schema-drift checks (docs/14_BACKEND_BUILD_PLAN.md
-- Phase 0 step 2: "repo replay == live schema, proven by an empty diff").
--
-- One row per catalog object: (cat, key, detail). Run the SAME file on two
-- databases and compare. Two ways to read it:
--   1. Summary (default below): one row per category with a count and an
--      md5 over every "key=detail" line in key order. Equal hashes in every
--      category == no drift in scope.
--   2. Detail: replace the final SELECT with
--        select cat, key, md5(detail) as h, detail from snap
--        where cat = '<category>' order by key;
--      for any category whose summary hash differs.
--
-- Scope: public-schema tables/views/sequences (RLS enabled + forced),
-- columns (type, not-null, default, identity, generated -- not position),
-- enum/domain/composite types, constraints, indexes, policies (command,
-- permissive/restrictive, roles, USING, WITH CHECK), functions (md5 of
-- pg_get_functiondef, SECURITY DEFINER, proconfig, owner), triggers,
-- grants on relations, columns, functions, schemas and default ACLs, the
-- app's own roles and their memberships, extensions, event triggers, the
-- app's grants on extension functions, and storage buckets.
--
-- Not visible to a non-superuser, so not compared: role passwords.
-- Read-only: every statement is a SELECT against the system catalogs.

with
app_roles as (
  select oid, rolname from pg_roles where rolname in ('app_backend', 'app_user', 'nca_super', 'audit_writer')
),
rel as (
  select c.* from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
),
snap(cat, key, detail) as (
  select 'table', r.relname,
         concat_ws('|', r.relkind, 'rls=' || r.relrowsecurity, 'force=' || r.relforcerowsecurity, 'owner=' || pg_get_userbyid(r.relowner))
  from rel r

  union all
  select 'column', r.relname || '.' || a.attname,
         concat_ws('|', format_type(a.atttypid, a.atttypmod), 'notnull=' || a.attnotnull,
                   'default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
                   'identity=' || a.attidentity::text, 'generated=' || a.attgenerated::text)
  from rel r
  join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where r.relkind <> 'S'

  union all
  select 'type', t.typname,
         concat_ws('|', t.typtype,
                   (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid),
                   case when t.typtype = 'd' then format_type(t.typbasetype, t.typtypmod) end)
  from pg_type t
  where t.typnamespace = 'public'::regnamespace
    and (t.typtype in ('e', 'd') or (t.typtype = 'c' and (select relkind from pg_class where oid = t.typrelid) = 'c'))

  union all
  select 'constraint', r.relname || '.' || k.conname, concat_ws('|', k.contype, pg_get_constraintdef(k.oid))
  from pg_constraint k join rel r on r.oid = k.conrelid

  union all
  select 'index', i.indexrelid::regclass::text, pg_get_indexdef(i.indexrelid)
  from pg_index i join rel r on r.oid = i.indrelid

  union all
  select 'policy', p.tablename || '.' || p.policyname,
         concat_ws('|', p.cmd, p.permissive, p.roles::text, 'using=' || coalesce(p.qual, ''), 'check=' || coalesce(p.with_check, ''))
  from pg_policies p where p.schemaname = 'public'

  union all
  select 'function', p.oid::regprocedure::text,
         concat_ws('|', md5(pg_get_functiondef(p.oid)), 'secdef=' || p.prosecdef,
                   'config=' || coalesce(p.proconfig::text, ''), 'owner=' || pg_get_userbyid(p.proowner))
  from pg_proc p where p.pronamespace = 'public'::regnamespace

  union all
  select 'function_grant',
         p.oid::regprocedure::text || ' -> ' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         a.privilege_type || '|grantable=' || a.is_grantable
  from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.pronamespace = 'public'::regnamespace

  union all
  select 'trigger', r.relname || '.' || t.tgname, concat_ws('|', t.tgenabled, pg_get_triggerdef(t.oid))
  from pg_trigger t join rel r on r.oid = t.tgrelid where not t.tgisinternal

  union all
  select 'relation_grant',
         r.relname || ' -> ' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type,
         'grantable=' || a.is_grantable
  from rel r, aclexplode(coalesce(r.relacl, acldefault((case when r.relkind = 'S' then 's' else 'r' end)::"char", r.relowner))) a

  union all
  select 'column_grant',
         r.relname || '.' || att.attname || ' -> ' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type,
         'grantable=' || a.is_grantable
  from rel r join pg_attribute att on att.attrelid = r.oid and att.attacl is not null, aclexplode(att.attacl) a

  union all
  select 'schema_grant',
         n.nspname || ' -> ' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type,
         'grantable=' || a.is_grantable
  from pg_namespace n, aclexplode(n.nspacl) a
  where n.nspname in ('public', 'extensions', 'vault', 'storage')

  union all
  select 'default_acl',
         pg_get_userbyid(d.defaclrole) || ' ' || coalesce(n.nspname, '*') || ' ' || d.defaclobjtype::text || ' -> '
           || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type,
         'grantable=' || a.is_grantable
  from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace, aclexplode(d.defaclacl) a

  union all
  select 'extension_function_grant',
         p.oid::regprocedure::text || ' -> ' || ar.rolname,
         a.privilege_type || '|grantable=' || a.is_grantable
  from pg_proc p, aclexplode(p.proacl) a join app_roles ar on ar.oid = a.grantee
  where p.pronamespace = 'extensions'::regnamespace

  union all
  select 'role', r.rolname,
         concat_ws('|', 'login=' || r.rolcanlogin, 'inherit=' || r.rolinherit, 'bypassrls=' || r.rolbypassrls,
                   'createrole=' || r.rolcreaterole, 'createdb=' || r.rolcreatedb, 'connlimit=' || r.rolconnlimit,
                   'config=' || coalesce(r.rolconfig::text, ''))
  from pg_roles r join app_roles ar on ar.oid = r.oid

  union all
  select 'role_membership',
         g.rolname || ' <- ' || u.rolname || ' by ' || pg_get_userbyid(m.grantor),
         concat_ws('|', 'admin=' || m.admin_option, 'inherit=' || m.inherit_option, 'set=' || m.set_option)
  from pg_auth_members m
  join pg_roles g on g.oid = m.roleid
  join pg_roles u on u.oid = m.member
  where m.roleid in (select oid from app_roles) or m.member in (select oid from app_roles)

  union all
  select 'extension', e.extname, e.extversion || '@' || e.extnamespace::regnamespace from pg_extension e

  union all
  select 'event_trigger', e.evtname,
         concat_ws('|', e.evtevent, e.evtfoid::regprocedure::text, e.evtenabled, coalesce(e.evttags::text, ''), pg_get_userbyid(e.evtowner))
  from pg_event_trigger e

  union all
  select 'storage_bucket', b.id,
         concat_ws('|', b.name, 'public=' || b.public, 'limit=' || coalesce(b.file_size_limit::text, ''), coalesce(b.allowed_mime_types::text, ''))
  from storage.buckets b
)
select cat, count(*) as n, md5(string_agg(key || '=' || detail, E'\n' order by key)) as h
from snap
group by cat
order by cat;
