-- M3-9 (C340; 07 "M3, the rest"; the supervisor's answer 2 in C230-AD): C230-D's school-side parent logins move to the
-- Family app, only through a School Link code, never by guess.
--
-- A school-side parent login (C230-D) is one guardian record of one school (its user id is the guardian's parent_id).
-- When a Family app account has linked that same guardian with the school's connect code (C230-AA: the office makes the
-- code for that guardian; the family spends it), the old login has moved. At its next sign-in it says so, and stops:
-- its user and membership are switched off (sessions are refused at once, the live check on users.is_active), audited.
-- The school's guardian record, its children's links and every record stay as they are; only the old login is retired.
--
-- public.parent_login_moved(): for a parent's session, whether its guardian has an open Family app link at this school.
-- public.retire_moved_parent_login(): for a parent's session whose guardian has moved, switches the old login off once
-- and writes the audit row; false when it has not moved (or was already retired). Neither is open to any other role.

create function public.parent_login_moved() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(current_setting('app.current_role', true), '') = 'parent'
     and exists (select 1 from family.school_links l
                  where l.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
                    and l.parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid
                    and l.revoked_at is null)
$$;
revoke all on function public.parent_login_moved() from public, anon, authenticated, service_role;
grant execute on function public.parent_login_moved() to app_user;

create function public.retire_moved_parent_login() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  done integer;
begin
  if coalesce(current_setting('app.current_role', true), '') <> 'parent' or me is null or school is null then
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
revoke all on function public.retire_moved_parent_login() from public, anon, authenticated, service_role;
grant execute on function public.retire_moved_parent_login() to app_user;
