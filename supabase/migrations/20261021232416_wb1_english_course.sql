-- The 90-day English course (docs/family-app/12, C274; slice E-1).
--
-- content: one course version per track, imported from the lesson files committed in a pull request, reviewed and
-- published as syllabus versions are (10 §4.2): the two-person rule, staff preview then everyone, one published version
-- of each per track. Its units, lessons and assessments carry stable keys, the same in every version, so a child's
-- progress carries across versions. Families read only what is published to everyone.
--
-- family: a child's place in the course, lessons done, review boxes, assessment results and per-day counts. Own
-- account only, twice (a permissive and a restrictive policy), like every family table (M1-1). No audio and no answer
-- text is kept: a check is scored on the server and only its score is stored.

-- ---- content ------------------------------------------------------------------------------------------------------

create table content.english_versions (
  version_id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('a', 'b', 'c', 'd')),
  version_no integer not null check (version_no >= 1),
  status text not null default 'in_review' check (status in ('draft', 'in_review', 'published', 'superseded', 'withdrawn', 'rejected')),
  audience text check (audience is null or audience in ('staff_preview', 'everyone')),
  import_source text not null check (import_source in ('control', 'repository')),
  import_ref text check (import_ref is null or length(import_ref) between 1 and 200),
  imported_by uuid,
  imported_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  released_at timestamptz,
  ended_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 1000),
  unique (track, version_no),
  check (import_source = 'repository' or imported_by is not null),
  check (approved_by is null or imported_by is null or approved_by <> imported_by),
  check ((status = 'published') = (audience is not null)),
  check (status not in ('published', 'superseded') or approved_by is not null)
);
create unique index uq_content_english_published on content.english_versions (track, audience) where status = 'published';

create table content.english_units (
  version_id uuid not null references content.english_versions (version_id) on delete cascade,
  unit_key text not null check (unit_key ~ '^[a-d]\.u[0-9]{2}$'),
  position smallint not null check (position between 1 and 18),
  title_en text not null check (length(title_en) between 1 and 120),
  title_hi text not null check (length(title_hi) between 1 and 120),
  can_do_en text not null check (length(can_do_en) between 1 and 200),
  can_do_hi text not null check (length(can_do_hi) between 1 and 200),
  pic text not null check (length(pic) between 1 and 40),
  primary key (version_id, unit_key),
  unique (version_id, position)
);

-- A lesson's body is the lesson as the file holds it, check answers included: the server strips them before a phone
-- gets the lesson (src/lib/english/course.ts forChild).
create table content.english_lessons (
  version_id uuid not null references content.english_versions (version_id) on delete cascade,
  lesson_key text not null check (lesson_key ~ '^[a-d]\.u[0-9]{2}\.l[1-5]$'),
  unit_key text not null,
  position smallint not null check (position between 1 and 5),
  kind text not null check (kind in ('words', 'pattern', 'listen', 'speak', 'review')),
  title_en text not null check (length(title_en) between 1 and 120),
  title_hi text not null check (length(title_hi) between 1 and 120),
  minutes smallint not null check (minutes between 1 and 15),
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 65536),
  primary key (version_id, lesson_key),
  foreign key (version_id, unit_key) references content.english_units (version_id, unit_key) on delete cascade,
  unique (version_id, unit_key, position)
);

create table content.english_assessments (
  version_id uuid not null references content.english_versions (version_id) on delete cascade,
  kind text not null check (kind in ('day0', 'day45', 'day90')),
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 65536),
  primary key (version_id, kind)
);

alter table content.english_versions enable row level security;
alter table content.english_versions force row level security;
alter table content.english_units enable row level security;
alter table content.english_units force row level security;
alter table content.english_lessons enable row level security;
alter table content.english_lessons force row level security;
alter table content.english_assessments enable row level security;
alter table content.english_assessments force row level security;
revoke all on content.english_versions, content.english_units, content.english_lessons, content.english_assessments from public, anon, authenticated, app_user;

-- Families read only what is published to everyone, and never write.
create policy english_versions_family_read on content.english_versions as permissive for select to family_app
  using (status = 'published' and audience = 'everyone');
create policy english_versions_family_only on content.english_versions as restrictive for all to family_app
  using (status = 'published' and audience = 'everyone') with check (false);
create policy english_units_family_read on content.english_units as permissive for select to family_app
  using (exists (select 1 from content.english_versions v where v.version_id = english_units.version_id));
create policy english_units_family_only on content.english_units as restrictive for all to family_app
  using (exists (select 1 from content.english_versions v where v.version_id = english_units.version_id)) with check (false);
create policy english_lessons_family_read on content.english_lessons as permissive for select to family_app
  using (exists (select 1 from content.english_versions v where v.version_id = english_lessons.version_id));
create policy english_lessons_family_only on content.english_lessons as restrictive for all to family_app
  using (exists (select 1 from content.english_versions v where v.version_id = english_lessons.version_id)) with check (false);
create policy english_assessments_family_read on content.english_assessments as permissive for select to family_app
  using (exists (select 1 from content.english_versions v where v.version_id = english_assessments.version_id));
create policy english_assessments_family_only on content.english_assessments as restrictive for all to family_app
  using (exists (select 1 from content.english_versions v where v.version_id = english_assessments.version_id)) with check (false);

