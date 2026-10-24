-- M3-9 review (C340): the old login is retired only from its own sign-in, never from the Family app's guardian door,
-- which sets the same parent settings (withGuardianContext) inside a Family account's session.

create or replace function public.retire_moved_parent_login() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  done integer;
begin
  if coalesce(current_setting('app.current_role', true), '') <> 'parent' or me is null or school is null
     or nullif(current_setting('app.current_account_id', true), '') is not null then
    raise exception 'only a parent''s own login is moved' using errcode = '42501';
  end if;
  if not public.parent_login_moved() then
    return false;
  end if;
  update public.users set is_active = false where user_id = me and school_id = school and role = 'parent' and is_active;
  get diagnostics done = row_count;
  if done = 0 then
    return false;
  end if;
  update public.memberships set is_active = false where user_id = me and school_id = school and role = 'parent' and is_active;
  insert into public.audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
  values (school, me, 'parent', 'parent_login.moved_to_family', 'users', me::text, jsonb_build_object('active', true), jsonb_build_object('active', false, 'moved', 'family_app'));
  return true;
end $$;
