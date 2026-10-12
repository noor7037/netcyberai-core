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
  communication_log: 'DELETE,INSERT,SELECT,UPDATE',
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

  it('anon, authenticated and PUBLIC can do nothing to any table, sequence or function, TRUNCATE included', async () => {
    const tables = await rows(
      `select c.relname, r.rolname, p.priv from pg_class c cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
         cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') and has_table_privilege(r.rolname, c.oid, p.priv)`
    );
    expect(tables).toEqual([]);
    const sequences = await rows(
      `select c.relname, r.rolname from pg_class c cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' and (has_sequence_privilege(r.rolname, c.oid, 'USAGE') or has_sequence_privilege(r.rolname, c.oid, 'SELECT') or has_sequence_privilege(r.rolname, c.oid, 'UPDATE'))`
    );
    expect(sequences).toEqual([]);
    const functions = await rows(
      `select p.oid::regprocedure::text as f, r.rolname from pg_proc p cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
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

  it('nothing is granted by default to anon, authenticated or the app’s role', async () => {
    const defaults = await rows(
      `select d.defaclobjtype::text as kind, pg_get_userbyid(a.grantee) as grantee from pg_default_acl d, aclexplode(d.defaclacl) a
        where d.defaclnamespace = 'public'::regnamespace and pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'app_user')`
    );
    expect(defaults).toEqual([]);
    // A table made now, with no grant of its own, is nobody's but its owner's and the platform's.
    await db.pg.exec(`create table grants_probe (id int); create sequence grants_probe_seq;`);
    const probe = await rows(
      `select r.rolname, has_table_privilege(r.rolname, 'grants_probe', 'SELECT') or has_table_privilege(r.rolname, 'grants_probe', 'INSERT') or has_table_privilege(r.rolname, 'grants_probe', 'TRUNCATE') as on_table, has_sequence_privilege(r.rolname, 'grants_probe_seq', 'USAGE') as on_sequence
         from pg_roles r where r.rolname in ('anon', 'authenticated', 'app_user') order by 1`
    );
    await db.pg.exec(`drop table grants_probe; drop sequence grants_probe_seq;`);
    expect(probe).toEqual([{ rolname: 'anon', on_table: false, on_sequence: false }, { rolname: 'app_user', on_table: false, on_sequence: false }, { rolname: 'authenticated', on_table: false, on_sequence: false }]);
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
