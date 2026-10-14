import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { SEVERITY, compareDob, compareGender, compareName, looksLikeAadhaarNumber } from '@/lib/free-tools/student-data-check';
import { pseudonymizeStudent } from '@/lib/consent/dsr';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { askParent, closeRequest, correctRecord, draftRequest, listDataCheck, noteAnswer, savePrinted, type DataCheckList } from '@/lib/students/data-check';
import { compareDetails, hasAadhaarNumber, hideAadhaarNumbers, readCorrection, readNote, readPrinted } from '@/lib/students/data-check-rules';
import { TODAY_PROVIDERS } from '@/lib/today/cards';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { deliverQueued, enqueueQueued } from '@/lib/whatsapp/gate';
import { StandInWhatsAppProvider, type WhatsAppNotice } from '@/lib/whatsapp/provider';
import { TEMPLATE_REGISTRY, definitionProblem } from '@/lib/whatsapp/templates';

// The student data check (docs/28 row 10b, C222). The acceptance test: a mismatch in name, date of birth or gender
// is found by the free tool's own rule; a request is sent only through the send-gate and its reply is kept; a
// 12-digit number is refused by the app and the database; the class teacher sees their own class, the accountant
// none. Every name, date and number here is made up; no message reaches a phone (the stand-in provider only).

describe('the rules, the free tool’s own', () => {
  it('each detail is compared by compareName, compareDob and compareGender, and ranked by their severity', () => {
    const pairs: [string, string, string, string, string, string][] = [
      ['Md Arif Khan', 'Mohammad Arif Khan', '2015-03-05', '2015-05-03', 'not_given', 'male'],
      ['Diya Sharma', 'Priya Verma', '2014-01-20', '2014-01-20', 'female', 'female'],
      ['Farah Ali', 'Farha Ali', '2014-02-11', '2014-02-12', 'female', 'male'],
      ['ASHA  RANI', 'Asha Rani', '', '2015-06-10', 'transgender', 'transgender'],
    ];
    for (const [n1, n2, d1, d2, g1, g2] of pairs) {
      const got = compareDetails({ name: n1, dob: d1 || null, gender: g1 }, { name: n2, dob: d2, gender: g2 });
      expect(got.map((f) => f.finding)).toEqual([compareName(n1, n2), compareDob(d1, d2), compareGender(g1 === 'not_given' ? '' : g1, g2)]);
      for (const f of got) expect(f.severity).toBe(SEVERITY[f.finding]);
    }
    expect(compareDetails({ name: 'Md Arif Khan', dob: '2015-03-05', gender: 'not_given' }, { name: 'Mohammad Arif Khan', dob: '2015-05-03', gender: 'male' }).map((f) => f.finding)).toEqual(['order', 'swapped', 'missing']);
    // "Not given" is never a real difference: it is a value the office has to fill in.
    expect(compareDetails({ name: 'A', dob: null, gender: 'not_given' }, { name: 'A', dob: null, gender: 'female' })[2].finding).toBe('missing');
  });

  it('a twelve-digit number is refused by the app, however it is written; ten digits and dates are not', () => {
    for (const v of ['123456789012', '1234 5678 9012', '1234-5678-9012', '१२३४ ५६७८ ९०१२', 'Ravi 123456789012', 'Ravi 1234 5678 9012 Kumar']) expect(hasAadhaarNumber(v), v).toBe(true);
    for (const v of ['Ravi Kumar', '9800000001', '2015-03-05', 'Called on 10:30 about 2 details']) expect(hasAadhaarNumber(v), v).toBe(false);
    // The free tool's own rule is asked first: a value that IS twelve digits.
    expect(looksLikeAadhaarNumber('1234 5678 9012')).toBe(true);
    expect(readPrinted({ name: '1234 5678 9012', dob: '', gender: '' }, '2026-10-14')).toEqual({ ok: false, reason: 'aadhaar_number' });
    expect(readPrinted({ name: '', dob: '2030-01-01', gender: '' }, '2026-10-14')).toEqual({ ok: false, reason: 'dob' });
    expect(readPrinted({ name: '', dob: '2015-02-30', gender: '' }, '2026-10-14')).toEqual({ ok: false, reason: 'dob' });
    expect(readPrinted({ name: '', dob: '', gender: 'other' }, '2026-10-14')).toEqual({ ok: false, reason: 'gender' });
    expect(readPrinted({ name: '  ', dob: '', gender: '' }, '2026-10-14')).toEqual({ ok: false, reason: 'empty' });
    expect(readPrinted({ name: ' Arif   Khan ', dob: '2015-03-05', gender: 'male' }, '2026-10-14')).toEqual({ ok: true, values: { name: 'Arif Khan', dob: '2015-03-05', gender: 'male' } });
    expect(readCorrection('gender', 'not_given', '2026-10-14')).toEqual({ ok: false, reason: 'value' });
    expect(readCorrection('name', 'Arif 123456789012', '2026-10-14')).toEqual({ ok: false, reason: 'aadhaar_number' });
    expect(readNote('x'.repeat(301), 300)).toEqual({ ok: false, reason: 'value' });
    expect(hideAadhaarNumbers('Her number is 1234 5678 9012, thank you', '#')).toBe('Her number is #, thank you');
    expect(hideAadhaarNumbers('Call 9800000001', '#')).toBe('Call 9800000001');
  });

  it('the message’s words name the school first, and pass the template rules', () => {
    const d = TEMPLATE_REGISTRY.find((x) => x.name === 'data_check_request');
    expect(d).toBeDefined();
    expect(definitionProblem(d!)).toBeNull();
    expect(d!.variables).toEqual(['school', 'child', 'details']);
    expect(d!.purpose).toBe('operational_communication');
  });
});

