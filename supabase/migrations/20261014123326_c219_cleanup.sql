-- C219 cleanup: what earlier slices kept only until their code was live.
--
-- 1. The message-log bridge of C210 (20261014072356_c210_message_log_bridge.sql) is removed. It let every school role
--    read communication_log on a database that already held messages, until the code that no longer needs it ran;
--    that code recorded its job types ('jobs.handlers' holds 'early_warning.nightly' on the test database, C218-A),
--    so the bridge has closed by itself. communication_log_role_read is restored exactly as C210 wrote it, without the
--    bridge. The function c210_message_log_bridge_open and the setting 'rollout.message_log_bridge' go.
-- 2. plans.price_minor and plans.period, retired by C212 (a price for the whole school), are dropped. No code has read
--    them since C212 (grep of src: none); each plan's old price is kept in its 'billing.plan_changed' audit row of
--    C212. The check that tied them together goes with them.
--
-- Who reads: communication_log as C210 says (the principal and the school admin every message of the school; a
-- teacher those about their own classes; nobody else). plans: the platform role only.

-- 1.
alter policy communication_log_role_read on communication_log using (
  current_setting('app.current_role', true) in ('principal', 'school_admin')
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
drop function public.c210_message_log_bridge_open();
delete from platform_settings where key = 'rollout.message_log_bridge';

-- 2.
alter table plans drop column price_minor;
alter table plans drop column period;
