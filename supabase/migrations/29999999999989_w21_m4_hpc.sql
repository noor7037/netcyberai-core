-- W21-M4 (docs/42, Medium: Exams): the Holistic Progress Card, and the family's own Personal Best / Most Improved line.
--
-- 1. hpc_entries: what the school writes on a child's Holistic Progress Card for a session that no other table holds:
--    the class teacher's remark for the session, a health and physical education note, the child's self-assessment
--    and the parent's feedback (free text the school types in, 600 letters each). One row a child and session. Read by
--    the three roles that run exams and a teacher of the class; written and changed by those three or the class
--    teacher, in their own name; never by a family (no parent policy opens it). The scholastic results, the
--    co-scholastic grades and the attendance on the card are read from their own tables, never copied here.
-- 2. hpc_cards: each child's published card of a session as a PDF in the school's own folder of the store
--    (<school>/hpc/<session>/<card>.pdf, held by a check). One row a child and session; publishing again replaces the
--    file and adds one to the version. Made by the office (the principal, the school admin, the academic coordinator)
--    in its own name, for a child of the class; read by the office and the class's class teacher. A family reads no row.
-- 3. guardian_hpc_cards(): a guardian's own consented children's cards (the Family app's door), the key and file name
--    only, as guardian_report_cards() is for report cards.
-- 4. guardian_recognition(): a guardian's own consented children's Personal Best and Most Improved of each publication
--    in force, from the recognition kept with the publication (each child compared with their own earlier results
--    only, C215), with the subject's name; only while the school's plan has the feature. Never another child's entry:
--    guardian_publications() keeps the whole class's recognition out of a family's reach, and this answers one child's
--    piece at a time.

-- ---- 1. hpc_entries -------------------------------------------------------------------------------------------------

create table hpc_entries (
  entry_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  session_id uuid not null references academic_sessions(session_id),
  class_id uuid not null,
  student_id uuid not null,
  teacher_remark text,
  health_note text,
  self_assessment text,
  parent_feedback text,
  written_by uuid not null,
  written_at timestamptz not null default now(),
  unique (school_id, entry_id),
  -- One card's words a child and session.
  unique (school_id, session_id, student_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, written_by) references users(school_id, user_id),
  constraint hpc_entries_teacher_remark check (teacher_remark is null or char_length(btrim(teacher_remark)) between 1 and 600),
  constraint hpc_entries_health_note check (health_note is null or char_length(btrim(health_note)) between 1 and 600),
  constraint hpc_entries_self_assessment check (self_assessment is null or char_length(btrim(self_assessment)) between 1 and 600),
  constraint hpc_entries_parent_feedback check (parent_feedback is null or char_length(btrim(parent_feedback)) between 1 and 600)
);
create index idx_hpc_entries_class on hpc_entries (school_id, session_id, class_id);

-- The session is the school's own, the child is of that class, and who and what it is for never change.
create function public.hpc_entries_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.entry_id, new.school_id, new.session_id, new.class_id, new.student_id) is distinct from (old.entry_id, old.school_id, old.session_id, old.class_id, old.student_id) then
    raise exception 'a progress card''s words stay with their child, class and session' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from academic_sessions a where a.session_id = new.session_id and a.school_id = new.school_id) then
      raise exception 'a progress card is for one of the school''s own sessions' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from students s where s.school_id = new.school_id and s.student_id = new.student_id and s.class_id = new.class_id) then
      raise exception 'a progress card is for a child of that class' using errcode = 'check_violation';
    end if;
  end if;
  new.teacher_remark := nullif(btrim(new.teacher_remark), '');
  new.health_note := nullif(btrim(new.health_note), '');
  new.self_assessment := nullif(btrim(new.self_assessment), '');
  new.parent_feedback := nullif(btrim(new.parent_feedback), '');
  new.written_at := now();
  return new;
end $$;
revoke all on function public.hpc_entries_rules() from public, anon, authenticated, service_role;
create trigger hpc_entries_rules before insert or update on hpc_entries for each row execute function public.hpc_entries_rules();

revoke all on hpc_entries from public, anon, authenticated, service_role;
revoke all on hpc_entries from app_user, nca_super;
grant select, insert, update on hpc_entries to app_user;

