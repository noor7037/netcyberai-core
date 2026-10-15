-- C232 part B (P7 wave 2 close-out): the compliance desk (docs/28 row 10d) and the founder's reason for viewing a
-- school, as the supervisor answered in C230-A.
--
-- 1. A STAFF MEMBER READS THEIR OWN QUALIFICATION ROW. staff_qualifications_office (restrictive, every command: the
--    principal and the school admin) is replaced by one restrictive policy for each command. The office reads every
--    row of its school; any other staff member reads their own row (user_id = themselves) and nothing else of the
--    desk; adding, changing and erasing a row stay the office's.
-- 2. ERASING AN EX-STAFF MEMBER'S ROW. public.erase_staff_qualification(user) deletes the qualification row of a person
--    of the caller's own school who is no longer on the teaching register (their account is inactive, or no longer
--    a teaching role). SECURITY DEFINER with a pinned search_path; the principal or the school admin of that school
--    only; a member of the teaching staff is refused (their row is changed, never erased); a person of another school
--    is not found (null). The app's role still holds no DELETE on the table. The app audits the erasure with the
--    person's id and a count, never a name.
-- 3. THE CPI AND THE FILING DEADLINE ARE ENTERED ON THE DESK (docs/05 section 3). compliance_config already keeps each
--    figure, its source and when it was recorded; it gains, for each, the day its source was read and who entered it
--    (cpi_read_on, cpi_recorded_by, filing_deadline_read_on, filing_deadline_recorded_by). A trigger holds the rule
--    whenever a figure changes: the figure, its source (an https address, never an Aadhaar number) and the day read
--    are entered together or cleared together; the day read is never after today in India; the CPI is a percent above
--    -100 and below 100 with at most two decimal places; the database itself records who entered it (the session's
--    person) and when. Never a default number: a figure stays empty until a person enters it. Restrictive policies:
--    the principal and the school admin write the row; they and the accountant read it (Form 6 is fee data).
-- 4. THE FOUNDER'S REASON FOR VIEWING A SCHOOL MOVES BESIDE ITS AUDIT ROW (C224's rule). The app stops writing the
--    reason into the ImpersonationStarted audit row. It is kept on the viewing's own row, impersonation_sessions.reason,
--    written in the same statement as the audit row (src/lib/audit/log.ts, writeImpersonationAudit), and the audit row
--    names the viewing by its id. That row is where the school reads the reason, on its Compliance page (C165, C180,
--    PRD section 2.3): written by the founder's path only (the app's role has no insert policy on it), read by the
--    school viewed and by the founder. Now that it is the only record of the reason, what was recorded about a viewing
--    never changes: only its end is set, once (a trigger). A new reason takes the one Aadhaar rule and is 1 to 300
--    characters (a check, NOT VALID: the reasons already kept are the founder's own words of earlier viewings and are
--    not rewritten). The audit rows already written keep the reason they hold: audit_log is append-only.
--
-- Read by: src/lib/compliance/qualifications.ts (the register, the person's own row, the erasure),
-- src/lib/compliance/form6.ts (the figures and the advisory), src/app/(school)/app/compliance/page.tsx (the viewings),
-- src/app/api/control/impersonate/start/route.ts (through writeImpersonationAudit).
--
-- SAFE WHILE MAIN'S CODE RUNS ON THE TEST DATABASE:
--   1. main reads and writes staff_qualifications as the principal or the school admin only (loadRegister and
--      saveQualification refuse anyone else), which the new policies allow as before; a teacher's read of their own
--      row is new, and main never asks for it.
--   2. a new function; main does not call it.
--   3. new nullable columns, empty on every row; the trigger acts only when a figure changes, and main writes no figure
--      (its mute upsert sets advisory_muted, muted_by, muted_at and updated_at only). main writes the row as the
--      principal or the school admin (canWriteMasterData) and reads it as those two or the accountant (the Form 6
--      route's readers): the roles the new policies allow.
--   4. main's start route stores a trimmed reason of 1 to 300 characters; one with an Aadhaar number is now refused by
--      the database, which is the rule. main's end route sets ended_at once, on a viewing not yet ended (its live
--      check), which the trigger allows. main still writes the reason into the audit row too until this code is
--      deployed; nothing here depends on that.

-- ---- 1. Who reads a qualification row ------------------------------------------------------------------------------

drop policy staff_qualifications_office on staff_qualifications;
create policy staff_qualifications_readers on staff_qualifications as restrictive for select using (
  current_setting('app.current_role', true) in ('principal', 'school_admin')
  or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy staff_qualifications_added_by_office on staff_qualifications as restrictive for insert
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy staff_qualifications_changed_by_office on staff_qualifications as restrictive for update
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'))
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy staff_qualifications_erased_by_office on staff_qualifications as restrictive for delete
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));

