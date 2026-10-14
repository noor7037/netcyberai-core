-- P7 slice 10b (C222): the student data check, for UDISE+ and APAAR (docs/28 sections 2.2, 3 and 5, row 10b).
--
-- The school's record of each child (name, date of birth, gender) is compared with the same three details AS PRINTED
-- on Aadhaar, typed by the school. The comparison is the website free tool's own rule
-- (src/lib/free-tools/student-data-check.ts: compareName, compareDob, compareGender), imported by the app. There is no
-- APAAR or UIDAI connection. NO AADHAAR NUMBER IS EVER STORED: every text column below refuses a run of twelve digits
-- (spaces and dashes between groups ignored, Devanagari digits read as digits), and the app refuses it first with the
-- free tool's looksLikeAadhaarNumber.
--
-- 1. students.gender: male, female, transgender (Aadhaar's own set, as the free tool's readGender reads it) or
--    not_given. Every existing child is not_given (the default fills them in); "not given" is read by the free tool as
--    no value, so it is a finding for the office ("missing"), never a "real difference". Only the principal or the
--    school admin records or changes it (a trigger, as students_rte_office_only does for the RTE tag).
-- 2. student_id_as_printed: one row a child: the name, date of birth and gender as printed on Aadhaar, who typed them
--    and when. Never the number, never a scan.
-- 3. data_check_requests: one row a detail asked about: the field, the school's value and the printed value at that
--    moment, the free tool's finding, the guardian asked, the message (its row in communication_log, written by the
--    send-gate: the trigger checks the row is this school's and this child's data_check_request message), the
--    guardian's reply in the WhatsApp conversation and when it came, an answer the office attaches when it came
--    another way, and the outcome: corrected (to what) or closed (why), by whom and when. One open request a child and
--    detail (a unique index). Nothing about a request changes once decided; it is never removed.
-- 4. The reply is kept with the request by the database: when a guardian's message arrives in the school's
--    conversation with that number (inbound_messages), it is linked to the open requests whose message went to that
--    number and was sent before it. Only the database links a reply; the app cannot set or change it. The link never
--    stops a parent's message from being kept: if it fails, it says so in the log and the message is kept as before.
-- 5. ERASURE (lead, at integration): the erasure of a data request (src/lib/consent/dsr.ts, pseudonymizeStudent)
--    removes what was typed from the child's Aadhaar and every request about the child, with the name and date of
--    birth it already removes, through erase_student_data_check(): nothing here is deleted otherwise.
--
-- Who reads and writes (docs/28 section 3 rule 6):
--   the principal and the school admin read and write every row of their school;
--   a teacher reads the rows of the children of the class they are class teacher of (is_class_teacher_of), and
--     writes nothing;
--   the accountant and the academic coordinator read nothing;
--   the platform role holds no right on these tables.
--   Typing the printed values, asking, attaching an answer, correcting the record and closing a request are audited
--   by the app ('student.id_as_printed_saved', 'student.data_check_asked', 'student.data_check_answer_noted',
--   'student.data_check_corrected', 'student.data_check_closed').
-- Read by src/lib/students/data-check.ts (the /app/students/data-check screen and its API) and by the My Day card
-- 'data-check-answers' (src/lib/today/cards.ts).
--
-- Existing rows stay valid: the only change to an existing table's rows is students.gender, filled with 'not_given'.

