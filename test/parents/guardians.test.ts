import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { recordConsentDecision } from '@/lib/consent/gate';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { guardianDetail, listGuardians } from '@/lib/parents/guardians';
import { queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { TEMPLATE_REGISTRY } from '@/lib/whatsapp/templates';

// Parents (docs/25 slice 7j, C192). The acceptance test: a teacher sees guardians of their own classes only, and a
// consent change shows in the next send. Every name and number is made up.

const A = 'ca000000-0000-4000-8000-000000000001';
const u = (n: number) => `ca000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const PRINCIPAL = u(11);
const TEACHER_5A = u(12);
const TEACHER_6B = u(13);
const ACCOUNTANT = u(14);
const CLASS_5A = u(51);
const CLASS_6B = u(52);
const [ASHA, BILAL, FARAH, GAURI] = [u(31), u(32), u(36), u(37)];
const [G_ASHA, G_BILAL, G_FARAH, G_BOTH] = [u(41), u(42), u(46), u(47)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const teacher5A: Who = { role: 'teacher', user: TEACHER_5A };
const teacher6B: Who = { role: 'teacher', user: TEACHER_6B };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const viewer = (who: Who) => ({ schoolId: A, role: who.role });
const names = (rows: { name: string }[]) => rows.map((r) => r.name);
let sendNo = 0;
// The next message to Asha's guardian, as any part of the app would send it: through the gate.
const nextSend = () =>
  as(principal, (c) => queueWhatsAppMessage(c, queue, { schoolId: A, studentId: ASHA, parentId: G_ASHA, purpose: 'operational_communication', toPhone: '+919000000001', templateName: 'class_notice', templateParams: { class: '5-A', notice: 'A notice.' }, dedupeKey: `7j-test:${++sendNo}` })).then((r) => r.status);
const decide = (granted: boolean) =>
  as(principal, (c) => recordConsentDecision(c, { schoolId: A, studentId: ASHA, purpose: 'operational_communication', granted, parentId: G_ASHA, actorUserId: PRINCIPAL, actorRole: 'principal' as never, noticeVersion: 'v1' }));

describe('the Parents screen, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // 5-A: Asha and Bilal. 6-B: Farah. One guardian has a child in each class: Gauri (5-A) and Farah (6-B).
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TEACHER_5A}', '${A}', 't5a@school-a.example', 'teacher', 'Tara Teacher'),
        ('${TEACHER_6B}', '${A}', 't6b@school-a.example', 'teacher', 'Tarun Teacher'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TEACHER_5A}'), ('${CLASS_6B}', '${A}', '6-B', '${TEACHER_6B}');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${CLASS_5A}'), ('${BILAL}', '${A}', 'A-2', 'Bilal', 'active', '${CLASS_5A}'),
        ('${FARAH}', '${A}', 'A-6', 'Farah', 'active', '${CLASS_6B}'), ('${GAURI}', '${A}', 'A-7', 'Gauri', 'active', '${CLASS_5A}');
      insert into parents (parent_id, school_id, name, phone, email, relation) values ('${G_ASHA}', '${A}', 'Anita Sharma', '9000000001', 'anita@family.example', 'Mother'), ('${G_BILAL}', '${A}', 'Bashir Khan', 'not given', null, 'Father'),
        ('${G_FARAH}', '${A}', 'Fatima Ali', '9000000006', null, 'Mother'), ('${G_BOTH}', '${A}', 'Gopal Verma', '9000000007', null, 'Father');
      insert into parent_student_map (school_id, parent_id, student_id, verification_status) values ('${A}', '${G_ASHA}', '${ASHA}', 'active'), ('${A}', '${G_BILAL}', '${BILAL}', 'active'), ('${A}', '${G_FARAH}', '${FARAH}', 'active'),
        ('${A}', '${G_BOTH}', '${GAURI}', 'active'), ('${A}', '${G_BOTH}', '${FARAH}', 'active');
      insert into data_subject_requests (school_id, student_id, request_type, requested_by_description, logged_by) values ('${A}', '${ASHA}', 'correction', 'Mother, by phone', '${PRINCIPAL}');
    `);
    const t = TEMPLATE_REGISTRY.find((x) => x.name === 'class_notice')!;
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, 'class_notice', 1, 'en', $1, $2, 'utility', 1440, 'approved')`, [t.body.en, [...t.variables]]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('a teacher sees the guardians of their own classes only, and of a shared guardian only their own class’s child', async () => {
    expect(names(await as(principal, (c) => listGuardians(c, viewer(principal), '')))).toEqual(['Anita Sharma', 'Bashir Khan', 'Fatima Ali', 'Gopal Verma']);
    const mine = await as(teacher5A, (c) => listGuardians(c, viewer(teacher5A), ''));
    expect(names(mine)).toEqual(['Anita Sharma', 'Bashir Khan', 'Gopal Verma']);
    expect(mine[2].children.map((k) => k.name)).toEqual(['Gauri']); // not Farah, who is in 6-B
    const theirs = await as(teacher6B, (c) => listGuardians(c, viewer(teacher6B), ''));
    expect(names(theirs)).toEqual(['Fatima Ali', 'Gopal Verma']);
    expect(theirs[1].children.map((k) => k.name)).toEqual(['Farah']);
    // Opening another class's guardian by its id is "not found" for a teacher, and found for the office.
    expect(await as(teacher5A, (c) => guardianDetail(c, viewer(teacher5A), G_FARAH))).toBeNull();
    expect((await as(principal, (c) => guardianDetail(c, viewer(principal), G_FARAH)))?.guardian.name).toBe('Fatima Ali');
    const shared = await as(teacher5A, (c) => guardianDetail(c, viewer(teacher5A), G_BOTH));
    expect(shared?.children.map((k) => k.name)).toEqual(['Gauri']);
    // Nobody outside the office and the teachers is let in at all.
    expect(await as(accountant, (c) => listGuardians(c, viewer(accountant), ''))).toEqual([]);
    expect(await as(accountant, (c) => guardianDetail(c, viewer(accountant), G_ASHA))).toBeNull();
  });

  it('a teacher gets the last four digits, never the number or email, and no data requests; the office gets them', async () => {
    const t = (await as(teacher5A, (c) => guardianDetail(c, viewer(teacher5A), G_ASHA)))!;
    expect(t.guardian).toMatchObject({ phone: null, email: null, phone_last4: '0001', relation: 'Mother' });
    expect(t.requests).toBeNull();
    expect(t.mayEdit).toBe(false);
    expect(JSON.stringify(t)).not.toMatch(/9000000001|anita@family/);
    const o = (await as(principal, (c) => guardianDetail(c, viewer(principal), G_ASHA)))!;
    expect(o.guardian).toMatchObject({ phone: '9000000001', email: 'anita@family.example' });
    expect(o.requests?.map((r) => [r.child, r.type, r.status])).toEqual([['Asha', 'correction', 'logged']]);
    expect(o.mayEdit).toBe(true);
    // Search: by a guardian's name, by a child's name; by number for the office only.
    expect(names(await as(teacher5A, (c) => listGuardians(c, viewer(teacher5A), 'gauri')))).toEqual(['Gopal Verma']);
    expect(names(await as(teacher5A, (c) => listGuardians(c, viewer(teacher5A), 'farah')))).toEqual([]);
    expect(names(await as(principal, (c) => listGuardians(c, viewer(principal), '0000 0006')))).toEqual(['Fatima Ali']);
    expect(names(await as(teacher6B, (c) => listGuardians(c, viewer(teacher6B), '90000')))).toEqual([]);
    expect(names(await as(principal, (c) => listGuardians(c, viewer(principal), '100%')))).toEqual([]);
  });

  it('a consent change shows in the next send, and on the screen', async () => {
    const consent = async () => (await as(principal, (c) => guardianDetail(c, viewer(principal), G_ASHA)))!.children[0].consent.operational_communication;
    expect(await consent()).toBe(false);
    expect(await nextSend()).toBe('blocked_consent');
    await decide(true);
    expect(await consent()).toBe(true);
    expect(await nextSend()).toBe('queued');
    await decide(false);
    expect(await consent()).toBe(false);
    expect(await nextSend()).toBe('blocked_consent');
    // The teacher's view of the same guardian reads the same ledger.
    await decide(true);
    expect((await as(teacher5A, (c) => guardianDetail(c, viewer(teacher5A), G_ASHA)))!.children[0].consent).toMatchObject({ operational_communication: true, daily_pulse: false });
  });

  it('the number’s state: usable or not, STOP, the last message, and whether they have written', async () => {
    const before = (await as(principal, (c) => guardianDetail(c, viewer(principal), G_ASHA)))!.phone;
    expect(before).toMatchObject({ usable: true, stopped: false, wrote_at: null, unread: 0 });
    expect(before.last_message?.status).toBe('blocked_consent'); // the last one above, held after the withdrawal
    expect((await as(principal, (c) => guardianDetail(c, viewer(principal), G_BILAL)))!.phone).toMatchObject({ usable: false, stopped: false, last_message: null });
    await db.pg.query(`insert into whatsapp_opt_outs (school_id, phone) values ($1, '+919000000001')`, [A]);
    await db.pg.query(`insert into message_threads (school_id, phone, parent_id, last_inbound_at, unread) values ($1, '+919000000001', $2, now(), 2)`, [A, G_ASHA]);
    for (const who of [principal, teacher5A]) expect((await as(who, (c) => guardianDetail(c, viewer(who), G_ASHA)))!.phone, who.role).toMatchObject({ stopped: true, unread: 2 });
    expect(await nextSend()).not.toBe('queued'); // STOP holds the next message, whatever the consent
  });

  it('the language of messages: the guardian’s own, else the school’s, else English', async () => {
    const language = async () => (await as(principal, (c) => guardianDetail(c, viewer(principal), G_FARAH)))!.guardian;
    expect(await language()).toMatchObject({ preferred_language: null, message_language: 'en' });
    await as(principal, (c) => c.query(`update parents set preferred_language = 'hi' where parent_id = $1`, [G_FARAH]));
    expect(await language()).toMatchObject({ preferred_language: 'hi', message_language: 'hi' });
  });
});
