-- P7 slice 10d (C227): the compliance desk (docs/28 row 10d), at /app/compliance/desk.
--
-- 1. staff_qualifications: ONE row per staff account of the school (users), as the website's Teacher qualification
--    and TET register keeps a teacher (src/lib/free-tools/teacher-register.ts): the stage taught, subjects, degree,
--    postgraduate degree, professional qualification, the TET (CTET or a State TET, its paper, the certificate's date
--    and any valid-until date the school enters) and one other approval with its valid-until date. A blank valid-until
--    date is no end date (NCTE, 2021: TET certificates are valid for life); nothing here works an expiry out of the
--    certificate's date. The TET's paper and dates only with a TET; a valid-until date never before the certificate's
--    date; a certificate's date never after today in India. Every typed field takes the one Aadhaar-number rule
--    (public.no_aadhaar_number, C225). Changed in place by the office, in its own name (who and when are kept on the
--    row; every change is audited with the staff member's id and the fields that changed, never their values).
-- 2. disclosure_entries: the school's mandatory public disclosure data, typed by the school as its board requires:
--    each item a heading, what the school discloses, and where it comes from. NOTHING IS OVERWRITTEN: every change
--    is a new entry of the item (select and insert only), with who and when (the database's own clock); the latest
--    entry of an item is what is in force, and an item is removed by an entry that says so, after which it stays
--    removed. Nothing here is published on the public website: the school prints it or downloads it.
-- 3. sqaaf_standards: CBSE's School Quality Assessment and Assurance Framework, as DATA: the seven domains, their
--    sub-domains and the 84 standards, copied word for word from the document named on each row (its URL and the day
--    it was read). The app's role reads them; nobody writes them (a new edition comes by a migration).
-- 4. sqaaf_evidence: the school's evidence, each row tagged to ONE standard of that list: a typed note, or a photo or
--    PDF the office uploads (kept in the private documents bucket under "<school>/sqaaf/", handed out only as a
--    short-lived link), or both. Never an Aadhaar number in a note or a file's name (the one rule). A wrong one is
--    removed (audited); none is changed.
--
-- Who reads and writes: the principal and the school admin of the school, in their own name. A teacher, the academic
-- coordinator and the accountant read nothing here (the desk is the office's, docs/28 section 3 rule 6); the platform
-- role holds no right on any of the school's tables. The desk's audit rows ('compliance_desk.%') hold ids, codes,
-- counts and booleans only (C56), and are read by the principal and the school admin, or by the person who acted.
--
-- Read by: src/lib/compliance/qualifications.ts (the register, its CSV import and the My Day card),
-- src/lib/compliance/disclosure.ts (the disclosure items, their printable page and CSV), src/lib/compliance/sqaaf.ts
-- (the standards and the evidence). Form 6 is not here: the desk shows src/lib/compliance/form6.ts's own advisory.
--
-- New tables only: no existing row, column, function or grant is changed, so the code on main runs as before.

-- ---- 1. Teacher qualifications and TET ------------------------------------------------------------------------------

create table staff_qualifications (
  qualification_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  user_id uuid not null,
  stage text check (stage in ('pre', 'primary', 'upper', 'secondary', 'senior')),
  subjects text check (subjects is null or (char_length(btrim(subjects)) between 1 and 80 and public.no_aadhaar_number(subjects))),
  degree text check (degree is null or (char_length(btrim(degree)) between 1 and 60 and public.no_aadhaar_number(degree))),
  postgraduate_degree text check (postgraduate_degree is null or (char_length(btrim(postgraduate_degree)) between 1 and 60 and public.no_aadhaar_number(postgraduate_degree))),
  professional_qualification text check (professional_qualification is null or (char_length(btrim(professional_qualification)) between 1 and 60 and public.no_aadhaar_number(professional_qualification))),
  tet_type text check (tet_type in ('CTET', 'State TET')),
  tet_paper text check (tet_paper in ('I', 'II', 'both')),
  tet_certificate_date date,
  tet_valid_until date,
  other_approval text check (other_approval is null or (char_length(btrim(other_approval)) between 1 and 80 and public.no_aadhaar_number(other_approval))),
  other_valid_until date,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  unique (school_id, qualification_id),
  unique (school_id, user_id),
  foreign key (school_id, user_id) references users(school_id, user_id),
  foreign key (school_id, updated_by) references users(school_id, user_id),
  check (tet_type is not null or (tet_paper is null and tet_certificate_date is null and tet_valid_until is null)),
  check (tet_valid_until is null or tet_certificate_date is null or tet_valid_until >= tet_certificate_date)
);

create function public.staff_qualifications_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  kind text;
begin
  if tg_op = 'UPDATE' and (new.qualification_id, new.school_id, new.user_id) is distinct from (old.qualification_id, old.school_id, old.user_id) then
    raise exception 'a staff member''s qualification row stays theirs' using errcode = 'check_violation';
  end if;
  select u.role::text into kind from users u where u.school_id = new.school_id and u.user_id = new.user_id;
  if kind is null or kind not in ('principal', 'school_admin', 'teacher', 'academic_coordinator') then
    raise exception 'qualifications are kept for the school''s teaching staff' using errcode = 'check_violation';
  end if;
  if new.tet_certificate_date > today then
    raise exception 'a TET certificate''s date is a day that has come' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.staff_qualifications_rules() from public, anon, authenticated, service_role;
create trigger staff_qualifications_rules before insert or update on staff_qualifications for each row execute function public.staff_qualifications_rules();

-- ---- 2. The mandatory public disclosure ----------------------------------------------------------------------------

create table disclosure_entries (
  entry_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  item_id uuid not null,
  heading text not null check (char_length(btrim(heading)) between 1 and 160 and public.no_aadhaar_number(heading)),
  value text check (value is null or (char_length(btrim(value)) between 1 and 2000 and public.no_aadhaar_number(value))),
  source text check (source is null or (char_length(btrim(source)) between 1 and 300 and public.no_aadhaar_number(source))),
  removed boolean not null default false,
  changed_by uuid not null,
  changed_at timestamptz not null default clock_timestamp(),
  unique (school_id, entry_id),
  unique (school_id, item_id, changed_at),
  foreign key (school_id, changed_by) references users(school_id, user_id),
  check (removed = (value is null) and removed = (source is null))
);
create index idx_disclosure_entries_item on disclosure_entries (school_id, item_id, changed_at desc);

-- An entry's time is the database's clock, always after the item's entry before it (a clock that reads the same twice
-- never makes two versions of one time). An item's first entry is never a removal, and a removed item stays removed.
create function public.disclosure_entries_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.changed_at := greatest(
    clock_timestamp(),
    (select max(e.changed_at) + interval '1 microsecond' from disclosure_entries e where e.school_id = new.school_id and e.item_id = new.item_id)
  );
  if exists (select 1 from disclosure_entries e where e.school_id = new.school_id and e.item_id = new.item_id and e.removed) then
    raise exception 'a removed disclosure item stays removed' using errcode = 'check_violation';
  end if;
  if new.removed and not exists (select 1 from disclosure_entries e where e.school_id = new.school_id and e.item_id = new.item_id) then
    raise exception 'only a kept disclosure item is removed' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.disclosure_entries_rules() from public, anon, authenticated, service_role;
create trigger disclosure_entries_rules before insert on disclosure_entries for each row execute function public.disclosure_entries_rules();

-- ---- 3. SQAAF: the standards, as data ------------------------------------------------------------------------------

create table sqaaf_standards (
  code text primary key check (code ~ '^[1-7]\.[0-9]{1,2}\.[0-9]{1,2}$'),
  position int not null unique check (position between 1 and 500),
  domain_no int not null check (domain_no between 1 and 7),
  domain text not null check (char_length(btrim(domain)) between 1 and 120),
  sub_domain_code text not null check (sub_domain_code ~ '^[1-7]\.[0-9]{1,2}$' and code like sub_domain_code || '.%'),
  sub_domain text not null check (char_length(btrim(sub_domain)) between 1 and 200),
  statement text not null check (char_length(btrim(statement)) between 1 and 400),
  source_title text not null check (char_length(btrim(source_title)) between 1 and 200),
  source_url text not null check (char_length(source_url) <= 500 and source_url ~ '^https://[^[:space:]]+$'),
  source_read_on date not null,
  check (domain_no = split_part(code, '.', 1)::int)
);

-- ---- 4. SQAAF evidence ---------------------------------------------------------------------------------------------

create table sqaaf_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  standard_code text not null references sqaaf_standards(code),
  note text check (note is null or (char_length(btrim(note)) between 1 and 600 and public.no_aadhaar_number(note))),
  storage_key text unique check (storage_key is null or char_length(storage_key) between 1 and 300),
  file_name text check (file_name is null or (char_length(btrim(file_name)) between 1 and 120 and public.no_aadhaar_number(file_name))),
  mime_type text check (mime_type is null or mime_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes int check (size_bytes is null or size_bytes between 1 and 8388608),
  added_by uuid not null,
  added_at timestamptz not null default now(),
  unique (school_id, evidence_id),
  foreign key (school_id, added_by) references users(school_id, user_id),
  check (note is not null or storage_key is not null),
  check ((storage_key is null) = (file_name is null) and (storage_key is null) = (mime_type is null) and (storage_key is null) = (size_bytes is null))
);
create index idx_sqaaf_evidence_standard on sqaaf_evidence (school_id, standard_code, added_at);

-- A file's key is under the school's own folder for SQAAF evidence; the time is the database's clock.
create function public.sqaaf_evidence_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.storage_key is not null and left(new.storage_key, char_length(new.school_id::text) + 7) <> new.school_id::text || '/sqaaf/' then
    raise exception 'an evidence file is kept under its own school''s folder' using errcode = 'check_violation';
  end if;
  new.added_at := now();
  return new;
end $$;
revoke all on function public.sqaaf_evidence_rules() from public, anon, authenticated, service_role;
create trigger sqaaf_evidence_rules before insert on sqaaf_evidence for each row execute function public.sqaaf_evidence_rules();

-- ---- Rights ---------------------------------------------------------------------------------------------------------

revoke all on staff_qualifications, disclosure_entries, sqaaf_standards, sqaaf_evidence from public, anon, authenticated, service_role;
revoke all on staff_qualifications, disclosure_entries, sqaaf_standards, sqaaf_evidence from app_user, nca_super;
grant select, insert, update on staff_qualifications to app_user;
grant select, insert on disclosure_entries to app_user;
grant select on sqaaf_standards to app_user;
grant select, insert, delete on sqaaf_evidence to app_user;

alter table staff_qualifications enable row level security;
alter table staff_qualifications force row level security;
alter table disclosure_entries enable row level security;
alter table disclosure_entries force row level security;
alter table sqaaf_standards enable row level security;
alter table sqaaf_standards force row level security;
alter table sqaaf_evidence enable row level security;
alter table sqaaf_evidence force row level security;

create policy staff_qualifications_tenant_isolation on staff_qualifications using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy disclosure_entries_tenant_isolation on disclosure_entries using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy sqaaf_evidence_tenant_isolation on sqaaf_evidence using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The standards are CBSE's, the same for every school: the office of any school reads them; no policy lets anyone write.
create policy sqaaf_standards_read on sqaaf_standards for select to app_user using (
  current_setting('app.current_role', true) in ('principal', 'school_admin')
);

-- The office only: a teacher, the academic coordinator and the accountant read and write nothing here.
create policy staff_qualifications_office on staff_qualifications as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy disclosure_entries_office on disclosure_entries as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));
create policy sqaaf_evidence_office on sqaaf_evidence as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin'));