-- 0. The one rule for "no Aadhaar number", used by every check below. Immutable; reads nothing.
create function public.no_aadhaar_number(p text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p is null or regexp_replace(translate(p, '०१२३४५६७८९', '0123456789'), '[[:space:]-]', '', 'g') !~ '[0-9]{12}'
$$;
revoke all on function public.no_aadhaar_number(text) from public, anon, authenticated, service_role;
grant execute on function public.no_aadhaar_number(text) to app_user;

-- 1. Gender on the school record.
alter table students add column gender text not null default 'not_given';
alter table students add constraint students_gender_values check (gender in ('male', 'female', 'transgender', 'not_given'));

create function public.students_gender_office_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'app_user'
     and coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin')
     and ((tg_op = 'INSERT' and new.gender <> 'not_given') or (tg_op = 'UPDATE' and new.gender is distinct from old.gender)) then
    raise exception 'only the principal or the school admin records a child''s gender' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.students_gender_office_only() from public, anon, authenticated, service_role;
create trigger students_gender_office_only before insert or update of gender on students for each row execute function public.students_gender_office_only();

-- 2. What Aadhaar prints, typed by the school.
create table student_id_as_printed (
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  printed_name text,
  printed_dob date,
  printed_gender text,
  typed_by uuid not null,
  typed_at timestamptz not null default now(),
  primary key (school_id, student_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, typed_by) references users(school_id, user_id),
  constraint student_id_as_printed_name check (printed_name is null or char_length(btrim(printed_name)) between 1 and 120),
  constraint student_id_as_printed_no_aadhaar_number check (public.no_aadhaar_number(printed_name)),
  constraint student_id_as_printed_gender check (printed_gender is null or printed_gender in ('male', 'female', 'transgender')),
  constraint student_id_as_printed_something check (printed_name is not null or printed_dob is not null or printed_gender is not null)
);

create function public.student_id_as_printed_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.school_id, new.student_id) is distinct from (old.school_id, old.student_id) then
    raise exception 'what is typed for one child never moves to another' using errcode = 'check_violation';
  end if;
  new.printed_name := nullif(btrim(new.printed_name), '');
  new.typed_at := now();
  return new;
end $$;
revoke all on function public.student_id_as_printed_rules() from public, anon, authenticated, service_role;
create trigger student_id_as_printed_rules before insert or update on student_id_as_printed for each row execute function public.student_id_as_printed_rules();

-- 3. Correction requests.
create table data_check_requests (
  request_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  field text not null,
  school_value text,
  printed_value text,
  finding text not null,
  parent_id uuid not null,
  message_log_id uuid,
  asked_by uuid not null,
  asked_at timestamptz not null default now(),
  reply_message_id uuid references inbound_messages(message_id),
  reply_at timestamptz,
  office_note text,
  office_note_by uuid,
  office_note_at timestamptz,
  outcome text,
  corrected_to text,
  closing_note text,
  decided_by uuid,
  decided_at timestamptz,
  unique (school_id, request_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, parent_id) references parents(school_id, parent_id),
  foreign key (school_id, asked_by) references users(school_id, user_id),
  foreign key (school_id, office_note_by) references users(school_id, user_id),
  foreign key (school_id, decided_by) references users(school_id, user_id),
  constraint data_check_requests_field check (field in ('name', 'dob', 'gender')),
  -- The free tool's findings, apart from an exact match: nothing is asked about a detail that matches.
  constraint data_check_requests_finding check (finding in ('format', 'order', 'spelling', 'swapped', 'missing', 'unreadable', 'different')),
  constraint data_check_requests_lengths check (coalesce(char_length(school_value), 0) <= 120 and coalesce(char_length(printed_value), 0) <= 120 and coalesce(char_length(corrected_to), 0) <= 120),
  constraint data_check_requests_no_aadhaar_number check (
    public.no_aadhaar_number(school_value) and public.no_aadhaar_number(printed_value) and public.no_aadhaar_number(office_note)
    and public.no_aadhaar_number(corrected_to) and public.no_aadhaar_number(closing_note)
  ),
  constraint data_check_requests_reply check ((reply_message_id is null) = (reply_at is null)),
  constraint data_check_requests_office_note check (
    (office_note is null) = (office_note_by is null) and (office_note is null) = (office_note_at is null)
    and (office_note is null or char_length(btrim(office_note)) between 1 and 600)
  ),
  constraint data_check_requests_outcome check (
    (outcome is null and decided_by is null and decided_at is null and corrected_to is null and closing_note is null)
    or (outcome = 'corrected' and decided_by is not null and decided_at is not null and corrected_to is not null and char_length(btrim(corrected_to)) >= 1 and closing_note is null)
    or (outcome = 'closed' and decided_by is not null and decided_at is not null and corrected_to is null and closing_note is not null and char_length(btrim(closing_note)) between 1 and 300)
  )
);
-- One open request a child and detail.
create unique index uq_data_check_requests_open on data_check_requests (school_id, student_id, field) where outcome is null;
create index idx_data_check_requests_student on data_check_requests (school_id, student_id);
create index idx_data_check_requests_message on data_check_requests (school_id, message_log_id) where message_log_id is not null;