-- ---- 2. Erasing an ex-staff member's row ---------------------------------------------------------------------------
-- The number of rows erased (0 or 1), or null when the caller's school has no such person. On the register (an active
-- account of the teaching staff) is refused: that row is kept up to date, not erased.
create function public.erase_staff_qualification(p_user_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  on_register boolean;
  n integer;
begin
  if school is null or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    raise exception 'a qualification row is erased by the principal or the school admin of the school' using errcode = '42501';
  end if;
  select u.is_active and u.role::text in ('principal', 'school_admin', 'teacher', 'academic_coordinator') into on_register
    from users u
   where u.school_id = school and u.user_id = p_user_id;
  if not found then
    return null;
  end if;
  if on_register then
    raise exception 'a member of the teaching staff keeps their qualification row: it is changed, never erased' using errcode = 'check_violation';
  end if;
  delete from staff_qualifications q where q.school_id = school and q.user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.erase_staff_qualification(uuid) from public, anon, authenticated, service_role;
revoke all on function public.erase_staff_qualification(uuid) from app_user, nca_super;
grant execute on function public.erase_staff_qualification(uuid) to app_user;

-- ---- 3. The CPI and the filing deadline ----------------------------------------------------------------------------

alter table compliance_config
  add column cpi_read_on date,
  add column cpi_recorded_by uuid,
  add column filing_deadline_read_on date,
  add column filing_deadline_recorded_by uuid,
  add constraint compliance_config_school_cpi_recorded_by_fkey foreign key (school_id, cpi_recorded_by) references users (school_id, user_id),
  add constraint compliance_config_school_deadline_recorded_by_fkey foreign key (school_id, filing_deadline_recorded_by) references users (school_id, user_id),
  add constraint compliance_config_cpi_entered check ((cpi_read_on is null) = (cpi_recorded_by is null) and (cpi_read_on is null or cpi_percent is not null)),
  add constraint compliance_config_deadline_entered check ((filing_deadline_read_on is null) = (filing_deadline_recorded_by is null) and (filing_deadline_read_on is null or filing_deadline is not null));

create function public.compliance_config_figures() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
begin
  -- The CPI.
  if tg_op = 'INSERT' or (new.cpi_percent, new.cpi_source, new.cpi_read_on) is distinct from (old.cpi_percent, old.cpi_source, old.cpi_read_on) then
    if new.cpi_percent is null and new.cpi_source is null and new.cpi_read_on is null then
      new.cpi_recorded_by := null;
      new.cpi_recorded_at := null;
    elsif new.cpi_percent is null or new.cpi_source is null or new.cpi_read_on is null then
      raise exception 'the CPI is entered with its source and the day it was read, or cleared with them' using errcode = 'check_violation';
    else
      if new.cpi_percent <= -100 or new.cpi_percent >= 100 or new.cpi_percent <> round(new.cpi_percent, 2) then
        raise exception 'the CPI is a percent above -100 and below 100, with at most two decimal places' using errcode = 'check_violation';
      end if;
      if char_length(new.cpi_source) > 500 or new.cpi_source !~ '^https://[^[:space:]]+$' or not public.no_aadhaar_number(new.cpi_source) then
        raise exception 'the CPI''s source is an https address' using errcode = 'check_violation';
      end if;
      if new.cpi_read_on > today then
        raise exception 'the day the CPI''s source was read is a day that has come' using errcode = 'check_violation';
      end if;
      if me is null then
        raise exception 'a figure is entered by a person of the school, in their own name' using errcode = 'check_violation';
      end if;
      new.cpi_recorded_by := me;
      new.cpi_recorded_at := now();
    end if;
  else
    new.cpi_recorded_by := old.cpi_recorded_by;
    new.cpi_recorded_at := old.cpi_recorded_at;
  end if;
  -- The filing deadline.
  if tg_op = 'INSERT' or (new.filing_deadline, new.filing_deadline_source, new.filing_deadline_read_on) is distinct from (old.filing_deadline, old.filing_deadline_source, old.filing_deadline_read_on) then
    if new.filing_deadline is null and new.filing_deadline_source is null and new.filing_deadline_read_on is null then
      new.filing_deadline_recorded_by := null;
      new.filing_deadline_recorded_at := null;
    elsif new.filing_deadline is null or new.filing_deadline_source is null or new.filing_deadline_read_on is null then
      raise exception 'the filing deadline is entered with its source and the day it was read, or cleared with them' using errcode = 'check_violation';
    else
      if char_length(new.filing_deadline_source) > 500 or new.filing_deadline_source !~ '^https://[^[:space:]]+$' or not public.no_aadhaar_number(new.filing_deadline_source) then
        raise exception 'the filing deadline''s source is an https address' using errcode = 'check_violation';
      end if;
      if new.filing_deadline_read_on > today then
        raise exception 'the day the filing deadline''s source was read is a day that has come' using errcode = 'check_violation';
      end if;
      if me is null then
        raise exception 'a figure is entered by a person of the school, in their own name' using errcode = 'check_violation';
      end if;
      new.filing_deadline_recorded_by := me;
      new.filing_deadline_recorded_at := now();
    end if;
  else
    new.filing_deadline_recorded_by := old.filing_deadline_recorded_by;
    new.filing_deadline_recorded_at := old.filing_deadline_recorded_at;
  end if;
  return new;
end $$;
revoke all on function public.compliance_config_figures() from public, anon, authenticated, service_role;
create trigger compliance_config_figures before insert or update on compliance_config for each row execute function public.compliance_config_figures();

create policy compliance_config_readers on compliance_config as restrictive for select
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant'));
create policy compliance_config_set_by_office on compliance_config as restrictive for insert
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy compliance_config_changed_by_office on compliance_config as restrictive for update
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'))
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy compliance_config_removed_by_office on compliance_config as restrictive for delete
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));

-- ---- 4. The founder's reason for viewing a school ------------------------------------------------------------------

-- The founder's path writes the viewing as nca_super, which runs the check: it may call the one rule (a pure function
-- of its text that reads nothing).
grant execute on function public.no_aadhaar_number(text) to nca_super;
alter table impersonation_sessions
  add constraint impersonation_sessions_reason_rule check (char_length(btrim(reason)) between 1 and 300 and public.no_aadhaar_number(reason)) not valid;

create function public.impersonation_sessions_kept() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.impersonation_id, new.actor_user_id, new.target_user_id, new.target_school_id, new.reason, new.started_at, new.expires_at)
     is distinct from (old.impersonation_id, old.actor_user_id, old.target_user_id, old.target_school_id, old.reason, old.started_at, old.expires_at) then
    raise exception 'what was recorded about a viewing stays as recorded: only its end is set' using errcode = 'check_violation';
  end if;
  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'a viewing ends once' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.impersonation_sessions_kept() from public, anon, authenticated, service_role;
create trigger impersonation_sessions_kept before update on impersonation_sessions for each row execute function public.impersonation_sessions_kept();
