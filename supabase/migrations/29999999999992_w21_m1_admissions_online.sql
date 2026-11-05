-- W21-M1: the online enquiry form on a school's own link, and the pipeline's conversion numbers.
--
-- 1. SOURCE 'online': an enquiry a family sent itself, from the school's online form (/enquire/<key>). It is the one
--    source the office never chooses by hand ('website' stays the office's own record of a family that found the
--    school on the website); the conversion numbers count it apart.
-- 2. WHO RECORDED IT: nobody of the school. An online enquiry has no `created_by`, and its one database-written step
--    ('recorded') has no `by_user`. Every other enquiry and step keeps both: the office's insert policies still ask for
--    the session's own user (a null never equals it), so the only way to a null is the definer function below.
-- 3. public.admission_online_form(school) and public.admission_enquiry_online(...): SECURITY DEFINER, pinned
--    search_path, executed by the platform role only (the public route runs as nca_super through withPlatformService).
--    The form answers only a school whose Admissions is on and that has someone in the office to follow it up; it
--    shows the school's name and its classes, nothing else. The enquiry is given to the office (the longest-serving
--    active principal, else school admin), due for a follow-up today (India's date), and recorded open, as every
--    enquiry is. The same child, class and phone sent again the same day is the same enquiry (returned, not made
--    twice). The table's own checks (lengths, phone, no Aadhaar number) hold here too.
-- Rate limits, the honeypot and size caps are the route's (src/app/api/public/admissions/[key]/route.ts); nothing
-- personal is logged or audited (the audit row 'admissions.enquiry_online' holds ids and the source only).
-- Read by: src/lib/admissions/online.ts, src/lib/admissions/conversion.ts, src/lib/admissions/admissions.ts.
-- Existing rows stay valid: every one has a created_by and a by_user, and the source list only grows.

alter table admission_enquiries drop constraint admission_enquiries_source_check;
alter table admission_enquiries add constraint admission_enquiries_source_check
  check (source in ('walk_in', 'phone_call', 'whatsapp', 'website', 'referral', 'newspaper', 'other', 'online'));

alter table admission_enquiries alter column created_by drop not null;
alter table admission_enquiries add constraint admission_enquiries_recorded_by
  check (created_by is not null or source = 'online');

alter table admission_events alter column by_user drop not null;
-- Only the step a family's own enquiry was recorded with has nobody of the school behind it.
alter table admission_events add constraint admission_events_by_someone check (by_user is not null or kind = 'recorded');

create function public.admission_online_form(p_school uuid)
returns table (school_name text, class_id uuid, class_name text, grade text, section text)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.name, c.class_id, c.name, c.grade, c.section
    from schools s
    join classes c on c.school_id = s.school_id
   where s.school_id = p_school
     and exists (select 1 from school_module_entitlements m where m.school_id = s.school_id and m.module_id = 'admissions' and m.enabled)
     and exists (select 1 from users u where u.school_id = s.school_id and u.is_active and u.role::text in ('principal', 'school_admin'))
$$;
revoke all on function public.admission_online_form(uuid) from public, anon, authenticated, service_role, app_user;
grant execute on function public.admission_online_form(uuid) to nca_super;

create function public.admission_enquiry_online(p_school uuid, p_child text, p_class uuid, p_guardian text, p_phone text)
returns table (enquiry_id uuid, fresh boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  office uuid;
  found_id uuid;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not exists (select 1 from school_module_entitlements m where m.school_id = p_school and m.module_id = 'admissions' and m.enabled) then
    return;
  end if;
  if not exists (select 1 from classes c where c.school_id = p_school and c.class_id = p_class) then
    return;
  end if;
  select u.user_id into office from users u
   where u.school_id = p_school and u.is_active and u.role::text in ('principal', 'school_admin')
   order by (u.role::text = 'principal') desc, u.created_at, u.user_id
   limit 1;
  if office is null then
    return;
  end if;
  -- One family's enquiry sent twice: the same child, class and phone, the same India day.
  perform pg_advisory_xact_lock(hashtextextended('admission_enquiry_online:' || p_school::text || ':' || p_phone, 0));
  select e.enquiry_id into found_id from admission_enquiries e
   where e.school_id = p_school and e.source = 'online' and e.phone = p_phone and e.class_id = p_class
     and lower(e.child_name) = lower(p_child) and (e.created_at at time zone 'Asia/Kolkata')::date = today
   limit 1;
  if found_id is not null then
    return query select found_id, false;
    return;
  end if;
  insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, next_follow_up, created_by)
  values (p_school, p_child, p_guardian, p_phone, p_class, 'online', office, today, null)
  returning admission_enquiries.enquiry_id into found_id;
  return query select found_id, true;
end $$;
revoke all on function public.admission_enquiry_online(uuid, text, uuid, text, text) from public, anon, authenticated, service_role, app_user;
grant execute on function public.admission_enquiry_online(uuid, text, uuid, text, text) to nca_super;
