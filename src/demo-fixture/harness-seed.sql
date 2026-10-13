-- Illustrative data for the screenshot harness (C133), in the fixture style
-- of this folder: not a real school, person or number. Loaded only by
-- scripts/harness/ into a throwaway local database; never by the app, and
-- never into a real database (the harness refuses a non-local one).
-- Phone numbers are placeholders (98000 0000x) and emails end in
-- example.invalid: nothing here may ever be messaged, and the harness has no
-- way to send (no scheduler, no keys).
--
-- One live school with a principal, an admin, two teachers, three classes
-- and 26 students; one tagged test-fixture school; one platform admin.
-- Fixed ids so the screenshot script can link straight to a record.

insert into schools (school_id, name, jurisdiction, onboarding_stage, is_test_fixture) values
  ('a0000000-0000-4000-8000-000000000001', 'Illustrative Public School', 'IN-HR', 'go_live', false),
  ('b0000000-0000-4000-8000-000000000002', 'Illustrative Test School', 'IN-DL', 'data_imported', true);

insert into users (user_id, school_id, email, role, display_name) values
  ('00000000-0000-4000-8000-00000000f001', null, 'founder@example.invalid', 'super_admin', 'Illustrative Founder'),
  ('00000000-0000-4000-8000-00000000a001', 'a0000000-0000-4000-8000-000000000001', 'principal@example.invalid', 'principal', 'Priya Example'),
  ('00000000-0000-4000-8000-00000000a002', 'a0000000-0000-4000-8000-000000000001', 'admin@example.invalid', 'school_admin', 'Arjun Example'),
  ('00000000-0000-4000-8000-00000000a003', 'a0000000-0000-4000-8000-000000000001', 'tara@example.invalid', 'teacher', 'Tara Example'),
  ('00000000-0000-4000-8000-00000000a004', 'a0000000-0000-4000-8000-000000000001', 'tanvi@example.invalid', 'teacher', 'Tanvi Example'),
  ('00000000-0000-4000-8000-00000000b001', 'b0000000-0000-4000-8000-000000000002', 'bela@example.invalid', 'principal', 'Bela Example');

insert into memberships (membership_id, user_id, school_id, role) values
  ('00000000-0000-4000-8000-0000000a1001', '00000000-0000-4000-8000-00000000a001', 'a0000000-0000-4000-8000-000000000001', 'principal'),
  ('00000000-0000-4000-8000-0000000a1002', '00000000-0000-4000-8000-00000000a002', 'a0000000-0000-4000-8000-000000000001', 'school_admin'),
  ('00000000-0000-4000-8000-0000000a1003', '00000000-0000-4000-8000-00000000a003', 'a0000000-0000-4000-8000-000000000001', 'teacher'),
  ('00000000-0000-4000-8000-0000000a1004', '00000000-0000-4000-8000-00000000a004', 'a0000000-0000-4000-8000-000000000001', 'teacher'),
  ('00000000-0000-4000-8000-0000000b1001', '00000000-0000-4000-8000-00000000b001', 'b0000000-0000-4000-8000-000000000002', 'principal');

