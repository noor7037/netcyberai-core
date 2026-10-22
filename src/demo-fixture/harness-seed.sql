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

-- A parent's login (C230-D): Rajesh Example, whose account id is his guardian record's id, and the school's consent
-- for his two children's records, so the family app shows them.
insert into users (user_id, school_id, email, role, display_name) values
  ('00000000-0000-4000-8000-0000000e0001', 'a0000000-0000-4000-8000-000000000001', 'rajesh.example@login.netcyberai.com', 'parent', 'Rajesh Example');
insert into memberships (membership_id, user_id, school_id, role) values
  ('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e0001', 'a0000000-0000-4000-8000-000000000001', 'parent');
insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000500001', 'core_records', true, 'school_attested', 'harness'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000500004', 'core_records', true, 'school_attested', 'harness');

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
from unnest(array['a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002']::uuid[]) s, unnest(array['dashboard','setup','students','parents','academics','attendance','timetable','homework','recovery','pulse','communication','ptm','events','complaints','parent-ai','proxy','school-auditor','early-warning','documents','compliance','help-center','raise-ticket','staff','admissions','fees','reports']) m;

insert into support_tickets (ticket_id, school_id, raised_by, raised_role, category, module_id, subject, body, status) values
  ('00000000-0000-4000-8000-0000000f0001', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a003', 'teacher', 'not_working', 'attendance', 'Attendance for 5-A will not save', 'When I mark attendance for class 5-A and press Submit, the page shows an error.', 'waiting_on_school'),
  ('00000000-0000-4000-8000-0000000f0002', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a001', 'principal', 'how_to', 'setup', 'How do I add a second section to class 6?', 'We opened a new section this term and I cannot find where to add it.', 'open'),
  ('00000000-0000-4000-8000-0000000f0003', 'b0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000b001', 'principal', 'other', null, 'A ticket from the test school', 'This ticket belongs to the tagged test school.', 'open');
insert into support_ticket_messages (school_id, ticket_id, author_user_id, author_side, body) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-00000000f001', 'platform', 'Thank you. Which date were you marking, and does it happen for other classes too?');

insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, after_state) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a002', 'school_admin', 'student.create', 'students', '00000000-0000-4000-8000-000000500026', null),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a003', 'teacher', 'attendance.submitted', 'classes', '00000000-0000-4000-8000-0000000c0051', null),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000f001', 'super_admin', 'ImpersonationStarted', 'users', '00000000-0000-4000-8000-00000000a001', '{"impersonationId":"00000000-0000-4000-8000-0000000ee001","targetRole":"principal"}');
-- The founder's earlier view of School A as its principal: the reason is kept on the viewing's own row, beside the audit
-- row above, and shown to the school on its Compliance page (C232 part B).
insert into impersonation_sessions (impersonation_id, actor_user_id, target_user_id, target_school_id, reason, started_at, expires_at, ended_at) values
  ('00000000-0000-4000-8000-0000000ee001', '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000a001', 'a0000000-0000-4000-8000-000000000001', 'Helping the office with a class import', now() - interval '2 days', now() - interval '2 days' + interval '15 minutes', now() - interval '2 days' + interval '9 minutes');

-- The timetable (C145): Tara's and Tanvi's week in 5-A and 5-B, Monday to Saturday. Tanvi's English in 5-A is a
-- period made before Setup gave 5-A English to Tara: it stays (C230-C), so it is written as such a period was, before
-- the database kept to who teaches what (C243).
set session_replication_role = replica;
insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id)
select 'a0000000-0000-4000-8000-000000000001', c.class_id, d, p.period, p.subject_id, case when (c.name = '5-A') = (p.period % 2 = 1) then '00000000-0000-4000-8000-00000000a003'::uuid else '00000000-0000-4000-8000-00000000a004'::uuid end
from (values ('00000000-0000-4000-8000-0000000c0051'::uuid, '5-A'), ('00000000-0000-4000-8000-0000000c0052'::uuid, '5-B')) c(class_id, name)
cross join generate_series(1, 6) d
cross join (values (1, '00000000-0000-4000-8000-0000000d0001'::uuid), (2, '00000000-0000-4000-8000-0000000d0002'::uuid), (3, '00000000-0000-4000-8000-0000000d0001'::uuid)) p(period, subject_id);
set session_replication_role = origin;

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


