-- P4 slice 7i (C191): notices from the school to a class's parents, or to every parent.
--
-- A notice is written by a member of staff, waits for the principal, and is
-- sent only when the principal approves it. Nothing sends unapproved, and a
-- notice's words never change once written: a wrong notice is rejected and
-- written again. A teacher writes for their own classes only; a notice to
-- the whole school is the office's. Who received and read it is in the
-- message log, one row per guardian, as for every other message.
create table class_notices (
  notice_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  class_id uuid,
  body text not null check (char_length(btrim(body)) between 1 and 600),
  status text not null default 'waiting' check (status in ('waiting', 'sent', 'rejected')),
  written_by uuid not null,
  written_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(btrim(reject_reason)) between 1 and 300),
  unique (school_id, notice_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, written_by) references users(school_id, user_id),
  check ((status = 'waiting') = (decided_by is null) and (decided_by is null) = (decided_at is null)),
  check ((status = 'rejected') = (reject_reason is not null))
);
create index idx_class_notices_school on class_notices (school_id, written_at desc);
revoke all on class_notices from public, anon, authenticated, service_role;
grant select, insert, update on class_notices to app_user;
grant select on class_notices to nca_super;
alter table class_notices enable row level security;
alter table class_notices force row level security;
create policy class_notices_tenant_isolation on class_notices using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The office sees and writes every notice; a teacher, only those for their own classes, and never one for the whole school.
create policy class_notices_staff on class_notices as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and class_id is not null and class_id in (select unnest(public.teacher_own_class_ids())))
);
create policy class_notices_as_self on class_notices as restrictive for insert with check (written_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
-- Only the principal decides; the words, the class and the writer never change; a decision is made once.
create policy class_notices_principal_decides on class_notices as restrictive for update using (current_setting('app.current_role', true) = 'principal');
create function public.class_notices_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.body, new.written_by, new.written_at) is distinct from (old.school_id, old.body, old.written_by, old.written_at) or new.class_id is distinct from old.class_id then
    raise exception 'a notice is never edited: reject it and write it again' using errcode = 'check_violation';
  end if;
  if old.status <> 'waiting' then
    raise exception 'a notice is decided once' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.class_notices_fixed() from public;
create trigger class_notices_fixed before update on class_notices for each row execute function public.class_notices_fixed();