const A = 'dc000000-0000-4000-8000-000000000001';
const B = 'dc000000-0000-4000-8000-000000000002';
const u = (n: number) => `dc000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, TARUN, TINA, ACCOUNTANT, COORD, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(18)];
const [CLASS_5A, CLASS_6B] = [u(51), u(52)];
const [ARIF, ASHA, DIYA, NEEL, FARAH] = [u(31), u(32), u(33), u(34), u(35)];
const [G_ARIF, G_DIYA, G_FARAH, G_FARAH2, G_ASHA, G_NEEL] = [u(41), u(42), u(43), u(44), u(45), u(46)];
const SECRET = 'a-secret-for-this-test-only-0123456789abcdef';
const standIn = new StandInWhatsAppProvider({ secret: SECRET });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA }; // class teacher of 5-A
const tarun: Who = { role: 'teacher', user: TARUN }; // class teacher of 6-B
const tina: Who = { role: 'teacher', user: TINA }; // teaches a subject in 5-A, class teacher of nothing
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const coordinator: Who = { role: 'academic_coordinator', user: COORD };
const otherSchool: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
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
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sql = (who: Who, text: string, params: unknown[] = []) => as(who, (c) => c.query(text, params)) as Promise<{ rows: any[]; rowCount: number }>;
const list = (who: Who, classId: string | null = null) => as(who, (c) => listDataCheck(c, actor(who), { classId })) as Promise<DataCheckList | null>;
let n = 0;
const writes = (fromPhone: string, text: string) => {
  const notices: WhatsAppNotice[] = [{ kind: 'inbound', providerMessageId: `standin-in-dc-${++n}`, fromPhone, text, at: new Date().toISOString() }];
  const { rawBody, signature } = standIn.notice(notices);
  return platform((c) => applyNotices(c, standIn, rawBody, signature, enqueueQueued(queue)));
};
const requestsOf = async (student: string) => (await db.pg.query(`select request_id, field, finding, message_log_id, reply_message_id, reply_at, office_note, outcome, corrected_to from data_check_requests where student_id = $1 order by field`, [student])).rows;
const logOf = async (logId: string) => (await db.pg.query(`select template_name, status::text as status, to_phone, student_id, parent_id, template_params, not_before from communication_log where log_id = $1`, [logId])).rows[0];
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe('on the real schema, as the app’s own role', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${B}', 'School B', 'IN-DL', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@dc-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@dc-a.example', 'school_admin', 'Asif Admin'),
        ('${TARA}', '${A}', 'tara@dc-a.example', 'teacher', 'Tara Teacher'), ('${TARUN}', '${A}', 'tarun@dc-a.example', 'teacher', 'Tarun Teacher'),
        ('${TINA}', '${A}', 'tina@dc-a.example', 'teacher', 'Tina Teacher'), ('${ACCOUNTANT}', '${A}', 'accounts@dc-a.example', 'accountant', 'Anil Accountant'),
        ('${COORD}', '${A}', 'coord@dc-a.example', 'academic_coordinator', 'Chetan Coordinator'), ('${B_PRINCIPAL}', '${B}', 'principal@dc-b.example', 'principal', 'Bela Principal');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TARA}'), ('${CLASS_6B}', '${A}', '6-B', '${TARUN}');
      insert into teachers (teacher_id, school_id, user_id, name) values ('${u(61)}', '${A}', '${TINA}', 'Tina Teacher');
      insert into subjects (subject_id, school_id, name) values ('${u(71)}', '${A}', 'Mathematics');
      insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${u(61)}', '${u(71)}', '${CLASS_5A}');
      insert into students (student_id, school_id, admission_no, name, status, class_id, dob) values
        ('${ARIF}', '${A}', 'A-1', 'Md Arif Khan', 'active', '${CLASS_5A}', '2015-03-05'),
        ('${ASHA}', '${A}', 'A-2', 'Asha Rani', 'active', '${CLASS_5A}', '2015-06-10'),
        ('${DIYA}', '${A}', 'A-3', 'Diya Sharma', 'active', '${CLASS_5A}', '2014-01-20'),
        ('${NEEL}', '${A}', 'A-4', 'Neel Das', 'active', '${CLASS_5A}', '2014-09-09'),
        ('${FARAH}', '${A}', 'A-5', 'Farah Ali', 'active', '${CLASS_6B}', '2013-02-11');
      insert into parents (parent_id, school_id, name, phone) values ('${G_ARIF}', '${A}', 'Rahim Khan', '9000000001'), ('${G_DIYA}', '${A}', 'Meena Sharma', '9000000002'),
        ('${G_FARAH}', '${A}', 'Imran Ali', 'not given'), ('${G_FARAH2}', '${A}', 'Salma Ali', '9000000003'), ('${G_ASHA}', '${A}', 'Ravi Rani', '9000000004'),
        ('${G_NEEL}', '${A}', 'Kiran Das', '9000000005');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ARIF}', '${ARIF}'), ('${A}', '${G_DIYA}', '${DIYA}'), ('${A}', '${G_FARAH}', '${FARAH}'), ('${A}', '${G_FARAH2}', '${FARAH}'), ('${A}', '${G_ASHA}', '${ASHA}'), ('${A}', '${G_NEEL}', '${NEEL}');
    `);
    const words = TEMPLATE_REGISTRY.find((x) => x.name === 'data_check_request')!;
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, $1, 1, 'en', $2, $3, 'utility', $4, 'approved')`, [words.name, words.body.en, [...words.variables], words.staleAfterMinutes]);
    // Diya's family has not agreed to messages; the others have.
    for (const s of [ARIF, FARAH, ASHA, NEEL]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, s]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('every existing child starts as "not given", and only the office records a gender', async () => {
    expect((await db.pg.query(`select distinct gender from students where school_id = $1`, [A])).rows).toEqual([{ gender: 'not_given' }]);
    await expect(as(tara, (c) => c.query(`update students set gender = 'female' where student_id = $1`, [ASHA]))).rejects.toThrow(/only the principal or the school admin/);
    await expect(as(principal, (c) => c.query(`update students set gender = 'girl' where student_id = $1`, [ASHA]))).rejects.toThrow(/students_gender_values/);
    await as(principal, (c) => c.query(`update students set gender = 'female' where student_id = any($1::uuid[])`, [[ASHA, DIYA]]));
    expect((await db.pg.query(`select gender from students where student_id = $1`, [ASHA])).rows[0].gender).toBe('female');
  });

  it('the office types what Aadhaar prints; a mismatch in name, date of birth or gender is found by the free tool’s rule, most serious first', async () => {
    ok(await as(admin, (c) => savePrinted(c, actor(admin), ARIF, { name: 'Mohammad Arif Khan', dob: '2015-05-03', gender: 'male' })));
    ok(await as(admin, (c) => savePrinted(c, actor(admin), ASHA, { name: 'Asha Rani', dob: '2015-06-10', gender: 'female' })));
    ok(await as(principal, (c) => savePrinted(c, actor(principal), DIYA, { name: 'Priya Verma', dob: '2014-01-20', gender: 'female' })));
    ok(await as(principal, (c) => savePrinted(c, actor(principal), FARAH, { name: 'Farha Ali', dob: '', gender: '' })));
    const got = (await list(principal))!;
    expect(got.office).toBe(true);
    expect(got.children.map((c) => [c.name, c.severity])).toEqual([['Diya Sharma', 5], ['Md Arif Khan', 4], ['Farah Ali', 4], ['Asha Rani', 0], ['Neel Das', -1]]);
    const arif = got.children.find((c) => c.student_id === ARIF)!;
    expect(arif.fields.map((f) => [f.field, f.school, f.printed, f.finding])).toEqual([
      ['name', 'Md Arif Khan', 'Mohammad Arif Khan', compareName('Md Arif Khan', 'Mohammad Arif Khan')],
      ['dob', '2015-03-05', '2015-05-03', compareDob('2015-03-05', '2015-05-03')],
      ['gender', 'not_given', 'male', 'missing'],
    ]);
    expect(arif.fields.map((f) => f.finding)).toEqual(['order', 'swapped', 'missing']);
    expect(got.children.find((c) => c.student_id === FARAH)!.fields.map((f) => f.finding)).toEqual(['spelling', 'missing', 'missing']);
    expect(arif.printed).toMatchObject({ typed_by: 'Asif Admin' });
    expect(arif.guardians).toEqual([{ parent_id: G_ARIF, name: 'Rahim Khan', last4: '0001' }]);
    expect(got.counts).toEqual({ total: 5, typed: 4, attention: 3, open: 0, answered: 0 });
    // The class filter.
    expect((await list(principal, CLASS_6B))!.children.map((c) => c.name)).toEqual(['Farah Ali']);
    // Typing again replaces what was typed, in the new typist's name; it is audited without the values.
    ok(await as(principal, (c) => savePrinted(c, actor(principal), FARAH, { name: 'Farha Ali', dob: '2013-02-11', gender: '' })));
    expect((await db.pg.query(`select typed_by, printed_dob::text as dob from student_id_as_printed where student_id = $1`, [FARAH])).rows[0]).toEqual({ typed_by: PRINCIPAL, dob: '2013-02-11' });
    const audit = (await db.pg.query(`select actor_user_id, before_state, after_state from audit_log where event_action = 'student.id_as_printed_saved' and target_id = $1 order by created_at, audit_id`, [FARAH])).rows;
    expect(audit.map((r: { after_state: unknown }) => r.after_state)).toEqual([{ typed: ['name'] }, { typed: ['name', 'dob'] }]);
    expect(JSON.stringify(audit)).not.toContain('Farha');
  });

  it('a twelve-digit number is refused by the app and by the database, in every column that holds words', async () => {
    for (const name of ['123456789012', '1234 5678 9012', '1234-5678-9012', '१२३४ ५६७८ ९०१२', 'Neel 1234 5678 9012']) {
      expect(await as(admin, (c) => savePrinted(c, actor(admin), NEEL, { name, dob: '', gender: '' }))).toEqual({ ok: false, reason: 'aadhaar_number' });
      await expect(as(admin, (c) => c.query(`insert into student_id_as_printed (school_id, student_id, printed_name, typed_by) values ($1, $2, $3, $4)`, [A, NEEL, name, ADMIN]))).rejects.toThrow(/student_id_as_printed_no_aadhaar_number/);
    }
    await expect(as(admin, (c) => c.query(`update student_id_as_printed set printed_name = 'Asha 123456789012', typed_by = $2 where student_id = $1`, [ASHA, ADMIN]))).rejects.toThrow(/no_aadhaar_number/);
    for (const col of ['school_value', 'printed_value']) {
      await expect(as(admin, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, ${col}, finding, parent_id, asked_by) values ($1, $2, 'name', '1234 5678 9012', 'different', $3, $4)`, [A, ASHA, G_ASHA, ADMIN]))).rejects.toThrow(/data_check_requests_no_aadhaar_number/);
    }
    expect((await db.pg.query(`select count(*)::int as n from student_id_as_printed where student_id = $1`, [NEEL])).rows[0].n).toBe(0);
    expect((await db.pg.query(`select count(*)::int as n from student_id_as_printed where printed_name ~ '[0-9]'`)).rows[0].n).toBe(0);
  });

  it('the class teacher sees their own class only, and changes nothing; another teacher, the accountant, the coordinator and another school see none', async () => {
    const mine = (await list(tara))!;
    expect(mine.office).toBe(false);
    expect(mine.classes).toEqual([{ class_id: CLASS_5A, name: '5-A' }]);
    expect(mine.children.map((c) => c.name)).toEqual(['Diya Sharma', 'Md Arif Khan', 'Asha Rani', 'Neel Das']);
    expect(mine.children.every((c) => c.guardians.length === 0)).toBe(true);
    expect((await list(tarun))!.children.map((c) => c.name)).toEqual(['Farah Ali']);
    expect((await list(tara, CLASS_6B))!.children).toEqual([]);
    // A subject teacher of 5-A is not its class teacher.
    expect((await list(tina))!.children).toEqual([]);
    expect(await as(tina, (c) => c.query(`select count(*)::int as n from student_id_as_printed`))).toMatchObject({ rows: [{ n: 0 }] });
    expect(await list(accountant)).toBeNull();
    expect(await list(coordinator)).toBeNull();
    for (const who of [accountant, coordinator, otherSchool]) {
      for (const table of ['student_id_as_printed', 'data_check_requests']) expect((await sql(who, `select count(*)::int as n from ${table}`)).rows[0].n, `${who.role} ${table}`).toBe(0);
    }
    expect((await sql(tara, `select student_id from student_id_as_printed order by student_id`)).rows.map((r: { student_id: string }) => r.student_id)).toEqual([ARIF, ASHA, DIYA]);
    // Directly in the database, a teacher and the accountant write nothing.
    await expect(as(tara, (c) => c.query(`insert into student_id_as_printed (school_id, student_id, printed_name, typed_by) values ($1, $2, 'Neel Das', $3)`, [A, NEEL, TARA]))).rejects.toThrow(/row-level security/);
    expect((await sql(tara, `update student_id_as_printed set printed_name = 'Changed', typed_by = $2 where student_id = $1`, [ARIF, TARA])).rowCount).toBe(0);
    await expect(as(accountant, (c) => c.query(`insert into student_id_as_printed (school_id, student_id, printed_name, typed_by) values ($1, $2, 'Neel Das', $3)`, [A, NEEL, ACCOUNTANT]))).rejects.toThrow(/row-level security/);
    await expect(as(tara, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, finding, parent_id, asked_by) values ($1, $2, 'name', 'different', $3, $4)`, [A, DIYA, G_DIYA, TARA]))).rejects.toThrow(/row-level security/);
    // The office types in its own name only.
    await expect(as(admin, (c) => c.query(`insert into student_id_as_printed (school_id, student_id, printed_name, typed_by) values ($1, $2, 'Neel Das', $3)`, [A, NEEL, PRINCIPAL]))).rejects.toThrow(/row-level security/);
    // The app asks the same roles first.
    expect(await as(tara, (c) => savePrinted(c, actor(tara), NEEL, { name: 'Neel Das', dob: '', gender: '' }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(tara, (c) => askParent(c, queue, actor(tara), DIYA, { parentId: G_DIYA, fields: ['name'] }))).toEqual({ ok: false, reason: 'not_allowed' });
    // The platform role holds nothing on these tables.
    await expect(platform((c) => c.query(`select count(*) from data_check_requests`))).rejects.toThrow(/permission denied/);
    await expect(platform((c) => c.query(`select count(*) from student_id_as_printed`))).rejects.toThrow(/permission denied/);
  });

  let ARIF_LOG = '';
  it('"Ask the parent": a draft a person reads, then the message goes only through the send-gate, and the request is kept', async () => {
    const before = (await db.pg.query(`select count(*)::int as n from communication_log`)).rows[0].n;
    const draft = ok(await as(admin, (c) => draftRequest(c, actor(admin), ARIF, { parentId: G_ARIF, fields: ['name', 'dob', 'gender'] })));
    expect(draft.hasNumber).toBe(true);
    expect(draft.text).toBe('School A: For UDISE+ and APAAR, Md Arif Khan’s details in the school record must match Aadhaar. These differ: Name: school record Md Arif Khan, Aadhaar Mohammad Arif Khan; Date of birth: school record 05-03-2015, Aadhaar 03-05-2015; Gender: school record Not recorded, Aadhaar Male. Please reply here with the correct details, or tell the school office. Please do not send the Aadhaar number.');
    // A draft sends nothing and keeps nothing.
    expect((await db.pg.query(`select count(*)::int as n from communication_log`)).rows[0].n).toBe(before);
    expect(await requestsOf(ARIF)).toEqual([]);
    // What cannot be asked.
    expect(await as(admin, (c) => askParent(c, queue, actor(admin), ASHA, { parentId: G_ASHA, fields: ['name'] }))).toEqual({ ok: false, reason: 'nothing_to_ask' });
    expect(await as(admin, (c) => askParent(c, queue, actor(admin), NEEL, { parentId: G_ARIF, fields: ['name'] }))).toEqual({ ok: false, reason: 'not_typed' });
    expect(await as(admin, (c) => askParent(c, queue, actor(admin), ARIF, { parentId: G_DIYA, fields: ['name'] }))).toEqual({ ok: false, reason: 'guardian' });
    expect(await as(admin, (c) => askParent(c, queue, actor(admin), ARIF, { parentId: G_ARIF, fields: [] }))).toEqual({ ok: false, reason: 'fields' });

    const asked = ok(await as(admin, (c) => askParent(c, queue, actor(admin), ARIF, { parentId: G_ARIF, fields: ['name', 'dob', 'gender'] })));
    expect(asked.message).toBe('queued');
    expect(asked.requestIds).toHaveLength(3);
    const rows = await requestsOf(ARIF);
    expect(rows.map((r: { field: string; finding: string }) => [r.field, r.finding])).toEqual([['dob', 'swapped'], ['gender', 'missing'], ['name', 'order']]);
    ARIF_LOG = rows[0].message_log_id;
    expect(new Set(rows.map((r: { message_log_id: string }) => r.message_log_id)).size).toBe(1);
    // One message, written by the send-gate: this child's, to this guardian's number, in the approved words.
    expect(await logOf(ARIF_LOG)).toMatchObject({ template_name: 'data_check_request', status: 'queued', to_phone: '+919000000001', student_id: ARIF, parent_id: G_ARIF, template_params: { child: 'Md Arif Khan' } });
    expect((await db.pg.query(`select count(*)::int as n from jobs where type = 'whatsapp.send'`)).rows[0].n).toBe(1);
    expect((await db.pg.query(`select actor_user_id, after_state from audit_log where event_action = 'student.data_check_asked' and target_id = $1`, [ARIF])).rows[0]).toMatchObject({ actor_user_id: ADMIN, after_state: { fields: ['name', 'dob', 'gender'], message: 'queued' } });
    // One open request a child and detail.
    expect(await as(admin, (c) => askParent(c, queue, actor(admin), ARIF, { parentId: G_ARIF, fields: ['name'] }))).toEqual({ ok: false, reason: 'already_open' });
  });

  it('the database keeps only the send-gate’s own message with a request', async () => {
    // A made-up message id, or a message that is not this request's words, is refused.
    await expect(as(admin, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, finding, parent_id, message_log_id, asked_by) values ($1, $2, 'name', 'different', $3, gen_random_uuid(), $4)`, [A, DIYA, G_DIYA, ADMIN]))).rejects.toThrow(/send-gate/);
    const other = (await db.pg.query(`insert into communication_log (school_id, channel, template_name, status, student_id, parent_id) values ($1, 'whatsapp', 'class_notice', 'queued', $2, $3) returning log_id`, [A, DIYA, G_DIYA])).rows[0].log_id;
    await expect(as(admin, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, finding, parent_id, message_log_id, asked_by) values ($1, $2, 'name', 'different', $3, $4, $5)`, [A, DIYA, G_DIYA, other, ADMIN]))).rejects.toThrow(/send-gate/);
    // Arif's message is not Diya's.
    await expect(as(admin, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, finding, parent_id, message_log_id, asked_by) values ($1, $2, 'name', 'different', $3, $4, $5)`, [A, DIYA, G_DIYA, ARIF_LOG, ADMIN]))).rejects.toThrow(/send-gate/);
    // A guardian of another child is refused.
    await expect(as(admin, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, finding, parent_id, asked_by) values ($1, $2, 'name', 'different', $3, $4)`, [A, DIYA, G_ARIF, ADMIN]))).rejects.toThrow(/guardian of the child/);
    // An exact match is never asked about; a request starts open.
    await expect(as(admin, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, finding, parent_id, asked_by) values ($1, $2, 'name', 'exact', $3, $4)`, [A, DIYA, G_DIYA, ADMIN]))).rejects.toThrow(/data_check_requests_finding/);
    await expect(as(admin, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, finding, parent_id, asked_by, outcome, corrected_to, decided_by, decided_at) values ($1, $2, 'name', 'different', $3, $4, 'corrected', 'x', $4, now())`, [A, DIYA, G_DIYA, ADMIN]))).rejects.toThrow(/starts open/);
    // A second open request about the same detail.
    await expect(as(admin, (c) => c.query(`insert into data_check_requests (school_id, student_id, field, finding, parent_id, asked_by) values ($1, $2, 'name', 'order', $3, $4)`, [A, ARIF, G_ARIF, ADMIN]))).rejects.toThrow(/uq_data_check_requests_open/);
    await db.pg.exec(`set session_replication_role = replica; delete from communication_log where log_id = '${other}'; set session_replication_role = origin;`);
  });

  it('every rule of the send-gate holds: no consent, no budget, quiet hours; without a number nothing is sent, and the request is still kept', async () => {
    // Diya's family has not agreed: the message is held, recorded, and the request keeps it.
    const diya = ok(await as(principal, (c) => askParent(c, queue, actor(principal), DIYA, { parentId: G_DIYA, fields: ['name'] })));
    expect(diya.message).toBe('blocked_consent');
    const [d] = await requestsOf(DIYA);
    expect(await logOf(d.message_log_id)).toMatchObject({ template_name: 'data_check_request', status: 'blocked_consent' });
    // Farah's first guardian has no WhatsApp number: no message, the request is kept for the office to ask in person.
    const draft = ok(await as(admin, (c) => draftRequest(c, actor(admin), FARAH, { parentId: G_FARAH, fields: ['name'] })));
    expect(draft.hasNumber).toBe(false);
    const farah = ok(await as(admin, (c) => askParent(c, queue, actor(admin), FARAH, { parentId: G_FARAH, fields: ['name'] })));
    expect(farah.message).toBe('no_number');
    expect((await requestsOf(FARAH))[0].message_log_id).toBeNull();
    // With no budget set, the gate holds it.
    ok(await as(admin, (c) => savePrinted(c, actor(admin), NEEL, { name: 'Neel Dass', dob: '2014-09-19', gender: 'male' })));
    await db.pg.query(`update schools set monthly_budget_paise = null where school_id = $1`, [A]);
    const noBudget = await as(admin, (c) => askParent(c, queue, actor(admin), NEEL, { parentId: G_NEEL, fields: ['dob'] }));
    await db.pg.query(`update schools set monthly_budget_paise = 100000 where school_id = $1`, [A]);
    expect(ok(noBudget).message).toBe('blocked_budget');
    expect(await logOf((await requestsOf(NEEL))[0].message_log_id)).toMatchObject({ status: 'blocked_budget' });
    // In quiet hours it waits for them to end; it is not dropped.
    const ist = new Date(Date.now() + 5.5 * 3600_000);
    const hm = (d: Date) => d.toISOString().slice(11, 16);
    await db.pg.query(`update schools set quiet_hours_start = $2, quiet_hours_end = $3 where school_id = $1`, [A, hm(new Date(ist.getTime() - 3600_000)), hm(new Date(ist.getTime() + 3600_000))]);
    const quiet = await as(admin, (c) => askParent(c, queue, actor(admin), FARAH, { parentId: G_FARAH2, fields: ['gender'] }));
    await db.pg.query(`update schools set quiet_hours_start = '00:00', quiet_hours_end = '00:00' where school_id = $1`, [A]);
    expect(ok(quiet).message).toBe('queued');
    const held = await logOf((await requestsOf(FARAH)).find((r: { field: string }) => r.field === 'gender').message_log_id);
    expect(new Date(held.not_before).getTime()).toBeGreaterThan(Date.now() + 30 * 60_000);
  });

  let REPLY = '';
  it('the guardian’s reply in that conversation is kept with the request; nothing before the message went, no STOP and no other number', async () => {
    // A message from Arif's guardian before the request has gone is not its reply.
    await writes('+919000000001', 'Hello, is school open tomorrow?');
    expect((await requestsOf(ARIF)).every((r: { reply_message_id: string | null }) => r.reply_message_id === null)).toBe(true);
    // The job runner sends it, through the gate, to the stand-in only.
    expect((await deliverQueued({ platform, queue, provider: standIn }, ARIF_LOG)).status).toBe('sent');
    // Another guardian writes: not Arif's reply.
    await writes('+919000000004', 'Asha will be late today.');
    expect((await requestsOf(ARIF)).every((r: { reply_message_id: string | null }) => r.reply_message_id === null)).toBe(true);
    await writes('+919000000001', 'The Aadhaar is right: Mohammad Arif Khan, born 3 May 2015. His Aadhaar is 1234 5678 9012.');
    const rows = await requestsOf(ARIF);
    REPLY = rows[0].reply_message_id;
    expect(REPLY).toBeTruthy();
    expect(rows.every((r: { reply_message_id: string; reply_at: string | null }) => r.reply_message_id === REPLY && r.reply_at !== null)).toBe(true);
    // A later message does not replace the reply kept.
    await writes('+919000000001', 'Thank you');
    expect((await requestsOf(ARIF)).every((r: { reply_message_id: string }) => r.reply_message_id === REPLY)).toBe(true);
    // The office reads the reply with the request, with the twelve digits hidden; nothing of the number is stored by the data check.
    const arif = (await list(admin))!.children.find((c) => c.student_id === ARIF)!;
    expect(arif.requests.map((r) => r.reply_text)).toEqual(Array(3).fill('The Aadhaar is right: Mohammad Arif Khan, born 3 May 2015. His Aadhaar is •••• •••• ••••.'));
    expect(arif.requests[0].message_status).toBe('sent');
    expect((await db.pg.query(`select count(*)::int as n from data_check_requests r where concat_ws(' ', r.school_value, r.printed_value, r.office_note, r.corrected_to, r.closing_note) ~ '[0-9]{12}'`)).rows[0].n).toBe(0);
    // The class teacher reads the same reply for her own class's child.
    expect((await list(tara))!.children.find((c) => c.student_id === ARIF)!.requests[0].reply_text).toContain('Mohammad Arif Khan');
    // A STOP is not a reply. Farah's second guardian: her request's message goes, she writes STOP, then answers.
    const farahDob = (await requestsOf(FARAH)).find((r: { field: string }) => r.field === 'gender');
    expect((await deliverQueued({ platform, queue, provider: standIn, now: () => new Date(Date.now() + 2 * 3600_000) }, farahDob.message_log_id)).status).toBe('sent');
    await writes('+919000000003', 'STOP');
    expect((await requestsOf(FARAH)).find((r: { field: string }) => r.field === 'gender').reply_message_id).toBeNull();
    await writes('+919000000003', 'Farah is a girl, as Aadhaar says.');
    expect((await requestsOf(FARAH)).find((r: { field: string }) => r.field === 'gender').reply_message_id).not.toBeNull();
    // The request asked without a number, and the one the gate held for consent, have no reply to link.
    expect((await requestsOf(FARAH)).find((r: { field: string }) => r.field === 'name').reply_message_id).toBeNull();
    // Only the database links a reply: the office cannot set or change it.
    await expect(as(admin, (c) => c.query(`update data_check_requests set reply_message_id = $2, reply_at = now() where request_id = $1`, [farahDob.request_id, REPLY]))).rejects.toThrow(/linked by the database/);
    await expect(as(admin, (c) => c.query(`update data_check_requests set reply_message_id = null, reply_at = null where student_id = $1`, [ARIF]))).rejects.toThrow(/linked by the database/);
  });

  it('an answer that came another way is attached once; the office corrects the record (audited) or closes the request; a decided request never changes', async () => {
    const [diya] = await requestsOf(DIYA);
    expect(await as(admin, (c) => noteAnswer(c, actor(admin), diya.request_id, 'Her number is 123456789012'))).toEqual({ ok: false, reason: 'aadhaar_number' });
    expect(await as(tara, (c) => noteAnswer(c, actor(tara), diya.request_id, 'The mother came in'))).toEqual({ ok: false, reason: 'not_allowed' });
    ok(await as(admin, (c) => noteAnswer(c, actor(admin), diya.request_id, 'The mother came in: the school record is right, Aadhaar will be corrected.')));
    expect(await as(admin, (c) => noteAnswer(c, actor(admin), diya.request_id, 'Again'))).toEqual({ ok: false, reason: 'noted_already' });
    await expect(as(admin, (c) => c.query(`update data_check_requests set office_note = 'Changed', office_note_by = $2 where request_id = $1`, [diya.request_id, ADMIN]))).rejects.toThrow(/attached once/);
    await expect(as(principal, (c) => c.query(`update data_check_requests set office_note = '1234 5678 9012', office_note_by = $2 where student_id = $1 and field = 'gender'`, [ARIF, PRINCIPAL]))).rejects.toThrow(/no_aadhaar_number/);
    // My Day: the children whose answers wait for the office (Arif's one reply about three details, Diya, Farah).
    const card = TODAY_PROVIDERS.find((p) => p.type === 'data-check-answers')!;
    const ctx = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never, sunday: false });
    expect(await as(principal, (c) => card.load(c, ctx(principal)))).toEqual([{ id: 'data-check-answers', type: 'data-check-answers', moduleId: 'students', state: 'todo', count: 3, href: '/app/students/data-check' }]);
    expect(card.roles).toEqual(['principal', 'school_admin']);

    const arif = Object.fromEntries((await requestsOf(ARIF)).map((r: { field: string; request_id: string }) => [r.field, r.request_id]));
    expect(await as(admin, (c) => correctRecord(c, actor(admin), arif.name, '1234 5678 9012'))).toEqual({ ok: false, reason: 'aadhaar_number' });
    expect(await as(admin, (c) => correctRecord(c, actor(admin), arif.gender, 'not_given'))).toEqual({ ok: false, reason: 'value' });
    expect(await as(admin, (c) => correctRecord(c, actor(admin), arif.dob, '2099-01-01'))).toEqual({ ok: false, reason: 'value' });
    expect(await as(tara, (c) => correctRecord(c, actor(tara), arif.name, 'Mohammad Arif Khan'))).toEqual({ ok: false, reason: 'not_allowed' });
    ok(await as(admin, (c) => correctRecord(c, actor(admin), arif.name, 'Mohammad Arif Khan')));
    ok(await as(principal, (c) => correctRecord(c, actor(principal), arif.gender, 'male')));
    expect(await as(admin, (c) => closeRequest(c, actor(admin), arif.dob, '   '))).toEqual({ ok: false, reason: 'value' });
    ok(await as(admin, (c) => closeRequest(c, actor(admin), arif.dob, 'The school record is right; the family will correct Aadhaar with UIDAI.')));
    expect((await db.pg.query(`select name, gender, dob::text as dob from students where student_id = $1`, [ARIF])).rows[0]).toEqual({ name: 'Mohammad Arif Khan', gender: 'male', dob: '2015-03-05' });
    expect((await requestsOf(ARIF)).map((r: { field: string; outcome: string; corrected_to: string | null }) => [r.field, r.outcome, r.corrected_to])).toEqual([['dob', 'closed', null], ['gender', 'corrected', 'male'], ['name', 'corrected', 'Mohammad Arif Khan']]);
    const audit = (await db.pg.query(`select actor_user_id, before_state, after_state from audit_log where event_action = 'student.data_check_corrected' and target_id = $1 order by created_at, audit_id`, [ARIF])).rows;
    // The detail and the request, never a value (C224): the values are on the request, which the erasure removes.
    expect(audit).toEqual([
      { actor_user_id: ADMIN, before_state: null, after_state: { field: 'name', requestId: arif.name } },
      { actor_user_id: PRINCIPAL, before_state: null, after_state: { field: 'gender', requestId: arif.gender } },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/Arif|male/);
    expect((await db.pg.query(`select count(*)::int as n from audit_log where event_action = 'student.data_check_closed' and target_id = $1`, [arif.dob])).rows[0].n).toBe(1);
    // Now the name and gender match; the date of birth still differs, and can be asked about again.
    const now = (await list(admin))!.children.find((c) => c.student_id === ARIF)!;
    expect(now.fields.map((f) => f.finding)).toEqual(['exact', 'swapped', 'exact']);
    // A decided request does not change, in the app or in the database.
    expect(await as(admin, (c) => correctRecord(c, actor(admin), arif.name, 'Someone Else'))).toEqual({ ok: false, reason: 'decided' });
    expect(await as(admin, (c) => closeRequest(c, actor(admin), arif.gender, 'No'))).toEqual({ ok: false, reason: 'decided' });
    await expect(as(admin, (c) => c.query(`update data_check_requests set closing_note = 'x' where request_id = $1`, [arif.dob]))).rejects.toThrow(/decided request does not change/);
    await expect(as(admin, (c) => c.query(`update data_check_requests set printed_value = 'x' where request_id = $1`, [diya.request_id]))).rejects.toThrow(/never changed/);
    // Decided in one's own name only, and never removed.
    await expect(as(admin, (c) => c.query(`update data_check_requests set outcome = 'closed', closing_note = 'x', decided_by = $2, decided_at = now() where request_id = $1`, [diya.request_id, PRINCIPAL]))).rejects.toThrow(/own name/);
    await expect(as(admin, (c) => c.query(`delete from data_check_requests where request_id = $1`, [diya.request_id]))).rejects.toThrow(/permission denied/);
    await expect(as(admin, (c) => c.query(`delete from student_id_as_printed where student_id = $1`, [DIYA]))).rejects.toThrow(/permission denied/);
    // The class teacher reads the outcome, and the accountant still reads nothing.
    const seen = (await list(tara))!.children.find((c) => c.student_id === ARIF)!;
    expect(seen.requests.map((r) => [r.field, r.outcome, r.decided_by])).toEqual(expect.arrayContaining([['name', 'corrected', 'Asif Admin'], ['gender', 'corrected', 'Priya Principal'], ['dob', 'closed', 'Asif Admin']]));
    expect((await sql(accountant, `select count(*)::int as n from data_check_requests`)).rows[0].n).toBe(0);
  });
  it('lead, at integration: an erasure removes what was typed from the child’s Aadhaar and every request about the child; nobody else may call it', async () => {
    const count = async (table: string, student: string) => (await db.pg.query(`select count(*)::int as n from ${table} where student_id = $1`, [student])).rows[0].n;
    const asked = await count('data_check_requests', ARIF);
    expect([await count('student_id_as_printed', ARIF), asked > 0]).toEqual([1, true]);
    const erase = (who: Who) => as(who, async (c) => (await c.query(`select public.erase_student_data_check($1) as n`, [ARIF])).rows[0].n);
    for (const who of [tara, tina, accountant, coordinator]) await expect(erase(who), who.role).rejects.toThrow(/principal or the school admin/);
    // Another school's principal reaches nothing of school A's.
    expect(await erase(otherSchool)).toBe(0);
    expect(await count('student_id_as_printed', ARIF)).toBe(1);
    // The erasure itself, as the route carries it out.
    const done = await as(principal, (c) => pseudonymizeStudent(c, A, ARIF));
    expect(done.dataCheckRowsErased).toBe(asked + 1);
    expect([await count('student_id_as_printed', ARIF), await count('data_check_requests', ARIF)]).toEqual([0, 0]);
    expect((await db.pg.query(`select gender, dob from students where student_id = $1`, [ARIF])).rows[0]).toEqual({ gender: 'not_given', dob: null });
    // Another child's are kept.
    expect(await count('data_check_requests', DIYA)).toBeGreaterThan(0);
  });

  it('C224: the erasure also blanks the words of the messages that asked (the child’s name and details), and only those; nobody else can', async () => {
    // Arif's message was sent (above): its words are gone; the row (to whom, when, its state) is kept.
    expect(await logOf(ARIF_LOG)).toMatchObject({ template_name: 'data_check_request', status: 'sent', to_phone: '+919000000001', student_id: ARIF, template_params: null });
    // Farah's requests were not erased: the message sent about her keeps its words.
    const farahLog = (await requestsOf(FARAH)).find((r: { field: string }) => r.field === 'gender').message_log_id;
    expect(await logOf(farahLog)).toMatchObject({ status: 'sent', template_params: { child: 'Farah Ali' } });
    // What a sent message was still never changes for the app's role or the platform role.
    expect((await as<{ rowCount: number }>(principal, (c) => c.query(`update communication_log set template_params = null where log_id = $1`, [farahLog]))).rowCount).toBe(0);
    await expect(platform((c) => c.query(`update communication_log set template_params = null where log_id = $1`, [farahLog]))).rejects.toThrow(/what a message was never changes/);
    await expect(platform((c) => c.query(`update communication_log set template_params = '{"child": "Someone"}' where log_id = $1`, [ARIF_LOG]))).rejects.toThrow(/what a message was never changes/);
    // Another school's principal reaches none of school A's messages.
    expect(await as(otherSchool, async (c) => (await c.query(`select public.erase_student_data_check($1) as n`, [FARAH])).rows[0].n)).toBe(0);
    expect((await logOf(farahLog)).template_params).toMatchObject({ child: 'Farah Ali' });
  });
  it('lead, at integration: a message still queued when its request is erased is failed, so it never goes out with its words gone', async () => {
    // An earlier test spent the month's budget and moved quiet hours: give the school room to queue again.
    await db.pg.query(`update schools set monthly_budget_paise = 100000000, quiet_hours_start = '00:00', quiet_hours_end = '00:00' where school_id = $1`, [A]);
    ok(await as(admin, (c) => savePrinted(c, actor(admin), NEEL, { name: 'Neel Kumar Das', dob: '', gender: '' })));
    const asked = ok(await as(admin, (c) => askParent(c, queue, actor(admin), NEEL, { parentId: G_NEEL, fields: ['name'] })));
    expect(asked.message).toBe('queued');
    const log = (await requestsOf(NEEL)).find((r: { field: string }) => r.field === 'name').message_log_id;
    expect(await logOf(log)).toMatchObject({ status: 'queued', template_params: { child: 'Neel Das' } });
    // The printed row and Neel's two requests (the date of birth, held earlier for the budget, and this name).
    expect(await as(principal, async (c) => (await c.query(`select public.erase_student_data_check($1) as n`, [NEEL])).rows[0].n)).toBe(3);
    expect(await logOf(log)).toMatchObject({ status: 'failed', template_params: null });
    expect((await db.pg.query(`select failure_code, failed_at is not null as failed from communication_log where log_id = $1`, [log])).rows[0]).toEqual({ failure_code: 'erased', failed: true });
  });
});
