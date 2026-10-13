-- P4 slice 7l (C194): school events.
--
-- 1. school_events: an event with a date, for some classes or for every
--    class (class_ids empty). Made by the office; a draft until parents are
--    invited. ONLY THE INVITED CLASSES RECEIVE IT.
-- 2. event_replies: a guardian's YES or NO, one a guardian and event, the
--    latest answer kept. Written by the platform role from the parent's
--    reply, as Pulse answers are.
--
-- Who reads: the principal and school admin, everything; a teacher, the
-- events of their own classes and of the whole school, and the answers of
-- guardians of their own classes.

create table school_events (
  event_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  held_on date not null,
  starts_at time,
  details text not null check (char_length(btrim(details)) between 1 and 300),
  class_ids uuid[] not null default '{}' check (cardinality(class_ids) <= 200),
  status text not null default 'draft' check (status in ('draft', 'invited', 'cancelled')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  invited_by uuid,
  invited_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  unique (school_id, event_id),
  foreign key (school_id, created_by) references users(school_id, user_id),
  check ((invited_at is null) = (invited_by is null)),
  check ((status = 'draft') = (invited_at is null) or status = 'cancelled'),
  check ((status = 'cancelled') = (cancelled_at is not null) and (cancelled_at is null) = (cancelled_by is null))
);
create index idx_school_events_school on school_events (school_id, held_on desc);

create table event_replies (
  reply_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  event_id uuid not null,
  parent_id uuid not null,
  answer text not null check (answer in ('yes', 'no')),
  replied_at timestamptz not null,
  unique (event_id, parent_id),
  foreign key (school_id, event_id) references school_events(school_id, event_id),
  foreign key (school_id, parent_id) references parents(school_id, parent_id)
);

revoke all on school_events, event_replies from public, anon, authenticated, service_role;
grant select, insert, update on school_events to app_user;
grant select on event_replies to app_user;
grant select on school_events to nca_super;
grant select, insert, update on event_replies to nca_super;

alter table school_events enable row level security;
alter table school_events force row level security;
alter table event_replies enable row level security;
alter table event_replies force row level security;
create policy school_events_tenant_isolation on school_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy event_replies_tenant_isolation on event_replies using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy school_events_staff on school_events as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and (cardinality(class_ids) = 0 or class_ids && public.teacher_own_class_ids()))
);
create policy school_events_office_makes on school_events as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy school_events_office_changes on school_events as restrictive for update using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
create policy event_replies_staff on event_replies as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and exists (
    select 1 from parent_student_map m where m.school_id = event_replies.school_id and m.parent_id = event_replies.parent_id and m.student_id in (select unnest(public.teacher_own_student_ids()))
  ))
);

-- The reminder the day before is a job the office's session enqueues when it invites.
alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify', 'whatsapp.send', 'ptm.remind', 'event.remind')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );

-- The module is built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'events', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
