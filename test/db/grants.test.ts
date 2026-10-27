import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Who may do what to every table in schema public (C160, C161), checked on
// every migration replayed onto a database that starts with Supabase's own
// default privileges, as the real databases do.
//
//   - The app's role (app_user) has exactly the rights listed here, table by
//     table. The list was read from the test database on 2026-10-15 and is
//     the same on production. '' means none: the table is the platform's.
//   - Every other role is pinned too (C164): the platform role (nca_super),
//     the sign-in role (app_backend) and audit_writer. A role not named
//     here holds nothing; that includes Supabase's service_role (C167).
//   - The public Supabase roles (anon, authenticated) can do nothing to any
//     table, sequence or function, and nor can PUBLIC.
//   - Nothing is granted by default any more.
//
// A new table: add it here with the rights it needs, and grant exactly
// those to app_user in its migration. A new function: its migration says
// `revoke all on function ... from public` and grants execute to whoever
// calls it. Otherwise this test fails.

const APP_USER: Record<string, string> = {
  academic_sessions: 'DELETE,INSERT,SELECT,UPDATE',
  ai_usage: 'INSERT,SELECT',
  attendance: 'DELETE,INSERT,SELECT,UPDATE',
  attendance_correction_requests: 'INSERT,SELECT,UPDATE',
  audit_log: 'INSERT,SELECT',
  bulk_runs: 'INSERT,SELECT,UPDATE',
  captured_documents: 'DELETE,INSERT,SELECT,UPDATE',
  certificate_requests: 'DELETE,INSERT,SELECT,UPDATE',
  classes: 'DELETE,INSERT,SELECT,UPDATE',
  client_operations: 'INSERT,SELECT,UPDATE',
  communication_log: 'INSERT,SELECT,UPDATE', // never deleted by the app (C190); erasure gets its own audited function
  compliance_config: 'DELETE,INSERT,SELECT,UPDATE',
  consent_ledger: 'INSERT,SELECT',
  csv_imports: 'DELETE,INSERT,SELECT,UPDATE',
  custom_field_definitions: 'INSERT,SELECT,UPDATE',
  custom_field_values: 'DELETE,INSERT,SELECT,UPDATE',
  data_subject_requests: 'DELETE,INSERT,SELECT,UPDATE',
  entitlement_change_reasons: '',
  exams: 'DELETE,INSERT,SELECT,UPDATE',
  families: 'INSERT,SELECT,UPDATE',
  fee_concessions: 'INSERT,SELECT,UPDATE',
  fee_heads: 'INSERT,SELECT,UPDATE',
  fee_structure_items: 'INSERT,SELECT',
  fee_structures: 'INSERT,SELECT',
  fees_ledger: 'INSERT,SELECT,UPDATE',
  guardian_merges: 'INSERT,SELECT',
  homework: 'INSERT,SELECT,UPDATE',
  homework_attachments: 'INSERT,SELECT',
  homework_status: 'INSERT,SELECT,UPDATE',
  homework_targets: 'INSERT,SELECT,UPDATE',
  impersonation_sessions: 'DELETE,INSERT,SELECT,UPDATE',
  intake_rate_events: '',
  jobs: 'INSERT',
  leads: 'DELETE,INSERT,SELECT,UPDATE',
  marks: 'DELETE,INSERT,SELECT,UPDATE',
  memberships: 'DELETE,INSERT,SELECT,UPDATE',
  message_rate_table: 'SELECT',
  ocr_extractions: 'DELETE,INSERT,SELECT,UPDATE',
  parent_feedback: 'DELETE,INSERT,SELECT,UPDATE',
  parent_student_map: 'DELETE,INSERT,SELECT,UPDATE',
  parents: 'DELETE,INSERT,SELECT,UPDATE',
  payments: 'INSERT,SELECT',
  platform_settings: '',
  pulse_followups: 'INSERT,SELECT,UPDATE',
  pulse_messages: 'DELETE,INSERT,SELECT,UPDATE',
  pulse_response_log: 'DELETE,INSERT,SELECT,UPDATE',
  qr_scan_log: 'DELETE,INSERT,SELECT,UPDATE',
  receipts: 'INSERT,SELECT,UPDATE',
  held_inbound: '', // a parent's held words, encrypted: the platform role only (C190)
  whatsapp_credentials: '', // the platform's own WhatsApp account: never the app role's (C186)
  payment_credentials: '', // ciphertext only, and still not the app role's: the server's payment path reads it as the platform role (C171)
  payment_evidence: 'INSERT,SELECT,UPDATE', // the one door every credit goes through; a trigger keeps what it says fixed
  payment_gateway_access: 'SELECT', // set by NetCyberAI in Control
  bank_accounts: 'INSERT,SELECT,UPDATE',
  class_notices: 'INSERT,SELECT,UPDATE', // never edited, decided once (trigger); never deleted
  ptm_events: 'INSERT,SELECT,UPDATE',
  school_events: 'INSERT,SELECT,UPDATE',
  complaints: 'INSERT,SELECT,UPDATE', // what it says never changes; closed stays closed (trigger); never deleted
  complaint_events: 'INSERT,SELECT', // append-only
  parent_ai_answers: 'INSERT,SELECT,UPDATE', // a sent or discarded answer is never changed (trigger); never deleted
  event_replies: 'SELECT', // written by the platform role from the parent's reply
  ptm_slots: 'INSERT,SELECT',
  ptm_bookings: 'INSERT,SELECT,UPDATE', // moved, never deleted
  message_threads: 'SELECT,UPDATE', // read, and marked read; written by the webhook as the platform role (C187)
  inbound_messages: 'SELECT',
  whatsapp_opt_outs: 'SELECT,UPDATE', // lifted by the office
  fee_followups: 'INSERT,SELECT,UPDATE', // closed, never edited (trigger)
  fee_refunds: 'INSERT,SELECT',
  fee_reminders: 'SELECT', // written by the nightly job only
  fee_clearance_overrides: 'INSERT,SELECT',
  bank_credit_rows: 'INSERT,SELECT,UPDATE', // the bank's own lines; a trigger keeps them fixed (C176)
  bank_statement_imports: 'INSERT,SELECT',
  school_holidays: 'DELETE,INSERT,SELECT',
  payment_methods: 'INSERT,SELECT,UPDATE',
  payment_reports: 'SELECT,UPDATE', // written by the parent's page (the platform role); the school reads and decides (C174)
  payment_events: 'SELECT', // written when a provider's notice is applied, as the platform role (C169)
  payment_links: 'INSERT,SELECT,UPDATE', // never deleted: cancelled, paid or expired (C168)
  payment_link_lines: 'INSERT,SELECT', // fixed when the link is made
  fee_status_runs: 'SELECT', // written by the nightly job as the platform role (C163)
  recognition_events: 'DELETE,INSERT,SELECT,UPDATE',
  recovery_plans: 'INSERT,SELECT',
  retention_policy: 'DELETE,INSERT,SELECT,UPDATE',
  saved_views: 'DELETE,INSERT,SELECT,UPDATE',
  school_applications: '',
  school_entitlements: 'SELECT',
  school_module_entitlements: 'SELECT',
  school_sequences: 'INSERT,SELECT,UPDATE',
  school_setting_changes: 'INSERT,SELECT',
  school_settings: 'INSERT,SELECT,UPDATE',
  school_whatsapp_configs: 'DELETE,INSERT,SELECT,UPDATE',
  schools: 'SELECT', // C219: UPDATE of the profile columns only (name, address), a column grant; no INSERT or DELETE
  sessions: '',
  staff_invitations: 'INSERT,SELECT,UPDATE',
  student_qr_tokens: 'DELETE,INSERT,SELECT,UPDATE',
  students: 'DELETE,INSERT,SELECT,UPDATE',
  subjects: 'DELETE,INSERT,SELECT,UPDATE',
  support_ticket_attachments: 'INSERT,SELECT',
  support_ticket_messages: 'INSERT,SELECT',
  support_tickets: 'INSERT,SELECT',
  syllabus_progress: 'DELETE,INSERT,SELECT,UPDATE',
  syllabus_units: 'DELETE,INSERT,SELECT',
  system_config: 'DELETE,INSERT,SELECT,UPDATE',
  teacher_impact_metrics: 'DELETE,INSERT,SELECT,UPDATE',
  teacher_subjects: 'DELETE,INSERT,SELECT,UPDATE',
  teachers: 'DELETE,INSERT,SELECT,UPDATE',
  teaching_notes: 'INSERT,SELECT',
  timetable_entries: 'DELETE,INSERT,SELECT,UPDATE',
  trusted_devices: '', // F1-1 (C257): like sessions, reached only through app_backend's own grant
  usage_events: 'INSERT,SELECT',
  users: 'DELETE,INSERT,SELECT,UPDATE',
  webhook_events: 'INSERT,SELECT',
  whatsapp_templates: 'DELETE,INSERT,SELECT,UPDATE',
  // --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
  // p5-8a begin
  // p5-8a end
  // p5-8b begin
  staff_leave: 'INSERT,SELECT,UPDATE', // never deleted: withdrawn or cancelled (C201)
  // p5-8b end
  // p5-8c begin
  substitutions: 'INSERT,SELECT,UPDATE', // never deleted: a cover is undone (C202)
  // p5-8c end
  // p5-8d begin
  // p5-8d end
  // p5-8e begin
  plans: '', // the platform's: names and prices are typed in Control (C204)
  school_subscriptions: 'SELECT', // a school reads its own paid-until day; only the platform role writes
  subscription_payments: '', // payments recorded by NetCyberAI: never the app role's
  // p5-8e end
  // p5-8f begin
  // p5-8f end
  // p5-8g begin
  // p5-8g end
  // p5-8h begin
  // p5-8h end
  // p5-8i begin
  school_health_runs: 'INSERT,SELECT,UPDATE', // never deleted: a past day's check-up never changes (C208)
  // p5-8i end
  // p5-8j begin
  early_warning_flags: 'INSERT,SELECT,UPDATE', // never deleted: a flag closes (C209); the table was at_risk_flags
  early_warning_actions: 'INSERT,SELECT', // append-only: a later outcome is a new row
  // p5-8j end
  // c210-rls begin
  // c210-rls end
  // c210-leave begin
  // c210-leave end
  // c210-jobs begin
  // c210-jobs end
  // c210-ui begin
  // c210-ui end
  // p6-9a begin
  boards: 'SELECT', // every school role reads the boards and their presets; only the platform role adds them (C213)
  board_presets: 'SELECT',
  grading_schemes: 'INSERT,SELECT', // a version is saved, never changed or removed
  // p6-9a end
  // p6-9b begin
  exam_papers: 'DELETE,INSERT,SELECT,UPDATE', // a paper is removed only while it has no marks (C214)
  // p6-9b end
  // p6-9c begin
  exam_publications: 'INSERT,SELECT,UPDATE', // never deleted: a publication is reopened, with a reason (C215)
  report_remarks: 'DELETE,INSERT,SELECT,UPDATE', // the class teacher clears a remark while the class is not published
  // p6-9c end
  // p6-9d begin
  // p6-9d end
  // p6-9e begin
  // p6-9e end
  // p6-9f begin
  // p6-9f end
  // c212-pricing begin
  school_billing_terms: '', // a school's own terms (C212): read and written in Control only, never by a school
  // c212-pricing end
  // p7-10a begin
  admission_enquiries: 'INSERT,SELECT,UPDATE', // never deleted; admitted is for good (trigger) (C221)
  admission_events: 'INSERT,SELECT', // append-only: the trigger keeps every change, a person adds a note
  // p7-10a end
  // p7-10b begin
  student_id_as_printed: 'INSERT,SELECT,UPDATE', // what Aadhaar prints, typed by the office; never removed (C222)
  data_check_requests: 'INSERT,SELECT,UPDATE', // never removed: a request is corrected or closed
  // p7-10b end
  // p7-10c begin
  rte_rates: 'INSERT,SELECT', // a new rate replaces the year's rate; none is changed or removed (C223)
  rte_claims: 'INSERT,SELECT,UPDATE', // raised, then paid or written off once (trigger); never removed
  rte_evidence: 'DELETE,INSERT,SELECT', // a wrong piece of evidence is removed, audited; never changed
  // p7-10c end
  // p7-10d begin
  staff_qualifications: 'INSERT,SELECT,UPDATE', // a staff member's row, changed in place by the office; never removed (C227)
  disclosure_entries: 'INSERT,SELECT', // every change is a new entry; none is changed or removed
  sqaaf_standards: 'SELECT', // CBSE's standards as data: read only; a new edition comes by a migration
  sqaaf_evidence: 'DELETE,INSERT,SELECT', // a wrong piece of evidence is removed, audited; never changed
  // p7-10d end
  // p7-10e begin
  certificates_issued: 'INSERT,SELECT,UPDATE', // never deleted: a number is never reused; UPDATE only withdraws (trigger) (C228)
  certificate_copies: 'INSERT,SELECT', // a copy sent to a family; removed only by a child's erasure (definer function)
  certificate_marks: 'DELETE,INSERT,SELECT,UPDATE', // the seal and the signature: the principal replaces or removes them
  certificate_numbering: 'INSERT,SELECT,UPDATE', // the prefix and starting number: set, then fixed once a certificate uses it (trigger) (C232)
  certificate_signatories: 'DELETE,INSERT,SELECT', // the school admins the principal names as signers: named or un-named, never changed (C232)
  certificate_signatures: 'DELETE,INSERT,SELECT,UPDATE', // each signer's own signature image, kept, replaced or removed by that person (C232)
  // p7-10e end
  // p7-10f begin
  timetable_loads: 'DELETE,INSERT,SELECT,UPDATE', // a class's subject periods and teacher, edited by the office (C229)
  timetable_unavailable: 'DELETE,INSERT,SELECT', // a teacher's unavailable periods are replaced as a set
  timetable_proposals: 'INSERT,SELECT,UPDATE', // never deleted: a draft is published or discarded, for good (trigger)
  timetable_versions: 'INSERT,SELECT', // append-only: each publish kept
  // p7-10f end
  // p7-10g begin
  teacher_subject_requests: 'INSERT,SELECT,UPDATE', // a teacher's proposal: decided once by the office (trigger), never deleted (C231)
  // p7-10g end
  // c224 begin
  attendance_change_reasons: 'DELETE,INSERT,SELECT', // the words given for an attendance change, beside the audit row; deleted only by an erasure (review of C224)
  // c224 end
  // c225 begin
  rte_claim_receipts: 'INSERT,SELECT', // the state's payments: recorded, never changed or removed; a mistake is a reversing row (C225)
  // c225 end
  // c226 begin
  school_trials: 'SELECT', // the free month: the school's principal and school admin read their own (row level security); only Control writes (C226)
  // c226 end
  // c219 begin
  co_scholastic_grades: 'DELETE,INSERT,SELECT,UPDATE', // frozen with the class's publication (trigger); cleared while not published
  // c219 end
  // c235d begin
  record_documents: 'DELETE,INSERT,SELECT', // a paper on a staff or student record: added or removed by the office, never changed (C235-D)
  record_document_versions: 'DELETE,INSERT,SELECT', // each upload kept as a version; removed only with its paper or by an erasure
  // c235d end
  // c238 begin
  staff_profiles: 'INSERT,SELECT,UPDATE', // a staff member's profile, changed in place by the office; never removed (C238)
  // c238 end
  // c230-aa begin
  family_connect_codes: 'INSERT,SELECT,UPDATE', // a guardian's Family app code: made, then spent or expired; never removed (C230-AA)
  // c230-aa end
  // c347 begin
  exam_withdrawals: 'DELETE,INSERT,SELECT', // a child withdrawn from an exam by the office, and taken back; never changed (C348)
  exam_seat_numbers: 'SELECT', // exam numbers are the database's own: issued by its triggers only (C348)
  marking_setups: 'DELETE,INSERT,SELECT,UPDATE', // AI marking (C347): written by whoever may mark the paper
  marking_questions: 'DELETE,INSERT,SELECT,UPDATE',
  marking_uploads: 'DELETE,INSERT,SELECT,UPDATE',
  marking_sheets: 'DELETE,INSERT,SELECT,UPDATE',
  marking_pages: 'DELETE,INSERT,SELECT,UPDATE',
  marking_marks: 'DELETE,INSERT,SELECT,UPDATE',
  marking_report_links: 'INSERT,SELECT', // made by the office (C351); UPDATE of the three ended_* columns only, a column grant (C230-AG)
  // c347 end
  // aj-5 begin
  exam_outputs: 'INSERT,SELECT', // "publish and notify" made for a publication: one row, never changed or removed (C230-AJ part 5)
  exam_certificates: 'INSERT,SELECT', // a merit or participation certificate linked to its publication and child; never changed or removed
  // aj-5 end
  // aq-2 begin
  question_bank: 'DELETE,INSERT,SELECT,UPDATE', // the school's questions (C363): only a draft is removed (row level security)
  paper_generations: 'INSERT,SELECT,UPDATE', // one making of a paper's questions (C362): asked, moved on by its job, never removed
  // aq-2 end
};

