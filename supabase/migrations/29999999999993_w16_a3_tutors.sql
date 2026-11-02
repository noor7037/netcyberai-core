-- W16-A3: the Tutor Hall (Programme W16, decision 5). Placeholder timestamp: the lead applies the migration and renames it
-- to the version it is applied as.
--
-- Subject-wise tutors a child can chat with or call, and a school's own tutors, which reach the Family app after School
-- Link pairing.
--
--   content.tutors      the platform's tutors (NetCyberAI's library, no personal data): a key, a subject (null: all),
--                       a name and a one-line style in both languages, the language they speak, the id of their TTS
--                       voice (W16-A4 uses it), one of the five lesson tints and an avatar key. Read by the family
--                       role (the enabled ones) and by the school role through public.platform_tutors_for_school() (the
--                       content schema stays closed to app_user, as the other content tables); written by nca_super.
--                       Six are seeded: plain names, one-line styles, no claims.
--   public.school_tutors  a school's own tutors (name, subject, style, language, voice, tint, on or off), and its
--                       switch-offs of platform tutors (a row with platform_key and enabled = false, nothing else).
--                       The school's own rows: forced row level security, the office (principal, school admin) reads
--                       and writes, a parent never reads the table (school_tutors_no_parent).
--   public.school_tutors_for_guardian()  the one door for a family: as the guardian of a school the family is linked
--                       to, with at least one consented child, the school's enabled tutors and the platform tutors it
--                       switched off. Name, subject, style, language and tint only (no voice, no author).
--   family.tutor_conversations.tutor_key  the tutor a chat is with (a platform key, or 'school:<tutor id>'), so a chat
--                       remembers its tutor. No foreign key: a school's tutor lives in the school's own schema.

-- ---- the platform's tutors -----------------------------------------------------------------------------------------