alter table hpc_entries enable row level security;
alter table hpc_entries force row level security;
create policy hpc_entries_tenant_isolation on hpc_entries using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy hpc_entries_readers on hpc_entries as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or (current_setting('app.current_role', true) = 'teacher' and class_id in (select unnest(public.teacher_own_class_ids())))
);
create policy hpc_entries_written on hpc_entries as restrictive for insert with check (
  (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']) or public.is_class_teacher_of(class_id))
  and written_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy hpc_entries_changed on hpc_entries as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']) or public.is_class_teacher_of(class_id))
  with check (
    (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']) or public.is_class_teacher_of(class_id))
    and written_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

-- ---- 2. hpc_cards ---------------------------------------------------------------------------------------------------

create table hpc_cards (
  card_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  session_id uuid not null references academic_sessions(session_id),
  class_id uuid not null,
  student_id uuid not null,
  version integer not null default 1,
  storage_key text not null,
  file_name text not null,
  sha256 text not null,
  bytes integer not null,
  published_by uuid not null,
  published_at timestamptz not null default now(),
  unique (school_id, card_id),
  unique (school_id, session_id, student_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, published_by) references users(school_id, user_id),
  constraint hpc_cards_version check (version >= 1),
  constraint hpc_cards_key check (storage_key like school_id::text || '/hpc/' || session_id::text || '/%.pdf' and char_length(storage_key) <= 200),
  constraint hpc_cards_file_name check (file_name ~ '^[A-Za-z0-9_-]{1,80}\.pdf$'),
  constraint hpc_cards_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint hpc_cards_bytes check (bytes between 1 and 4000000)
);
create index idx_hpc_cards_class on hpc_cards (school_id, session_id, class_id);

-- The session is the school's own and the child is of that class; a card stays the child's and session's, and its
-- version only goes up.
create function public.hpc_cards_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if (new.card_id, new.school_id, new.session_id, new.student_id) is distinct from (old.card_id, old.school_id, old.session_id, old.student_id) then
      raise exception 'a progress card stays with its child and session' using errcode = 'check_violation';
    end if;
    if new.version <> old.version + 1 then
      raise exception 'publishing a progress card again adds one to its version' using errcode = 'check_violation';
    end if;
  elsif new.version <> 1 then
    raise exception 'a progress card is first published as version 1' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from academic_sessions a where a.session_id = new.session_id and a.school_id = new.school_id) then
    raise exception 'a progress card is for one of the school''s own sessions' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from students s where s.school_id = new.school_id and s.student_id = new.student_id and s.class_id = new.class_id and s.status in ('active', 'pending_consent')) then
    raise exception 'a progress card is for a child on that class''s roll' using errcode = 'check_violation';
  end if;
  new.published_at := now();
  return new;
end $$;
revoke all on function public.hpc_cards_rules() from public, anon, authenticated, service_role;
create trigger hpc_cards_rules before insert or update on hpc_cards for each row execute function public.hpc_cards_rules();

revoke all on hpc_cards from public, anon, authenticated, service_role;
revoke all on hpc_cards from app_user, nca_super;
grant select, insert, update on hpc_cards to app_user;

alter table hpc_cards enable row level security;
alter table hpc_cards force row level security;
create policy hpc_cards_tenant_isolation on hpc_cards using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy hpc_cards_readers on hpc_cards as restrictive for select using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  or public.is_class_teacher_of(class_id)
);
create policy hpc_cards_published on hpc_cards as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
  and published_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy hpc_cards_republished on hpc_cards as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator']))
  with check (
    current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
    and published_by = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

-- ---- 3. The family's door to a card ---------------------------------------------------------------------------------

create function public.guardian_hpc_cards()
returns table (session_id uuid, student_id uuid, version integer, storage_key text, file_name text, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.session_id, c.student_id, c.version, c.storage_key, c.file_name, c.published_at
    from public.hpc_cards c
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and c.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and c.student_id = any ((select public.guardian_student_ids())::uuid[])
$$;
revoke all on function public.guardian_hpc_cards() from public, anon, authenticated, service_role, nca_super;
grant execute on function public.guardian_hpc_cards() to app_user;

-- ---- 4. The family's own Personal Best and Most Improved ------------------------------------------------------------

create function public.guardian_recognition()
returns table (exam_id uuid, student_id uuid, kind text, subject text, now_percent numeric, then_percent numeric)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select x.school_id, x.exam_id, st.student_id, x.recognition -> st.student_id::text as r
      from public.exam_publications x
      join public.students st on st.school_id = x.school_id and st.class_id = x.class_id
     where coalesce(current_setting('app.current_role', true), '') = 'parent'
       and x.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
       and x.reopened_at is null
       and x.class_id = any (public.guardian_class_ids())
       and st.student_id = any ((select public.guardian_student_ids())::uuid[])
       and jsonb_typeof(x.recognition -> st.student_id::text) = 'object'
       and public.school_plan_has_feature(x.school_id, 'personal-best')
  )
  select m.exam_id, m.student_id, 'personal_best'::text, sb.name, (b ->> 'now')::numeric, (b ->> 'best')::numeric
    from mine m
    cross join lateral jsonb_array_elements(case when jsonb_typeof(m.r -> 'personalBest') = 'array' then m.r -> 'personalBest' else '[]'::jsonb end) b
    join public.subjects sb on sb.school_id = m.school_id and sb.subject_id::text = b ->> 'subjectId'
  union all
  select m.exam_id, m.student_id, 'most_improved'::text, sb.name, (m.r #>> '{mostImproved,now}')::numeric, (m.r #>> '{mostImproved,before}')::numeric
    from mine m
    join public.subjects sb on sb.school_id = m.school_id and sb.subject_id::text = m.r #>> '{mostImproved,subjectId}'
   where jsonb_typeof(m.r -> 'mostImproved') = 'object'
$$;
revoke all on function public.guardian_recognition() from public, anon, authenticated, service_role, nca_super;
grant execute on function public.guardian_recognition() to app_user;
