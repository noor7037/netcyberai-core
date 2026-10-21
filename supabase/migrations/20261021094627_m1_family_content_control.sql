-- M1-1 (C247): the Family app's own data, the content library and Control's switches (docs/family-app/03 §3, §5,
-- §11, §14; 10 §1–§5; docs/34 §9.1). Three new schemas, none of which has a foreign key into public.*, so the family
-- app and then its data can move out later (C230-H):
--
--   family   a family's own rows, keyed to its account: the account (with the parent PIN's hash), sign-in codes, the
--            consent ledger, children, answers, topic progress and the daily AI count.
--   content  NetCyberAI's library: boards, syllabus versions with units, chapters and topics, and the Concept
--            Resolver's responses. No personal data.
--   control  what Control changes live (10 §1): settings, app flags with audiences, banners, the oldest accepted app
--            version, the AI providers, profiles and sealed credentials, and AI counts. Every Control change is audited
--            in the existing audit_log (src/lib/audit/log.ts, platform rows), with the before and after for rollback.
--
-- Who reaches what:
--   family_app  a new role, reached only by SET LOCAL ROLE from app_backend (src/lib/auth/db.ts), always with
--               app.current_account_id set from a verified family session. Forced row level security with a
--               permissive and a restrictive policy on every family table: own account only. It reads published
--               content and the switches Control sets, and writes nothing in Control but the AI counts.
--   nca_super   Control (super_admin): writes content and control rows; reads family data only as counts, through
--               family.control_counts(). It holds no right on any family table.
--   app_user    school staff: nothing here at all.
--   public, anon, authenticated: nothing (schema usage revoked; no grant).
-- Sign-in codes are reached only through three security-definer functions; no role holds a right on the table.

create schema if not exists family;
create schema if not exists content;
create schema if not exists control;
revoke all on schema family, content, control from public;
revoke all on schema family, content, control from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'family_app') then
    create role family_app nologin nobypassrls;
  end if;
end $$;
-- INHERIT FALSE, as app_user and nca_super (20260917090000): a missed SET ROLE fails closed.
grant family_app to app_backend with inherit false;
grant usage on schema family, content, control to family_app, nca_super;

-- The verified account of this request, set only by withFamilyContext. Null outside a family session.
create function family.current_account() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('app.current_account_id', true), '')::uuid
$$;

-- ---- family -------------------------------------------------------------------------------------------------------

-- A family account is global (03 §3): one parent's email, never a row of a school's users. The parent PIN (docs/34
-- §9.1 rule 1) is stored only as a salted, peppered hash made by the server; wrong tries bring escalating waits.
create table family.accounts (
  account_id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and length(email) between 3 and 254 and email like '%_@_%'),
  ui_language text not null default 'en' check (ui_language in ('en', 'hi')),
  pin_hash text check (pin_hash is null or length(pin_hash) between 40 and 300),
  pin_set_at timestamptz,
  pin_failures smallint not null default 0 check (pin_failures between 0 and 1000),
  pin_locked_until timestamptz,
  token_version integer not null default 0,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- One-time email codes: random, stored as a keyed hash (never the code), 10 minutes, 5 tries, rate-limited by email
-- and by network address (both also keyed hashes). Purpose `pin_reset` is the PIN's reset by email.
create table family.sign_in_codes (
  code_id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('sign_in', 'pin_reset')),
  email_key text not null check (email_key ~ '^[0-9a-f]{64}$'),
  code_key text not null check (code_key ~ '^[0-9a-f]{64}$'),
  ip_key text check (ip_key is null or ip_key ~ '^[0-9a-f]{64}$'),
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index idx_family_codes_email on family.sign_in_codes (email_key, purpose, created_at desc);
create index idx_family_codes_ip on family.sign_in_codes (ip_key, created_at) where ip_key is not null;
create index idx_family_codes_created on family.sign_in_codes (created_at);

