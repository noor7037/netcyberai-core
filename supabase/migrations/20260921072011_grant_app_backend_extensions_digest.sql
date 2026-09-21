-- app_backend needs USAGE on the extensions schema and EXECUTE on
-- digest() specifically to run the (now schema-qualified) audit_hash_chain
-- trigger -- confirmed live via "permission denied for schema extensions"
-- immediately after schema-qualifying the call. Minimal grant, not a
-- blanket ALTER ROLE ... SET search_path or a schema-wide EXECUTE grant.
grant usage on schema extensions to app_backend;
grant execute on function extensions.digest(text, text) to app_backend;
