-- P4 slice 7k (C193): parent-teacher meetings.
--
-- 1. ptm_events: a meeting day for some classes, with a time window and a
--    slot length. Made by the office; a draft until parents are invited.
-- 2. ptm_slots: one row a teacher and a start time, made with the event for
--    each class teacher of its classes.
-- 3. ptm_bookings: a guardian's slot with a teacher. A SLOT IS BOOKED ONCE
--    (unique on the slot) and a guardian has one slot a teacher in a meeting.
--    A booking is moved, never deleted; attendance and a note are recorded
--    on it after the meeting.
--
-- Who reads: the principal and school admin, everything; a teacher, the
-- meetings of their own classes and their own slots and bookings. A parent
-- books by replying with a time: that is written by the platform role in
-- the webhook, as their Pulse answers are.

create table ptm_events (
  ptm_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  held_on date not null,
  starts_at time not null,
  ends_at time not null,
  slot_minutes int not null check (slot_minutes between 5 and 60),
  class_ids uuid[] not null check (cardinality(class_ids) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'invited', 'cancelled')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  invited_by uuid,
  invited_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  unique (school_id, ptm_id),
  foreign key (school_id, created_by) references users(school_id, user_id),
  check (ends_at > starts_at),
  check ((invited_at is null) = (invited_by is null)),
  check ((status = 'draft') = (invited_at is null) or status = 'cancelled'),
  check ((status = 'cancelled') = (cancelled_at is not null) and (cancelled_at is null) = (cancelled_by is null))
);
create index idx_ptm_events_school on ptm_events (school_id, held_on desc);

create table ptm_slots (
  slot_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  ptm_id uuid not null,
  teacher_id uuid not null,
  starts_at time not null,
  unique (school_id, slot_id),
  unique (ptm_id, teacher_id, starts_at),
  foreign key (school_id, ptm_id) references ptm_events(school_id, ptm_id),
  foreign key (school_id, teacher_id) references users(school_id, user_id)
);

create table ptm_bookings (
  booking_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  ptm_id uuid not null,
  slot_id uuid not null,
  teacher_id uuid not null,
  parent_id uuid not null,
  booked_via text not null check (booked_via in ('reply', 'staff')),
  booked_by uuid,
  created_at timestamptz not null default now(),
  reminded_at timestamptz,
  attended boolean,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  marked_by uuid,
  marked_at timestamptz,
  -- A slot is booked once; a guardian has one slot a teacher in a meeting.
  unique (slot_id),
  unique (ptm_id, teacher_id, parent_id),
  foreign key (school_id, ptm_id) references ptm_events(school_id, ptm_id),
  foreign key (school_id, slot_id) references ptm_slots(school_id, slot_id),
  foreign key (school_id, teacher_id) references users(school_id, user_id),
  foreign key (school_id, parent_id) references parents(school_id, parent_id),
  check ((booked_via = 'staff') = (booked_by is not null)),
  check ((attended is null) = (marked_at is null) and (marked_at is null) = (marked_by is null)),
  check (note is null or attended is not null)
);
create index idx_ptm_bookings_event on ptm_bookings (ptm_id);

-- The slot of a booking belongs to the same meeting and the same teacher as the booking says.
create function public.ptm_booking_matches_slot() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from ptm_slots s where s.slot_id = new.slot_id and s.ptm_id = new.ptm_id and s.teacher_id = new.teacher_id and s.school_id = new.school_id) then
    raise exception 'the slot is not this teacher''s in this meeting' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and (new.school_id, new.ptm_id, new.teacher_id, new.parent_id) is distinct from (old.school_id, old.ptm_id, old.teacher_id, old.parent_id) then
    raise exception 'a booking is moved to another time, never to another meeting, teacher or guardian' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.ptm_booking_matches_slot() from public;
create trigger ptm_booking_matches_slot before insert or update on ptm_bookings for each row execute function public.ptm_booking_matches_slot();

revoke all on ptm_events, ptm_slots, ptm_bookings from public, anon, authenticated, service_role;
grant select, insert, update on ptm_events to app_user;
grant select, insert on ptm_slots to app_user;
grant select, insert, update on ptm_bookings to app_user;
grant select on ptm_events, ptm_slots to nca_super;
grant select, insert, update on ptm_bookings to nca_super;

alter table ptm_events enable row level security;
alter table ptm_events force row level security;
alter table ptm_slots enable row level security;
alter table ptm_slots force row level security;
alter table ptm_bookings enable row level security;
alter table ptm_bookings force row level security;
create policy ptm_events_tenant_isolation on ptm_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy ptm_slots_tenant_isolation on ptm_slots using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy ptm_bookings_tenant_isolation on ptm_bookings using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy ptm_events_staff on ptm_events as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and class_ids && public.teacher_own_class_ids())
);
create policy ptm_events_office_makes on ptm_events as restrictive for insert with check (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin'])
  and created_by = nullif(current_setting('app.current_user_id', true), '')::uuid
);
create policy ptm_events_office_changes on ptm_events as restrictive for update using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
create policy ptm_slots_staff on ptm_slots as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
);
create policy ptm_slots_office_makes on ptm_slots as restrictive for insert with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
create policy ptm_bookings_staff on ptm_bookings as restrictive for all using (
  current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin'])
  or (current_setting('app.current_role', true) = 'teacher' and teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
);

-- The reminder the day before is a job the office's session enqueues when it invites.
alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify', 'whatsapp.send', 'ptm.remind')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );

-- The module is built: on for every school, as the default plan gives it (the founder switches it off per school in Control).
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'ptm', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