insert into teachers (teacher_id, school_id, user_id, name) values
  ('00000000-0000-4000-8000-0000000a2003', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a003', 'Tara Example'),
  ('00000000-0000-4000-8000-0000000a2004', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a004', 'Tanvi Example');

insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values
  ('00000000-0000-4000-8000-0000000c0051', 'a0000000-0000-4000-8000-000000000001', '5-A', '5', 'A', '00000000-0000-4000-8000-00000000a003'),
  ('00000000-0000-4000-8000-0000000c0052', 'a0000000-0000-4000-8000-000000000001', '5-B', '5', 'B', '00000000-0000-4000-8000-00000000a004'),
  ('00000000-0000-4000-8000-0000000c0061', 'a0000000-0000-4000-8000-000000000001', '6-A', '6', 'A', null);

insert into subjects (subject_id, school_id, name) values
  ('00000000-0000-4000-8000-0000000d0001', 'a0000000-0000-4000-8000-000000000001', 'Mathematics'),
  ('00000000-0000-4000-8000-0000000d0002', 'a0000000-0000-4000-8000-000000000001', 'English');

insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000a2003', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000c0051'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000a2003', '00000000-0000-4000-8000-0000000d0002', '00000000-0000-4000-8000-0000000c0051'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000a2004', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000c0052');

-- 26 students: names from a short list, "Example" as the family name.
insert into students (student_id, school_id, admission_no, name, class_id, roll_no, dob, status)
select ('00000000-0000-4000-8000-0000005' || lpad(g::text, 5, '0'))::uuid,
       'a0000000-0000-4000-8000-000000000001',
       'ILL-' || lpad(g::text, 4, '0'),
       (array['Aarav','Diya','Kabir','Meera','Rohan','Sana','Vihaan','Zoya','Ishaan','Anaya','Dev','Kiara','Neel'])[1 + (g - 1) % 13] || ' Example ' || chr(64 + ((g - 1) / 13 + 1)),
       (array['00000000-0000-4000-8000-0000000c0051','00000000-0000-4000-8000-0000000c0052','00000000-0000-4000-8000-0000000c0061'])[1 + (g - 1) % 3]::uuid,
       ((g - 1) / 3 + 1)::text,
       date '2015-04-01' + (g * 17),
       (case when g > 23 then 'pending_consent' else 'active' end)::student_status
from generate_series(1, 26) g;

insert into students (school_id, admission_no, name, status)
select 'b0000000-0000-4000-8000-000000000002', 'TST-' || g, 'Test Student ' || g, 'active' from generate_series(1, 8) g;

insert into parents (parent_id, school_id, name, phone, email, relation) values
  ('00000000-0000-4000-8000-0000000e0001', 'a0000000-0000-4000-8000-000000000001', 'Rajesh Example', '9800000001', 'rajesh@example.invalid', 'Father'),
  ('00000000-0000-4000-8000-0000000e0002', 'a0000000-0000-4000-8000-000000000001', 'Sunita Example', '9800000002', null, 'Mother');
insert into parent_student_map (school_id, parent_id, student_id) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-000000500001'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000e0002', '00000000-0000-4000-8000-000000500001'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-000000500004');

-- Attendance for the last 10 India days (weekdays), a few absent or late; today is marked for 5-A only.
insert into attendance (school_id, student_id, class_id, date, status, marked_by)
select s.school_id, s.student_id, s.class_id, d::date,
       case when (extract(day from d)::int + right(s.admission_no, 2)::int) % 11 = 0 then 'absent' when (extract(day from d)::int + right(s.admission_no, 2)::int) % 17 = 0 then 'late' else 'present' end,
       '00000000-0000-4000-8000-00000000a003'
from students s
cross join generate_series((now() at time zone 'Asia/Kolkata')::date - 10, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') d
where s.school_id = 'a0000000-0000-4000-8000-000000000001' and s.status = 'active' and extract(isodow from d) < 7
  and (d::date < (now() at time zone 'Asia/Kolkata')::date or s.class_id = '00000000-0000-4000-8000-0000000c0051');

insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, status, date) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000a2003', '00000000-0000-4000-8000-0000000c0051', '00000000-0000-4000-8000-0000000d0001', 'Fractions: halves and quarters', 'taught', (now() at time zone 'Asia/Kolkata')::date);

insert into fees_ledger (school_id, student_id, amount_minor, due_date, status)
select school_id, student_id, 450000, current_date - 20 + (right(admission_no, 2)::int), (array['paid','paid','paid','pending','overdue'])[1 + right(admission_no, 2)::int % 5]::fee_status
from students where school_id = 'a0000000-0000-4000-8000-000000000001' and status = 'active';

insert into communication_log (school_id, channel, status, created_at)
select 'a0000000-0000-4000-8000-000000000001', 'whatsapp', (array['delivered','read','delivered','blocked_consent','delivered'])[1 + g % 5]::comm_status, now() - (g % 12) * interval '1 day'
from generate_series(1, 60) g;

-- The live modules switched on for the live school, as the default plan does.
insert into school_entitlements (school_id, plan) values ('a0000000-0000-4000-8000-000000000001', 'standard'), ('b0000000-0000-4000-8000-000000000002', 'standard');
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s, m, true, 'plan'
from unnest(array['a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002']::uuid[]) s, unnest(array['dashboard','setup','students','parents','academics','attendance','timetable','homework','recovery','pulse','communication','ptm','documents','compliance','help-center','raise-ticket','staff','admissions','fees','reports']) m;

insert into support_tickets (ticket_id, school_id, raised_by, raised_role, category, module_id, subject, body, status) values
  ('00000000-0000-4000-8000-0000000f0001', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a003', 'teacher', 'not_working', 'attendance', 'Attendance for 5-A will not save', 'When I mark attendance for class 5-A and press Submit, the page shows an error.', 'waiting_on_school'),
  ('00000000-0000-4000-8000-0000000f0002', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a001', 'principal', 'how_to', 'setup', 'How do I add a second section to class 6?', 'We opened a new section this term and I cannot find where to add it.', 'open'),
  ('00000000-0000-4000-8000-0000000f0003', 'b0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000b001', 'principal', 'other', null, 'A ticket from the test school', 'This ticket belongs to the tagged test school.', 'open');
insert into support_ticket_messages (school_id, ticket_id, author_user_id, author_side, body) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-00000000f001', 'platform', 'Thank you. Which date were you marking, and does it happen for other classes too?');

insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, after_state) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a002', 'school_admin', 'student.create', 'students', '00000000-0000-4000-8000-000000500026', null),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a003', 'teacher', 'attendance.submitted', 'classes', '00000000-0000-4000-8000-0000000c0051', null),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000f001', 'super_admin', 'ImpersonationStarted', 'schools', 'a0000000-0000-4000-8000-000000000001', '{"reason":"Helping the office with a class import"}');

-- The timetable (C145): Tara's and Tanvi's week in 5-A and 5-B, Monday to Saturday.
insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id)
select 'a0000000-0000-4000-8000-000000000001', c.class_id, d, p.period, p.subject_id, case when (c.name = '5-A') = (p.period % 2 = 1) then '00000000-0000-4000-8000-00000000a003'::uuid else '00000000-0000-4000-8000-00000000a004'::uuid end
from (values ('00000000-0000-4000-8000-0000000c0051'::uuid, '5-A'), ('00000000-0000-4000-8000-0000000c0052'::uuid, '5-B')) c(class_id, name)
cross join generate_series(1, 6) d
cross join (values (1, '00000000-0000-4000-8000-0000000d0001'::uuid), (2, '00000000-0000-4000-8000-0000000d0002'::uuid), (3, '00000000-0000-4000-8000-0000000d0001'::uuid)) p(period, subject_id);

-- The syllabus map (C147): Mathematics in 5-A, five topics, none taught yet.
insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000c0051', '00000000-0000-4000-8000-0000000d0001', 1, 'Fractions', 'Halves and quarters'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000c0051', '00000000-0000-4000-8000-0000000d0001', 2, 'Fractions', 'Comparing two fractions'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000c0051', '00000000-0000-4000-8000-0000000d0001', 3, 'Fractions', 'Fractions on the number line'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000c0051', '00000000-0000-4000-8000-0000000d0001', 4, 'Decimals', 'Tenths'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000c0051', '00000000-0000-4000-8000-0000000d0001', 5, 'Decimals', 'Hundredths');

-- Teacher Copilot (C154): switched on for the illustrative school only, with a monthly limit, so the harness can show it on the stand-in.
insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ('a0000000-0000-4000-8000-000000000001', 'teacher-copilot', true, 'founder_override', '{"monthly_tokens": 20000}')
on conflict (school_id, module_id) do update set enabled = true, limits = excluded.limits;