-- Runs as the person writing (not security definer): the message and guardian it looks at are the ones that person
-- may read, which for the office is every row of its school. The database's own link of a reply (section 4) runs as
-- the owner and is the only way a reply is set.
create function public.data_check_requests_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  me uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  app boolean := current_user = 'app_user';
begin
  if tg_op = 'INSERT' then
    if new.reply_message_id is not null or new.office_note is not null or new.outcome is not null then
      raise exception 'a request starts open, with no answer and no outcome' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from parent_student_map m where m.school_id = new.school_id and m.parent_id = new.parent_id and m.student_id = new.student_id) then
      raise exception 'a request goes to a guardian of the child' using errcode = 'check_violation';
    end if;
    -- The message is the send-gate's own row for this child and this request's words, or there is none (no number).
    if new.message_log_id is not null and not exists (
      select 1 from communication_log l
       where l.school_id = new.school_id and l.log_id = new.message_log_id and l.student_id = new.student_id
         and l.parent_id = new.parent_id and l.template_name = 'data_check_request'
    ) then
      raise exception 'a request''s message is the send-gate''s data_check_request message for this child' using errcode = 'check_violation';
    end if;
    new.asked_at := now();
    return new;
  end if;
  if (new.request_id, new.school_id, new.student_id, new.field, new.school_value, new.printed_value, new.finding, new.parent_id, new.message_log_id, new.asked_by, new.asked_at)
     is distinct from (old.request_id, old.school_id, old.student_id, old.field, old.school_value, old.printed_value, old.finding, old.parent_id, old.message_log_id, old.asked_by, old.asked_at) then
    raise exception 'what was asked, of whom and when is never changed' using errcode = 'check_violation';
  end if;
  if old.outcome is not null then
    raise exception 'a decided request does not change' using errcode = 'check_violation';
  end if;
  -- The reply in the conversation: linked once, by the database only, to a message of this school.
  if (new.reply_message_id, new.reply_at) is distinct from (old.reply_message_id, old.reply_at) then
    if app or old.reply_message_id is not null
       or not exists (select 1 from inbound_messages i where i.message_id = new.reply_message_id and i.school_id = new.school_id) then
      raise exception 'a reply is linked by the database, once, from the guardian''s own conversation' using errcode = 'check_violation';
    end if;
  end if;
  -- An answer that came another way: attached once, by the person at the keyboard.
  if (new.office_note, new.office_note_by, new.office_note_at) is distinct from (old.office_note, old.office_note_by, old.office_note_at) then
    if old.office_note is not null or (app and new.office_note_by is distinct from me) then
      raise exception 'an answer is attached once, in the attaching person''s own name' using errcode = 'check_violation';
    end if;
    new.office_note := btrim(new.office_note);
    new.office_note_at := now();
  end if;
  if new.outcome is not null then
    if app and new.decided_by is distinct from me then
      raise exception 'a request is corrected or closed in the deciding person''s own name' using errcode = 'check_violation';
    end if;
    new.closing_note := btrim(new.closing_note);
    new.decided_at := now();
  end if;
  return new;
end $$;
revoke all on function public.data_check_requests_rules() from public, anon, authenticated, service_role;
create trigger data_check_requests_rules before insert or update on data_check_requests for each row execute function public.data_check_requests_rules();

