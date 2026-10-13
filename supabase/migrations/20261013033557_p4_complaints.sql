-- P4 slice 7m (C195): complaints from parents.
--
-- 1. complaints: a parent's complaint, taken from their conversation or by
--    the office, with an owner and a time it is due by.
--      - NOTHING CLOSES WITHOUT A NOTE (a check, not app code alone). The
--        note is what the parent is told.
--      - Past its due time and still open, it is passed to the principal
--        (escalated_at, and the principal becomes the owner).
--      - NOBODY BUT THE PRINCIPAL sees a complaint about themselves until
--        the principal has seen it (principal_seen_at). A complaint is never
--        owned by the person it is about.
-- 2. complaint_events: what happened, in order. Append-only. Seen by
--    whoever may see the complaint.
--
-- Who reads: the principal, every complaint; the school admin, every one not
-- about themselves (or already seen by the principal); a teacher, those they
-- own and those about children of their own classes, with the same rule.

create table complaints (
  complaint_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  parent_id uuid not null,
  student_id uuid,
  about_user_id uuid,
  source text not null check (source in ('thread', 'office')),
  summary text not null check (char_length(btrim(summary)) between 1 and 600),
  status text not null default 'open' check (status in ('open', 'closed')),
  owner_id uuid not null,
  due_at timestamptz not null,
  escalated_at timestamptz,
  principal_seen_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  closing_note text check (closing_note is null or char_length(btrim(closing_note)) between 1 and 600),
  unique (school_id, complaint_id),
  foreign key (school_id, parent_id) references parents(school_id, parent_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, about_user_id) references users(school_id, user_id),
  foreign key (school_id, owner_id) references users(school_id, user_id),
  foreign key (school_id, created_by) references users(school_id, user_id),
  check (about_user_id is null or owner_id <> about_user_id),
  check ((status = 'closed') = (closed_at is not null) and (closed_at is null) = (closed_by is null) and (closed_at is null) = (closing_note is null))
);
create index idx_complaints_school on complaints (school_id, status, due_at);

create table complaint_events (
  event_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  complaint_id uuid not null,
  kind text not null check (kind in ('opened', 'note', 'assigned', 'escalated', 'closed')),
  note text check (note is null or char_length(btrim(note)) between 1 and 600),
  by_user uuid,
  parent_told boolean not null default false,
  at timestamptz not null default now(),
  foreign key (school_id, complaint_id) references complaints(school_id, complaint_id),
  check (kind <> 'note' or note is not null)
);
create index idx_complaint_events on complaint_events (complaint_id, at);

-- What a complaint is about never changes, and a closed complaint stays closed.
create function public.complaints_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.parent_id, new.summary, new.source, new.created_by, new.created_at, new.due_at) is distinct from (old.school_id, old.parent_id, old.summary, old.source, old.created_by, old.created_at, old.due_at)
     or new.student_id is distinct from old.student_id or new.about_user_id is distinct from old.about_user_id then
    raise exception 'what a complaint says, and who it is from and about, is never changed' using errcode = 'check_violation';
  end if;
  -- (That the principal has seen it can still be recorded on a closed one; nothing else.)
  if old.status = 'closed' and (to_jsonb(new) - 'principal_seen_at') is distinct from (to_jsonb(old) - 'principal_seen_at') then
    raise exception 'a closed complaint stays closed: open a new one' using errcode = 'check_violation';
  end if;
  if old.principal_seen_at is not null and new.principal_seen_at is distinct from old.principal_seen_at then
    raise exception 'when the principal first saw it is recorded once' using errcode = 'check_violation';
  end if;
  if old.principal_seen_at is null and new.principal_seen_at is not null and current_user <> 'nca_super' and coalesce(current_setting('app.current_role', true), '') <> 'principal' then
    raise exception 'only the principal''s own session records that the principal has seen it' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.complaints_fixed() from public;
create trigger complaints_fixed before update on complaints for each row execute function public.complaints_fixed();

revoke all on complaints, complaint_events from public, anon, authenticated, service_role;
grant select, insert, update on complaints to app_user;
grant select, insert on complaint_events to app_user;
grant select, update on complaints to nca_super;
grant select, insert on complaint_events to nca_super;

alter table complaints enable row level security;
alter table complaints force row level security;
alter table complaint_events enable row level security;
alter table complaint_events force row level security;
create policy complaints_tenant_isolation on complaints using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy complaint_events_tenant_isolation on complaint_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy complaints_staff on complaints as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'super_admin'])
  or (
    (about_user_id is distinct from nullif(current_setting('app.current_user_id', true), '')::uuid or principal_seen_at is not null)
    and (
      current_setting('app.current_role', true) = 'school_admin'
      or (current_setting('app.current_role', true) = 'teacher' and (
        owner_id = nullif(current_setting('app.current_user_id', true), '')::uuid
        or student_id in (select unnest(public.teacher_own_student_ids()))
      ))
    )
  )
);
create policy complaints_as_self on complaints as restrictive for insert with check (created_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
-- An event is seen, and written, by whoever may see its complaint (the policy above decides inside this query).
create policy complaint_events_with_complaint on complaint_events as restrictive for all using (
  exists (select 1 from complaints c where c.school_id = complaint_events.school_id and c.complaint_id = complaint_events.complaint_id)
);

-- Passing an overdue complaint to the principal is a job the session enqueues when the complaint is opened.
alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify', 'whatsapp.send', 'ptm.remind', 'event.remind', 'complaint.escalate')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );

-- The module is built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'complaints', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
