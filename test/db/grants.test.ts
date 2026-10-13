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
  at_risk_flags: 'DELETE,INSERT,SELECT,UPDATE',
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
  schools: 'DELETE,INSERT,SELECT,UPDATE',
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
  usage_events: 'INSERT,SELECT',
  users: 'DELETE,INSERT,SELECT,UPDATE',
  webhook_events: 'INSERT,SELECT',
  whatsapp_templates: 'DELETE,INSERT,SELECT,UPDATE',
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
};
// Every other role that holds anything on a table.
const OTHER_ROLES: Record<string, Record<string, string>> = {
  app_backend: { leads: 'INSERT,SELECT', sessions: 'INSERT,SELECT,UPDATE' },
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