-- In one's own name.
create policy staff_qualifications_saved_as_self on staff_qualifications as restrictive for insert
  with check (updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy staff_qualifications_changed_as_self on staff_qualifications as restrictive for update
  using (true)
  with check (updated_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy disclosure_entries_changed_as_self on disclosure_entries as restrictive for insert
  with check (changed_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy sqaaf_evidence_added_as_self on sqaaf_evidence as restrictive for insert
  with check (added_by = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- The desk's audit rows name staff members and evidence: the principal and the school admin, or the person who acted.
create policy audit_compliance_desk_rows_office_or_actor on audit_log as restrictive for select
  using (
    split_part(event_action, '.', 1) <> 'compliance_desk'
    or current_setting('app.current_role', true) in ('principal', 'school_admin')
    or actor_user_id = (nullif(current_setting('app.current_user_id', true), ''))::uuid
  );

-- ---- The SQAAF standards, word for word from the document, read 2026-10-14 ---------------------------------------
-- CBSE, "School Quality Assessment and Assurance Framework", April 2023 (Academic Unit): section 1.9, the domain
-- overviews (pages 17-18, 87-88, 141, 169, 191-192, 223, 241): 7 domains, 48 sub-domains and 84 standards, which is
-- what is copied here; the performance levels and indicators under each standard are not.

insert into sqaaf_standards (position, code, domain_no, domain, sub_domain_code, sub_domain, statement, source_title, source_url, source_read_on)
select v.position, v.code, split_part(v.code, '.', 1)::int, d.domain, v.sub_code, s.sub_domain, v.statement,
       'CBSE School Quality Assessment and Assurance Framework (April 2023)', 'https://cbseacademic.nic.in/sqaa/doc/handbook.pdf', date '2026-10-14'
  from (values
    (1, '1.1.1', '1.1', 'Principal and teachers are familiar with the spirit and content of NCF and recommendations of NEP.'),
    (2, '1.1.2', '1.1', 'The School Leaders and Teachers are familiar with the curriculum documents and support material brought out by CBSE.'),
    (3, '1.1.3', '1.1', 'The School Integrated Annual Curriculum and Pedagogical Plan (ACPP) reflects the recommendations of the Board.'),
    (4, '1.1.4', '1.1', 'Curriculum develops skills and abilities which prepare students for lifelong learning; fosters global citizenship leading to attainment of Sustainable Development Goals (SDGs).'),
    (5, '1.2.1', '1.2', 'School follows an optimum number of teaching days and teaching hours as defined by the Appropriate Authority/State/UT Government.'),
    (6, '1.2.2', '1.2', 'The school follows Teacher – Student Ratio as per norms.'),
    (7, '1.2.3', '1.2', 'Teachers are empowered to adopt varied teaching learning approaches reflecting their understanding of the needs of the diverse students and create a conducive environment for joyful learning.'),
    (8, '1.2.4', '1.2', 'The School uses NCERT defined Learning Outcomes (LOs) for all classes as success criteria.'),
    (9, '1.3.1', '1.3', 'The school provides ample opportunities for Art Education.'),
    (10, '1.3.2', '1.3', 'The School Vocational Education Programme develops entrepreneurial and employability skills and provides opportunities for internship and apprenticeship at local industry.'),
    (11, '1.3.3', '1.3', 'The school provides facilities to the students to participate in activities which enhance Literary and Reading Skills, Creative and Critical Thinking Skills; Scientific Skills; Communication Skills, Leadership Skills, and ensures mandatory Digital, Financial, Citizenship, Information and Media, Environmental and Health Literacy.'),
    (12, '1.3.4', '1.3', 'The school has a Life Skills Development Programme focusing on Thinking, Social and Emotional skills.'),
    (13, '1.4.1', '1.4', 'School has a Policy and a strong leadership for promoting Health and Physical Education in Students.'),
    (14, '1.4.2', '1.4', 'Teaching and learning of PE, Sports, Yoga and other Fitness Activities is rich and engaging.'),
    (15, '1.4.3', '1.4', 'Inclusive PE and Sport is an important aspect of school.'),
    (16, '1.5.1', '1.5', 'The school nurtures values through a climate of care, compassion, and respect; welcomes diversity and creates a culture of pride for the school amongst the stakeholders.'),
    (17, '1.5.2', '1.5', 'The school inculcates pride towards Indian heritage and civilization and encourages students to be conscious of their duties towards society, living beings and nature.'),
    (18, '1.6.1', '1.6', 'The school ensures 75% attendance of its students and reduces drop outs.'),
    (19, '1.6.2', '1.6', 'Teachers use multiple modes of assessment to assess the performance of the students - Assessment of Learning.'),
    (20, '1.6.3', '1.6', 'The school has defined procedures and criteria to regularly assess the students'' performance; adopts varied assessment tools and techniques to assess the performance of the students – Assessment for Learning and As Learning.'),
    (21, '1.6.4', '1.6', 'Assessment of skills and competencies (visual and performing arts, life skills, values and ethos, vocational skills, health and physical education, scientific skills, computational skills, literacy skills, digital skills, reading skills and other skills) is done on the basis of Learning Outcomes and the criteria given in the Holistic Progress Card (HPC).'),
    (22, '1.6.5', '1.6', 'The school uses the results of NAS/SLAS/Third Party Assessment/CBSE SAFAL assessment to ensure all students progress on their developmental continuum.'),
    (23, '1.7.1', '1.7', 'The school organises content and teaching learning material based on defined Learning Outcomes, principles and guidelines given in NCF for Foundational Stage along with consideration for the local context.'),
    (24, '1.7.2', '1.7', 'The school adopts an inclusive approach to pedagogy that is play based, engaging, contextual and experiential.'),
    (25, '1.7.3', '1.7', 'The schools designs and conducts age appropriate, regular and ongoing assessments that check for the achievement of the defined Learning Outcomes.'),
    (26, '1.7.4', '1.7', 'The school has created a suitable ecosystem for attaining Foundational Literacy and Numeracy (FLN) targets for all children.'),
    (27, '2.1.1', '2.1', 'The school has sufficient classrooms conducive to learning.'),
    (28, '2.1.2', '2.1', 'The School Library facilitates effective delivery/implementation of its educational programme.'),
    (29, '2.1.3', '2.1', 'Laboratories are available to support learning activities.'),
    (30, '2.1.4', '2.1', 'Computer and other ICT facilities are available to support different administrative and educational activities in the school.'),
    (31, '2.1.5', '2.1', 'The school has adequate number of activity rooms for art, sculpture, music, dance and theatre.'),
    (32, '2.2.1', '2.2', 'The school has sufficient space for Principal, staff and administration as per requirements.'),
    (33, '2.3.1', '2.3', 'The school has effective preventive health care and health management facilities.'),
    (34, '2.4.1', '2.4', 'The school provides safe drinking water; adequate sanitation facilities and follows effective waste management practices.'),
    (35, '2.5.1', '2.5', 'The school has adequate, safe, comfortable, age appropriate and aesthetically designed furniture.'),
    (36, '2.6.1', '2.6', 'The school building is designed for natural lighting and ventilation in keeping with the best international norms.'),
    (37, '2.7.1', '2.7', 'The school follows eco-friendly/green practices to promote and inculcate organic lifestyle among students.'),
    (38, '2.8.1', '2.8', 'The school ensures safety measures as per statutory requirements and as defined by the Board from time to time; effective measures are also in place for Disaster Management.'),
    (39, '2.9.1', '2.9', 'Indoor and outdoor sport facilities are available and support divyang.'),
    (40, '2.10.1', '2.10', 'School has sufficient rooms/dormitories, recreational spaces, washrooms, drinking areas, residence of warden, residence of pastoral care staff, visitors’ room, laundry room, storage room for food items (perishable and non-perishable) and additional bedding, and common room.'),
    (41, '2.10.2', '2.10', 'School has a separate clean and hygienic Kitchen and Dining Area.'),
    (42, '2.10.3', '2.10', 'The school fosters a culture of cleanliness and hygiene.'),
    (43, '2.10.4', '2.10', 'School provides for safety and security of students.'),
    (44, '2.10.5', '2.10', 'Students’ physical, mental, socio-emotional and intellectual well-being is taken care of by intensive pastoral care programmes.'),
    (45, '2.11.1', '2.11', 'The school has a well-managed, clean, hygienic and safe canteen.'),
    (46, '2.12.1', '2.12', 'School provides optional, safe and reliable transportation facility to accessible and remote areas.'),
    (47, '3.1.1', '3.1', 'The school recruits qualified and competent staff (teaching and non-teaching) that is sufficient in number to support fulfilment of school mission and objectives.'),
    (48, '3.1.2', '3.1', 'The School Induction Programme lays strong foundations for productive relationship and high standards of performance.'),
    (49, '3.1.3', '3.1', 'The school staff appraisal is a supportive and developmental process to ensure positive outcomes for students.'),
    (50, '3.1.4', '3.1', 'The school is committed to achieving student learning outcomes by building the capacity of teachers through collaborative, reflective and experiential processes.'),
    (51, '3.1.5', '3.1', 'The school decides the salary and other allowances as per state norms/central norms.'),
    (52, '3.1.6', '3.1', 'The school provides staff incentives and appreciation.'),
    (53, '3.2.1', '3.2', 'Parents are partners in the qualitative growth of the school.'),
    (54, '3.3.1', '3.3', 'Students participate and are involved in school improvement activities.'),
    (55, '3.4.1', '3.4', 'Alumni is involved in the school development programmes.'),
    (56, '3.5.1', '3.5', 'The school is committed to fostering effective school community partnership for providing enriching opportunities to enhance students’ achievement and wellbeing and facilitates Volunteerism through Vidyanjali.'),
    (57, '4.1.1', '4.1', 'The school provides equitable, inclusive and accessible physical environment in which divyang and students from all socio economic backgrounds learn and thrive alongside their peers.'),
    (58, '4.1.2', '4.1', 'The school addresses equity and inclusivity by providing accessible curriculum to divyang and students from all socio economic backgrounds.'),
    (59, '4.1.3', '4.1', 'The school adopts accessible and inclusive pedagogical and assessment practices to accommodate divyang and students from diverse socio economic backgrounds.'),
    (60, '4.2.1', '4.2', 'Indoor and outdoor games, sports and other recreational facilities are provided to divyang and students belonging to different socio economic backgrounds to learn and thrive with their peers.'),
    (61, '4.3.1', '4.3', 'The school provides safe transportation facilities to divyang.'),
    (62, '4.4.1', '4.4', 'The school fosters a culture of compassion, care and empathy towards all.'),
    (63, '4.5.1', '4.5', 'Self Defence Training instils a sense of confidence, promotes physical fitness and enhances emotional wellbeing among the girls.'),
    (64, '5.1.1', '5.1', 'The School Management and Governance System is driven by Standard Operating Procedures (SOPs) made in alignment with its policies, vision and mission.'),
    (65, '5.2.1', '5.2', 'The School Institutional Plan is based on the needs of the students and community and the principle of optimum utilization of resources available in the school and community.'),
    (66, '5.3.1', '5.3', 'The School Management and Governance System establishes effective co-ordination within the school and with outside community to achieve the desired goals.'),
    (67, '5.4.1', '5.4', 'The School Resource Management System facilitates the optimal use of resources and creates a positive and supportive environment for the growth of the school.'),
    (68, '5.5.1', '5.5', 'The School Relationship Management System nurtures and sustains meaningful relationships with its stakeholders to foster increased student achievement.'),
    (69, '5.6.1', '5.6', 'The School Activity Management System accelerates and manages the workflow of all the activities of the school.'),
    (70, '5.7.1', '5.7', 'The School Data and Record Maintenance System assists in making informed decisions for increased efficiency and productivity.'),
    (71, '5.8.1', '5.8', 'The School Communication System facilitates the school staff to stay connected with its stakeholders and community anytime, anywhere.'),
    (72, '5.9.1', '5.9', 'The School Financial and Fee Administration System is based on rationality, admissibility and allocability.'),
    (73, '5.10.1', '5.10', 'The School Admission Policy is in consonance with Board’s and RTE Act norms and is inclusive of bringing OoSC (Out of School Children) and children from deprived communities in the school system.'),
    (74, '6.1.1', '6.1', 'The School Leader builds an intellectual and professional capital for teachers to set the direction for school improvement and student learning.'),
    (75, '6.2.1', '6.2', 'Collaborative Leadership engages shared intelligence to co-create learning institutions.'),
    (76, '6.3.1', '6.3', 'School Leader fosters a climate that supports achievement of learning outcomes.'),
    (77, '6.3.2', '6.3', 'The School Leader demonstrates responsibility and accountability in building a culture of equitability, inclusivity and systems thinking in school.'),
    (78, '6.3.3', '6.3', 'The School Leader provides opportunities to teachers and students to be creative, divergent thinkers, enhance entrepreneurial attitude and thus become future-ready.'),
    (79, '7.1.1', '7.1', 'The school tracks and assesses student satisfaction on the learning experiences provided to them at all stages of engagement, inside and outside the classroom.'),
    (80, '7.2.1', '7.2', 'The school tracks and assesses staff (teaching and non-teaching) satisfaction on the working conditions, safety, recognition, opportunities for creativity, growth and sense of belongingness at all stages of engagement.'),
    (81, '7.3.1', '7.3', 'Intrinsic and extrinsic factors influence the job satisfaction experienced by the principal.'),
    (82, '7.4.1', '7.4', 'The school maintains a healthy relationship with parents and alumni and assesses their satisfaction through connection, engagement and interaction.'),
    (83, '7.5.1', '7.5', 'The school ensures the satisfaction of the community by establishing a culture of meaningful and sustainable community engagement in school programmes.'),
    (84, '7.6.1', '7.6', 'The Management Satisfaction is assessed through stakeholders’ attitude and behaviour towards the institution.')
  ) as v(position, code, sub_code, statement)
  join (values
    (1, 'Curriculum, Pedagogy and Assessment'),
    (2, 'Infrastructure: Adequacy, Functionality and Aesthetics'),
    (3, 'Human Resources'),
    (4, 'Inclusive Practices'),
    (5, 'Management and Governance'),
    (6, 'Leadership'),
    (7, 'Beneficiary Satisfaction')
  ) as d(domain_no, domain) on d.domain_no = split_part(v.code, '.', 1)::int
  join (values
    ('1.1', 'Curriculum Planning'),
    ('1.2', 'Teaching Learning Processes'),
    ('1.3', 'Student Enrichment, Skill based/Vocational Education Programmes embedded in the Annual Curriculum and Pedagogical Plan'),
    ('1.4', 'Mainstreaming Physical Education and Sports'),
    ('1.5', 'Values and Ethos'),
    ('1.6', 'Student Performance, Assessment of Learning Outcomes and Feedback and Learning Enhancement Programme'),
    ('1.7', 'Early Childhood Care and Education and Foundational Literacy and Numeracy'),
    ('2.1', 'Classrooms, library, laboratories, computer labs, ICT facilities and rooms for different activities'),
    ('2.2', 'Principal’s Office, Staff room and Administrative Offices'),
    ('2.3', 'Infirmary and Health Management Facilities'),
    ('2.4', 'Water, Sanitation Facilities and Waste Management'),
    ('2.5', 'Furniture'),
    ('2.6', 'Lighting and Ventilation'),
    ('2.7', 'Eco friendly orientation and integration of Organic Living in Curriculum'),
    ('2.8', 'Safety Provisions'),
    ('2.9', 'Playground and Sports Facilities'),
    ('2.10', 'Hostels (Only for Residential Schools and separate for Boys and Girls)'),
    ('2.11', 'School Canteen (For Day Schools)'),
    ('2.12', 'Transport and Escort Facility'),
    ('3.1', 'School Staff – teaching and non-teaching'),
    ('3.2', 'Parents'),
    ('3.3', 'Students'),
    ('3.4', 'Alumni'),
    ('3.5', 'Community'),
    ('4.1', 'Barrier free environment'),
    ('4.2', 'Games, Sports and other Recreational Facilities'),
    ('4.3', 'Transportation Facilities'),
    ('4.4', 'Overcoming Attitudinal Barriers'),
    ('4.5', 'Self Special Equity Projects'),
    ('5.1', 'Vision and Mission Statement'),
    ('5.2', 'Institutional Planning'),
    ('5.3', 'Effective Coordination'),
    ('5.4', 'Resource Management'),
    ('5.5', 'Relationship Management'),
    ('5.6', 'Activity Management'),
    ('5.7', 'Data and Record Maintenance'),
    ('5.8', 'Oral/Virtual/Online and Written Communication'),
    ('5.9', 'Financial and Fee Administration'),
    ('5.10', 'Admission Process'),
    ('6.1', 'Pedagogical Leadership'),
    ('6.2', 'Collaborative Leadership'),
    ('6.3', 'Systems for Ongoing Quality and Change Management'),
    ('7.1', 'Satisfaction of Students'),
    ('7.2', 'Satisfaction of Staff (Teaching and Non-Teaching)'),
    ('7.3', 'Satisfaction of Principal'),
    ('7.4', 'Satisfaction of Parents and Alumni'),
    ('7.5', 'Satisfaction of Community'),
    ('7.6', 'Satisfaction of Management')
  ) as s(sub_code, sub_domain) on s.sub_code = v.sub_code;

-- The document's own count, domain by domain (its table 1.8: sub-domains and standards 7 and 26, 12 and 20, 5 and 10,
-- 5 and 7, 10 and 10, 3 and 5, 6 and 6). The table's total line says 49 sub-domains, but its rows add up to 48, which
-- is what section 1.9 lists; 84 standards either way. A copy that does not match stops the migration.
do $$
begin
  if (select string_agg(format('%s:%s:%s', domain_no, subs, n), ',' order by domain_no)
        from (select domain_no, count(distinct sub_domain_code) as subs, count(*) as n from sqaaf_standards group by domain_no) x)
     is distinct from '1:7:26,2:12:20,3:5:10,4:5:7,5:10:10,6:3:5,7:6:6' then
    raise exception 'the SQAAF standards do not match the document''s count of sub-domains and standards in each domain';
  end if;
end $$;
