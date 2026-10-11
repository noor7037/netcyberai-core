-- C142: a student's status follows the consent ledger.
--
-- Found 2026-10-11: every student is created 'pending_consent' (Constitution
-- §8, PRD §3.1) and nothing ever made one 'active'. Recording consent only
-- appended to consent_ledger, so a student added through the app never
-- reached the attendance roster or My Day, which count 'active' students.
--
-- The app now moves the student in the same transaction as the consent row
-- (src/lib/consent/student-status.ts). This migration is the database side:
--
--   1. student_required_consents_granted(school, student): the one definition
--      of "every purpose that is required for service is currently granted"
--      (PRD §3.5: core_records and operational_communication). "Currently"
--      is the latest ledger row per purpose, as everywhere else.
--   2. A trigger on students.status, for the app role only (as C116 did for
--      family links): only the principal or school admin changes a status,
--      and nobody makes a student 'active' unless (1) holds. RLS lets a
--      teacher update a student of their own class, so without this a
--      teacher's session could set the status directly.
--   3. A one-time backfill: students already 'pending_consent' whose required
--      consents are granted become 'active', one audit row each.
--
-- Safe to run again: the functions are replaced, the trigger is recreated
-- and the backfill then finds nothing.
-- Applied test-first: test database, then prod, then the catalog snapshot.

create or replace function public.student_required_consents_granted(p_school_id uuid, p_student_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*) = 2
  from (
    select distinct on (cl.purpose) cl.purpose, cl.granted
    from consent_ledger cl
    where cl.school_id = p_school_id
      and cl.student_id = p_student_id
      and cl.purpose in ('core_records', 'operational_communication')
    order by cl.purpose, cl.created_at desc
  ) latest
  where latest.granted
$$;

-- SECURITY INVOKER: it reads consent_ledger under the caller's own row
-- level security, so a session only ever learns about its own school.
revoke all on function public.student_required_consents_granted(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.student_required_consents_granted(uuid, uuid) to app_user, nca_super;

create or replace function public.student_status_follows_consent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'app_user' then
    if tg_op = 'INSERT' then
      -- A new student has no consent yet (the ledger row needs the student).
      if new.status = 'active' then
        raise exception 'a new student starts as pending_consent' using errcode = '23514';
      end if;
    elsif new.status is distinct from old.status then
      if coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
        raise exception 'only the principal or school admin can change a student''s status' using errcode = '42501';
      end if;
      if new.status = 'active' and not public.student_required_consents_granted(new.school_id, new.student_id) then
        raise exception 'a student becomes active only when every required consent is granted' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end
$$;

-- A trigger function needs no EXECUTE grant to fire; keep it off the REST API.
revoke all on function public.student_status_follows_consent() from public, anon, authenticated, service_role;

drop trigger if exists students_status_follows_consent on students;
create trigger students_status_follows_consent
  before insert or update of status on students
  for each row execute function public.student_status_follows_consent();

-- One-time backfill. One student per step, so each audit row links to the
-- one before it in the school's hash chain. No actor: the system did this.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select s.school_id, s.student_id
    from students s
    where s.status = 'pending_consent'
      and public.student_required_consents_granted(s.school_id, s.student_id)
    order by s.school_id, s.created_at, s.student_id
  loop
    update students set status = 'active', updated_at = now()
      where school_id = r.school_id and student_id = r.student_id and status = 'pending_consent';
    insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
    values (r.school_id, null, null, 'student.activated', 'students', r.student_id::text,
            jsonb_build_object('status', 'pending_consent'),
            jsonb_build_object('status', 'active', 'reason', 'required_consents_granted', 'source', 'backfill_c142'));
    n := n + 1;
  end loop;
  raise notice 'C142 backfill: % student(s) moved from pending_consent to active', n;
end
$$;
