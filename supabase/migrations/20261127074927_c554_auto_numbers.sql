-- C554: numbers the system gives, never twice. One admission number per student in a school; every staff member gets
-- the school's next staff code when they join; every school gets the next school code when it is made.

-- 1. An admission number is one student's in a school (live: no duplicates).
create unique index if not exists students_admission_no_per_school
  on public.students (school_id, lower(btrim(admission_no))) where admission_no is not null;

-- 2. The school's next staff code: the style most codes follow (text before the digits), the highest number + 1,
--    zero-padded to the widest; EMP-001 for a school with none. Same rule as src/lib/numbering/series.ts.
create or replace function public.next_staff_code(p_school uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prefix text; v_width int; v_last bigint; v_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended('staff|' || p_school::text, 0));
  select m[1], max(length(m[2])), max(m[2]::bigint) into v_prefix, v_width, v_last
    from (select regexp_match(btrim(staff_code), '^(.*?)(\d{1,15})$') m from staff_profiles where school_id = p_school and staff_code is not null) s
   where m is not null group by m[1] order by count(*) desc, max(m[2]::bigint) desc limit 1;
  if v_prefix is null then v_prefix := 'EMP-'; v_width := 3; v_last := 0; end if;
  loop
    v_last := v_last + 1;
    v_code := v_prefix || lpad(v_last::text, greatest(v_width, length(v_last::text)), '0');
    exit when not exists (select 1 from staff_profiles where school_id = p_school and upper(staff_code) = upper(v_code));
  end loop;
  return v_code;
end $$;
revoke all on function public.next_staff_code(uuid) from public;

create or replace function public.staff_code_on_join() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Only where the staff profile's own rules allow one: the person's account is this school's, in a staff role.
  if new.role in ('principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator')
     and exists (select 1 from users u where u.school_id = new.school_id and u.user_id = new.user_id
                  and u.role in ('principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator')) then
    insert into staff_profiles (school_id, user_id, staff_code, updated_by)
    values (new.school_id, new.user_id, next_staff_code(new.school_id), new.user_id)
    on conflict (school_id, user_id) do update set staff_code = coalesce(staff_profiles.staff_code, excluded.staff_code);
  end if;
  return new;
end $$;
revoke all on function public.staff_code_on_join() from public;
drop trigger if exists memberships_staff_code on public.memberships;
create trigger memberships_staff_code after insert on public.memberships for each row execute function public.staff_code_on_join();

-- Everyone already on the staff, in the order they joined.
do $$ declare r record; begin
  for r in select m.school_id, m.user_id from memberships m
            join users u on u.school_id = m.school_id and u.user_id = m.user_id
            where m.role in ('principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator')
              and u.role in ('principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator')
              and not exists (select 1 from staff_profiles p where p.school_id = m.school_id and p.user_id = m.user_id and p.staff_code is not null)
            order by m.school_id, m.created_at, m.membership_id loop
    insert into staff_profiles (school_id, user_id, staff_code, updated_by) values (r.school_id, r.user_id, next_staff_code(r.school_id), r.user_id)
    on conflict (school_id, user_id) do update set staff_code = coalesce(staff_profiles.staff_code, excluded.staff_code);
  end loop;
end $$;

-- 3. School codes: NCA-0001 on, given by the database to every new school whichever screen makes it.
create sequence if not exists public.school_code_seq;
alter table public.schools add column if not exists school_code text;
do $$ declare r record; begin
  for r in select school_id from schools where school_code is null order by created_at, school_id loop
    update schools set school_code = 'NCA-' || lpad(nextval('public.school_code_seq')::text, 4, '0') where school_id = r.school_id;
  end loop;
end $$;
alter table public.schools alter column school_code set default ('NCA-' || lpad(nextval('public.school_code_seq')::text, 4, '0'));
alter table public.schools alter column school_code set not null;
create unique index if not exists schools_school_code_unique on public.schools (school_code);
grant usage on sequence public.school_code_seq to app_user, nca_super;
