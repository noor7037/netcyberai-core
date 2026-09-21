-- app_backend's role has no search_path override (rolconfig is null), so
-- it falls back to the server default "$user", public -- which does not
-- include the "extensions" schema where pgcrypto's digest() lives on this
-- Supabase project. Every insert into audit_log made under app_backend
-- has therefore failed with "function digest(text, unknown) does not
-- exist" since the RLS migration first created this trigger. Fix by
-- schema-qualifying digest() so it no longer depends on any role's
-- search_path.
create or replace function audit_hash_chain() returns trigger as $$
declare
  prev text;
begin
  select row_hash into prev from audit_log
    where school_id is not distinct from new.school_id
    order by occurred_at desc limit 1;
  new.prev_hash := coalesce(prev, '0');
  new.row_hash := encode(
    extensions.digest(coalesce(new.prev_hash,'') || new.event_action || coalesce(new.target_id,'') || new.occurred_at::text, 'sha256'),
    'hex'
  );
  return new;
end;
$$ language plpgsql;