create table content.tutors (
  tutor_id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  subject text check (subject is null or subject ~ '^[a-z][a-z_]{1,39}$'),
  name_en text not null check (char_length(name_en) between 1 and 40 and name_en !~ '[[:cntrl:]]'),
  name_hi text not null check (char_length(name_hi) between 1 and 40 and name_hi !~ '[[:cntrl:]]'),
  style_en text not null check (char_length(style_en) between 1 and 140 and style_en !~ '[[:cntrl:]]'),
  style_hi text not null check (char_length(style_hi) between 1 and 140 and style_hi !~ '[[:cntrl:]]'),
  language text not null default 'both' check (language in ('en', 'hi', 'both')),
  voice text check (voice is null or voice ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  tint text not null check (tint in ('mint', 'butter', 'lilac', 'blush', 'sky')),
  avatar_key text not null check (avatar_key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  enabled boolean not null default true,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table content.tutors enable row level security;
alter table content.tutors force row level security;
revoke all on content.tutors from public, anon, authenticated, app_user;
create policy tutors_family_read on content.tutors as permissive for select to family_app using (enabled);
create policy tutors_family_only on content.tutors as restrictive for all to family_app using (enabled) with check (false);
grant select on content.tutors to family_app;
grant select, insert, update on content.tutors to nca_super;

insert into content.tutors (key, subject, name_en, name_hi, style_en, style_hi, language, tint, avatar_key, sort) values
  ('maths', 'mathematics', 'Maths Tutor', 'गणित ट्यूटर', 'Goes one step at a time and shows every step.', 'एक बार में एक कदम चलता है और हर कदम दिखाता है।', 'both', 'sky', 'maths', 10),
  ('science', 'science', 'Science Tutor', 'विज्ञान ट्यूटर', 'Starts from something you can see around you, then explains why.', 'पहले आसपास दिखने वाली चीज़ से शुरू करता है, फिर बताता है कि ऐसा क्यों होता है।', 'both', 'mint', 'science', 20),
  ('english', 'english', 'English Tutor', 'अंग्रेज़ी ट्यूटर', 'Reads with you and helps you say it in your own words.', 'आपके साथ पढ़ता है और अपने शब्दों में बोलने में मदद करता है।', 'en', 'blush', 'english', 30),
  ('hindi', 'hindi', 'Hindi Tutor', 'हिंदी ट्यूटर', 'Speaks Hindi and explains each word before the meaning.', 'हिंदी में बात करता है और अर्थ से पहले हर शब्द समझाता है।', 'hi', 'butter', 'hindi', 40),
  ('social_science', 'social_science', 'Social Science Tutor', 'सामाजिक विज्ञान ट्यूटर', 'Tells it as a story, with the place and the time.', 'कहानी की तरह बताता है, जगह और समय के साथ।', 'both', 'lilac', 'social', 50),
  ('all_rounder', null, 'All-subject Tutor', 'सभी विषयों का ट्यूटर', 'Any subject, a small step at a time.', 'कोई भी विषय, एक-एक छोटे कदम में।', 'both', 'mint', 'allround', 60)
on conflict (key) do nothing;

-- ---- a chat remembers its tutor ------------------------------------------------------------------------------------------

alter table family.tutor_conversations
  add column tutor_key text check (tutor_key is null or tutor_key ~ '^([a-z][a-z0-9_]{1,39}|school:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');

-- ---- a school's own tutors -------------------------------------------------------------------------------------------------

create table public.school_tutors (
  school_id uuid not null references public.schools (school_id),
  tutor_id uuid not null default gen_random_uuid(),
  -- A platform tutor this row switches on or off for the school (no other field), else null: the school's own tutor.
  platform_key text check (platform_key is null or platform_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text check (name is null or (char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]')),
  subject text check (subject is null or subject ~ '^[a-z][a-z_]{1,39}$'),
  style text check (style is null or (char_length(style) between 1 and 140 and style !~ '[[:cntrl:]]')),
  language text check (language is null or language in ('en', 'hi', 'both')),
  voice text check (voice is null or voice ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  tint text check (tint is null or tint in ('mint', 'butter', 'lilac', 'blush', 'sky')),
  enabled boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, tutor_id),
  foreign key (school_id, created_by) references public.users (school_id, user_id),
  unique (school_id, platform_key),
  constraint school_tutors_shape check (
    (platform_key is null and name is not null and style is not null and language is not null and tint is not null)
    or (platform_key is not null and name is null and subject is null and style is null and language is null and voice is null and tint is null)
  )
);

revoke all on public.school_tutors from public, anon, authenticated, service_role;
revoke all on public.school_tutors from app_user, nca_super;
grant select, insert, update on public.school_tutors to app_user;
alter table public.school_tutors enable row level security;
alter table public.school_tutors force row level security;
create policy school_tutors_tenant_isolation on public.school_tutors using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The school's office reads and writes; a new row is in the writer's own name.
create policy school_tutors_office on public.school_tutors as restrictive for all
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
              and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
-- Never removed: a tutor is switched off, and its switch-off row stays.
create policy school_tutors_never_removed on public.school_tutors as restrictive for delete using (false);
create policy school_tutors_no_parent on public.school_tutors as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- Who made a row, what it switches and where it belongs never change; the update is stamped.
create function public.school_tutors_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.tutor_id, new.platform_key, new.created_by, new.created_at)
     is distinct from (old.school_id, old.tutor_id, old.platform_key, old.created_by, old.created_at) then
    raise exception 'a school tutor keeps its place and its maker' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger school_tutors_rules before update on public.school_tutors for each row execute function public.school_tutors_rules();
revoke all on function public.school_tutors_rules() from public, anon, authenticated, service_role, app_user, nca_super;

-- The platform's tutors as the school's office sees them, each with this school's own switch (on unless the school
-- switched it off). The enabled ones only.
create function public.platform_tutors_for_school()
returns table (tutor_key text, subject text, name_en text, name_hi text, style_en text, style_hi text, language text, tint text, school_enabled boolean)
language sql stable security definer set search_path = '' as $$
  select t.key, t.subject, t.name_en, t.name_hi, t.style_en, t.style_hi, t.language, t.tint,
         coalesce((select s.enabled from public.school_tutors s
                    where s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid and s.platform_key = t.key), true)
    from content.tutors t
   where t.enabled
     and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin')
     and nullif(current_setting('app.current_tenant_id', true), '') is not null
   order by t.sort, t.key
$$;
revoke all on function public.platform_tutors_for_school() from public, anon, authenticated, service_role, nca_super;
grant execute on function public.platform_tutors_for_school() to app_user;

-- A family's door (as guardian_report_cards()): the school's enabled tutors, and the platform tutors the school switched
-- off, for a guardian with at least one consented child. Nothing else of the row (no voice, no author).
create function public.school_tutors_for_guardian()
returns table (tutor_id uuid, platform_key text, name text, subject text, style text, language text, tint text, enabled boolean, school_name text)
language sql stable security definer set search_path = '' as $$
  select s.tutor_id, s.platform_key, s.name, s.subject, s.style, s.language, s.tint, s.enabled, sc.name
    from public.school_tutors s
    join public.schools sc on sc.school_id = s.school_id
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and cardinality(public.guardian_student_ids()) > 0
     and ((s.platform_key is null and s.enabled) or (s.platform_key is not null and not s.enabled))
   order by s.created_at, s.tutor_id
$$;
revoke all on function public.school_tutors_for_guardian() from public, anon, authenticated, service_role, nca_super;
grant execute on function public.school_tutors_for_guardian() to app_user;

-- ---- the school module -----------------------------------------------------------------------------------------------------

-- AI Tutors (school module 'ai-tutors'): on, like the other working modules, for the test schools whose plan holds
-- every working module (as 20261028103229_w6_d_everything_on.sql did). A paying plan's modules are the founder's
-- decision and are not changed here.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select e.school_id, 'ai-tutors', true, 'plan'
  from school_entitlements e
  join schools s on s.school_id = e.school_id and s.is_test_fixture
  join plans p on p.plan_id = e.plan and p.test_schools_only and p.all_working_modules
on conflict (school_id, module_id) do nothing;
