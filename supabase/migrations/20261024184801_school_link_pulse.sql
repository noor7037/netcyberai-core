-- School Link, the Daily Pulse in the app (C336; 07 "M3, the rest", M3-6; R9; the supervisor's answer 3 in C230-AD).
--
-- 1. Read. A linked guardian reads the Daily Pulse messages the school SENT to their own consented children's classes
--    (guardian_class_ids(), C329), never a draft or one marked ready, never another class's or school's; and their own
--    answers to them, whichever way they gave them (WhatsApp or the app). The tables' parent refusals (no_parent,
--    restrictive for every command) let exactly those rows through and keep their write checks; the role rules for
--    reading gain the parent. A parent still writes, changes and deletes nothing here: the role rules for writing on
--    pulse_messages name staff only, and pulse_response_log refuses every write from the app's role.
--
-- 2. Answer. public.guardian_pulse_answer is the only way a guardian's answer from the app is recorded. It records what
--    a WhatsApp answer records (src/lib/pulse/replies.ts, notePulseReply): one pulse_response_log row (1 understood,
--    2 needs help) and, for "needs help", the open parent_reply follow-up for the child in the child's class, in the
--    teacher's queue, one open item per child (the same lock as src/lib/pulse/followups.ts). It is refused unless the
--    session is a parent's, the child is that guardian's own active, consented child at the session's school, the
--    message was sent to that child's class in the last 24 hours (the window in which a WhatsApp answer is tied to its
--    Pulse), and the school holds the child's operational_communication consent (C230-AD: without it the Pulse is read
--    only). One answer per guardian, child and message: a second one is "already". The app sends one of two fixed
--    answers, never free text, so no typed words (and never an Aadhaar number) reach the school this way. It is not
--    written into the school's WhatsApp conversation: an answer in the app is not a WhatsApp message, and a conversation
--    marked as written to would show the office a 24-hour WhatsApp reply window that WhatsApp has not opened.

-- 1. Read
alter policy pulse_messages_no_parent on public.pulse_messages
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (status = 'sent' and class_id = any ((select public.guardian_class_ids())::uuid[])))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy pulse_messages_role_read on public.pulse_messages
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'teacher')
         or (current_setting('app.current_role', true) = 'academic_coordinator' and status <> 'sent')
         or (current_setting('app.current_role', true) = 'parent' and status = 'sent'));

alter policy pulse_response_log_no_parent on public.pulse_response_log
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid
             and student_id = any ((select public.guardian_student_ids())::uuid[])))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy pulse_response_log_role_read on public.pulse_response_log
  using (current_setting('app.current_role', true) in ('principal', 'school_admin')
         or (
           current_setting('app.current_role', true) = 'teacher'
           and pulse_id in (
             select m.pulse_id from pulse_messages m
              where m.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
                and m.class_id in (select unnest(public.teacher_own_class_ids()))
           )
         )
         or (current_setting('app.current_role', true) = 'parent'
             and parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid));

-- 2. Answer
create function public.guardian_pulse_answer(p_pulse_id uuid, p_student_id uuid, p_answer text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  child_class uuid;
  made integer;
begin
  if coalesce(current_setting('app.current_role', true), '') <> 'parent' or me is null or school is null then
    raise exception 'only a guardian answers the Daily Pulse' using errcode = '42501';
  end if;
  if p_answer is null or p_answer not in ('understood', 'needs_help') then
    raise exception 'an answer is understood or needs_help' using errcode = '22023';
  end if;
  -- The guardian's own active, consented child at this school, and a message sent to that child's class.
  select m.class_id into child_class
    from public.pulse_messages m
    join public.students s on s.school_id = m.school_id and s.class_id = m.class_id
   where m.school_id = school and m.pulse_id = p_pulse_id and m.status = 'sent'
     and s.student_id = p_student_id and s.student_id = any (public.guardian_student_ids());
  if child_class is null then
    return 'not_found';
  end if;
  if not exists (select 1 from public.pulse_messages m where m.school_id = school and m.pulse_id = p_pulse_id and m.sent_at > now() - interval '24 hours') then
    return 'closed';
  end if;
  if not coalesce((select c.granted from public.consent_ledger c
                    where c.school_id = school and c.student_id = p_student_id and c.purpose = 'operational_communication'
                    order by c.created_at desc limit 1), false) then
    return 'no_consent';
  end if;
  if exists (select 1 from public.pulse_response_log r where r.school_id = school and r.pulse_id = p_pulse_id and r.student_id = p_student_id and r.parent_id = me) then
    return 'already';
  end if;
  insert into public.pulse_response_log (school_id, pulse_id, student_id, parent_id, tier, responded_at, provider_message_id)
  values (school, p_pulse_id, p_student_id, me, case p_answer when 'understood' then 1 else 2 end, now(),
          'app:' || p_pulse_id || ':' || p_student_id || ':' || me)
  on conflict (provider_message_id) where provider_message_id is not null do nothing;
  get diagnostics made = row_count;
  if made <> 1 then
    return 'already';
  end if;
  if p_answer = 'needs_help' then
    perform pg_advisory_xact_lock(hashtext('followup:' || school || ':' || p_student_id || ':did_not_understand'));
    insert into public.pulse_followups (school_id, student_id, class_id, kind, reason, source)
    select school, p_student_id, child_class, 'did_not_understand', 'A parent answered the day''s message in the app: the child needs help.', 'parent_reply'
     where not exists (select 1 from public.pulse_followups f
                        where f.school_id = school and f.student_id = p_student_id and f.kind = 'did_not_understand' and f.status = 'open');
  end if;
  return 'recorded';
end $$;
revoke all on function public.guardian_pulse_answer(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.guardian_pulse_answer(uuid, uuid, text) to app_user;