-- The Family app (M1-2, C248): four illustrative families, one at each of the parent's first steps, for the harness's
-- family pictures. Made-up addresses and first names. The PIN hash is a stand-in string (no PIN opens it): the harness
-- signs parent mode directly with its own secret.
insert into family.accounts (account_id, email, ui_language, pin_hash, pin_set_at) values
  ('f0000000-0000-4000-8000-0000000f0001', 'new.family@example.org', 'en', null, null),
  ('f0000000-0000-4000-8000-0000000f0002', 'consented.family@example.org', 'en', null, null),
  ('f0000000-0000-4000-8000-0000000f0003', 'pinned.family@example.org', 'en', 'scrypt$16384$8$1$aGFybmVzcy1zYWx0LTAwMQ==$aGFybmVzcy1zdGFuZC1pbi1oYXNoLTAwMDAwMDAwMDA=', now()),
  ('f0000000-0000-4000-8000-0000000f0004', 'full.family@example.org', 'en', 'scrypt$16384$8$1$aGFybmVzcy1zYWx0LTAwMg==$aGFybmVzcy1zdGFuZC1pbi1oYXNoLTAwMDAwMDAwMDA=', now());
insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
  ('f0000000-0000-4000-8000-0000000f0002', 'study_core', true, 'parent_tap', 'fam-notice-1'),
  ('f0000000-0000-4000-8000-0000000f0003', 'study_core', true, 'parent_tap', 'fam-notice-1'),
  ('f0000000-0000-4000-8000-0000000f0004', 'study_core', true, 'parent_tap', 'fam-notice-1');
insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, created_at) values
  ('f0000000-0000-4000-8000-0000000fc001', 'f0000000-0000-4000-8000-0000000f0004', 'Asha', 7, 'CBSE', 'en', 'hinglish', 'IN-UP', now() - interval '2 minutes'),
  ('f0000000-0000-4000-8000-0000000fc002', 'f0000000-0000-4000-8000-0000000f0004', 'Kabir', 9, 'CBSE', 'en', 'en', 'IN-DL', now() - interval '1 minute');

-- The English course (C274): a fifth illustrative family whose child (Class 2) takes track B, with the course consent
-- and the course switched on. The course itself is loaded by scripts/harness/family.mjs from data/english/.
insert into family.accounts (account_id, email, ui_language, pin_hash, pin_set_at) values
  ('f0000000-0000-4000-8000-0000000f0005', 'english.family@example.org', 'en', 'scrypt$16384$8$1$aGFybmVzcy1zYWx0LTAwMw==$aGFybmVzcy1zdGFuZC1pbi1oYXNoLTAwMDAwMDAwMDA=', now());
insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
  ('f0000000-0000-4000-8000-0000000f0005', 'study_core', true, 'parent_tap', 'fam-notice-1'),
  ('f0000000-0000-4000-8000-0000000f0005', 'english_programme', true, 'parent_tap', 'fam-notice-1');
insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
  ('f0000000-0000-4000-8000-0000000fc005', 'f0000000-0000-4000-8000-0000000f0005', 'Meena', 2, 'CBSE', 'en', 'hi', 'IN-UP');
insert into control.app_flags (app, module, enabled, reason) values ('family', 'english_programme', true, 'harness'), ('family', 'worksheets', true, 'harness')
  on conflict (app, module) do update set enabled = true;

