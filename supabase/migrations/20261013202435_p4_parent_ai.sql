-- P4 slice 7n (C196): Parent AI v1, "What can I do at home?".
--
-- parent_ai_answers: an answer for one child's guardian, drafted from what
-- that child's class was taught and that child's own homework, read and
-- approved by a person before it is sent.
--   - AN ANSWER CITES WHAT IT USED: `sources` is never empty (a check).
--   - NOTHING SENDS UNAPPROVED: a row is 'sent' only with who approved it and
--     when; a sent or discarded answer is never changed again (trigger).
--   - Whose child it is about, and what it used, never change.
--
-- Who reads and writes: the principal and school admin, every answer; a
-- teacher, those for children of their own classes.

create table parent_ai_answers (
  answer_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  parent_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 700),
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) >= 1),
  ai_assisted boolean not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'discarded')),
  drafted_by uuid not null,
  drafted_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  unique (school_id, answer_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, parent_id) references parents(school_id, parent_id),
  foreign key (school_id, drafted_by) references users(school_id, user_id),
  foreign key (school_id, approved_by) references users(school_id, user_id),
  check ((status = 'sent') = (approved_at is not null) and (approved_at is null) = (approved_by is null))
);
create index idx_parent_ai_answers_school on parent_ai_answers (school_id, drafted_at desc);

create function public.parent_ai_answers_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status <> 'draft' then
    raise exception 'an answer that was sent or discarded is never changed' using errcode = 'check_violation';
  end if;
  if (new.school_id, new.student_id, new.parent_id, new.sources, new.ai_assisted, new.drafted_by, new.drafted_at) is distinct from (old.school_id, old.student_id, old.parent_id, old.sources, old.ai_assisted, old.drafted_by, old.drafted_at) then
    raise exception 'whose child an answer is about, and what it used, never change' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.parent_ai_answers_fixed() from public;
create trigger parent_ai_answers_fixed before update on parent_ai_answers for each row execute function public.parent_ai_answers_fixed();

revoke all on parent_ai_answers from public, anon, authenticated, service_role;
grant select, insert, update on parent_ai_answers to app_user;
grant select on parent_ai_answers to nca_super;
alter table parent_ai_answers enable row level security;
alter table parent_ai_answers force row level security;
create policy parent_ai_answers_tenant_isolation on parent_ai_answers using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy parent_ai_answers_staff on parent_ai_answers as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and student_id in (select unnest(public.teacher_own_student_ids())))
);
create policy parent_ai_answers_as_self on parent_ai_answers as restrictive for insert with check (drafted_by = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- A tip about the topic taught is one more kind of draft the AI door may be asked for.
alter table ai_usage drop constraint ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check check (kind in ('lesson_plan', 'worksheet', 'pulse_message', 'home_help'));

-- The module is built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'parent-ai', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