-- The consent ledger (03 §11), in the shape of the school's consent_ledger (src/lib/consent/gate.ts): append-only, a
-- withdrawal is a new row, and the latest row per purpose is its state; no row means not granted. A purpose is granted
-- or withdrawn only by the parent's own tap. Erased with the account (DPDP erasure), never edited.
create table family.consents (
  consent_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references family.accounts (account_id) on delete cascade,
  purpose text not null check (purpose in ('study_core', 'school_link', 'opportunity_matching', 'photo_input', 'english_programme', 'voice_practice')),
  granted boolean not null,
  verification_method text not null check (verification_method = 'parent_tap'),
  notice_version text not null check (notice_version ~ '^[a-z0-9.-]{1,32}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index idx_family_consents_account on family.consents (account_id, purpose, created_at desc);

-- A child is a first name, class, board, language, explanation style and state (03 §5): no surname, no photo, no
-- phone, no Aadhaar. One word of letters only. The state has no default: the parent chooses it.
create table family.children (
  child_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references family.accounts (account_id) on delete cascade,
  first_name text not null check (first_name ~ '^[^[:space:][:digit:][:punct:][:cntrl:]०-९<>@]{1,30}$'),
  class_level smallint not null check (class_level between 6 and 10),
  board_id text not null check (board_id = 'CBSE'),
  language text not null check (language in ('en', 'hi')),
  style text not null check (style in ('en', 'hi', 'hinglish')),
  state_code text not null check (state_code ~ '^IN-[A-Z]{2}$'),
  free_subject text check (free_subject is null or free_subject in ('mathematics', 'science')),
  free_subject_set_at timestamptz,
  created_at timestamptz not null default now(),
  -- The composite key every child-keyed row points at: a row of one account can never name another account's child.
  unique (account_id, child_id)
);

-- A child's checked answers (02 §4.2): only answers checked against a key are kept, and only these move progress. The
-- parent sees and deletes them (P2).
create table family.attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  subject text not null check (subject in ('mathematics', 'science')),
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  item_key text not null check (length(item_key) between 1 and 120),
  kind text not null check (kind in ('check', 'practice')),
  answer text not null check (length(answer) <= 500),
  correct boolean not null,
  hint_used boolean not null default false,
  answered_on date not null,
  created_at timestamptz not null default now(),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_attempts_child on family.attempts (child_id, created_at desc);
create index idx_family_attempts_account on family.attempts (account_id);

-- A child's progress per topic: moved only by checked answers. Mastered = correct on two days at least 7 apart.
create table family.topic_progress (
  account_id uuid not null,
  child_id uuid not null,
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  subject text not null check (subject in ('mathematics', 'science')),
  answered integer not null default 0 check (answered >= 0),
  correct integer not null default 0 check (correct between 0 and answered),
  first_correct_on date,
  last_correct_on date,
  mastered_on date,
  updated_at timestamptz not null default now(),
  primary key (child_id, topic_key),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_progress_account on family.topic_progress (account_id);

-- Requests to the AI per account per India day, for the daily cap (03 §7). Counts only: never a prompt or answer.
create table family.ai_daily (
  account_id uuid not null references family.accounts (account_id) on delete cascade,
  day date not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (account_id, day)
);

alter table family.accounts enable row level security;
alter table family.accounts force row level security;
alter table family.sign_in_codes enable row level security;
alter table family.sign_in_codes force row level security;
alter table family.consents enable row level security;
alter table family.consents force row level security;
alter table family.children enable row level security;
alter table family.children force row level security;
alter table family.attempts enable row level security;
alter table family.attempts force row level security;
alter table family.topic_progress enable row level security;
alter table family.topic_progress force row level security;
alter table family.ai_daily enable row level security;
alter table family.ai_daily force row level security;
revoke all on family.accounts, family.sign_in_codes, family.consents, family.children, family.attempts, family.topic_progress, family.ai_daily from public, anon, authenticated, app_user, nca_super;

-- Own account only, twice: a permissive policy that grants it and a restrictive one that no later policy can widen.
create policy accounts_own on family.accounts as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy accounts_own_only on family.accounts as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy consents_own on family.consents as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy consents_own_only on family.consents as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy children_own on family.children as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy children_own_only on family.children as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy attempts_own on family.attempts as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy attempts_own_only on family.attempts as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy topic_progress_own on family.topic_progress as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy topic_progress_own_only on family.topic_progress as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy ai_daily_own on family.ai_daily as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy ai_daily_own_only on family.ai_daily as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());

grant select, delete on family.accounts to family_app;
grant update (ui_language, pin_hash, pin_set_at, pin_failures, pin_locked_until, token_version, last_sign_in_at) on family.accounts to family_app;
grant select, insert on family.consents to family_app;
grant select, insert, delete on family.children to family_app;
grant update (first_name, class_level, language, style, state_code, free_subject, free_subject_set_at) on family.children to family_app;
grant select, insert, delete on family.attempts to family_app;
grant select, insert, update, delete on family.topic_progress to family_app;
grant select, insert, update on family.ai_daily to family_app;

-- Issue a code: refused when this email had 3 codes in 15 minutes or 10 in a day, or this network 20 in an hour. A new
-- code ends the older ones for the same email and purpose. Expired rows older than two days are cleared here.
create function family.issue_code(p_purpose text, p_email_key text, p_code_key text, p_ip_key text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  in_15 integer;
  in_day integer;
  from_ip integer := 0;
begin
  if p_purpose not in ('sign_in', 'pin_reset') then
    raise exception 'family.issue_code: unknown purpose';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('family.code:' || p_email_key, 0));
  delete from family.sign_in_codes where created_at < now() - interval '2 days';
  select count(*) filter (where created_at > now() - interval '15 minutes'), count(*) filter (where created_at > now() - interval '1 day')
    into in_15, in_day
    from family.sign_in_codes where email_key = p_email_key;
  if p_ip_key is not null then
    select count(*) into from_ip from family.sign_in_codes where ip_key = p_ip_key and created_at > now() - interval '1 hour';
  end if;
  if in_15 >= 3 or in_day >= 10 or from_ip >= 20 then
    return 'rate_limited';
  end if;
  update family.sign_in_codes set consumed_at = now()
   where email_key = p_email_key and purpose = p_purpose and consumed_at is null;
  insert into family.sign_in_codes (purpose, email_key, code_key, ip_key, expires_at)
  values (p_purpose, p_email_key, p_code_key, p_ip_key, now() + interval '10 minutes');
  return 'ok';
end $$;

-- Check a code against the newest live one for this email and purpose. Every wrong try counts; the fifth locks it.
-- Returns ok | wrong | locked | expired | none.
create function family.redeem_code(p_purpose text, p_email_key text, p_code_key text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  select code_id, code_key, attempts, expires_at into c
    from family.sign_in_codes
   where email_key = p_email_key and purpose = p_purpose and consumed_at is null
   order by created_at desc limit 1
   for update;
  if not found then return 'none'; end if;
  if c.expires_at <= now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'locked'; end if;
  if c.code_key = p_code_key then
    update family.sign_in_codes set attempts = attempts + 1, consumed_at = now() where code_id = c.code_id;
    return 'ok';
  end if;
  update family.sign_in_codes set attempts = attempts + 1 where code_id = c.code_id;
  return case when c.attempts + 1 >= 5 then 'locked' else 'wrong' end;
end $$;

-- Sign in: redeem the code and, only when it is right, open the account for this email (made on first sign-in).
create function family.sign_in(p_email text, p_email_key text, p_code_key text)
returns table (outcome text, account_id uuid, token_version integer, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare
  r text;
  e text := lower(btrim(p_email));
begin
  r := family.redeem_code('sign_in', p_email_key, p_code_key);
  if r <> 'ok' then
    return query select r, null::uuid, null::integer, null::boolean;
    return;
  end if;
  return query
    insert into family.accounts as a (email, last_sign_in_at) values (e, now())
    on conflict (email) do update set last_sign_in_at = now()
    returning 'ok'::text, a.account_id, a.token_version, (a.xmax = 0);
end $$;

revoke all on function family.issue_code(text, text, text, text), family.redeem_code(text, text, text), family.sign_in(text, text, text) from public;
grant execute on function family.issue_code(text, text, text, text), family.redeem_code(text, text, text), family.sign_in(text, text, text) to family_app;
grant execute on function family.current_account() to family_app;
revoke all on function family.current_account() from public;

-- ---- content ------------------------------------------------------------------------------------------------------

create table content.boards (
  board_id text primary key check (board_id ~ '^[A-Z][A-Z0-9-]{1,15}$'),
  name_en text not null check (length(name_en) between 1 and 120),
  name_hi text check (name_hi is null or length(name_hi) between 1 and 120)
);
insert into content.boards (board_id, name_en, name_hi)
values ('CBSE', 'Central Board of Secondary Education', 'केंद्रीय माध्यमिक शिक्षा बोर्ड');

-- A syllabus version (10 §4.2): imported as a whole, reviewed as a whole, published as a numbered version. The two-
-- person rule is held here too: whoever imported a version can never approve it. A version imported from a file
-- committed in a pull request (import_source 'repository') names that PR and has no importing account.
-- Published versions go to staff preview first, then to everyone; at most one of each per syllabus and year.
create table content.syllabus_versions (
  version_id uuid primary key default gen_random_uuid(),
  board_id text not null references content.boards (board_id),
  class_level smallint not null check (class_level between 1 and 12),
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{2}$'),
  version_no integer not null check (version_no >= 1),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'superseded', 'withdrawn', 'rejected')),
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
  unique (board_id, class_level, subject, academic_year, version_no),
  check (import_source = 'repository' or imported_by is not null),
  check (approved_by is null or imported_by is null or approved_by <> imported_by),
  check ((status = 'published') = (audience is not null)),
  check (status not in ('published', 'superseded') or approved_by is not null)
);
create unique index uq_content_published on content.syllabus_versions (board_id, class_level, subject, academic_year, audience)
  where status = 'published';

-- Units, chapters and topics of a version. Each has a stable key, the same in every version of that syllabus, so
-- progress and responses carry across versions and a diff can match lines. Titles only: never textbook text (10 §4.2).
-- Every line names its official source, the page, and the day it was checked.
create table content.units (
  unit_id uuid primary key default gen_random_uuid(),
  version_id uuid not null references content.syllabus_versions (version_id) on delete cascade,
  unit_key text not null check (unit_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  position integer not null check (position >= 1),
  title_en text not null check (length(title_en) between 1 and 300),
  title_hi text check (title_hi is null or length(title_hi) between 1 and 300),
  source_url text not null check (source_url ~ '^https://'),
  source_page text not null check (length(source_page) between 1 and 40),
  checked_on date not null,
  unique (version_id, unit_key)
);

create table content.chapters (
  chapter_id uuid primary key default gen_random_uuid(),
  version_id uuid not null references content.syllabus_versions (version_id) on delete cascade,
  unit_id uuid references content.units (unit_id) on delete cascade,
  chapter_key text not null check (chapter_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  position integer not null check (position >= 1),
  title_en text not null check (length(title_en) between 1 and 300),
  title_hi text check (title_hi is null or length(title_hi) between 1 and 300),
  source_url text not null check (source_url ~ '^https://'),
  source_page text not null check (length(source_page) between 1 and 40),
  checked_on date not null,
  unique (version_id, chapter_key)
);
create index idx_content_chapters_version on content.chapters (version_id, position);

create table content.topics (
  topic_id uuid primary key default gen_random_uuid(),
  version_id uuid not null references content.syllabus_versions (version_id) on delete cascade,
  chapter_id uuid not null references content.chapters (chapter_id) on delete cascade,
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  position integer not null check (position >= 1),
  title_en text not null check (length(title_en) between 1 and 300),
  title_hi text check (title_hi is null or length(title_hi) between 1 and 300),
  source_url text not null check (source_url ~ '^https://'),
  source_page text not null check (length(source_page) between 1 and 40),
  checked_on date not null,
  unique (version_id, topic_key)
);
create index idx_content_topics_chapter on content.topics (chapter_id, position);

-- The Concept Resolver's cached responses for a syllabus topic (10 §4.3): keyed by topic, class, language, style and
-- prompt version. "AI-made" until the founder approves it in Control; then "checked by NetCyberAI". A typed question
-- is never cached here: it is the child's own words.
create table content.responses (
  response_id uuid primary key default gen_random_uuid(),
  board_id text not null references content.boards (board_id),
  class_level smallint not null check (class_level between 1 and 12),
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  language text not null check (language in ('en', 'hi')),
  style text not null check (style in ('en', 'hi', 'hinglish')),
  prompt_version text not null check (prompt_version ~ '^[a-z0-9.-]{1,32}$'),
  schema_version integer not null check (schema_version >= 1),
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  status text not null default 'ai_made' check (status in ('ai_made', 'checked', 'withdrawn')),
  provider text not null check (length(provider) between 1 and 40),
  model text not null check (length(model) between 1 and 80),
  created_at timestamptz not null default now(),
  checked_by uuid,
  checked_at timestamptz,
  withdrawn_at timestamptz,
  check ((status = 'checked') = (checked_by is not null))
);
create unique index uq_content_response_key on content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version)
  where status <> 'withdrawn';

alter table content.boards enable row level security;
alter table content.boards force row level security;
alter table content.syllabus_versions enable row level security;
alter table content.syllabus_versions force row level security;
alter table content.units enable row level security;
alter table content.units force row level security;
alter table content.chapters enable row level security;
alter table content.chapters force row level security;
alter table content.topics enable row level security;
alter table content.topics force row level security;
alter table content.responses enable row level security;
alter table content.responses force row level security;
revoke all on content.boards, content.syllabus_versions, content.units, content.chapters, content.topics, content.responses from public, anon, authenticated, app_user;

-- Families read boards, and only what is published to everyone.
create policy boards_family_read on content.boards as permissive for select to family_app using (true);
create policy versions_family_read on content.syllabus_versions as permissive for select to family_app
  using (status = 'published' and audience = 'everyone');
create policy versions_family_only on content.syllabus_versions as restrictive for all to family_app
  using (status = 'published' and audience = 'everyone') with check (false);
create policy units_family_read on content.units as permissive for select to family_app
  using (exists (select 1 from content.syllabus_versions v where v.version_id = units.version_id and v.status = 'published' and v.audience = 'everyone'));
create policy units_family_only on content.units as restrictive for all to family_app
  using (exists (select 1 from content.syllabus_versions v where v.version_id = units.version_id and v.status = 'published' and v.audience = 'everyone')) with check (false);
create policy chapters_family_read on content.chapters as permissive for select to family_app
  using (exists (select 1 from content.syllabus_versions v where v.version_id = chapters.version_id and v.status = 'published' and v.audience = 'everyone'));
create policy chapters_family_only on content.chapters as restrictive for all to family_app
  using (exists (select 1 from content.syllabus_versions v where v.version_id = chapters.version_id and v.status = 'published' and v.audience = 'everyone')) with check (false);
create policy topics_family_read on content.topics as permissive for select to family_app
  using (exists (select 1 from content.syllabus_versions v where v.version_id = topics.version_id and v.status = 'published' and v.audience = 'everyone'));
create policy topics_family_only on content.topics as restrictive for all to family_app
  using (exists (select 1 from content.syllabus_versions v where v.version_id = topics.version_id and v.status = 'published' and v.audience = 'everyone')) with check (false);
-- Responses: families read any not withdrawn, and add new AI-made ones (the resolver's cache, written only by the
-- server after the response passed its schema and checks); they never approve. A reviewer withdraws a bad one.
create policy responses_family_read on content.responses as permissive for select to family_app using (status <> 'withdrawn');
create policy responses_family_add on content.responses as permissive for insert to family_app
  with check (status = 'ai_made' and checked_by is null and checked_at is null and withdrawn_at is null);
create policy responses_family_only on content.responses as restrictive for all to family_app
  using (status <> 'withdrawn') with check (status = 'ai_made' and checked_by is null);

grant select on content.boards, content.syllabus_versions, content.units, content.chapters, content.topics, content.responses to family_app;
grant insert on content.responses to family_app;
-- Control (nca_super bypasses row security; these grants are its only rights here).
grant select, insert, update on content.boards, content.syllabus_versions, content.units, content.chapters, content.topics, content.responses to nca_super;
grant delete on content.units, content.chapters, content.topics, content.syllabus_versions to nca_super;

-- ---- control ------------------------------------------------------------------------------------------------------

-- Settings stored as data (10 §1): limits and caps, never prices before the pilot evidence. Each key's value is JSON.
create table control.settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{2,79}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into control.settings (key, value) values
  ('family.ai.daily_requests', '20'::jsonb),
  ('family.free_subjects_per_child', '1'::jsonb),
  ('family.free_subject_change_days', '90'::jsonb);

-- App flags with audiences (10 §2): per app and module; module '*' is the whole app's kill switch. A missing row is
-- off. The message shows in place of the screen when a module is off.
create table control.app_flags (
  app text not null check (app in ('family', 'teacher', 'school_web')),
  module text not null check (module = '*' or module ~ '^[a-z][a-z0-9_.]{1,59}$'),
  enabled boolean not null,
  audience text not null default 'everyone' check (audience in ('everyone', 'staff_preview', 'percent', 'schools')),
  audience_percent smallint check (audience_percent is null or audience_percent between 0 and 100),
  audience_schools uuid[],
  reason text check (reason is null or length(reason) <= 300),
  ends_at timestamptz,
  off_message_en text check (off_message_en is null or length(off_message_en) <= 300),
  off_message_hi text check (off_message_hi is null or length(off_message_hi) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (app, module),
  check ((audience = 'percent') = (audience_percent is not null)),
  check ((audience = 'schools') = (audience_schools is not null))
);
insert into control.app_flags (app, module, enabled, reason) values
  ('family', '*', true, 'M1'),
  ('family', 'understand', true, 'M1'),
  ('family', 'practice', true, 'M1'),
  ('family', 'progress', true, 'M1'),
  ('family', 'parent_card', true, 'M1');

-- A notice or maintenance banner per app, in English and Hindi, with a start and an end.
create table control.app_banners (
  banner_id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('family', 'teacher', 'school_web')),
  tone text not null default 'info' check (tone in ('info', 'warning')),
  text_en text not null check (length(text_en) between 1 and 300),
  text_hi text not null check (length(text_hi) between 1 and 300),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ends_at > starts_at)
);

-- The oldest app shell version still accepted (10 §1): an older Android shell is told to refresh.
create table control.app_versions (
  app text primary key check (app in ('family', 'teacher', 'school_web')),
  min_shell_version integer not null default 0 check (min_shell_version >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into control.app_versions (app) values ('family'), ('teacher'), ('school_web');

-- Accounts that see staff-preview flags (the founder's own family account, for example). Plain ids, no foreign key.
create table control.preview_accounts (
  account_id uuid primary key,
  added_by uuid not null,
  added_at timestamptz not null default now()
);

-- AI providers (03 §7). cleared_for_minors is the founder's confirmation, after reading the provider's current terms,
-- that its terms allow a product used by children (aal2, audited). The code adds its own check on top: an adapter must
-- also be eligible for minors.
create table control.ai_providers (
  provider_id text primary key check (provider_id ~ '^[a-z][a-z0-9_-]{1,39}$'),
  cleared_for_minors boolean not null default false,
  cleared_terms_url text check (cleared_terms_url is null or cleared_terms_url ~ '^https://'),
  cleared_at timestamptz,
  cleared_by uuid,
  enabled boolean not null default true,
  check (not cleared_for_minors or (cleared_terms_url is not null and cleared_at is not null and cleared_by is not null))
);
insert into control.ai_providers (provider_id) values ('anthropic'), ('openai');

-- Sealed credentials (10 §3): encrypted by the server before they are stored, decrypted only inside the server call
-- that uses them. Write-only in Control: a screen sees the last four characters, who set it and when.
create table control.ai_credentials (
  provider_id text primary key references control.ai_providers (provider_id),
  ciphertext text not null,
  iv text not null,
  tag text not null,
  key_version integer not null check (key_version >= 1),
  key_last4 text not null check (length(key_last4) between 1 and 4),
  set_by uuid not null,
  set_at timestamptz not null default now(),
  tested_at timestamptz,
  test_ok boolean,
  test_message text check (test_message is null or length(test_message) <= 200)
);

-- Profiles by feature (03 §7): provider and model, a fallback chain, the active prompt version and an on switch.
-- carries_child_words is set by the code's profile list, never in Control: such a profile is refused at run time
-- unless every provider in its chain is cleared for minors, and a change to an uncleared provider is refused here.
create table control.ai_profiles (
  profile_id text primary key check (profile_id ~ '^[a-z][a-z0-9_.]{2,59}$'),
  provider_id text references control.ai_providers (provider_id),
  model text check (model is null or model ~ '^[A-Za-z0-9._:/-]{1,80}$'),
  fallback jsonb not null default '[]'::jsonb check (jsonb_typeof(fallback) = 'array'),
  prompt_version text not null default 'v1' check (prompt_version ~ '^[a-z0-9.-]{1,32}$'),
  max_output_tokens integer not null default 2000 check (max_output_tokens between 100 and 16000),
  carries_child_words boolean not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words)
values ('family.resolver', null, null, true);

create function control.ai_profile_minors_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  p text;
begin
  if not new.carries_child_words then return new; end if;
  if tg_op = 'UPDATE' and new.provider_id is not distinct from old.provider_id and new.fallback = old.fallback and old.carries_child_words then
    return new;
  end if;
  for p in select new.provider_id union select f ->> 'provider' from jsonb_array_elements(new.fallback) f loop
    if p is not null and not exists (select 1 from control.ai_providers where provider_id = p and cleared_for_minors) then
      raise exception 'provider % is not cleared for minors', p using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
create trigger ai_profiles_minors_check before insert or update on control.ai_profiles
  for each row execute function control.ai_profile_minors_check();

-- A provider's clearance cannot be withdrawn while a profile that carries a child's words still uses it: move the
-- profile first.
create function control.ai_provider_clearance_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.cleared_for_minors and not new.cleared_for_minors and exists (
    select 1 from control.ai_profiles p
     where p.carries_child_words
       and (p.provider_id = new.provider_id or exists (select 1 from jsonb_array_elements(p.fallback) f where f ->> 'provider' = new.provider_id))
  ) then
    raise exception 'provider % is used by a profile that carries a child''s words', new.provider_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger ai_providers_clearance_check before update on control.ai_providers
  for each row execute function control.ai_provider_clearance_check();

-- AI counts per day, profile, provider and model (03 §7 "Audit and usage"): counts and tokens, never text.
create table control.ai_usage (
  day date not null,
  profile_id text not null,
  provider_id text not null,
  model text not null,
  requests integer not null default 0 check (requests >= 0),
  failures integer not null default 0 check (failures >= 0),
  cap_refusals integer not null default 0 check (cap_refusals >= 0),
  tokens_in bigint not null default 0 check (tokens_in >= 0),
  tokens_out bigint not null default 0 check (tokens_out >= 0),
  primary key (day, profile_id, provider_id, model)
);

alter table control.settings enable row level security;
alter table control.settings force row level security;
alter table control.app_flags enable row level security;
alter table control.app_flags force row level security;
alter table control.app_banners enable row level security;
alter table control.app_banners force row level security;
alter table control.app_versions enable row level security;
alter table control.app_versions force row level security;
alter table control.preview_accounts enable row level security;
alter table control.preview_accounts force row level security;
alter table control.ai_providers enable row level security;
alter table control.ai_providers force row level security;
alter table control.ai_credentials enable row level security;
alter table control.ai_credentials force row level security;
alter table control.ai_profiles enable row level security;
alter table control.ai_profiles force row level security;
alter table control.ai_usage enable row level security;
alter table control.ai_usage force row level security;
revoke all on control.settings, control.app_flags, control.app_banners, control.app_versions, control.preview_accounts, control.ai_providers, control.ai_credentials, control.ai_profiles, control.ai_usage from public, anon, authenticated, app_user;

-- What a family session may read: the switches and limits, never a credential or the audit.
create policy settings_family_read on control.settings as permissive for select to family_app using (true);
create policy app_flags_family_read on control.app_flags as permissive for select to family_app using (app = 'family');
create policy app_banners_family_read on control.app_banners as permissive for select to family_app using (app = 'family');
create policy app_versions_family_read on control.app_versions as permissive for select to family_app using (app = 'family');
create policy preview_family_read on control.preview_accounts as permissive for select to family_app using (account_id = family.current_account());
create policy preview_family_only on control.preview_accounts as restrictive for all to family_app using (account_id = family.current_account()) with check (false);
create policy ai_providers_family_read on control.ai_providers as permissive for select to family_app using (true);
create policy ai_profiles_family_read on control.ai_profiles as permissive for select to family_app using (true);

grant select on control.settings, control.app_flags, control.app_banners, control.app_versions, control.preview_accounts, control.ai_providers, control.ai_profiles to family_app;
grant select, insert, update on control.settings, control.app_flags, control.app_banners, control.app_versions, control.ai_providers, control.ai_profiles, control.ai_usage to nca_super;
grant select, insert, update, delete on control.ai_credentials to nca_super;
grant select, insert, delete on control.preview_accounts to nca_super;

-- The sealed credential of an enabled provider, for the server call that uses it. Ciphertext only: the key that opens
-- it is in the server's environment and nowhere else.
create function control.ai_sealed_credential(p_provider text)
returns table (ciphertext text, iv text, tag text, key_version integer)
language sql stable security definer set search_path = '' as $$
  select c.ciphertext, c.iv, c.tag, c.key_version
    from control.ai_credentials c join control.ai_providers p on p.provider_id = c.provider_id
   where c.provider_id = p_provider and p.enabled
$$;
revoke all on function control.ai_sealed_credential(text) from public;

-- Add to today's AI counts. The only way a family request touches them: it can add, never rewrite or read.
create function control.count_ai_usage(p_day date, p_profile text, p_provider text, p_model text, p_requests integer, p_failures integer, p_cap_refusals integer, p_tokens_in bigint, p_tokens_out bigint)
returns void
language sql security definer set search_path = '' as $$
  insert into control.ai_usage as u (day, profile_id, provider_id, model, requests, failures, cap_refusals, tokens_in, tokens_out)
  values (p_day, p_profile, p_provider, p_model, greatest(p_requests, 0), greatest(p_failures, 0), greatest(p_cap_refusals, 0), greatest(p_tokens_in, 0), greatest(p_tokens_out, 0))
  on conflict (day, profile_id, provider_id, model) do update
    set requests = u.requests + excluded.requests, failures = u.failures + excluded.failures, cap_refusals = u.cap_refusals + excluded.cap_refusals,
        tokens_in = u.tokens_in + excluded.tokens_in, tokens_out = u.tokens_out + excluded.tokens_out
$$;
revoke all on function control.count_ai_usage(date, text, text, text, integer, integer, integer, bigint, bigint) from public;
grant execute on function control.count_ai_usage(date, text, text, text, integer, integer, integer, bigint, bigint) to family_app, nca_super;
grant execute on function control.ai_sealed_credential(text) to family_app, nca_super;
revoke all on function control.ai_profile_minors_check(), control.ai_provider_clearance_check() from public;

-- Control → Family (10 §9): counts only, never a name, a child or an answer.
create function family.control_counts()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accounts', (select count(*) from family.accounts),
    'accounts_with_pin', (select count(*) from family.accounts where pin_hash is not null),
    'children', (select count(*) from family.children),
    'children_by_class', coalesce((select jsonb_object_agg(class_level, n) from (select class_level, count(*) n from family.children group by class_level) x), '{}'::jsonb),
    'study_core_granted', (select count(*) from (select distinct on (account_id) granted from family.consents where purpose = 'study_core' order by account_id, created_at desc) s where granted),
    'answers_7d', (select count(*) from family.attempts where created_at > now() - interval '7 days'),
    'children_answering_7d', (select count(distinct child_id) from family.attempts where created_at > now() - interval '7 days'),
    'topics_mastered', (select count(*) from family.topic_progress where mastered_on is not null),
    'ai_requests_today', (select coalesce(sum(requests), 0) from family.ai_daily where day = (now() at time zone 'Asia/Kolkata')::date)
  )
$$;
revoke all on function family.control_counts() from public;
grant execute on function family.control_counts() to nca_super;