-- Understand (M1-5, C251): one illustrative catalog line (class 9 Mathematics) and an illustrative cached response in
-- English and Hindi, so the harness can photograph Study and Understand without an AI key. Not the real catalog
-- (data/catalog/ is loaded separately); not shown anywhere but the harness's throwaway database.
insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
values ('f0000000-0000-4000-8000-00000000c901', 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'harness', '00000000-0000-4000-8000-00000000f001', now());
insert into content.units (unit_id, version_id, unit_key, position, title_en, source_url, source_page, checked_on)
values ('f0000000-0000-4000-8000-00000000c902', 'f0000000-0000-4000-8000-00000000c901', 'cbse.c9.mathematics.u1', 1, 'Number Systems', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
insert into content.chapters (chapter_id, version_id, unit_id, chapter_key, position, title_en, source_url, source_page, checked_on)
values ('f0000000-0000-4000-8000-00000000c903', 'f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c902', 'cbse.c9.mathematics.u1.ch01', 1, 'Number Systems', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
insert into content.topics (version_id, chapter_id, topic_key, position, title_en, title_hi, source_url, source_page, checked_on) values
  ('f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c903', 'cbse.c9.mathematics.u1.ch01.t01', 1, 'Rational numbers', 'परिमेय संख्याएँ', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
  ('f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c903', 'cbse.c9.mathematics.u1.ch01.t02', 2, 'Irrational numbers', 'अपरिमेय संख्याएँ', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model) values
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch01.t01', 'en', 'en', 'v1', 1, '[{"type": "explanation", "title": "Rational numbers", "idea": "A rational number is any number you can write as one whole number divided by another, like 3/4.", "example": "If a pizza is cut into 4 equal slices and you eat 3, you ate 3/4 of it.", "steps": ["Write the number as p/q.", "Check that q is not zero.", "Both p and q are whole numbers, so it is rational."], "terms": [{"en": "numerator", "local": "top number"}, {"en": "denominator", "local": "bottom number"}]}, {"type": "worked_example", "problem": "Is 0.75 a rational number?", "steps": [{"text": "Write 0.75 as hundredths.", "expression": "75/100", "result": "0.75"}, {"text": "Divide top and bottom by 25 to get 3/4."}], "answer": "Yes, 0.75 = 3/4."}, {"type": "diagram", "title": "Where rational numbers sit", "kind": "flow", "nodes": [{"id": "n", "label": "Natural numbers"}, {"id": "w", "label": "Whole numbers"}, {"id": "i", "label": "Integers"}, {"id": "r", "label": "Rational numbers"}], "edges": [{"from": "n", "to": "w", "label": "add 0"}, {"from": "w", "to": "i", "label": "add negatives"}, {"from": "i", "to": "r", "label": "add fractions"}]}, {"type": "key_points", "points": ["Every integer is rational: 5 = 5/1.", "The denominator is never zero.", "Terminating decimals are rational."]}, {"type": "check", "items": [{"id": "c1", "question": "Which of these is a rational number?", "options": ["5/0", "2/3", "The square root of 2", "None of these"], "answer": 1, "hint": "Look for a whole number over a non-zero whole number.", "why": "2/3 is one whole number divided by another, and 3 is not zero.", "wrong": ["Division by zero has no value.", "", "The square root of 2 cannot be written as p/q.", "One of them does fit."]}]}, {"type": "practice", "items": [{"id": "p1", "question": "Write 0.5 as p/q in lowest terms.", "options": ["5/10", "1/2", "2/1", "1/5"], "answer": 1, "hint": "Divide top and bottom by the same number.", "why": "5/10 becomes 1/2 when both are divided by 5.", "wrong": ["Right value, but not in lowest terms.", "", "That is 2, not 0.5.", "That is 0.2."]}]}, {"type": "english_moment", "words": [{"en": "rational", "meaning": "can be written as a fraction"}], "sentence": "Three quarters is a rational number.", "pattern": "___ is a rational number because ___.", "sayIt": "Zero point five is one half."}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch01.t01', 'hi', 'en', 'v1', 1, '[{"type": "explanation", "title": "परिमेय संख्याएँ", "idea": "परिमेय संख्या वह है जिसे एक पूर्ण संख्या को दूसरी से भाग देकर लिखा जा सके, जैसे 3/4।", "example": "अगर एक पिज़्ज़ा के 4 बराबर टुकड़े हों और आप 3 खाएँ, तो आपने 3/4 खाया।", "steps": ["संख्या को p/q के रूप में लिखें।", "देखें कि q शून्य न हो।", "p और q दोनों पूर्ण संख्याएँ हैं, इसलिए यह परिमेय है।"], "terms": [{"en": "numerator", "local": "अंश"}, {"en": "denominator", "local": "हर"}]}, {"type": "worked_example", "problem": "क्या 0.75 एक परिमेय संख्या है?", "steps": [{"text": "0.75 को सौवें भाग में लिखें।", "expression": "75/100", "result": "0.75"}, {"text": "ऊपर और नीचे को 25 से भाग दें, 3/4 मिलेगा।"}], "answer": "हाँ, 0.75 = 3/4।"}, {"type": "diagram", "title": "परिमेय संख्याएँ कहाँ आती हैं", "kind": "flow", "nodes": [{"id": "n", "label": "प्राकृत संख्याएँ"}, {"id": "w", "label": "पूर्ण संख्याएँ"}, {"id": "i", "label": "पूर्णांक"}, {"id": "r", "label": "परिमेय संख्याएँ"}], "edges": [{"from": "n", "to": "w", "label": "0 जोड़ें"}, {"from": "w", "to": "i", "label": "ऋणात्मक जोड़ें"}, {"from": "i", "to": "r", "label": "भिन्न जोड़ें"}]}, {"type": "key_points", "points": ["हर पूर्णांक परिमेय है: 5 = 5/1।", "हर कभी शून्य नहीं होता।", "सीमित दशमलव परिमेय होते हैं।"]}, {"type": "check", "items": [{"id": "c1", "question": "इनमें से कौन परिमेय संख्या है?", "options": ["5/0", "2/3", "2 का वर्गमूल", "कोई नहीं"], "answer": 1, "hint": "ऐसी संख्या ढूँढें जो एक पूर्ण संख्या बटा शून्य से अलग पूर्ण संख्या हो।", "why": "2/3 एक पूर्ण संख्या बटा दूसरी है, और 3 शून्य नहीं है।", "wrong": ["शून्य से भाग का कोई मान नहीं होता।", "", "2 का वर्गमूल p/q में नहीं लिखा जा सकता।", "इनमें से एक सही है।"]}]}, {"type": "practice", "items": [{"id": "p1", "question": "0.5 को सबसे छोटे रूप में p/q लिखें।", "options": ["5/10", "1/2", "2/1", "1/5"], "answer": 1, "hint": "ऊपर और नीचे को एक ही संख्या से भाग दें।", "why": "5/10 को 5 से भाग देने पर 1/2 मिलता है।", "wrong": ["मान सही है, पर सबसे छोटा रूप नहीं।", "", "यह 2 है, 0.5 नहीं।", "यह 0.2 है।"]}]}, {"type": "english_moment", "words": [{"en": "rational", "meaning": "जिसे भिन्न के रूप में लिखा जा सके"}], "sentence": "Three quarters is a rational number.", "pattern": "___ is a rational number because ___.", "sayIt": "Zero point five is one half."}]'::jsonb, 'ai_made', 'harness', 'harness');

-- Learning and home (M1-6, C252): Kabir studies Mathematics (his free subject) and has two checked answers on the
-- illustrative topic, so the harness can show progress and the parent's calm card. Illustrative only.
update family.children set free_subject = 'mathematics', free_subject_set_at = now() where child_id = 'f0000000-0000-4000-8000-0000000fc002';
insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values
  ('f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'mathematics', 'cbse.c9.mathematics.u1.ch01.t01', 'cbse.c9.mathematics.u1.ch01.t01#c1', 'check', 'Which of these is a rational number? → 5/0', false, (now() at time zone 'Asia/Kolkata')::date),
  ('f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'mathematics', 'cbse.c9.mathematics.u1.ch01.t01', 'cbse.c9.mathematics.u1.ch01.t01#c1', 'check', 'Which of these is a rational number? → 2/3', true, (now() at time zone 'Asia/Kolkata')::date);
insert into family.topic_progress (account_id, child_id, topic_key, subject, answered, correct, first_correct_on, last_correct_on)
values ('f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'cbse.c9.mathematics.u1.ch01.t01', 'mathematics', 2, 1, (now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date);

-- m2-8 begin
-- Interactive diagrams and simulations (M2-8, C282): one illustrative harness-only chapter whose six topics each carry
-- a cached response with one interactive block, so the harness can photograph them without an AI key. Illustrative
-- only; the Science simulations sit under this Mathematics chapter because the harness child studies Mathematics.
insert into content.chapters (chapter_id, version_id, unit_id, chapter_key, position, title_en, source_url, source_page, checked_on)
values ('f0000000-0000-4000-8000-00000000c904', 'f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c902', 'cbse.c9.mathematics.u1.ch90', 90, 'Interactive pictures (harness)', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
insert into content.topics (version_id, chapter_id, topic_key, position, title_en, title_hi, source_url, source_page, checked_on) values
  ('f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c904', 'cbse.c9.mathematics.u1.ch90.t01', 1, 'Graph of a line', 'रेखा का ग्राफ़', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
  ('f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c904', 'cbse.c9.mathematics.u1.ch90.t02', 2, 'Intervals on a number line', 'संख्या रेखा पर अंतराल', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
  ('f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c904', 'cbse.c9.mathematics.u1.ch90.t03', 3, 'Comparing fractions', 'भिन्नों की तुलना', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
  ('f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c904', 'cbse.c9.mathematics.u1.ch90.t04', 4, 'Angles of a triangle', 'त्रिभुज के कोण', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
  ('f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c904', 'cbse.c9.mathematics.u1.ch90.t05', 5, 'Simple pendulum', 'सरल लोलक', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
  ('f0000000-0000-4000-8000-00000000c901', 'f0000000-0000-4000-8000-00000000c904', 'cbse.c9.mathematics.u1.ch90.t06', 6, 'Refraction of light', 'प्रकाश का अपवर्तन', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model) values
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t01', 'en', 'en', 'v1', 1, '[{"type":"explanation","title":"Graph of a line","idea":"Every solution of y = mx + c is a point, and all of them lie on one straight line.","example":"Change a value in the picture and see what changes.","steps":["Look at the picture.","Change one value.","Read the values written below it."],"terms":[]},{"type":"graph","title":"Move m and c and watch the line","fn":"linear","params":{"m":2,"c":1},"sliders":[{"param":"m","min":-5,"max":5,"step":0.5},{"param":"c","min":-5,"max":5,"step":1}],"xFrom":-5,"xTo":5},{"type":"check","items":[{"id":"c1","question":"What changed in the picture?","options":["The picture and the values","Nothing"],"answer":0,"hint":"Try changing one value.","why":"Every value is worked out again.","wrong":["","When a value changes, the picture changes too."]}]},{"type":"practice","items":[{"id":"p1","question":"Change the other value. What happened?","options":["The picture changed","Nothing"],"answer":0,"hint":"Move the slider.","why":"The picture is drawn from the values.","wrong":["","The picture is drawn from the values."]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t01', 'hi', 'en', 'v1', 1, '[{"type":"explanation","title":"रेखा का ग्राफ़","idea":"y = mx + c का हर हल एक बिंदु है, और सब बिंदु एक सीधी रेखा पर होते हैं।","example":"चित्र में मान बदलकर देखें कि क्या बदलता है।","steps":["चित्र देखें।","एक मान बदलें।","नीचे लिखे मान पढ़ें।"],"terms":[]},{"type":"graph","title":"m और c बदलकर रेखा देखें","fn":"linear","params":{"m":2,"c":1},"sliders":[{"param":"m","min":-5,"max":5,"step":0.5},{"param":"c","min":-5,"max":5,"step":1}],"xFrom":-5,"xTo":5},{"type":"check","items":[{"id":"c1","question":"चित्र में क्या बदला?","options":["चित्र और मान दोनों","कुछ नहीं"],"answer":0,"hint":"एक मान बदलकर देखें।","why":"हर मान हमारा कोड फिर से निकालता है।","wrong":["","मान बदलने पर चित्र भी बदलता है।"]}]},{"type":"practice","items":[{"id":"p1","question":"दूसरा मान बदलें। क्या हुआ?","options":["चित्र बदला","कुछ नहीं"],"answer":0,"hint":"स्लाइडर खिसकाएँ।","why":"चित्र मानों से बनता है।","wrong":["","चित्र मानों से बनता है।"]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t02', 'en', 'en', 'v1', 1, '[{"type":"explanation","title":"Intervals on a number line","idea":"An interval is every number between two ends; a filled dot means the end is included.","example":"Change a value in the picture and see what changes.","steps":["Look at the picture.","Change one value.","Read the values written below it."],"terms":[]},{"type":"number_line","title":"From −2 to 3","from":-5,"to":5,"step":1,"marks":[{"value":-2,"label":"A"},{"value":3,"label":"B"}],"interval":{"from":-2,"to":3,"closedFrom":true,"closedTo":false}},{"type":"check","items":[{"id":"c1","question":"What changed in the picture?","options":["The picture and the values","Nothing"],"answer":0,"hint":"Try changing one value.","why":"Every value is worked out again.","wrong":["","When a value changes, the picture changes too."]}]},{"type":"practice","items":[{"id":"p1","question":"Change the other value. What happened?","options":["The picture changed","Nothing"],"answer":0,"hint":"Move the slider.","why":"The picture is drawn from the values.","wrong":["","The picture is drawn from the values."]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t02', 'hi', 'en', 'v1', 1, '[{"type":"explanation","title":"संख्या रेखा पर अंतराल","idea":"अंतराल दो सिरों के बीच की हर संख्या है; भरा बिंदु बताता है कि सिरा शामिल है।","example":"चित्र में मान बदलकर देखें कि क्या बदलता है।","steps":["चित्र देखें।","एक मान बदलें।","नीचे लिखे मान पढ़ें।"],"terms":[]},{"type":"number_line","title":"−2 से 3 तक","from":-5,"to":5,"step":1,"marks":[{"value":-2,"label":"A"},{"value":3,"label":"B"}],"interval":{"from":-2,"to":3,"closedFrom":true,"closedTo":false}},{"type":"check","items":[{"id":"c1","question":"चित्र में क्या बदला?","options":["चित्र और मान दोनों","कुछ नहीं"],"answer":0,"hint":"एक मान बदलकर देखें।","why":"हर मान हमारा कोड फिर से निकालता है।","wrong":["","मान बदलने पर चित्र भी बदलता है।"]}]},{"type":"practice","items":[{"id":"p1","question":"दूसरा मान बदलें। क्या हुआ?","options":["चित्र बदला","कुछ नहीं"],"answer":0,"hint":"स्लाइडर खिसकाएँ।","why":"चित्र मानों से बनता है।","wrong":["","चित्र मानों से बनता है।"]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t03', 'en', 'en', 'v1', 1, '[{"type":"explanation","title":"Comparing fractions","idea":"To compare two fractions, compare equal-sized wholes split into parts.","example":"Change a value in the picture and see what changes.","steps":["Look at the picture.","Change one value.","Read the values written below it."],"terms":[]},{"type":"fraction_model","title":"Which is larger?","shape":"bar","fractions":[{"n":2,"d":3},{"n":3,"d":5}]},{"type":"check","items":[{"id":"c1","question":"What changed in the picture?","options":["The picture and the values","Nothing"],"answer":0,"hint":"Try changing one value.","why":"Every value is worked out again.","wrong":["","When a value changes, the picture changes too."]}]},{"type":"practice","items":[{"id":"p1","question":"Change the other value. What happened?","options":["The picture changed","Nothing"],"answer":0,"hint":"Move the slider.","why":"The picture is drawn from the values.","wrong":["","The picture is drawn from the values."]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t03', 'hi', 'en', 'v1', 1, '[{"type":"explanation","title":"भिन्नों की तुलना","idea":"दो भिन्नों की तुलना के लिए बराबर आकार के पूरे भागों को देखें।","example":"चित्र में मान बदलकर देखें कि क्या बदलता है।","steps":["चित्र देखें।","एक मान बदलें।","नीचे लिखे मान पढ़ें।"],"terms":[]},{"type":"fraction_model","title":"कौन-सा बड़ा है?","shape":"bar","fractions":[{"n":2,"d":3},{"n":3,"d":5}]},{"type":"check","items":[{"id":"c1","question":"चित्र में क्या बदला?","options":["चित्र और मान दोनों","कुछ नहीं"],"answer":0,"hint":"एक मान बदलकर देखें।","why":"हर मान हमारा कोड फिर से निकालता है।","wrong":["","मान बदलने पर चित्र भी बदलता है।"]}]},{"type":"practice","items":[{"id":"p1","question":"दूसरा मान बदलें। क्या हुआ?","options":["चित्र बदला","कुछ नहीं"],"answer":0,"hint":"स्लाइडर खिसकाएँ।","why":"चित्र मानों से बनता है।","wrong":["","चित्र मानों से बनता है।"]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t04', 'en', 'en', 'v1', 1, '[{"type":"explanation","title":"Angles of a triangle","idea":"The three angles of any triangle add up to 180 degrees.","example":"Change a value in the picture and see what changes.","steps":["Look at the picture.","Change one value.","Read the values written below it."],"terms":[]},{"type":"geometry","title":"A triangle with sides 3, 4 and 5","shape":{"kind":"triangle","sides":[3,4,5]},"labels":["A","B","C"]},{"type":"check","items":[{"id":"c1","question":"What changed in the picture?","options":["The picture and the values","Nothing"],"answer":0,"hint":"Try changing one value.","why":"Every value is worked out again.","wrong":["","When a value changes, the picture changes too."]}]},{"type":"practice","items":[{"id":"p1","question":"Change the other value. What happened?","options":["The picture changed","Nothing"],"answer":0,"hint":"Move the slider.","why":"The picture is drawn from the values.","wrong":["","The picture is drawn from the values."]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t04', 'hi', 'en', 'v1', 1, '[{"type":"explanation","title":"त्रिभुज के कोण","idea":"किसी भी त्रिभुज के तीनों कोण मिलकर 180 डिग्री होते हैं।","example":"चित्र में मान बदलकर देखें कि क्या बदलता है।","steps":["चित्र देखें।","एक मान बदलें।","नीचे लिखे मान पढ़ें।"],"terms":[]},{"type":"geometry","title":"3, 4 और 5 भुजाओं वाला त्रिभुज","shape":{"kind":"triangle","sides":[3,4,5]},"labels":["A","B","C"]},{"type":"check","items":[{"id":"c1","question":"चित्र में क्या बदला?","options":["चित्र और मान दोनों","कुछ नहीं"],"answer":0,"hint":"एक मान बदलकर देखें।","why":"हर मान हमारा कोड फिर से निकालता है।","wrong":["","मान बदलने पर चित्र भी बदलता है।"]}]},{"type":"practice","items":[{"id":"p1","question":"दूसरा मान बदलें। क्या हुआ?","options":["चित्र बदला","कुछ नहीं"],"answer":0,"hint":"स्लाइडर खिसकाएँ।","why":"चित्र मानों से बनता है।","wrong":["","चित्र मानों से बनता है।"]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t05', 'en', 'en', 'v1', 1, '[{"type":"explanation","title":"Simple pendulum","idea":"A longer pendulum takes longer for each swing.","example":"Change a value in the picture and see what changes.","steps":["Look at the picture.","Change one value.","Read the values written below it."],"terms":[]},{"type":"simulation","title":"Change the length of the pendulum","sim":"pendulum","values":{"length":1}},{"type":"check","items":[{"id":"c1","question":"What changed in the picture?","options":["The picture and the values","Nothing"],"answer":0,"hint":"Try changing one value.","why":"Every value is worked out again.","wrong":["","When a value changes, the picture changes too."]}]},{"type":"practice","items":[{"id":"p1","question":"Change the other value. What happened?","options":["The picture changed","Nothing"],"answer":0,"hint":"Move the slider.","why":"The picture is drawn from the values.","wrong":["","The picture is drawn from the values."]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t05', 'hi', 'en', 'v1', 1, '[{"type":"explanation","title":"सरल लोलक","idea":"लंबा लोलक हर दोलन में अधिक समय लेता है।","example":"चित्र में मान बदलकर देखें कि क्या बदलता है।","steps":["चित्र देखें।","एक मान बदलें।","नीचे लिखे मान पढ़ें।"],"terms":[]},{"type":"simulation","title":"लोलक की लंबाई बदलें","sim":"pendulum","values":{"length":1}},{"type":"check","items":[{"id":"c1","question":"चित्र में क्या बदला?","options":["चित्र और मान दोनों","कुछ नहीं"],"answer":0,"hint":"एक मान बदलकर देखें।","why":"हर मान हमारा कोड फिर से निकालता है।","wrong":["","मान बदलने पर चित्र भी बदलता है।"]}]},{"type":"practice","items":[{"id":"p1","question":"दूसरा मान बदलें। क्या हुआ?","options":["चित्र बदला","कुछ नहीं"],"answer":0,"hint":"स्लाइडर खिसकाएँ।","why":"चित्र मानों से बनता है।","wrong":["","चित्र मानों से बनता है।"]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t06', 'en', 'en', 'v1', 1, '[{"type":"explanation","title":"Refraction of light","idea":"Light bends when it passes from one medium into another.","example":"Change a value in the picture and see what changes.","steps":["Look at the picture.","Change one value.","Read the values written below it."],"terms":[]},{"type":"simulation","title":"Light from glass into air","sim":"refraction","values":{"n1":1.5,"n2":1,"incidence":45}},{"type":"check","items":[{"id":"c1","question":"What changed in the picture?","options":["The picture and the values","Nothing"],"answer":0,"hint":"Try changing one value.","why":"Every value is worked out again.","wrong":["","When a value changes, the picture changes too."]}]},{"type":"practice","items":[{"id":"p1","question":"Change the other value. What happened?","options":["The picture changed","Nothing"],"answer":0,"hint":"Move the slider.","why":"The picture is drawn from the values.","wrong":["","The picture is drawn from the values."]}]}]'::jsonb, 'ai_made', 'harness', 'harness'),
  ('CBSE', 9, 'mathematics', 'cbse.c9.mathematics.u1.ch90.t06', 'hi', 'en', 'v1', 1, '[{"type":"explanation","title":"प्रकाश का अपवर्तन","idea":"एक माध्यम से दूसरे में जाते समय प्रकाश मुड़ जाता है।","example":"चित्र में मान बदलकर देखें कि क्या बदलता है।","steps":["चित्र देखें।","एक मान बदलें।","नीचे लिखे मान पढ़ें।"],"terms":[]},{"type":"simulation","title":"काँच से हवा में प्रकाश","sim":"refraction","values":{"n1":1.5,"n2":1,"incidence":45}},{"type":"check","items":[{"id":"c1","question":"चित्र में क्या बदला?","options":["चित्र और मान दोनों","कुछ नहीं"],"answer":0,"hint":"एक मान बदलकर देखें।","why":"हर मान हमारा कोड फिर से निकालता है।","wrong":["","मान बदलने पर चित्र भी बदलता है।"]}]},{"type":"practice","items":[{"id":"p1","question":"दूसरा मान बदलें। क्या हुआ?","options":["चित्र बदला","कुछ नहीं"],"answer":0,"hint":"स्लाइडर खिसकाएँ।","why":"चित्र मानों से बनता है।","wrong":["","चित्र मानों से बनता है।"]}]}]'::jsonb, 'ai_made', 'harness', 'harness');
-- m2-8 end
-- m2-2 begin
-- Today's plan (M2-2, C276): the plan module on; Kabir's wrong answer three days ago brings Rational numbers back today
-- (answered today, so it is ticked), then the next topic of his syllabus. Illustrative only.
insert into control.app_flags (app, module, enabled, reason) values ('family', 'plan', true, 'harness')
  on conflict (app, module) do update set enabled = true;
insert into family.revisits (account_id, child_id, topic_key, subject, step, set_on, due_on) values
  ('f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'cbse.c9.mathematics.u1.ch01.t01', 'mathematics', 1, (now() at time zone 'Asia/Kolkata')::date - 3, (now() at time zone 'Asia/Kolkata')::date),
  ('f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'cbse.c9.mathematics.u1.ch01.t01', 'mathematics', 2, (now() at time zone 'Asia/Kolkata')::date - 3, (now() at time zone 'Asia/Kolkata')::date + 7);
-- m2-2 end

-- m2-6 begin
-- The homework helper (M2-6, C280): its module on, so the harness can show the start screen and the Study link.
insert into control.app_flags (app, module, enabled, reason) values ('family', 'homework', true, 'harness')
  on conflict (app, module) do update set enabled = true;
-- m2-6 end

-- m2-7 begin
-- Voice input (M2-7, C281): its module on, and the full family's parent said yes to voice, so Study shows the
-- microphone and the parent area its consent row. Illustrative only.
insert into control.app_flags (app, module, enabled, reason) values ('family', 'voice_input', true, 'harness')
  on conflict (app, module) do update set enabled = true;
insert into family.consents (account_id, purpose, granted, verification_method, notice_version)
values ('f0000000-0000-4000-8000-0000000f0004', 'voice_practice', true, 'parent_tap', 'fam-notice-1');
-- m2-7 end
-- m2-3 begin
-- The habit pieces (M2-3, C277): the habit module on; Kabir finished his plan on four of the last seven days, mastered one
-- topic, and has a reward jar two days short of full. Illustrative only.
insert into control.app_flags (app, module, enabled, reason) values ('family', 'habit', true, 'harness')
  on conflict (app, module) do update set enabled = true;
insert into family.plan_days (account_id, child_id, day, items, minutes, completed_at)
select 'f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', (now() at time zone 'Asia/Kolkata')::date - n,
       '[{"kind":"next","topicKey":"cbse.c9.mathematics.u1.ch01.t02","subject":"mathematics"}]'::jsonb, 10, now()
  from unnest(array[1, 2, 4, 5]) as n;
insert into family.topic_progress (account_id, child_id, topic_key, subject, answered, correct, first_correct_on, last_correct_on, mastered_on)
values ('f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'cbse.c9.mathematics.u1.ch01.t02', 'mathematics', 4, 4,
        (now() at time zone 'Asia/Kolkata')::date - 9, (now() at time zone 'Asia/Kolkata')::date - 2, (now() at time zone 'Asia/Kolkata')::date - 2);
insert into family.reward_jars (account_id, child_id, reward, target_days, started_on)
values ('f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'A trip to the park', 6, (now() at time zone 'Asia/Kolkata')::date - 6);
-- m2-3 end
