-- C235-B: THE SCHOOL'S OWN BRANDING (school profile and branding, self-service).
--
-- 1. schools.logo_path, schools.logo_updated_at. The school's logo is one picture in the private `documents` bucket,
--    under the school's own prefix: "<school_id>/branding/logo-<uuid>.<png|jpg|webp>". A check holds that shape, so a
--    row can only ever name a file of its own school, never another school's file or another area of the bucket. The
--    picture's bytes never reach the database. logo_updated_at is the database's own: it moves whenever logo_path
--    does, whoever changes it (it is the version the app puts in the logo's address, so a browser keeps the picture
--    for a day and fetches the new one the moment it changes).
-- 2. The logo is a profile column. C219 left the school's row to the principal and the school admin of that school,
--    and only its profile columns (name, address), "a slice that adds a logo adds it here": the app's role is granted
--    UPDATE of logo_path too (never logo_updated_at), the restrictive policy schools_profile_by_office keeps the
--    principal and the school admin of that school only (unchanged), and the trigger schools_profile_only now lets the
--    app's role change name, address and logo_path, and nothing else.
-- 3. A school's name is never blank (NOT VALID: rows made before this are not re-checked; every new write is).
--
-- Who changes the name and the logo, and the audit row 'school.branding_updated' (ids and what changed, no picture
-- and no name), is src/lib/school/branding.ts; the founder does the same from Control as the platform role.

-- ---- 1. -----------------------------------------------------------------------------------------------------------

alter table schools
  add column logo_path text,
  add column logo_updated_at timestamptz;

alter table schools add constraint schools_logo_path_shape check (
  logo_path is null
  or logo_path ~ ('^' || school_id::text || '/branding/logo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$')
);

comment on column schools.logo_path is 'C235-B: the school''s logo in the private documents bucket, "<school_id>/branding/logo-<uuid>.<ext>"; changed by the principal or the school admin (or Control).';
comment on column schools.logo_updated_at is 'C235-B: when logo_path last changed (set by the trigger schools_profile_only, never by the app); the logo''s cache version.';

-- ---- 2. -----------------------------------------------------------------------------------------------------------

grant update (logo_path) on schools to app_user;

create or replace function public.schools_profile_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'app_user' then
    if (to_jsonb(new) - array['name', 'address', 'logo_path', 'updated_at']) is distinct from (to_jsonb(old) - array['name', 'address', 'logo_path', 'updated_at']) then
      raise exception 'a school changes only its own name, address and logo; everything else is changed by NetCyberAI in Control' using errcode = 'insufficient_privilege';
    end if;
    new.updated_at := now();
  end if;
  -- The logo's version moves with the file, whoever changes it.
  if new.logo_path is distinct from old.logo_path then
    new.logo_updated_at := case when new.logo_path is null then null else clock_timestamp() end;
  end if;
  return new;
end $$;
revoke all on function public.schools_profile_only() from public, anon, authenticated, service_role;

-- ---- 3. -----------------------------------------------------------------------------------------------------------

alter table schools add constraint schools_name_not_blank check (btrim(name) <> '') not valid;