-- 4. A guardian's message, as it arrives in the school's conversation, is linked to the open requests whose message
-- went to that number and was sent before it. SECURITY DEFINER with a pinned search_path: the webhook writes as the
-- platform role, which holds no right on data_check_requests; this function only ever links a message to requests of
-- the message's own school, sent to the conversation's own number. A STOP is not a reply.
create function public.data_check_link_reply() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    update data_check_requests r
       set reply_message_id = new.message_id, reply_at = new.received_at
      from message_threads t, communication_log l
     where t.school_id = new.school_id and t.thread_id = new.thread_id
       and r.school_id = new.school_id and r.reply_message_id is null and r.outcome is null
       and r.message_log_id is not null and r.asked_at <= new.received_at
       and l.school_id = r.school_id and l.log_id = r.message_log_id and l.to_phone = t.phone
       and l.status::text in ('sent', 'delivered', 'read');
  exception when others then
    -- The parent's message is kept whatever happens here; the office can still attach the answer by hand.
    raise warning 'data check: a reply could not be linked to its request (%)', sqlstate;
  end;
  return null;
end $$;
revoke all on function public.data_check_link_reply() from public, anon, authenticated, service_role;
create trigger data_check_link_reply after insert on inbound_messages for each row
  when (new.school_id is not null and not new.is_stop)
  execute function public.data_check_link_reply();

-- 5. Erasure. What was typed from a child's Aadhaar, and the values kept on the requests about the child, are the
-- child's personal data, as the name and date of birth the erasure of a data request removes (src/lib/consent/dsr.ts,
-- pseudonymizeStudent). The app's role deletes nothing here and a decided request never changes, so the erasure
-- removes them through this function: the child's printed values and every request about the child, in the caller's
-- own school, for the principal and the school admin only (the roles that carry out an erasure). The guardian's
-- message in the conversation belongs to Communication and is not touched here.
create function public.erase_student_data_check(p_student_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  school uuid := nullif(current_setting('app.current_tenant_id', true), '')::uuid;
  printed integer;
  asked integer;
begin
  if school is null or coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin') then
    raise exception 'an erasure is carried out by the principal or the school admin of the child''s school' using errcode = '42501';
  end if;
  delete from student_id_as_printed where school_id = school and student_id = p_student_id;
  get diagnostics printed = row_count;
  delete from data_check_requests where school_id = school and student_id = p_student_id;
  get diagnostics asked = row_count;
  return printed + asked;
end $$;
revoke all on function public.erase_student_data_check(uuid) from public, anon, authenticated, service_role;
grant execute on function public.erase_student_data_check(uuid) to app_user;

-- Rights: the app's role reads and writes; row level security and the triggers decide what. Nothing is ever deleted
-- but by the erasure above.
-- The platform role holds nothing here.
revoke all on student_id_as_printed, data_check_requests from public, anon, authenticated, service_role;
revoke all on student_id_as_printed, data_check_requests from app_user, nca_super;
grant select, insert, update on student_id_as_printed to app_user;
grant select, insert, update on data_check_requests to app_user;

alter table student_id_as_printed enable row level security;
alter table student_id_as_printed force row level security;
alter table data_check_requests enable row level security;
alter table data_check_requests force row level security;

create policy student_id_as_printed_tenant_isolation on student_id_as_printed using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy data_check_requests_tenant_isolation on data_check_requests using (school_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Read by the office, and by a teacher for the children of the class they are class teacher of.
create policy student_id_as_printed_readers on student_id_as_printed as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and exists (
    select 1 from students s
     where s.school_id = student_id_as_printed.school_id and s.student_id = student_id_as_printed.student_id
       and public.is_class_teacher_of(s.class_id)))
);
-- Typed and changed by the office only, in the typing person's own name.
create policy student_id_as_printed_typed_by_office on student_id_as_printed as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and typed_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy student_id_as_printed_changed_by_office on student_id_as_printed as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
    and typed_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

create policy data_check_requests_readers on data_check_requests as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and exists (
    select 1 from students s
     where s.school_id = data_check_requests.school_id and s.student_id = data_check_requests.student_id
       and public.is_class_teacher_of(s.class_id)))
);
-- Asked by the office only, in the asking person's own name; answered, corrected and closed by the office only.
create policy data_check_requests_asked_by_office on data_check_requests as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and asked_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy data_check_requests_decided_by_office on data_check_requests as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
