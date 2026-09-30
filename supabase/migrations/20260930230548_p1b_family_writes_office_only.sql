-- Sibling links and guardian merges are office-only in the database too
-- (C116). Found by the live proof: RLS lets a teacher update a student of
-- their own class (document review writes name and date of birth, so
-- student writes cannot be closed to teachers), which also let a teacher
-- change `students.family_id` directly; likewise `parents.merged_into` for
-- an own-class guardian. A policy cannot compare old and new values, so a
-- trigger does: for the app role (app_user), only the principal and school
-- admin may set or change a student's family or a guardian's merge mark.
-- The platform role (job runner) and migrations are not app_user.
--
-- Applied test-first: test database, then prod, then the catalog snapshot.

create or replace function public.family_links_office_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'app_user'
     and coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    -- Nested on purpose: PL/pgSQL resolves every field of an expression, so
    -- students columns never appear in a test that runs for parents, nor
    -- OLD in one that runs for an insert.
    if tg_table_name = 'students' then
      if tg_op = 'INSERT' then
        if new.family_id is not null then
          raise exception 'only the principal or school admin can change a student''s family' using errcode = '42501';
        end if;
      elsif new.family_id is distinct from old.family_id then
        raise exception 'only the principal or school admin can change a student''s family' using errcode = '42501';
      end if;
    elsif tg_table_name = 'parents' then
      if tg_op = 'INSERT' then
        if new.merged_into is not null then
          raise exception 'only the principal or school admin can merge guardians' using errcode = '42501';
        end if;
      elsif new.merged_into is distinct from old.merged_into or new.merged_at is distinct from old.merged_at then
        raise exception 'only the principal or school admin can merge guardians' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end
$$;

-- A trigger function needs no EXECUTE grant to fire; keep it off the REST
-- API (Supabase grants new public functions to these roles by name).
revoke all on function public.family_links_office_only() from public, anon, authenticated, service_role;

create trigger students_family_office_only
  before insert or update of family_id on students
  for each row execute function public.family_links_office_only();

create trigger parents_merge_office_only
  before insert or update of merged_into, merged_at on parents
  for each row execute function public.family_links_office_only();
