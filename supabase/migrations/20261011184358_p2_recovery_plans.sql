-- P2 5g (C152): Homework Recovery v1.
--
-- A plan is a decision about one student who missed several homeworks in a
-- window: the homeworks, the catch-up dates suggested, and whether the
-- teacher approved the plan or dismissed it. An approved plan waits for the
-- parent message that starts with WhatsApp (P4); nothing is sent in P2.
-- The list of students is worked out when the screen opens; only decisions
-- are stored.

create table recovery_plans (
  plan_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  class_id uuid not null,
  window_from date not null,
  window_to date not null,
  -- [{ "targetId": uuid, "title": text, "subject": text, "dueDate": date, "catchUpBy": date }]
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  status text not null check (status in ('approved', 'dismissed')),
  note text check (note is null or char_length(note) between 1 and 300),
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, class_id) references classes(school_id, class_id),
  foreign key (school_id, decided_by) references users(school_id, user_id),
  check (window_to >= window_from)
);
create index idx_recovery_plans_student on recovery_plans(school_id, student_id, window_to desc);

revoke all on recovery_plans from public, anon, authenticated;
grant select, insert on recovery_plans to app_user, nca_super;
alter table recovery_plans enable row level security;
alter table recovery_plans force row level security;
create policy recovery_plans_tenant_isolation on recovery_plans
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy recovery_plans_staff on recovery_plans as restrictive
  for all using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));
create policy recovery_plans_teacher_scope on recovery_plans as restrictive
  for all using (current_setting('app.current_role', true) <> 'teacher' or class_id = any (public.teacher_own_class_ids()));
-- A decision is made in one's own name.
create policy recovery_plans_decide_as_self on recovery_plans as restrictive
  for insert with check (decided_by = nullif(current_setting('app.current_user_id', true), '')::uuid);

insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'recovery', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
