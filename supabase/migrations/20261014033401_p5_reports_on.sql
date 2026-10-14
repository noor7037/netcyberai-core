-- P5 slice 8h (C207): Reports.
--
-- No new table, column, policy or grant. A report is run in the reader's own
-- session (role app_user, with the school, role and user set) from tables that
-- exist already, under the row level security each of those tables has:
--   receipts, fees_ledger, payments, fee_followups   principal, school admin, accountant
--   attendance, classes, students                    every role of the school; students waiting
--                                                    for consent only for the roles the consent gate names
--   homework, homework_targets, homework_status      principal, school admin, academic coordinator, teacher
--   pulse_messages, pulse_response_log, communication_log   every role of the school
--   staff_leave                                      the person themself, principal, school admin
-- Who is given which report is narrower than that and is decided in the app
-- (src/lib/reports/reports.ts): an accountant no report about learning, an
-- academic coordinator none about fees, a teacher none.
-- Each CSV download writes one row to audit_log ('report.exported': the report,
-- the days and the number of rows; never the rows), through the insert policy
-- audit_log already has.
--
-- Reports is partly built: on for every school, as the default plan gives it.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'reports', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