grant select on content.english_versions, content.english_units, content.english_lessons, content.english_assessments to family_app;
-- Control (nca_super bypasses row security; these grants are its only rights here, as for the catalog).
grant select, insert, update on content.english_versions, content.english_units, content.english_lessons, content.english_assessments to nca_super;
grant delete on content.english_units, content.english_lessons, content.english_assessments to nca_super;

-- ---- family -------------------------------------------------------------------------------------------------------

-- A child's place in the course: the track (from the class; the parent may move it), the unit the day-0 check placed
-- them at, and the parent's weekly goal (lessons in 7 days; a goal, never a streak).
create table family.english_enrolments (
  account_id uuid not null,
  child_id uuid primary key,
  track text not null check (track in ('a', 'b', 'c', 'd')),
  track_changed boolean not null default false,
  placed_unit smallint not null default 1 check (placed_unit in (1, 4, 7)),
  weekly_goal smallint not null default 5 check (weekly_goal between 1 and 7),
  started_on date not null,
  updated_at timestamptz not null default now(),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_english_enrolments_account on family.english_enrolments (account_id);

-- Lessons done: the best score of the check (0–100), the stars, how many tries. A lesson is done when stars > 0.
create table family.english_lessons_done (
  account_id uuid not null,
  child_id uuid not null,
  lesson_key text not null check (lesson_key ~ '^[a-d]\.u[0-9]{2}\.l[1-5]$'),
  tries smallint not null default 0 check (tries between 0 and 1000),
  best_score smallint not null default 0 check (best_score between 0 and 100),
  stars smallint not null default 0 check (stars between 0 and 3),
  done_on date,
  last_on date not null,
  primary key (child_id, lesson_key),
  check ((stars > 0) = (done_on is not null)),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_english_done_account on family.english_lessons_done (account_id);

-- The review boxes (12 §7): an item answered right comes back after 1, 3, 7 and 21 days; learned = right on two days
-- at least 7 apart (C230-I).
create table family.english_reviews (
  account_id uuid not null,
  child_id uuid not null,
  item_key text not null check (item_key ~ '^[a-d]\.u[0-9]{2}\.l[1-5]\.[a-z0-9][a-z0-9-]{0,29}$'),
  -- A word of a Words lesson, or a check item: the parent's report counts words learned.
  kind text not null check (kind in ('word', 'item')),
  box smallint not null check (box between 0 and 4),
  due_on date not null,
  first_right_on date,
  last_right_on date,
  learned_on date,
  misses smallint not null default 0 check (misses between 0 and 1000),
  primary key (child_id, item_key),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_english_reviews_due on family.english_reviews (child_id, due_on);
create index idx_family_english_reviews_account on family.english_reviews (account_id);

-- The day-0, day-45 and day-90 results, per skill (0–100; null where the track has no such section). The latest try.
create table family.english_assessment_results (
  account_id uuid not null,
  child_id uuid not null,
  kind text not null check (kind in ('day0', 'day45', 'day90')),
  taken_on date not null,
  listening smallint check (listening between 0 and 100),
  words smallint check (words between 0 and 100),
  grammar smallint check (grammar between 0 and 100),
  reading smallint check (reading between 0 and 100),
  speaking smallint check (speaking between 0 and 100),
  total smallint not null check (total between 0 and 100),
  primary key (child_id, kind),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_english_results_account on family.english_assessment_results (account_id);

-- Per child per India day: new lessons done (the daily cap, 12 §3) and seconds of voice practice (E-9's cap).
create table family.english_days (
  account_id uuid not null,
  child_id uuid not null,
  day date not null,
  new_lessons smallint not null default 0 check (new_lessons between 0 and 100),
  voice_seconds integer not null default 0 check (voice_seconds between 0 and 86400),
  primary key (child_id, day),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_english_days_account on family.english_days (account_id);

alter table family.english_enrolments enable row level security;
alter table family.english_enrolments force row level security;
alter table family.english_lessons_done enable row level security;
alter table family.english_lessons_done force row level security;
alter table family.english_reviews enable row level security;
alter table family.english_reviews force row level security;
alter table family.english_assessment_results enable row level security;
alter table family.english_assessment_results force row level security;
alter table family.english_days enable row level security;
alter table family.english_days force row level security;
revoke all on family.english_enrolments, family.english_lessons_done, family.english_reviews, family.english_assessment_results, family.english_days
  from public, anon, authenticated, app_user, nca_super;

create policy english_enrolments_own on family.english_enrolments as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_enrolments_own_only on family.english_enrolments as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_lessons_done_own on family.english_lessons_done as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_lessons_done_own_only on family.english_lessons_done as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_reviews_own on family.english_reviews as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_reviews_own_only on family.english_reviews as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_results_own on family.english_assessment_results as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_results_own_only on family.english_assessment_results as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_days_own on family.english_days as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_days_own_only on family.english_days as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());

grant select, insert, update, delete on family.english_enrolments, family.english_lessons_done, family.english_reviews,
  family.english_assessment_results, family.english_days to family_app;

-- ---- control ------------------------------------------------------------------------------------------------------

-- The course's limits (12 §3, §9), changed in Control: new lessons a day, and voice practice minutes a day (E-9).
insert into control.settings (key, value) values
  ('family.english.new_lessons_per_day', '2'::jsonb),
  ('family.english.voice_minutes_per_day', '5'::jsonb)
on conflict (key) do nothing;
