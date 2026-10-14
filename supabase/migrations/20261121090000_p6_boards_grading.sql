-- P6 slice 9a (C213): boards, board presets and the school's grading scheme
-- (docs/27 sections 3 and 5, row 9a).
--
-- 1. boards: the examination boards the app knows. CBSE and CISCE are seeded
--    below; Control adds a state board when a school from that board signs.
--    A board is added, never changed or removed.
-- 2. board_presets: a board's grading as its official document prints it,
--    kept as DATA (no grade table is written in the code): the level it is for,
--    the document's title, URL and the day it was read, the bands (from, to,
--    grade, meaning; where the document gives no mark ranges the bands carry
--    none), the pass mark, the components with their share of the subject's
--    marks, co-scholastic grades, and notes saying what the document leaves
--    out. A PRESET IS NEVER CHANGED: a new one replaces it
--    (replaces_preset_id), with who added it and when. Each is replaced at
--    most once, by a preset of the same board.
-- 3. schools.board_id: the board a school records. NetCyberAI sets it in
--    Control; the school's principal or school admin sets it on the grading
--    scheme screen. The trigger refuses anyone else and keeps who set it and
--    when. Schools whose old board field says CBSE or ICSE start on cbse or
--    cisce; every other school starts with no board.
-- 4. grading_schemes: the school's grading scheme, one row a version. Saving
--    makes the next version; the latest version is in force; NOTHING IS
--    OVERWRITTEN (no UPDATE or DELETE right for anyone, and the trigger). The
--    shape and the rules of the bands (each range within 0 to 100, from not
--    above to, every band with a range or none, no two bands with the same
--    grade or sharing a percent) are held here as well as in the app
--    (src/lib/exams/scheme.ts).
--
-- Who reads and writes:
--   boards, board_presets: every school role reads (the scheme screen offers
--     the presets of the school's board); only the platform role writes, and
--     only by adding rows. The app's role holds SELECT only.
--   grading_schemes: the school's principal, school admin, academic
--     coordinator and teachers read (from 9b, a class result shows grades by
--     it); the principal and the school admin save a version, in their own
--     name. The accountant reads nothing. The platform role holds no right.
--   Read by src/lib/exams/** (the scheme screen and Control's boards page).

-- 1.
create table boards (
  board_id text primary key check (board_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  added_by uuid references users(user_id),
  added_at timestamptz not null default now()
);
create unique index uq_boards_name on boards (lower(btrim(name)));

-- 2.
create table board_presets (
  preset_id uuid primary key default gen_random_uuid(),
  board_id text not null references boards(board_id),
  level text not null check (char_length(btrim(level)) between 1 and 80),
  source_title text not null check (char_length(btrim(source_title)) between 1 and 200),
  source_url text not null check (char_length(source_url) <= 500 and source_url ~ '^https://[^[:space:]]+$'),
  source_read_on date not null,
  bands jsonb not null check (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) between 1 and 30),
  pass_mark numeric(5, 2) check (pass_mark between 0 and 100),
  components jsonb not null default '[]' check (jsonb_typeof(components) = 'array' and jsonb_array_length(components) <= 12),
  co_scholastic jsonb check (co_scholastic is null or jsonb_typeof(co_scholastic) = 'object'),
  notes jsonb not null default '[]' check (jsonb_typeof(notes) = 'array' and jsonb_array_length(notes) <= 12),
  replaces_preset_id uuid,
  added_by uuid references users(user_id),
  added_at timestamptz not null default now(),
  unique (board_id, preset_id),
  -- A preset replaces one of its own board, never itself.
  foreign key (board_id, replaces_preset_id) references board_presets (board_id, preset_id),
  check (replaces_preset_id is distinct from preset_id)
);
-- Replaced once: the newer preset is the one in use.
create unique index uq_board_presets_replaced_once on board_presets (replaces_preset_id) where replaces_preset_id is not null;
create index idx_board_presets_board on board_presets (board_id, added_at);

-- The rules of a list of bands, in one place for presets and schemes. Null
-- when the bands keep them, or the first rule they break.
create function public.grading_bands_problem(bands jsonb) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when jsonb_typeof(bands) is distinct from 'array' then 'the bands are a list'
    when jsonb_array_length(bands) > 30 then 'at most 30 bands'
    when exists (select 1 from jsonb_array_elements(bands) e
                  where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'grade') is distinct from 'string'
                     or char_length(btrim(e ->> 'grade')) not between 1 and 20) then 'every band has a grade of 1 to 20 characters'
    when exists (select 1 from jsonb_array_elements(bands) e
                  where coalesce(jsonb_typeof(e -> 'meaning'), 'null') not in ('null', 'string') or char_length(e ->> 'meaning') > 120) then 'a meaning is at most 120 characters'
    when exists (select 1 from jsonb_array_elements(bands) e
                  where coalesce(jsonb_typeof(e -> 'from'), 'null') not in ('null', 'number')
                     or coalesce(jsonb_typeof(e -> 'to'), 'null') not in ('null', 'number')
                     or (jsonb_typeof(e -> 'from') = 'number') <> (jsonb_typeof(e -> 'to') = 'number')) then 'a band has both ends of its range, or neither'
    when (select count(*) from jsonb_array_elements(bands) e where jsonb_typeof(e -> 'from') = 'number') not in (0, jsonb_array_length(bands)) then 'every band has a range, or none has'
    when exists (select 1 from jsonb_array_elements(bands) e
                  where jsonb_typeof(e -> 'from') = 'number'
                    and not ((e ->> 'from')::numeric >= 0 and (e ->> 'to')::numeric <= 100 and (e ->> 'from')::numeric <= (e ->> 'to')::numeric)) then 'a range lies within 0 to 100, its start not above its end'
    when exists (select 1 from jsonb_array_elements(bands) e group by lower(btrim(e ->> 'grade')) having count(*) > 1) then 'two bands have the same grade'
    when exists (select 1 from jsonb_array_elements(bands) with ordinality a(x, i)
                   join jsonb_array_elements(bands) with ordinality b(y, j) on a.i < b.j
                  where jsonb_typeof(a.x -> 'from') = 'number' and jsonb_typeof(b.y -> 'from') = 'number'
                    and (a.x ->> 'from')::numeric <= (b.y ->> 'to')::numeric and (b.y ->> 'from')::numeric <= (a.x ->> 'to')::numeric) then 'two bands share a percent'
  end
$$;
revoke all on function public.grading_bands_problem(jsonb) from public, anon, authenticated, service_role;
-- Called from the triggers below, as the role that writes.
grant execute on function public.grading_bands_problem(jsonb) to app_user, nca_super;

create function public.board_presets_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  problem text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'a board preset is never changed or removed: add a new one that replaces it' using errcode = 'check_violation';
  end if;
  problem := grading_bands_problem(new.bands);
  if problem is not null then
    raise exception 'board preset: %', problem using errcode = 'check_violation';
  end if;
  -- Only the presets this migration seeds were added by no one.
  if new.added_by is null and current_user in ('app_user', 'nca_super') then
    raise exception 'a board preset says who added it' using errcode = 'check_violation';
  end if;
  new.added_at := now();
  return new;
end $$;
revoke all on function public.board_presets_rules() from public, anon, authenticated, service_role;
create trigger board_presets_rules before insert or update or delete on board_presets for each row execute function public.board_presets_rules();

create function public.boards_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'a board is never changed or removed' using errcode = 'check_violation';
  end if;
  if new.added_by is null and current_user in ('app_user', 'nca_super') then
    raise exception 'a board says who added it' using errcode = 'check_violation';
  end if;
  new.added_at := now();
  return new;
end $$;
revoke all on function public.boards_rules() from public, anon, authenticated, service_role;
create trigger boards_rules before insert or update or delete on boards for each row execute function public.boards_rules();

-- 3.
alter table schools
  add column board_id text references boards(board_id),
  add column board_set_by uuid references users(user_id),
  add column board_set_at timestamptz;

create function public.schools_board_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- A new school whose form named CBSE or ICSE starts on that board.
    if new.board_id is null then
      new.board_id := case new.board::text when 'CBSE' then 'cbse' when 'ICSE' then 'cisce' end;
    end if;
    new.board_set_by := null;
    new.board_set_at := case when new.board_id is null then null else now() end;
    return new;
  end if;
  if new.board_id is distinct from old.board_id then
    if current_user in ('app_user', 'nca_super')
       and coalesce(current_setting('app.current_role', true), '') not in ('principal', 'school_admin', 'super_admin') then
      raise exception 'only the principal, the school admin or NetCyberAI records the school''s board' using errcode = 'insufficient_privilege';
    end if;
    new.board_set_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
    new.board_set_at := now();
  else
    -- Who set the board and when are written by this trigger only.
    new.board_set_by := old.board_set_by;
    new.board_set_at := old.board_set_at;
  end if;
  return new;
end $$;
revoke all on function public.schools_board_rules() from public, anon, authenticated, service_role;
create trigger schools_board_rules before insert or update of board_id, board_set_by, board_set_at on schools
  for each row execute function public.schools_board_rules();

-- 4.
create table grading_schemes (
  scheme_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  version integer not null check (version >= 1),
  scheme jsonb not null,
  from_preset_id uuid references board_presets(preset_id),
  made_by uuid not null references users(user_id),
  made_at timestamptz not null default now(),
  unique (school_id, version),
  unique (school_id, scheme_id)
);

-- The rules of a whole scheme. Null when it keeps them, or the first it breaks.
create function public.grading_scheme_problem(scheme jsonb) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when jsonb_typeof(scheme) is distinct from 'object' then 'the scheme is a record'
    when jsonb_typeof(scheme -> 'decimals') is distinct from 'number' or (scheme ->> 'decimals') not in ('0', '1') then 'percents are rounded to a whole number or to one decimal place'
    when coalesce(jsonb_typeof(scheme -> 'passMark'), 'missing') not in ('null', 'number') then 'the pass mark is a number, or empty'
    when jsonb_typeof(scheme -> 'passMark') = 'number' and (scheme ->> 'passMark')::numeric not between 0 and 100 then 'the pass mark lies within 0 to 100'
    when jsonb_typeof(scheme -> 'components') is distinct from 'array' or jsonb_typeof(scheme -> 'terms') is distinct from 'array'
      or jsonb_typeof(scheme -> 'layout') is distinct from 'object' or jsonb_typeof(scheme -> 'bands') is distinct from 'array'
      or coalesce(jsonb_typeof(scheme -> 'coScholastic'), 'missing') not in ('null', 'object') then 'the scheme has bands, components, terms, a report card layout and co-scholastic areas or none'
    when jsonb_array_length(scheme -> 'components') > 12 or jsonb_array_length(scheme -> 'terms') > 12 then 'at most 12 components and 12 terms'
    when exists (select 1 from jsonb_array_elements(scheme -> 'components') c
                  where jsonb_typeof(c) <> 'object' or jsonb_typeof(c -> 'share') is distinct from 'number'
                     or (c ->> 'share')::numeric <= 0 or (c ->> 'share')::numeric > 100
                     or coalesce(jsonb_typeof(c -> 'passMark'), 'missing') not in ('null', 'number')
                     or (jsonb_typeof(c -> 'passMark') = 'number' and (c ->> 'passMark')::numeric not between 0 and 100)) then 'every component has a share above 0 and up to 100, and a pass mark within 0 to 100 or none'
    when jsonb_array_length(scheme -> 'components') > 0
     and (select sum((c ->> 'share')::numeric) from jsonb_array_elements(scheme -> 'components') c) <> 100 then 'the components'' shares add up to 100'
    else grading_bands_problem(scheme -> 'bands')
  end
$$;
revoke all on function public.grading_scheme_problem(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.grading_scheme_problem(jsonb) to app_user;

create function public.grading_schemes_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  problem text;
  latest integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'a saved grading scheme is never changed or removed: save a new version' using errcode = 'check_violation';
  end if;
  problem := grading_scheme_problem(new.scheme);
  if problem is not null then
    raise exception 'grading scheme: %', problem using errcode = 'check_violation';
  end if;
  -- The next version, and only the next: none is skipped and none is written twice (the unique index). Counted
  -- with the writer's own rights: the principal and the school admin read every version of their school, and
  -- anyone else is refused by the policies whatever this finds.
  select coalesce(max(version), 0) into latest from grading_schemes where school_id = new.school_id;
  if new.version <> latest + 1 then
    raise exception 'a new version of the grading scheme comes right after the latest one' using errcode = 'check_violation';
  end if;
  new.made_at := now();
  return new;
end $$;
revoke all on function public.grading_schemes_rules() from public, anon, authenticated, service_role;
create trigger grading_schemes_rules before insert or update or delete on grading_schemes for each row execute function public.grading_schemes_rules();

revoke all on boards, board_presets, grading_schemes from public, anon, authenticated, service_role;
revoke all on boards, board_presets, grading_schemes from app_user, nca_super;
grant select on boards, board_presets to app_user;
grant select, insert on boards, board_presets to nca_super;
grant select, insert on grading_schemes to app_user;

alter table boards enable row level security;
alter table boards force row level security;
alter table board_presets enable row level security;
alter table board_presets force row level security;
alter table grading_schemes enable row level security;
alter table grading_schemes force row level security;

-- Every school role reads the boards and their presets; the platform role (which bypasses row level security)
-- adds them. No policy lets the app's role write, and it holds no right to.
create policy boards_read on boards for select to app_user using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'])
);
create policy board_presets_read on board_presets for select to app_user using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'])
);

create policy grading_schemes_tenant_isolation on grading_schemes using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Read by the school's teaching staff. Not the accountant.
create policy grading_schemes_staff on grading_schemes as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher'])
);
-- Saved by the principal or the school admin, in their own name.
create policy grading_schemes_saved_by_office on grading_schemes as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and made_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);

-- The two boards with presets (docs/27 section 5), each copied from its official document, read 2026-10-14.
insert into boards (board_id, name) values
  ('cbse', 'Central Board of Secondary Education (CBSE)'),
  ('cisce', 'Council for the Indian School Certificate Examinations (CISCE)')
on conflict (board_id) do nothing;

insert into board_presets (board_id, level, source_title, source_url, source_read_on, bands, pass_mark, components, co_scholastic, notes)
select 'cbse', 'Classes IX-X', 'Secondary School Curriculum 2025–26, Classes IX–X',
  'https://cbseacademic.nic.in/web_material/CurriculumMain26/Sec/Curriculum_Sec_2025-26.pdf', date '2026-10-14',
  '[{"from": 91, "to": 100, "grade": "A1", "meaning": null},
    {"from": 81, "to": 90, "grade": "A2", "meaning": null},
    {"from": 71, "to": 80, "grade": "B1", "meaning": null},
    {"from": 61, "to": 70, "grade": "B2", "meaning": null},
    {"from": 51, "to": 60, "grade": "C1", "meaning": null},
    {"from": 45, "to": 50, "grade": "C2", "meaning": null},
    {"from": 33, "to": 40, "grade": "D", "meaning": null}]'::jsonb,
  33,
  '[{"key": "annual-examination", "kind": "theory", "name": "Annual examination", "share": 80, "passMark": null, "parts": []},
    {"key": "internal-assessment", "kind": "internal", "name": "Internal assessment", "share": 20, "passMark": null,
     "parts": [{"name": "Periodic assessment", "share": 5}, {"name": "Multiple assessment", "share": 5}, {"name": "Portfolio", "share": 5}, {"name": "Subject enrichment", "share": 5}]}]'::jsonb,
  null,
  '[{"about": "general", "text": "Section 4 of the document. The grading scale is the one the document says the school awards in Class IX."},
    {"about": "pass_mark", "text": "The document asks for “33 percent in total in each of these components” and says a 2018 notification relaxed this. That notification could not be read, so this preset sets 33 percent of the subject total only. A pass mark for each component is left to the school."},
    {"about": "bands", "text": "The document prints C2 as 45–50, so marks from 41 to 44, and below 33, fall in no band. The preset copies the table as printed; the school closes the gap."},
    {"about": "grades", "text": "Class X grades are positional: octiles of all the Board’s passed candidates. A school cannot compute them, and they rank children, so this preset does not offer them."}]'::jsonb
where not exists (select 1 from board_presets where board_id = 'cbse' and level = 'Classes IX-X');

insert into board_presets (board_id, level, source_title, source_url, source_read_on, bands, pass_mark, components, co_scholastic, notes)
select 'cisce', 'ICSE (Class X)', 'ICSE Regulations, Year 2028',
  'https://cisce.org/wp-content/uploads/2026/01/1.-Regulations.pdf', date '2026-10-14',
  '[{"from": null, "to": null, "grade": "1", "meaning": "Very good"},
    {"from": null, "to": null, "grade": "2", "meaning": "Very good"},
    {"from": null, "to": null, "grade": "3", "meaning": "Pass with credit"},
    {"from": null, "to": null, "grade": "4", "meaning": "Pass with credit"},
    {"from": null, "to": null, "grade": "5", "meaning": "Pass with credit"},
    {"from": null, "to": null, "grade": "6", "meaning": "Pass"},
    {"from": null, "to": null, "grade": "7", "meaning": "Pass"},
    {"from": null, "to": null, "grade": "8", "meaning": "Failure"},
    {"from": null, "to": null, "grade": "9", "meaning": "Failure"}]'::jsonb,
  33,
  '[]'::jsonb,
  '{"areas": ["SUPW and Community Service"],
    "grades": [{"grade": "A", "meaning": null, "pass": true}, {"grade": "B", "meaning": null, "pass": true}, {"grade": "C", "meaning": null, "pass": true},
               {"grade": "D", "meaning": null, "pass": true}, {"grade": "E", "meaning": null, "pass": false}]}'::jsonb,
  '[{"about": "grades", "text": "Grades 1 to 9, 1 the highest: 1 and 2 very good, 3 to 5 a pass with credit, 6 and 7 a pass, 8 and 9 a failure."},
    {"about": "bands", "text": "The Regulations give no mark range for the grades, so this preset has none: the school enters the ranges it uses, or the report card shows marks only."},
    {"about": "components", "text": "This preset carries the grades, the pass mark and SUPW and Community Service only. Components are left for the school to enter."}]'::jsonb
where not exists (select 1 from board_presets where board_id = 'cisce' and level = 'ICSE (Class X)');

insert into board_presets (board_id, level, source_title, source_url, source_read_on, bands, pass_mark, components, co_scholastic, notes)
select 'cisce', 'ISC (Class XII)', 'ISC Regulations, Year 2028',
  'https://cisce.org/wp-content/uploads/2026/01/1.-Regulations-1.pdf', date '2026-10-14',
  '[{"from": null, "to": null, "grade": "1", "meaning": "Very good (pass with credit)"},
    {"from": null, "to": null, "grade": "2", "meaning": "Very good (pass with credit)"},
    {"from": null, "to": null, "grade": "3", "meaning": "Pass with credit"},
    {"from": null, "to": null, "grade": "4", "meaning": "Pass with credit"},
    {"from": null, "to": null, "grade": "5", "meaning": "Pass with credit"},
    {"from": null, "to": null, "grade": "6", "meaning": "Pass with credit"},
    {"from": null, "to": null, "grade": "7", "meaning": "Pass"},
    {"from": null, "to": null, "grade": "8", "meaning": "Pass"},
    {"from": null, "to": null, "grade": "9", "meaning": "Failure"}]'::jsonb,
  35,
  '[]'::jsonb,
  '{"areas": ["SUPW and Community Service"],
    "grades": [{"grade": "A", "meaning": null, "pass": true}, {"grade": "B", "meaning": null, "pass": true}, {"grade": "C", "meaning": null, "pass": true},
               {"grade": "D", "meaning": null, "pass": true}, {"grade": "E", "meaning": null, "pass": false}]}'::jsonb,
  '[{"about": "grades", "text": "Grades 1 to 9, 1 the highest: 1 to 6 a pass with credit (1 and 2 very good), 7 and 8 a pass, 9 a failure."},
    {"about": "bands", "text": "The Regulations give no mark range for the grades, so this preset has none: the school enters the ranges it uses, or the report card shows marks only."},
    {"about": "components", "text": "This preset carries the grades, the pass mark and SUPW and Community Service only (graded A to E; A to D a pass). Components are left for the school to enter."}]'::jsonb
where not exists (select 1 from board_presets where board_id = 'cisce' and level = 'ISC (Class XII)');

-- Schools whose old board field names CBSE or ICSE start on that board (the trigger records when).
update schools set board_id = case board::text when 'CBSE' then 'cbse' when 'ICSE' then 'cisce' end
 where board_id is null and board::text in ('CBSE', 'ICSE');

-- Exams is partly built (its grading scheme): on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'exams', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
