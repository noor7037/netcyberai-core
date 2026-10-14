-- P5 close-out (C210): role policies on four tables, and the guardian names of a subject teacher's PTM bookings.
--
-- 1. attendance, pulse_messages, pulse_response_log and communication_log held a tenant policy only (plus a
--    teacher's own-classes scope on attendance and pulse_messages, and a parent's scope on attendance), so the
--    database answered every role of the school, though the app lets only some roles read them (the dashboard's
--    registry, src/lib/insights, held 26 role-and-fact pairs by its role list alone). Each table now carries
--    RESTRICTIVE policies that admit exactly the roles the app reads and writes it as. The existing teacher and
--    parent scopes stay as they are. The platform role (nca_super: the job runner, the WhatsApp webhook, Control)
--    bypasses row level security and is not affected.
-- 2. Two narrow functions the WhatsApp send-gate reads its own bookkeeping through (whatever the caller's role):
--    the outcome of an earlier message with the same dedupe key, and the priced messages of the month for the
--    budget. A role that may not read the message log still queues the messages its own work sets off.
-- 3. A narrow function that gives a teacher the guardian's name, and the child's, for the PTM bookings on the
--    teacher's OWN slots: a subject teacher from the timetable is not in teacher_own_class_ids() and cannot read
--    that guardian's row. General guardian access is not widened, and no number is returned.
--
-- Who reads and writes each table in the app, from the code (src/), by the role its route and module allow
-- (src/lib/frameworks/write-guard.ts, src/lib/contracts/modules.ts, the facts' roles in src/lib/insights/facts.ts,
-- the reports' in src/lib/reports/reports.ts, My Day's in src/lib/today/cards.ts). P = principal, A = school_admin,
-- C = academic_coordinator, T = teacher (own classes), Acc = accountant; "platform" = nca_super.
--
--   attendance
--     read   P A C T  attendance/attendance.ts (roster, marking, corrections, the alert's words), attendance/day.ts
--                     (the Attendance screen's lists; facts attendance.* for TEACHING), today/cards.ts (T: own
--                     classes; P A: the school), early-warning (P A C T), reports attendance-by-class and
--                     absentees (P A C), auditor (P A)
--            parent   parent_scope_attendance (kept; no parent session is issued today, C13)
--     insert P A C T  marking (canWriteAttendance: P A C T); office corrections and late phone marks (P A)
--     update P A C T  correcting a mark (P A C T); office corrections (P A)
--     delete nobody   a mark is corrected, never deleted
--     Acc    nothing (no attendance duty; facts and reports leave it out)
--
--   pulse_messages
--     read   P A T    Daily Pulse (pulse-drafts routes: P A T), send (P A T), parent-ai sources (P A T), facts
--                     pulse.* (P A T), report pulse-coverage (P A)
--            C        drafts not yet sent only: "taught today" (academics/taught.ts: P A C T) makes or remakes the
--                     lesson's draft, and setting homework (homework/homework.ts: P A C T) refreshes the day's drafts
--     insert P A C T  prepareDraft, after "taught today": a draft, in one's own name
--     update P A T    drafts, ready, sent (pulse/drafts.ts, pulse/send.ts); C: a draft stays a draft
--     delete P A C T  prepareDraft removes the draft of a lesson not taught; a sent message is never deleted
--     Acc    nothing
--
--   pulse_response_log
--     read   P A      the counts beside each message (pulse/drafts.ts), facts pulse.*, report pulse-coverage
--            T        the answers to the messages of their own classes (the Daily Pulse screen's counts)
--     write  platform only: a parent's answer arrives through the WhatsApp webhook (pulse/replies.ts)
--     C, Acc: nothing
--
--   communication_log
--     read   P A      Communication (messages, cost), facts messages.* and whatsapp.spend, My Day messages-held
--                     (P), reports pulse-coverage and messages-by-state, Parents (a guardian's last message),
--                     notices, events, parent-ai, threads
--            T        the rows about their own classes: a child of their classes, a guardian of such a child, or a
--                     reply they wrote. Read by: the Daily Pulse counts, a notice's counts, an event's invitations,
--                     a Parent AI answer's message, a guardian's card (Parents, from Communication), the thread
--                     with a guardian
--     insert P A C T Acc  every one through the send-gate (whatsapp/gate.ts), as a consequence of the person's own
--                     work: an absence alert after marking (P A C T), a Daily Pulse (P A T), a notice approved (P),
--                     an event or a meeting (P A), a complaint's step (P A T), a Parent AI answer (P A T), a reply in
--                     a thread (P A T, in one's own name, into a conversation they may see, to its number), a receipt
--                     after a UPI or bank payment is verified (P A Acc). The gate's duplicate check and budget read go through the two functions below, so a
--                     role that reads none or few of these rows still queues correctly.
--     update platform only: the job runner and the provider's notices
--     C, Acc: read nothing
--
-- Of the 26 role-and-fact pairs the dashboard's registry held by its role list alone, 21 now get nothing from the
-- database. Five keep a number, and none of them reads a row the role may not read: attendance.classes_unmarked for
-- an accountant counts the classes with a student on the roll, all "unmarked" because the accountant reads no mark;
-- and messages.total, messages.failed, messages.held and whatsapp.spend for a teacher count the messages about the
-- teacher's own classes, which the teacher's own screens read. They stay held by the registry's role list
-- (test/insights/access.test.ts, test/db/role-policies.test.ts).

-- ---- 1. Role policies -----------------------------------------------------------------------------------------

-- attendance
create policy attendance_role_read on attendance as restrictive for select using (
  current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator', 'teacher', 'parent')
);
create policy attendance_role_insert on attendance as restrictive for insert with check (
  current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
);
create policy attendance_role_update on attendance as restrictive for update
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator', 'teacher'))
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator', 'teacher'));
create policy attendance_not_deleted on attendance as restrictive for delete using (false);

-- pulse_messages
create policy pulse_messages_role_read on pulse_messages as restrictive for select using (
  current_setting('app.current_role', true) in ('principal', 'school_admin', 'teacher')
  or (current_setting('app.current_role', true) = 'academic_coordinator' and status <> 'sent')
);
create policy pulse_messages_role_insert on pulse_messages as restrictive for insert with check (
  current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
  and status = 'draft'
  and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
-- The three Daily Pulse roles lock a message, sent or not, to say "already sent" (pulse/drafts.ts, pulse/send.ts:
-- select ... for update, which this policy governs); the app changes nothing once it is sent.
create policy pulse_messages_role_update on pulse_messages as restrictive for update
  using (
    current_setting('app.current_role', true) in ('principal', 'school_admin', 'teacher')
    or (current_setting('app.current_role', true) = 'academic_coordinator' and status <> 'sent')
  )
  with check (
    current_setting('app.current_role', true) in ('principal', 'school_admin', 'teacher')
    or (current_setting('app.current_role', true) = 'academic_coordinator' and status = 'draft')
  );
create policy pulse_messages_role_delete on pulse_messages as restrictive for delete using (
  status <> 'sent'
  and current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
);

-- pulse_response_log
-- The subqueries name the session's school, not the row's (the tenant policy already holds the row to it), so
-- each is worked out once per statement and not once per row.
create policy pulse_response_log_role_read on pulse_response_log as restrictive for select using (
  current_setting('app.current_role', true) in ('principal', 'school_admin')
  or (
    current_setting('app.current_role', true) = 'teacher'
    and pulse_id in (
      select m.pulse_id from pulse_messages m
       where m.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
         and m.class_id in (select unnest(public.teacher_own_class_ids()))
    )
  )
);
create policy pulse_response_log_not_inserted on pulse_response_log as restrictive for insert with check (false);
create policy pulse_response_log_not_updated on pulse_response_log as restrictive for update using (false);
create policy pulse_response_log_not_deleted on pulse_response_log as restrictive for delete using (false);

-- communication_log
create policy communication_log_role_read on communication_log as restrictive for select using (
  current_setting('app.current_role', true) in ('principal', 'school_admin')
  or (
    current_setting('app.current_role', true) = 'teacher'
    and (
      student_id in (select unnest(public.teacher_own_student_ids()))
      or parent_id in (
        select m.parent_id from parent_student_map m
         where m.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
           and m.student_id in (select unnest(public.teacher_own_student_ids()))
      )
      or sent_by = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  )
);
-- A reply is written in one's own name; every other message has no writer recorded. A reply (a row with a
-- conversation) is written only by the roles that answer parents (the threads route: P A T), into a conversation
-- the writer may see (message_threads' own policy: a teacher, the guardians of their own classes), and to that
-- conversation's number, as queueThreadReply writes it.
create policy communication_log_role_insert on communication_log as restrictive for insert with check (
  current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator', 'teacher', 'accountant')
  and (sent_by is null or sent_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
  and (
    thread_id is null
    or (
      current_setting('app.current_role', true) in ('principal', 'school_admin', 'teacher')
      and sent_by = nullif(current_setting('app.current_user_id', true), '')::uuid
      and exists (select 1 from message_threads t where t.thread_id = communication_log.thread_id and t.phone = communication_log.to_phone)
    )
  )
);
create policy communication_log_not_updated on communication_log as restrictive for update using (false);

-- ---- 2. The send-gate's own bookkeeping -------------------------------------------------------------------------
-- A school session is answered for its own school only. The platform role (and the database's owner) is answered
-- for the school named, as its own direct read would be. `role` is the session's SET ROLE, which a SECURITY DEFINER
-- function does not change.

-- The earlier message with this dedupe key, if any: its id and where it got to. Nothing about who it went to.
create function public.communication_log_dedupe(p_school_id uuid, p_dedupe_key text)
returns table (log_id uuid, status text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.log_id, l.status::text
    from communication_log l
   where l.school_id = p_school_id
     and l.dedupe_key = p_dedupe_key
     and (p_school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid or coalesce(current_setting('role', true), 'none') <> 'app_user')
$$;
revoke all on function public.communication_log_dedupe(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.communication_log_dedupe(uuid, text) to app_user, nca_super;

-- The school's priced messages of this month in its own time zone, as the budget check needs them: state and
-- price only, no person, number or words. The gate adds them up with the rule cost.ts holds (COUNTED_AGAINST_LIMIT).
create function public.whatsapp_priced_this_month(p_school_id uuid, p_timezone text)
returns table (status text, billable boolean, cost_basis text, est_cost_paise bigint, gst_paise bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.status::text, l.billable, l.cost_basis, l.est_cost_paise, l.gst_paise
    from communication_log l
   where l.school_id = p_school_id
     and (p_school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid or coalesce(current_setting('role', true), 'none') <> 'app_user')
     and l.cost_basis = 'rate_table'
     and date_trunc('month', l.created_at at time zone p_timezone) = date_trunc('month', now() at time zone p_timezone)
$$;
revoke all on function public.whatsapp_priced_this_month(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.whatsapp_priced_this_month(uuid, text) to app_user, nca_super;

-- ---- 3. A teacher's own PTM bookings ----------------------------------------------------------------------------
-- For each booking on a slot the calling teacher holds in this meeting: the guardian's name, and the names of the
-- guardian's children in the meeting's classes whom that teacher teaches (class teacher, or the timetable when the
-- meeting includes subject teachers: the rule of ptm.ts's invitees). Only a teacher is answered, only for their
-- own slots, in their own school. No phone number.
-- A booking whose guardian has no such child is not answered: only such a guardian is invited to this teacher, and
-- so only such a guardian can be booked with them, by a reply or by the office. A booking a teacher's own session
-- wrote straight into the table for anyone else gets no name from here.
create function public.ptm_booked_with_me(p_ptm_id uuid)
returns table (booking_id uuid, guardian text, children text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select x.booking_id, x.guardian, x.children
    from (
      select b.booking_id, p.name as guardian,
             (select string_agg(distinct s.name, ', ' order by s.name)
                from parent_student_map m
                join students s on s.school_id = m.school_id and s.student_id = m.student_id and s.status = 'active'
                join classes c on c.school_id = s.school_id and c.class_id = s.class_id
               where m.school_id = b.school_id and m.parent_id = b.parent_id and c.class_id = any (e.class_ids)
                 and (c.class_teacher_id = b.teacher_id
                      or (e.with_subject_teachers and exists (select 1 from timetable_entries t where t.school_id = c.school_id and t.class_id = c.class_id and t.teacher_user_id = b.teacher_id)))) as children
        from ptm_bookings b
        join ptm_slots sl on sl.school_id = b.school_id and sl.slot_id = b.slot_id
        join ptm_events e on e.school_id = b.school_id and e.ptm_id = b.ptm_id
        join parents p on p.school_id = b.school_id and p.parent_id = b.parent_id
       where b.ptm_id = p_ptm_id
         and b.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
         and current_setting('app.current_role', true) = 'teacher'
         and b.teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid
         and sl.teacher_id = b.teacher_id
    ) x
   where x.children is not null
$$;
revoke all on function public.ptm_booked_with_me(uuid) from public, anon, authenticated, service_role;
grant execute on function public.ptm_booked_with_me(uuid) to app_user;