// The platform role (nca_super) holds what the app's role holds, except here.
// It bypasses row level security, so these rights are its only limit.
const NCA_SUPER_DIFFERS: Record<string, string> = {
  entitlement_change_reasons: 'INSERT,SELECT', // the founder's reasons: written once
  fee_status_runs: 'INSERT,SELECT', // the nightly job writes a result once
  payment_credentials: 'INSERT,SELECT,UPDATE',
  whatsapp_credentials: 'INSERT,SELECT,UPDATE',
  held_inbound: 'INSERT,SELECT,UPDATE',
  payment_gateway_access: 'INSERT,SELECT,UPDATE',
  fee_followups: 'SELECT', // the nightly reminders hold while a promise or hardship is open
  fee_refunds: '',
  fee_reminders: 'INSERT,SELECT', // the nightly reminders (C179)
  fee_clearance_overrides: '',
  class_notices: 'SELECT',
  ptm_events: 'SELECT',
  school_events: 'SELECT',
  complaints: 'SELECT,UPDATE', // the job that passes an overdue one to the principal
  parent_ai_answers: 'SELECT',
  event_replies: 'INSERT,SELECT,UPDATE',
  ptm_slots: 'SELECT',
  message_threads: 'INSERT,SELECT,UPDATE',
  inbound_messages: 'INSERT,SELECT',
  whatsapp_opt_outs: 'INSERT,SELECT,UPDATE',
  bank_accounts: '', // the platform role has no business in a school's bank statements
  bank_credit_rows: '',
  bank_statement_imports: '',
  school_holidays: 'SELECT', // the nightly alerts count working days
  payment_methods: 'SELECT',
  payment_reports: 'INSERT,SELECT,UPDATE',
  payment_events: 'INSERT,SELECT,UPDATE', // a provider's notice: recorded, then its outcome set
  payment_links: 'INSERT,SELECT,UPDATE', // closing a link when its payment is applied (C169); the nightly reminder makes the family's link (C179)
  payment_link_lines: 'INSERT,SELECT',
  intake_rate_events: 'DELETE,INSERT,SELECT,UPDATE',
  jobs: 'DELETE,INSERT,SELECT,UPDATE',
  message_rate_table: 'DELETE,INSERT,SELECT,UPDATE',
  platform_settings: 'DELETE,INSERT,SELECT,UPDATE',
  school_applications: 'DELETE,INSERT,SELECT,UPDATE',
  school_entitlements: 'INSERT,SELECT,UPDATE',
  school_module_entitlements: 'INSERT,SELECT,UPDATE',
  // --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
  // p5-8a begin
  // p5-8a end
  // p5-8b begin
  staff_leave: '', // the platform role has no business in a person's leave
  // p5-8b end
  // p5-8c begin
  substitutions: '', // nothing is sent or scheduled for a cover, so the platform role has no business in it
  // p5-8c end
  // p5-8d begin
  // p5-8d end
  // p5-8e begin
  plans: 'INSERT,SELECT,UPDATE', // retired, never deleted
  school_subscriptions: 'INSERT,SELECT,UPDATE',
  subscription_payments: 'INSERT,SELECT', // append-only: a wrong row is corrected by another row
  // p5-8e end
  // p5-8f begin
  // p5-8f end
  // p5-8g begin
  // p5-8g end
  // p5-8h begin
  // p5-8h end
  // p5-8i begin
  school_health_runs: '', // a check-up is the school office's own: the platform role reads nothing here (C208)
  // p5-8i end
  // p5-8j begin
  early_warning_flags: '', // nothing is sent or scheduled for a flag, so the platform role has no business in it
  early_warning_actions: '',
  // p5-8j end
  // c210-rls begin
  // c210-rls end
  // c210-leave begin
  // c210-leave end
  // c210-jobs begin
  // c210-jobs end
  // c210-ui begin
  // c210-ui end
  // p6-9a begin
  boards: 'INSERT,SELECT', // added in Control, never changed or removed (C213)
  board_presets: 'INSERT,SELECT', // a new preset replaces an old one; none is changed
  grading_schemes: '', // a school's grading scheme is its own: the platform role reads nothing here
  // p6-9a end
  // p6-9b begin
  exams: '', // a school's exams and marks are its own: the platform role reads nothing here (C214)
  exam_papers: '',
  marks: '',
  // p6-9b end
  // p6-9c begin
  exam_publications: '', // a school's results are its own: the platform role reads nothing here (C215)
  report_remarks: '',
  // p6-9c end
  // p6-9d begin
  // p6-9d end
  // p6-9e begin
  // p6-9e end
  // p6-9f begin
  // p6-9f end
  // c212-pricing begin
  school_billing_terms: 'INSERT,SELECT,UPDATE', // never deleted; an UPDATE may only bring a last day forward (a trigger)
  // c212-pricing end
  // p7-10a begin
  admission_enquiries: '', // a family's enquiry is the school office's own: the platform role reads nothing here (C221)
  admission_events: '',
  // p7-10a end
  // p7-10b begin
  student_id_as_printed: '', // a child's details as printed on Aadhaar are the school's own: the platform role reads nothing here (C222)
  data_check_requests: '', // the reply is linked by a database function as the owner, never by the platform role
  // p7-10b end
  // p7-10c begin
  rte_rates: '', // a school's RTE claims and the children's evidence are its own: the platform role reads nothing here (C223)
  rte_claims: '',
  rte_evidence: '',
  // p7-10c end
  // p7-10d begin
  staff_qualifications: '', // the school's staff records and its compliance desk are its own: the platform role reads nothing here (C227)
  disclosure_entries: '',
  sqaaf_standards: '',
  sqaaf_evidence: '',
  // p7-10d end
  // p7-10e begin
  certificates_issued: '', // a school's register is its own: the platform role runs certificate_verify() only (C228)
  certificate_copies: '', // the family's link is answered by certificate_copy() only
  certificate_marks: '',
  certificate_numbering: '', // a school's own (C232)
  certificate_signatories: '',
  certificate_signatures: '',
  // p7-10e end
  // p7-10f begin
  timetable_loads: '', // a school's timetable plans are its own: the platform role reads nothing here (C229)
  timetable_unavailable: '',
  timetable_proposals: '',
  timetable_versions: '',
  // p7-10f end
  // p7-10g begin
  teacher_subject_requests: '', // a school's own: the platform role reads nothing here (C231)
  // p7-10g end
  // c224 begin
  attendance_change_reasons: '', // the school's own: the platform role reads nothing here
  // c224 end
  // c225 begin
  rte_claim_receipts: '', // the platform role reads nothing of a school's RTE claims (C225)
  // c225 end
  // c226 begin
  school_trials: 'INSERT,SELECT,UPDATE', // started and extended in Control, ended by the nightly job; never removed (no DELETE, and a trigger)
  // c226 end
  // c219 begin
  schools: 'DELETE,INSERT,SELECT,UPDATE', // Control makes schools and sets plan, billing, pilot, test, budget and board (C219)
  co_scholastic_grades: '', // a school's results are its own: the platform role reads nothing here
  // c219 end
  // c235d begin
  record_documents: '', // a school's papers on its people are its own: the platform role reads nothing here (C235-D)
  record_document_versions: '',
  // c235d end
  // c238 begin
  staff_profiles: '', // a school's staff records are its own: the platform role reads nothing here (C238)
  // c238 end
  // c230-aa begin
  family_connect_codes: '', // a school's codes for its guardians: the platform role reads nothing here (C230-AA)
  // c230-aa end
  // c347 begin
  // AI marking and exam numbers: the platform role reads nothing here; the report link and Control's monitor read
  // only through their definer functions (C347, C351).
  exam_withdrawals: '',
  exam_seat_numbers: '',
  marking_setups: '',
  marking_questions: '',
  marking_uploads: '',
  marking_sheets: '',
  marking_pages: '',
  marking_marks: '',
  marking_report_links: '',
  // c347 end
  // aj-5 begin
  exam_outputs: '', // a school's own record: a guardian reads it only through guardian_exam_outputs()
  exam_certificates: '',
  // aj-5 end
  // aq-2 begin
  question_bank: '', // a school's own questions and papers: the platform role reads nothing here (C362, C363)
  paper_generations: '',
  // aq-2 end
};
// Every other role that holds anything on a table.
const OTHER_ROLES: Record<string, Record<string, string>> = {
  app_backend: { leads: 'INSERT,SELECT', sessions: 'INSERT,SELECT,UPDATE', trusted_devices: 'INSERT,SELECT,UPDATE' },
  audit_writer: { audit_log: 'INSERT,SELECT' },
};
// Supabase's service_role (the server's secret key) holds nothing here (C167): the app uses that key for
// sign-in administration and file storage only, neither of which is in this schema.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const rows = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('rights on schema public', () => {
  it('every table is on the list, and the app’s role has exactly the rights listed', async () => {
    const found = await rows(
      `select c.relname as t, coalesce((select string_agg(a.privilege_type, ',' order by a.privilege_type) from aclexplode(c.relacl) a where pg_get_userbyid(a.grantee) = 'app_user'), '') as rights
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1`
    );
    const held = Object.fromEntries(found.map((r: { t: string; rights: string }) => [r.t, r.rights]));
    // Every table the migrations make is pinned. (The harness skips the three job-scheduler migrations, which make no table.)
    expect(Object.keys(held).filter((t) => !(t in APP_USER))).toEqual([]);
    expect(Object.keys(APP_USER).filter((t) => !(t in held))).toEqual([]);
    expect(held).toEqual(APP_USER);
  });

  it('every other role has exactly the rights pinned: the platform role, the sign-in role, audit_writer; nobody else, service_role included, holds anything', async () => {
    const found = await rows(
      `select c.relname as t, pg_get_userbyid(a.grantee) as role, string_agg(a.privilege_type, ',' order by a.privilege_type) as rights
         from pg_class c, aclexplode(c.relacl) a
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and a.grantee <> c.relowner and pg_get_userbyid(a.grantee) <> 'app_user'
        group by 1, 2`
    );
    const held: Record<string, Record<string, string>> = {};
    for (const r of found as { t: string; role: string; rights: string }[]) (held[r.role] ??= {})[r.t] = r.rights;
    const only = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''));
    const expected: Record<string, Record<string, string>> = {
      ...OTHER_ROLES,
      nca_super: only({ ...APP_USER, ...NCA_SUPER_DIFFERS }),
    };
    expect(Object.keys(held).sort()).toEqual(Object.keys(expected).sort());
    for (const role of Object.keys(expected)) expect(held[role], role).toEqual(expected[role]);
  });

  it('anon, authenticated, service_role and PUBLIC can do nothing to any table, sequence or function, TRUNCATE included', async () => {
    const tables = await rows(
      `select c.relname, r.rolname, p.priv from pg_class c cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
         cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') and has_table_privilege(r.rolname, c.oid, p.priv)`
    );
    expect(tables).toEqual([]);
    const sequences = await rows(
      `select c.relname, r.rolname from pg_class c cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' and (has_sequence_privilege(r.rolname, c.oid, 'USAGE') or has_sequence_privilege(r.rolname, c.oid, 'SELECT') or has_sequence_privilege(r.rolname, c.oid, 'UPDATE'))`
    );
    expect(sequences).toEqual([]);
    const functions = await rows(
      `select p.oid::regprocedure::text as f, r.rolname from pg_proc p cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
        where p.pronamespace = 'public'::regnamespace and has_function_privilege(r.rolname, p.oid, 'EXECUTE')`
    );
    expect(functions).toEqual([]);
    const toPublic = await rows(`select p.oid::regprocedure::text as f from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))`);
    expect(toPublic).toEqual([]);
    const tableToPublic = await rows(`select c.relname from pg_class c, aclexplode(c.relacl) a where c.relnamespace = 'public'::regnamespace and a.grantee = 0`);
    expect(tableToPublic).toEqual([]);
  });

  it('the app’s role never holds TRUNCATE, REFERENCES or TRIGGER', async () => {
    expect(await rows(`select c.relname, a.privilege_type from pg_class c, aclexplode(c.relacl) a where c.relnamespace = 'public'::regnamespace and pg_get_userbyid(a.grantee) = 'app_user' and a.privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'USAGE')`)).toEqual([]);
  });

  it('nothing is granted by default to anon, authenticated, service_role, the app’s role or the platform role', async () => {
    const defaults = await rows(
      `select d.defaclobjtype::text as kind, pg_get_userbyid(a.grantee) as grantee from pg_default_acl d, aclexplode(d.defaclacl) a
        where d.defaclnamespace = 'public'::regnamespace and pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'app_user', 'nca_super', 'service_role')`
    );
    expect(defaults).toEqual([]);
    // A table made now, with no grant of its own, is nobody's but its owner's and the platform's.
    await db.pg.exec(`create table grants_probe (id int); create sequence grants_probe_seq;`);
    const probe = await rows(
      `select r.rolname, has_table_privilege(r.rolname, 'grants_probe', 'SELECT') or has_table_privilege(r.rolname, 'grants_probe', 'INSERT') or has_table_privilege(r.rolname, 'grants_probe', 'TRUNCATE') as on_table, has_sequence_privilege(r.rolname, 'grants_probe_seq', 'USAGE') as on_sequence
         from pg_roles r where r.rolname in ('anon', 'authenticated', 'app_user', 'nca_super', 'service_role') order by 1`
    );
    await db.pg.exec(`drop table grants_probe; drop sequence grants_probe_seq;`);
    expect(probe).toEqual(['anon', 'app_user', 'authenticated', 'nca_super', 'service_role'].map((rolname) => ({ rolname, on_table: false, on_sequence: false })));
  });

  it('before the hardening migration the harness had the fault the real databases had, so this test means something', async () => {
    // Replay everything up to, and not including, the hardening migration on a second database.
    const { readdirSync, readFileSync } = await import('fs');
    const path = await import('path');
    const dir = path.resolve(__dirname, '../../supabase/migrations');
    expect(readdirSync(dir).some((f) => f.endsWith('_grants_hardening.sql'))).toBe(true);
    const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_grants_hardening.sql'))!), 'utf8');
    expect(sql).toMatch(/revoke all on all tables in schema public from anon, authenticated;/);
    // The stand-ins give new objects to the public roles by default, as Supabase does.
    const standIns = readFileSync(path.resolve(__dirname, '../../scripts/harness/db.mjs'), 'utf8');
    expect(standIns).toMatch(/alter default privileges in schema public grant all on tables to anon, authenticated, service_role;/);
  });
});
