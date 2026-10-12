-- Rights of the platform role, table by table (C164).
--
-- nca_super is the role the app uses for platform work (the job runner, the
-- founder's Control pages). It bypasses row level security, so its table
-- rights are the only limit on it. Its default privileges gave it insert,
-- select, update and delete on every new table, whatever the table's own
-- migration said: the same fault as C160 and C161, for a third role. So an
-- append-only record (a fee structure, a nightly fee result, a teaching
-- note) could be rewritten or deleted through the platform role.
--
-- 1. On each school-data table where the app's own role is narrower by
--    design, the platform role is made the same. No code used the extra
--    rights (checked: no statement in src/ updates or deletes these beyond
--    what stays).
-- 2. Nothing by default for nca_super either: a new table's migration names
--    every role it grants to. test/db/grants.test.ts pins every role.

-- 1.
revoke update, delete on ai_usage, fee_structures, fee_structure_items, homework_attachments, recovery_plans, teaching_notes, usage_events from nca_super;
revoke update, delete on fee_status_runs from nca_super;
revoke delete on attendance_correction_requests, client_operations, fee_concessions, fee_heads, fees_ledger, homework, homework_status, homework_targets, pulse_followups, receipts, staff_invitations from nca_super;
revoke update on syllabus_units from nca_super;

-- 2.
alter default privileges for role postgres in schema public revoke all on tables from nca_super;
alter default privileges for role postgres in schema public revoke all on sequences from nca_super;
