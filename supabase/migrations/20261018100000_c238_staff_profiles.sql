-- C238: a member of staff's profile, to the founder's reference (wave C236, agent C).
--
-- staff_profiles: ONE row per staff account of the school (users), what the office keeps about the person beyond
-- their account: a staff code (unique in the school, whatever its case), a designation (the post: "PGT Mathematics",
-- "Vice Principal"), the kind of employment (permanent, contract, part time, visiting, probation), the joining date,
-- the date of birth, an address, an emergency contact, and a photo.
--
--   - The person is a member of staff of THIS school: a users row of the school (the foreign key, as
--     staff_qualifications and staff_leave keep their people), of a staff role, with a membership here that is not a
--     parent's (the trigger). Never a parent and never the platform's own accounts.
--   - The photo is one picture in the private `documents` bucket, under the school's own prefix and the person's own
--     id: "<school_id>/staff-photos/<user_id>-<uuid>.<png|jpg|webp>". A check holds that shape with the row's own
--     school and person, so a row can never name another school's file, another person's photo or another area of
--     the bucket. The picture's bytes never reach the database; the app stores and removes the file through the one
--     storage module and hands it out from its own address (src/app/api/app/staff/[staffId]/photo/route.ts).
--   - Every typed field takes the one Aadhaar-number rule (public.no_aadhaar_number, C225), and no control
--     character (an address may keep its line breaks). No Aadhaar, PAN or bank detail has a column here: Aadhaar
--     never, and payroll is blocked (C230). Skills and experience wait for the founder's list of fields.
--   - Changed in place, never removed (no DELETE right), in one's own name (updated_by is the session's person). The
--     database keeps created_at and updated_at itself. The app audits every change with the person's id and the NAMES
--     of the fields that changed, never their values ('staff_profile.%', src/lib/staff/profile-write.ts).
--
-- Who (row level security, the twin of src/lib/staff/profile.ts and profile-write.ts):
--   - the principal and the school admin of the school read every row and add and change them;
--   - any other member of staff reads their own row only, and changes nothing;
--   - a parent session reads and writes nothing (deny by default, C230-D); another school sees nothing (tenant
--     isolation); the platform role holds no right on the table.
-- The audit rows of these changes are read by the office, or by the person who acted.
--
-- A new table only: no existing row, column, function or grant is changed, so the code on main runs as before.

create table staff_profiles (
  school_id uuid not null references schools(school_id),
  user_id uuid not null,
  staff_code text check (staff_code is null or (staff_code ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,19}$' and public.no_aadhaar_number(staff_code))),
  designation text check (designation is null or (char_length(btrim(designation)) between 1 and 60 and designation !~ '[[:cntrl:]]' and public.no_aadhaar_number(designation))),
  employment_type text check (employment_type in ('permanent', 'contract', 'part_time', 'visiting', 'probation')),
  joining_date date check (joining_date >= date '1950-01-01'),
  date_of_birth date check (date_of_birth >= date '1930-01-01'),
  address text check (address is null or (char_length(btrim(address)) between 1 and 300 and address !~ '[\x01-\x09\x0b-\x1f\x7f]' and public.no_aadhaar_number(address))),
  emergency_contact text check (emergency_contact is null or (char_length(btrim(emergency_contact)) between 1 and 120 and emergency_contact !~ '[[:cntrl:]]' and public.no_aadhaar_number(emergency_contact))),
  photo_path text,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, user_id),
  foreign key (school_id, user_id) references users(school_id, user_id),
  foreign key (school_id, updated_by) references users(school_id, user_id),
  constraint staff_profiles_photo_path_shape check (
    photo_path is null
    or photo_path ~ ('^' || school_id::text || '/staff-photos/' || user_id::text || '-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$')
  )
);
-- A staff code is the school's own and names one person: unique in the school, "T-01" and "t-01" being the same code.
-- The same code in two schools is two codes.
create unique index staff_profiles_code_per_school on staff_profiles (school_id, upper(staff_code)) where staff_code is not null;

comment on table staff_profiles is 'C238: a member of staff''s profile (staff code, designation, employment, dates, contact, photo); the office writes, the person reads their own.';
comment on column staff_profiles.photo_path is 'C238: the photo in the private documents bucket, "<school_id>/staff-photos/<user_id>-<uuid>.<ext>"; changed by the principal or the school admin.';

-- The person stays the row's; they are a member of staff of the school; the days are days that can be; the times are
-- the database's own.
create function public.staff_profiles_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  kind text;
begin
  if tg_op = 'UPDATE' and (new.school_id, new.user_id) is distinct from (old.school_id, old.user_id) then
    raise exception 'a staff profile stays the person''s' using errcode = 'check_violation';
  end if;
  select u.role::text into kind from users u where u.school_id = new.school_id and u.user_id = new.user_id;
  if kind is null or kind not in ('principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator')
     or not exists (select 1 from memberships m where m.school_id = new.school_id and m.user_id = new.user_id and m.role::text <> 'parent') then
    raise exception 'a staff profile is kept for a member of the school''s staff' using errcode = 'check_violation';
  end if;
  if new.date_of_birth > today then
    raise exception 'a date of birth is a day that has come' using errcode = 'check_violation';
  end if;
  if new.joining_date > today + 366 then
    raise exception 'a joining date is at most a year ahead' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.staff_profiles_rules() from public, anon, authenticated, service_role;
create trigger staff_profiles_rules before insert or update on staff_profiles for each row execute function public.staff_profiles_rules();

-- Grants and row level security ---------------------------------------------------------------------------------------
revoke all on staff_profiles from public, anon, authenticated, service_role;
revoke all on staff_profiles from app_user, nca_super;
grant select, insert, update on staff_profiles to app_user;

alter table staff_profiles enable row level security;
alter table staff_profiles force row level security;

create policy staff_profiles_tenant_isolation on staff_profiles using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Who reads a profile: the office, or the person themself.
create policy staff_profiles_readers on staff_profiles as restrictive for select
  using (
    coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin')
    or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );
-- Added and changed by the office, in its own name.
create policy staff_profiles_added_by_office on staff_profiles as restrictive for insert
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin')
              and updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy staff_profiles_changed_by_office on staff_profiles as restrictive for update
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'))
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin')
              and updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
-- A parent session: nothing here (C230-D, deny by default).
create policy staff_profiles_no_parent on staff_profiles as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- The audit rows of a profile name the person by id and the fields changed by name: the office, or the person who acted.
create policy audit_staff_profile_rows_office_or_actor on audit_log as restrictive for select
  using (
    split_part(event_action, '.', 1) <> 'staff_profile'
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );
