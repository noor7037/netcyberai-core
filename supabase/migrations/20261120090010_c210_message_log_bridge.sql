-- P5 close-out (C210): the message log's read policy waits for the code that needs it.
--
-- The code deployed before this PR reads back every row it writes to communication_log (insert ... returning
-- log_id) and reads the log directly for its duplicate check and the month's budget. Under
-- communication_log_role_read, an academic coordinator or an accountant whose work queues a message (an absence
-- alert after marking, a receipt) could do neither, so that action would fail until this PR's code is deployed.
-- This PR's send-gate no longer reads back, and asks communication_log_dedupe and whatsapp_priced_this_month.
--
-- So on a database that already holds messages (the test database, which serves the live site), the read policy
-- admits every school role, as the tenant policy alone did before C210, UNTIL this PR's code runs: its job runner
-- records the job types it handles in platform_settings 'jobs.handlers' (C210 schedules), and once
-- 'early_warning.nightly' is there the bridge closes by itself. A database with no message yet (production today,
-- and every test database) never opens it. A later migration removes the bridge.

insert into platform_settings (key, value)
select 'rollout.message_log_bridge', 'true'::jsonb
 where exists (select 1 from communication_log)
on conflict (key) do nothing;

-- True while the bridge is open: set on this database, and this PR's code not yet running.
create function public.c210_message_log_bridge_open() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_settings b where b.key = 'rollout.message_log_bridge' and b.value = 'true'::jsonb)
     and not exists (
       select 1 from platform_settings p
        where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'early_warning.nightly'
     )
$$;
revoke all on function public.c210_message_log_bridge_open() from public, anon, authenticated, service_role;
grant execute on function public.c210_message_log_bridge_open() to app_user, nca_super;

alter policy communication_log_role_read on communication_log using (
  public.c210_message_log_bridge_open()
  or current_setting('app.current_role', true) in ('principal', 'school_admin')
  or (
    current_setting('app.current_role', true) = 'teacher'
    and (
      student_id in (select unnest(public.teacher_own_student_ids()))
      or parent_id in (
        select m.parent_id from parent_student_map m
         where m.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
           and m.student_id in (select unnest(public.teacher_own_student_ids()))
      )
      or sent_by = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  )
);
