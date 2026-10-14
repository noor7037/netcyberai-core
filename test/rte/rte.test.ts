import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { pseudonymizeStudent } from '@/lib/consent/dsr';
import { raiseDues } from '@/lib/fees/dues';
import { addHead, addStructureVersion, setHeadRteCovered } from '@/lib/fees/structures';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { buildClaim } from '@/lib/free-tools/rte-claim';
import { ageOf } from '@/lib/rte/ageing';
import { actOnClaim, addEvidence, loadDesk, raiseClaims, removeEvidence, typeRate, unpaidPastFirstBucket, type ClaimAction, type Desk, type DeskChild } from '@/lib/rte/desk';
import { claimFor, dueOf, headsCounted, lowerOfRateAndFee, minorToPlainRupees, typedText } from '@/lib/rte/rules';
import { rteSheetCsv } from '@/lib/rte/sheet-csv';
import { monthsOf, yearFeeMinor } from '@/lib/rte/year-fee';
import { indiaDate } from '@/lib/time/india';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// The RTE claim desk (docs/28 slice 10c, C223) and its close-out (C225, C223-A answer 4): the claim equals
// min(rate, fee) on the fee heads the school's setting counts; the state pays in parts, a short payment is written
// off with a note, a written-off claim is reopened by the principal or the school admin only; a past year's claim
// takes the class of that year; an erasure clears the notes and keeps the money; the roles are held by the
// database; no audit row holds free text. Every name and figure is made up. The two school years are the one today
// falls in and the one before, so the database's own "today" always agrees with the test.

const ROOT = path.resolve(__dirname, '../..');
const TODAY = indiaDate();
const CY = Number(TODAY.slice(5, 7)) >= 4 ? Number(TODAY.slice(0, 4)) : Number(TODAY.slice(0, 4)) - 1;
const yy = (y: number) => String(y % 100).padStart(2, '0');
const THIS = { start: `${CY}-04-01`, end: `${CY + 1}-03-31`, label: `${CY}-${yy(CY + 1)}` };
const LAST = { start: `${CY - 1}-04-01`, end: `${CY}-03-31`, label: `${CY - 1}-${yy(CY)}` };
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

describe('the rules, with no database', () => {
  it('the claim rule is the app’s, and the website’s free tool gives the same answer by importing it', () => {
    expect(lowerOfRateAndFee(15000, 20000)).toEqual({ claim: 15000, applied: 'rate' });
    expect(lowerOfRateAndFee(15000, 12000.5)).toEqual({ claim: 12000.5, applied: 'fee' });
    expect(lowerOfRateAndFee(15000, 15000)).toEqual({ claim: 15000, applied: 'equal' });
    expect(claimFor(1250000, 1935150)).toEqual({ amountMinor: 1250000, applied: 'rate' });
    expect(claimFor(1250001, 1250000)).toEqual({ amountMinor: 1250000, applied: 'fee' });
    expect(claimFor(1250000, 0)).toEqual({ amountMinor: 0, applied: 'fee' });
    expect(() => claimFor(0, 100)).toThrow();
    expect(() => claimFor(10.5, 100)).toThrow();
    const tool = buildClaim({ year: THIS.label, rate: '12,500', fee: '19351.50', classFees: [], documents: [], ageing: [] }, [{ name: 'Asha', cls: '5-A', admitted: '', docs: [] }], { y: CY, m: 10, d: 14 });
    expect([Math.round(tool.claims[0].claim * 100), tool.claims[0].applied]).toEqual([claimFor(1250000, 1935150).amountMinor, 'rate']);
  });

  it('one rule in one place: the claim and the Aadhaar rule are pure, and the website’s free tools import them', () => {
    const imports = (file: string) => [...readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports('src/lib/rte/rules.ts')).toEqual(['@/lib/privacy/aadhaar']);
    expect(imports('src/lib/privacy/aadhaar.ts')).toEqual([]);
    expect(imports('src/lib/free-tools/rte-claim.ts')).toContain('@/lib/rte/rules');
    expect(imports('src/lib/free-tools/student-data-check.ts')).toContain('@/lib/privacy/aadhaar');
    expect(readFileSync(path.join(ROOT, 'src/lib/free-tools/rte-claim.ts'), 'utf8')).not.toMatch(/Math\.min\(rate, fee\)/);
  });

  it('the year’s fee: the class’s structure month by month, in the heads that count; a one-time fee never counts', () => {
    const session = { label: '2026-27', start_date: '2026-04-01', end_date: '2027-03-31' };
    expect(monthsOf(session)).toHaveLength(12);
    expect([monthsOf(session)[0], monthsOf(session)[11]]).toEqual(['2026-04', '2027-03']);
    const v1 = { effective_from: '2026-04-01', items: [{ head_id: 'tuition', amount_minor: 150050, frequency: 'monthly' as const }, { head_id: 'transport', amount_minor: 80000, frequency: 'monthly' as const }, { head_id: 'admission', amount_minor: 500000, frequency: 'one_time' as const }, { head_id: 'exam', amount_minor: 30000, frequency: 'quarterly' as const }, { head_id: 'annual', amount_minor: 200000, frequency: 'annual' as const }] };
    const v2 = { ...v1, effective_from: '2026-07-01', items: v1.items.map((i) => (i.head_id === 'tuition' ? { ...i, amount_minor: 165000 } : i)) };
    expect(yearFeeMinor([v2, v1], new Set(['tuition', 'admission', 'exam', 'annual']), session)).toBe(450150 + 1485000 + 120000 + 200000);
    expect(yearFeeMinor([{ ...v1, effective_from: '2026-07-01' }], new Set(['tuition']), session)).toBe(9 * 150050);
    expect(yearFeeMinor([], new Set(['tuition']), session)).toBeNull();
    // The school's setting: every recurring head an RTE child does not pay, or only those every child pays.
    const heads = [
      { head_id: 'tuition', rte_covered: true, is_mandatory: true },
      { head_id: 'activity', rte_covered: true, is_mandatory: false },
      { head_id: 'transport', rte_covered: false, is_mandatory: false },
    ];
    expect([...headsCounted(heads, 'rte_covered')]).toEqual(['tuition', 'activity']);
    expect([...headsCounted(heads, 'rte_covered_mandatory')]).toEqual(['tuition']);
  });

  it('a claim ages by the free tool’s buckets on what is still due; nothing due is in none', () => {
    expect(ageOf('2025-06-01', '2025-08-30', 100)).toEqual({ days: 90, bucket: 'upTo90' });
    expect(ageOf('2025-06-01', '2025-08-31', 100)).toEqual({ days: 91, bucket: 'upTo180' });
    expect(ageOf('2025-06-01', '2026-06-02', 100)).toEqual({ days: 366, bucket: 'overYear' });
    expect(ageOf('2025-06-01', '2026-06-02', 0)).toEqual({ days: 366, bucket: 'paid' });
    expect([dueOf('raised', 1300000, 500000), dueOf('paid', 1300000, 1300000), dueOf('written_off', 1300000, 500000)]).toEqual([800000, 0, 0]);
  });

  it('every free-text field of the desk takes the one Aadhaar rule: a longer UTR passes, a twelve-digit IMPS reference is refused', () => {
    expect(typedText('UTR 1234567890123456', 1, 80)).toEqual({ ok: true, text: 'UTR 1234567890123456' });
    expect(typedText('  PFMS/HR/2026/0042  ', 1, 80)).toEqual({ ok: true, text: 'PFMS/HR/2026/0042' });
    for (const s of ['IMPS 123456789012', '1234 5678 9012', '1234  5678  9012', 'Aadhaar १२३४ ५६७८ ९०१२ seen']) expect(typedText(s, 1, 300), s).toEqual({ ok: false, reason: 'aadhaar' });
    expect(typedText('  ', 1, 80)).toEqual({ ok: false, reason: 'length' });
    expect(minorToPlainRupees(1935150)).toBe('19351.50');
    expect(minorToPlainRupees(5)).toBe('0.05');
  });
});

const A = 'c2250000-0000-4000-8000-000000000001';
const B = 'c2250000-0000-4000-8000-000000000002';
const u = (k: number) => `c2250000-0000-4000-8000-0000000001${String(k).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, ACCOUNTANT, TEACHER, COORDINATOR, PRINCIPAL_B] = [u(1), u(2), u(3), u(4), u(5), u(6)];
const C5 = u(51);
const C6 = u(52);
const Y_LAST = u(61);
const Y_THIS = u(62);
const S = { asha: u(71), bina: u(72), chetan: u(73), dev: u(74), esha: u(75), farah: u(76), gita: u(77) };
const DOC = { ashaBirth: u(81), ashaAadhaar: u(82), chetanBirth: u(83) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const desk = (who: Who, sessionId: string, today = TODAY) => as(who, (c) => loadDesk(c, actor(who), { sessionId, today })) as Promise<Desk>;
const child = (d: Desk, id: string) => d.children.find((c) => c.student_id === id) as DeskChild;
const act = (who: Who, claimId: string, input: ClaimAction) => as(who, (c) => actOnClaim(c, actor(who), claimId, input));
const pay = (who: Who, claimId: string, amount: string, receivedOn: string, reference: string) => act(who, claimId, { action: 'receipt', amount, receivedOn, reference });
const rates: Record<string, string> = {};
const claimOf = async (studentId: string, sessionId: string) => (await db.pg.query(`select *, paid_on::text as paid_on_text from rte_claims where student_id = $1 and session_id = $2`, [studentId, sessionId])).rows[0];
const receiptsOf = async (claimId: string) => (await db.pg.query(`select amount_minor::int as amount, received_on::text as on, reference, reverses, reversal_reason, recorded_by from rte_claim_receipts where claim_id = $1 order by recorded_at, receipt_id`, [claimId])).rows;
const audit = async (action: string) => (await db.pg.query(`select actor_user_id, actor_role, target_id, before_state, after_state from audit_log where event_action = $1 order by audit_id`, [action])).rows;
const claimInsert = `insert into rte_claims (school_id, student_id, session_id, class_id, class_source, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@a.invalid', 'school_admin', 'Asif Admin'),
        ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Anil Accountant'), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher'),
        ('${COORDINATOR}', '${A}', 'co@a.invalid', 'academic_coordinator', 'Kiran Coordinator'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values
        ('${Y_LAST}', '${A}', '${LAST.label}', '${LAST.start}', '${LAST.end}', false), ('${Y_THIS}', '${A}', '${THIS.label}', '${THIS.start}', '${THIS.end}', true);
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${TEACHER}'), ('${C6}', '${A}', '6-A', null);
      insert into students (student_id, school_id, admission_no, name, class_id, status, rte_admission, rte_entry_class, rte_admitted_on) values
        ('${S.asha}', '${A}', 'A-1', 'Asha', '${C5}', 'pending_consent', true, '4-A', '${CY - 1}-04-10'),
        ('${S.bina}', '${A}', 'A-2', 'Bina', '${C6}', 'pending_consent', true, '6-A', '${CY}-04-05'),
        ('${S.chetan}', '${A}', 'A-3', 'Chetan', '${C5}', 'pending_consent', false, null, null),
        ('${S.dev}', '${A}', 'A-4', 'Dev', '${C5}', 'pending_consent', true, '5-A', '${CY}-04-20'),
        ('${S.esha}', '${A}', 'A-5', 'Esha', '${C5}', 'pending_consent', true, '4-A', '${CY - 1}-04-12'),
        ('${S.farah}', '${A}', 'A-6', 'Farah', null, 'pending_consent', true, '1-A', '${CY}-04-02'),
        ('${S.gita}', '${A}', 'A-7', 'Gita', '${C5}', 'pending_consent', true, '4-A', '${CY - 1}-04-15');
      alter table students disable trigger user;
      update students set status = 'active' where student_id in ('${S.asha}', '${S.chetan}', '${S.dev}', '${S.gita}');
      update students set status = 'transferred' where student_id = '${S.esha}';
      alter table students enable trigger user;
      insert into captured_documents (document_id, school_id, student_id, doc_type, storage_path, mime_type, size_bytes, uploaded_by) values
        ('${DOC.ashaBirth}', '${A}', '${S.asha}', 'birth_certificate', '${A}/asha/birth.pdf', 'application/pdf', 1000, '${ADMIN}'),
        ('${DOC.ashaAadhaar}', '${A}', '${S.asha}', 'guardian_id', 'discarded:aadhaar', 'image/jpeg', 0, '${ADMIN}'),
        ('${DOC.chetanBirth}', '${A}', '${S.chetan}', 'birth_certificate', '${A}/chetan/birth.pdf', 'application/pdf', 1000, '${ADMIN}');
    `);
    const head = async (name: string, isMandatory: boolean) => {
      const r = await as(accountant, (c) => addHead(c, actor(accountant), { name, isMandatory }));
      if (!r.ok) throw new Error('head');
      return r.head.head_id;
    };
    // RTE covers the heads every child pays (C162), and here also an optional activity head the school marks.
    const tuition = await head('Tuition', true);
    const transport = await head('Transport', false);
    const admission = await head('Admission', true);
    const activity = await head('Activity', false);
    if (!(await as(accountant, (c) => setHeadRteCovered(c, actor(accountant), activity, true))).ok) throw new Error('activity');
    const structure = async (classId: string, sessionId: string, effectiveFrom: string, items: { headId: string; amountMinor: number; frequency: 'monthly' | 'one_time' }[]) => {
      const r = await as(accountant, (c) => addStructureVersion(c, actor(accountant), { classId, sessionId, effectiveFrom, items }));
      if (!r.ok) throw new Error(`structure: ${r.reason}`);
    };
    // 5-A this year: tuition 1,500.50 a month from April and 1,650 from July; activity 100; transport 800; admission 5,000 once.
    const c5 = (tuitionMinor: number) => [{ headId: tuition, amountMinor: tuitionMinor, frequency: 'monthly' as const }, { headId: transport, amountMinor: 80000, frequency: 'monthly' as const }, { headId: admission, amountMinor: 500000, frequency: 'one_time' as const }, { headId: activity, amountMinor: 10000, frequency: 'monthly' as const }];
    await structure(C5, Y_THIS, THIS.start, c5(150050));
    await structure(C5, Y_THIS, `${CY}-07-01`, c5(165000));
    // 6-A this year: tuition 1,000 a month. Last year: 5-A tuition 1,400 a month, 6-A 900.
    await structure(C6, Y_THIS, THIS.start, [{ headId: tuition, amountMinor: 100000, frequency: 'monthly' }]);
    await structure(C5, Y_LAST, LAST.start, [{ headId: tuition, amountMinor: 140000, frequency: 'monthly' }]);
    await structure(C6, Y_LAST, LAST.start, [{ headId: tuition, amountMinor: 90000, frequency: 'monthly' }]);
    // Last April's dues were raised for 5-A, with Asha and Gita in it (Esha had left). Gita is in 6-A now.
    const dues = await as(accountant, (c) => raiseDues(c, actor(accountant), { classId: C5, sessionId: Y_LAST, month: `${CY - 1}-04`, dueDate: `${CY - 1}-04-10` }));
    if (!dues.ok) throw new Error(`dues: ${dues.reason}`);
    await db.pg.exec(`alter table students disable trigger user; update students set class_id = '${C6}' where student_id = '${S.gita}'; alter table students enable trigger user;`);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('no claim is raised without the state rate: not by the app, and not in the database', async () => {
    const d = await desk(accountant, Y_THIS);
    expect(d.rate).toBeNull();
    expect(child(d, S.asha)).toMatchObject({ onSheet: true, blocked: 'no_rate', proposed: null, claim: null, class_source: 'current' });
    expect(await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y_THIS, studentIds: [S.asha], raisedOn: THIS.start }))).toEqual({ ok: false, reason: 'no_rate' });
    await expect(as(accountant, (c) => c.query(claimInsert, [A, S.asha, Y_THIS, C5, 'current', null, 1250000, 1935150, 1250000, THIS.start, ACCOUNTANT]))).rejects.toThrow(/null value|not-null/);
  });

  it('the state’s rate is typed with where it comes from; a new one replaces it; the audit row holds no source sentence', async () => {
    const type = (who: Who, rate: string, source: string, sessionId = Y_THIS) => as(who, (c) => typeRate(c, actor(who), { sessionId, rate, source }));
    expect(await type(accountant, '0', 'Haryana notification')).toEqual({ ok: false, reason: 'rate' });
    expect(await type(accountant, '12500', '  ')).toEqual({ ok: false, reason: 'source' });
    expect(await type(accountant, '12500', 'Notification 1234 5678 9012')).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await type(teacher, '12500', 'Haryana notification')).toEqual({ ok: false, reason: 'not_allowed' });
    const made = await type(accountant, '12,500', 'Haryana RTE notification, Annexure A');
    expect(made.ok).toBe(true);
    rates.thisFirst = (made as { rateId: string }).rateId;
    expect((await desk(principal, Y_THIS)).rate).toMatchObject({ rate_minor: 1250000, source: 'Haryana RTE notification, Annexure A', typed_by: 'Anil Accountant' });
    await expect(as(accountant, (c) => c.query(`update rte_rates set rate_minor = 1 where rate_id = $1`, [rates.thisFirst]))).rejects.toThrow(/permission denied/);
    // The one rule in the database: twelve digits inside a sentence are refused now, a longer number passes.
    await expect(as(accountant, (c) => c.query(`insert into rte_rates (school_id, session_id, rate_minor, source, typed_by) values ($1, $2, 100, 'Order 123456789012 of the state', $3)`, [A, Y_LAST, ACCOUNTANT]))).rejects.toThrow(/rte_rates_source_check/);
    expect((await audit('rte.rate_typed')).map((r: { after_state: unknown }) => r.after_state)).toEqual([{ session: THIS.label, rateMinor: 1250000 }]);
  });

  it('the claim equals min(rate, fee) on the heads the school’s setting counts; claims already raised keep their fee', async () => {
    const d = await desk(accountant, Y_THIS);
    expect(d.counting).toEqual({ choice: 'rte_covered', heads: ['Activity', 'Tuition'] });
    // Asha, 5-A: tuition 3 x 1,500.50 + 9 x 1,650 and activity 12 x 100 = 20,551.50 (transport not covered, admission once).
    expect(child(d, S.asha).proposed).toEqual({ fee_minor: 2055150, rate_minor: 1250000, amount_minor: 1250000, applied: 'rate' });
    // The office counts only the heads every child pays: the activity head is left out. The accountant may not change it.
    const fees = settingsSchemaFor('fees')!;
    expect(await as(accountant, (c) => saveSettings(c, actor(accountant), fees, { moduleId: 'fees', baseRevision: 0, set: { rte_claim_heads: 'rte_covered_mandatory' } }))).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await as(principal, (c) => saveSettings(c, actor(principal), fees, { moduleId: 'fees', baseRevision: 0, set: { rte_claim_heads: 'rte_covered_mandatory' } }))).toMatchObject({ ok: true });
    const counted = await desk(accountant, Y_THIS);
    expect(counted.counting).toEqual({ choice: 'rte_covered_mandatory', heads: ['Tuition'] });
    expect(child(counted, S.asha).proposed).toEqual({ fee_minor: 1935150, rate_minor: 1250000, amount_minor: 1250000, applied: 'rate' });
    // Bina, 6-A, waiting for consent (the accountant still sees her here): 12 x 1,000, below the rate: claimed at the fee.
    expect(child(counted, S.bina).proposed).toEqual({ fee_minor: 1200000, rate_minor: 1250000, amount_minor: 1200000, applied: 'fee' });
    expect(child(counted, S.farah)).toMatchObject({ onSheet: true, blocked: 'no_class', proposed: null });
    expect(child(counted, S.esha)).toMatchObject({ onSheet: false, offSheet: 'left' });
    expect(child(counted, S.chetan)).toBeUndefined();

    const raised = await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y_THIS, studentIds: [S.asha, S.chetan, S.farah], raisedOn: THIS.start }));
    expect(raised).toMatchObject({ ok: true, raised: [{ studentId: S.asha, amountMinor: 1250000 }], skipped: [{ studentId: S.chetan, reason: 'not_rte' }, { studentId: S.farah, reason: 'no_class' }] });
    expect(await claimOf(S.asha, Y_THIS)).toMatchObject({ state: 'raised', class_id: C5, class_source: 'current', fee_minor: 1935150, amount_minor: 1250000 });
    expect((await audit('rte.claim_raised'))[0].after_state).toMatchObject({ studentId: S.asha, classSource: 'current', heads: 'rte_covered_mandatory', feeMinor: 1935150, amountMinor: 1250000 });
    // Back to the default: the claim raised keeps its fee.
    expect(await as(principal, (c) => saveSettings(c, actor(principal), fees, { moduleId: 'fees', baseRevision: 1, resetToDefault: ['rte_claim_heads'] }))).toMatchObject({ ok: true });
    expect(child(await desk(accountant, Y_THIS), S.asha).claim).toMatchObject({ fee_minor: 1935150, amount_minor: 1250000, class_source: 'current' });

    // A new rate for claims raised after it. The database: once a year, the rate in force, the lower of the two, the child's class now.
    const second = await as(admin, (c) => typeRate(c, actor(admin), { sessionId: Y_THIS, rate: '11000', source: 'Haryana RTE notification, revised' }));
    rates.thisSecond = (second as { rateId: string }).rateId;
    await expect(as(principal, (c) => c.query(claimInsert, [A, S.asha, Y_THIS, C5, 'current', rates.thisSecond, 1100000, 1935150, 1100000, THIS.start, PRINCIPAL]))).rejects.toThrow(/duplicate key|unique/);
    await expect(as(accountant, (c) => c.query(claimInsert, [A, S.bina, Y_THIS, C6, 'current', rates.thisFirst, 1250000, 1200000, 1200000, THIS.start, ACCOUNTANT]))).rejects.toThrow(/newer rate/);
    await expect(as(accountant, (c) => c.query(claimInsert, [A, S.bina, Y_THIS, C6, 'current', rates.thisSecond, 1100000, 1200000, 1200000, THIS.start, ACCOUNTANT]))).rejects.toThrow(/check constraint/);
    await expect(as(accountant, (c) => c.query(claimInsert, [A, S.bina, Y_THIS, C5, 'current', rates.thisSecond, 1100000, 1200000, 1100000, THIS.start, ACCOUNTANT]))).rejects.toThrow(/class now/);
    await expect(as(principal, (c) => c.query(claimInsert, [A, S.bina, Y_THIS, C6, 'chosen', rates.thisSecond, 1100000, 1200000, 1100000, THIS.start, PRINCIPAL]))).rejects.toThrow(/only for a year that is over/);
    await expect(as(accountant, (c) => c.query(claimInsert, [A, S.chetan, Y_THIS, C5, 'current', rates.thisSecond, 1100000, 1935150, 1100000, THIS.start, ACCOUNTANT]))).rejects.toThrow(/admitted under RTE/);
    const bina = await as(admin, (c) => raiseClaims(c, actor(admin), { sessionId: Y_THIS, studentIds: [S.bina, S.dev], raisedOn: THIS.start }));
    expect(bina).toMatchObject({ ok: true, raised: [{ studentId: S.bina, amountMinor: 1100000 }, { studentId: S.dev, amountMinor: 1100000 }] });
  });

  it('a past year takes the class the child was in that year: that year’s dues, else the class the office chooses', async () => {
    await as(principal, (c) => typeRate(c, actor(principal), { sessionId: Y_LAST, rate: '13000', source: 'Haryana RTE notification for last year' }));
    const d = await desk(accountant, Y_LAST);
    // Gita is in 6-A now; last year's dues were raised for her in 5-A: 12 x 1,400 = 16,800, claimed at 13,000 (not 6-A's 10,800).
    expect(child(d, S.gita)).toMatchObject({ class_name: '5-A', class_source: 'dues', proposed: { fee_minor: 1680000, amount_minor: 1300000 } });
    expect(child(d, S.asha)).toMatchObject({ class_name: '5-A', class_source: 'dues', proposed: { fee_minor: 1680000, amount_minor: 1300000 } });
    // Esha had left before last April's dues: no record of her class. Dev and Bina were admitted after that year.
    expect(child(d, S.esha)).toMatchObject({ onSheet: true, blocked: 'choose_class', proposed: null, class_name: null, class_source: null });
    expect(child(d, S.dev)).toMatchObject({ onSheet: false, offSheet: 'admitted_later' });
    expect(d.mayDecide).toBe(false);
    expect(d.classes.map((k) => k.name)).toEqual(['5-A', '6-A']);
    const raisedOn = `${CY - 1}-06-01`;
    expect(await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y_LAST, studentIds: [S.asha, S.gita, S.esha], raisedOn }))).toMatchObject({ ok: true, raised: [{ studentId: S.asha }, { studentId: S.gita }], skipped: [{ studentId: S.esha, reason: 'choose_class' }] });
    expect(await claimOf(S.gita, Y_LAST)).toMatchObject({ class_id: C5, class_source: 'dues', fee_minor: 1680000 });
    // Only the principal or the school admin chooses, one child at a time, a class of the school.
    expect(await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y_LAST, studentIds: [S.esha], raisedOn, classId: C5 }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => raiseClaims(c, actor(principal), { sessionId: Y_LAST, studentIds: [S.esha, S.asha], raisedOn, classId: C5 }))).toEqual({ ok: false, reason: 'class' });
    expect(await as(principal, (c) => raiseClaims(c, actor(principal), { sessionId: Y_LAST, studentIds: [S.esha], raisedOn, classId: u(99) }))).toEqual({ ok: false, reason: 'class' });
    expect(await as(principal, (c) => raiseClaims(c, actor(principal), { sessionId: Y_LAST, studentIds: [S.esha], raisedOn, classId: C5 }))).toMatchObject({ ok: true, raised: [{ studentId: S.esha, amountMinor: 1300000 }] });
    expect(await claimOf(S.esha, Y_LAST)).toMatchObject({ class_id: C5, class_source: 'chosen', fee_minor: 1680000 });
    expect((await audit('rte.claim_raised')).find((r: { after_state: { studentId: string; classSource: string } }) => r.after_state.studentId === S.esha && r.after_state.classSource === 'chosen')).toMatchObject({ actor_user_id: PRINCIPAL, after_state: { classId: C5 } });
    // The database holds the same: never the class now for a year that is over, never a class without dues as 'dues',
    // never a chosen class where dues say it, and never chosen by the accountant.
    const rate = (await db.pg.query(`select rate_id from rte_rates where session_id = $1`, [Y_LAST])).rows[0].rate_id;
    await db.pg.exec(`set session_replication_role = replica; delete from rte_claims where student_id = '${S.esha}' and session_id = '${Y_LAST}'; set session_replication_role = origin;`);
    await expect(as(principal, (c) => c.query(claimInsert, [A, S.esha, Y_LAST, C5, 'current', rate, 1300000, 1680000, 1300000, raisedOn, PRINCIPAL]))).rejects.toThrow(/year that is over/);
    await expect(as(principal, (c) => c.query(claimInsert, [A, S.esha, Y_LAST, C6, 'dues', rate, 1080000, 1080000, 1080000, raisedOn, PRINCIPAL]))).rejects.toThrow(/charged in that year/);
    await expect(as(accountant, (c) => c.query(claimInsert, [A, S.esha, Y_LAST, C5, 'chosen', rate, 1300000, 1680000, 1300000, raisedOn, ACCOUNTANT]))).rejects.toThrow(/only the principal or the school admin chooses/);
    await db.pg.exec(`set session_replication_role = replica; delete from rte_claims where student_id = '${S.gita}' and session_id = '${Y_LAST}'; set session_replication_role = origin;`);
    await expect(as(principal, (c) => c.query(claimInsert, [A, S.gita, Y_LAST, C6, 'chosen', rate, 1080000, 1080000, 1080000, raisedOn, PRINCIPAL]))).rejects.toThrow(/dues say the child/);
    // Put the two back as the desk raises them.
    expect(await as(principal, (c) => raiseClaims(c, actor(principal), { sessionId: Y_LAST, studentIds: [S.esha], raisedOn, classId: C5 }))).toMatchObject({ ok: true });
    expect(await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y_LAST, studentIds: [S.gita], raisedOn }))).toMatchObject({ ok: true });
  });

  it('the state pays in parts: receipts until they cover the claim, then it is paid; never more than the claim; never changed', async () => {
    const asha = (await claimOf(S.asha, Y_LAST)).claim_id;
    expect(await pay(accountant, asha, '0', `${CY}-01-15`, 'PFMS/1')).toEqual({ ok: false, reason: 'amount' });
    expect(await pay(accountant, asha, '13000.01', `${CY}-01-15`, 'PFMS/1')).toEqual({ ok: false, reason: 'over' });
    expect(await pay(accountant, asha, '5000', `${CY - 1}-05-31`, 'PFMS/1')).toEqual({ ok: false, reason: 'received_on' });
    expect(await pay(accountant, asha, '5000', addDays(TODAY, 1), 'PFMS/1')).toEqual({ ok: false, reason: 'received_on' });
    expect(await pay(accountant, asha, '5000', `${CY}-01-15`, 'IMPS 123456789012')).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await pay(accountant, asha, '5000', `${CY}-01-15`, ' ')).toEqual({ ok: false, reason: 'reference' });
    expect(await pay(teacher, asha, '5000', `${CY}-01-15`, 'PFMS/1')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await pay(accountant, asha, '5,000', `${CY}-01-15`, 'PFMS/HR/0042')).toEqual({ ok: true, state: 'raised', dueMinor: 800000 });
    const part = child(await desk(accountant, Y_LAST), S.asha).claim!;
    expect(part).toMatchObject({ state: 'raised', received_minor: 500000, due_minor: 800000, receipts: [{ amount_minor: 500000, reference: 'PFMS/HR/0042', recorded_by: 'Anil Accountant', reversed: false }] });
    // The rest, dated before the first: paid, on the day the last of the money came; a longer UTR passes.
    expect(await pay(admin, asha, '8000', `${CY - 1}-09-01`, 'UTR 1234567890123456')).toEqual({ ok: true, state: 'paid', dueMinor: 0 });
    expect(await claimOf(S.asha, Y_LAST)).toMatchObject({ state: 'paid', paid_on_text: `${CY}-01-15`, reference: 'UTR 1234567890123456', settled_by: ADMIN });
    expect(await receiptsOf(asha)).toEqual([
      { amount: 500000, on: `${CY}-01-15`, reference: 'PFMS/HR/0042', reverses: null, reversal_reason: null, recorded_by: ACCOUNTANT },
      { amount: 800000, on: `${CY - 1}-09-01`, reference: 'UTR 1234567890123456', reverses: null, reversal_reason: null, recorded_by: ADMIN },
    ]);
    expect(await pay(accountant, asha, '1', `${CY}-01-15`, 'x')).toEqual({ ok: false, reason: 'settled' });
    // The database: a receipt on a paid claim, a receipt over the claim, the covering receipt typed in directly, a change or removal.
    const gita = (await claimOf(S.gita, Y_LAST)).claim_id;
    const insert = (who: Who, claimId: string, amount: number, by = who.user) => as(who, (c) => c.query(`insert into rte_claim_receipts (school_id, claim_id, amount_minor, received_on, reference, recorded_by) values ($1, $2, $3, $4, 'PFMS/9', $5)`, [A, claimId, amount, `${CY}-01-15`, by]));
    await expect(insert(accountant, asha, 1)).rejects.toThrow(/still raised/);
    await expect(insert(accountant, gita, 1300001)).rejects.toThrow(/never come to more than the claim/);
    await expect(insert(accountant, gita, 1300000)).rejects.toThrow(/recorded by marking the claim paid/);
    await expect(insert(accountant, gita, 100, ADMIN)).rejects.toThrow(/row-level security/);
    // A teacher does not see the claim at all.
    await expect(insert(teacher, gita, 100)).rejects.toThrow(/row-level security|claim of the school/);
    await expect(as(accountant, (c) => c.query(`update rte_claim_receipts set amount_minor = 1 where claim_id = $1`, [asha]))).rejects.toThrow(/permission denied/);
    await expect(as(principal, (c) => c.query(`delete from rte_claim_receipts where claim_id = $1`, [asha]))).rejects.toThrow(/permission denied/);
    // Marked paid as before (the way the code before this change did it): the database writes the receipt for what was still due.
    expect(await pay(accountant, gita, '3000', `${CY}-01-15`, 'PFMS/HR/0050')).toMatchObject({ ok: true, dueMinor: 1000000 });
    await as(accountant, (c) => c.query(`update rte_claims set state = 'paid', paid_on = $2, reference = 'PFMS/HR/0051', settled_by = $3 where claim_id = $1`, [gita, `${CY}-02-01`, ACCOUNTANT]));
    expect((await receiptsOf(gita)).map((r: { amount: number; on: string }) => [r.amount, r.on])).toEqual([[300000, `${CY}-01-15`], [1000000, `${CY}-02-01`]]);
    // Audited with amounts, dates and ids: never the reference.
    expect((await audit('rte.receipt_recorded'))[0]).toMatchObject({ actor_user_id: ACCOUNTANT, target_id: asha, after_state: { studentId: S.asha, amountMinor: 500000, receivedOn: `${CY}-01-15`, receivedMinor: 500000, dueMinor: 800000 } });
    expect((await audit('rte.claim_paid'))[0]).toMatchObject({ actor_user_id: ADMIN, target_id: asha, after_state: { state: 'paid', amountMinor: 800000, claimMinor: 1300000, receivedMinor: 1300000, receiptId: expect.any(String) } });
  });

  it('a receipt typed wrongly is taken back by a reversing row, never removed; a short payment is written off with a note', async () => {
    const esha = (await claimOf(S.esha, Y_LAST)).claim_id;
    expect(await pay(accountant, esha, '2000', `${CY}-01-15`, 'PFMS/HR/0060')).toMatchObject({ ok: true, dueMinor: 1100000 });
    const typedWrong = (await receiptsOf(esha))[0];
    const receiptId = (await db.pg.query(`select receipt_id from rte_claim_receipts where claim_id = $1`, [esha])).rows[0].receipt_id;
    expect(typedWrong.amount).toBe(200000);
    expect(await act(admin, esha, { action: 'reverse', receiptId, reason: 'because' })).toEqual({ ok: false, reason: 'reason' });
    expect(await act(admin, esha, { action: 'reverse', receiptId: u(98), reason: 'typed_wrong' })).toEqual({ ok: false, reason: 'receipt' });
    // The database: a reversal is minus the receipt, of the same claim, dated today.
    await expect(as(admin, (c) => c.query(`insert into rte_claim_receipts (school_id, claim_id, amount_minor, received_on, reverses, reversal_reason, recorded_by) values ($1, $2, -100, $3, $4, 'typed_wrong', $5)`, [A, esha, TODAY, receiptId, ADMIN]))).rejects.toThrow(/to the paisa/);
    await expect(as(admin, (c) => c.query(`insert into rte_claim_receipts (school_id, claim_id, amount_minor, received_on, reverses, reversal_reason, recorded_by) values ($1, $2, -200000, $3, $4, 'typed_wrong', $5)`, [A, esha, `${CY}-01-15`, receiptId, ADMIN]))).rejects.toThrow(/dated the day it is made/);
    expect(await act(admin, esha, { action: 'reverse', receiptId, reason: 'typed_wrong' })).toEqual({ ok: true, state: 'raised', dueMinor: 1300000 });
    expect(await act(admin, esha, { action: 'reverse', receiptId, reason: 'typed_wrong' })).toEqual({ ok: false, reason: 'receipt' });
    const reversal = (await db.pg.query(`select receipt_id from rte_claim_receipts where reverses = $1`, [receiptId])).rows[0].receipt_id;
    expect(await act(admin, esha, { action: 'reverse', receiptId: reversal, reason: 'typed_wrong' })).toEqual({ ok: false, reason: 'receipt' });
    expect((await desk(accountant, Y_LAST)).children.find((c) => c.student_id === S.esha)!.claim).toMatchObject({ received_minor: 0, due_minor: 1300000, receipts: [{ amount_minor: 200000, reversed: true }, { amount_minor: -200000, reverses: receiptId, reversal_reason: 'typed_wrong' }] });
    expect((await audit('rte.receipt_reversed'))[0]).toMatchObject({ actor_user_id: ADMIN, after_state: { reverses: receiptId, amountMinor: -200000, reversalCode: 'typed_wrong', receivedMinor: 0, dueMinor: 1300000 } });

    // 5,000 comes; the rest will not: written off with a note, which never holds an Aadhaar number.
    expect(await pay(accountant, esha, '5000', `${CY}-01-20`, 'PFMS/HR/0061')).toMatchObject({ ok: true, dueMinor: 800000 });
    expect(await act(accountant, esha, { action: 'write_off', note: ' ' })).toEqual({ ok: false, reason: 'note' });
    expect(await act(accountant, esha, { action: 'write_off', note: 'Parent gave Aadhaar 1234  5678  9012' })).toEqual({ ok: false, reason: 'aadhaar' });
    await expect(as(accountant, (c) => c.query(`update rte_claims set state = 'written_off', write_off_note = 'Aadhaar १२३४ ५६७८ ९०१२', settled_by = $2 where claim_id = $1`, [esha, ACCOUNTANT]))).rejects.toThrow(/check constraint/);
    await expect(as(accountant, (c) => c.query(`update rte_claims set state = 'written_off', settled_by = $2 where claim_id = $1`, [esha, ACCOUNTANT]))).rejects.toThrow(/with a note/);
    expect(await act(accountant, esha, { action: 'write_off', note: 'The district paid five thousand only, by its order of January.' })).toEqual({ ok: true, state: 'written_off', dueMinor: 0 });
    const year = (await desk(accountant, Y_LAST)).ageing.find((y) => y.label === LAST.label)!;
    // Asha 13,000 paid; Gita 13,000 paid; Esha 5,000 paid and 8,000 written off.
    expect(year).toMatchObject({ claims: 3, claimed_minor: 3900000, paid_minor: 3100000, written_off_minor: 800000, due_minor: 0 });
    expect((await audit('rte.claim_written_off'))[0]).toMatchObject({ actor_user_id: ACCOUNTANT, target_id: esha, after_state: { state: 'written_off', amountMinor: 1300000, receivedMinor: 500000, writtenOffMinor: 800000, noted: true } });
  });

  it('only the principal or the school admin reopens a written-off claim, with a reason; a paid claim stays as it is', async () => {
    const esha = (await claimOf(S.esha, Y_LAST)).claim_id;
    const asha = (await claimOf(S.asha, Y_LAST)).claim_id;
    expect(await act(accountant, esha, { action: 'reopen', reason: 'The district will pay the rest.' })).toEqual({ ok: false, reason: 'not_allowed' });
    await expect(as(accountant, (c) => c.query(`update rte_claims set state = 'raised', reopen_reason = 'x', reopened_by = $2 where claim_id = $1`, [esha, ACCOUNTANT]))).rejects.toThrow(/only the principal or the school admin reopens/);
    await expect(as(principal, (c) => c.query(`update rte_claims set state = 'raised', reopen_reason = 'x', reopened_by = $2 where claim_id = $1`, [esha, ADMIN]))).rejects.toThrow(/row-level security/);
    expect(await act(principal, esha, { action: 'reopen', reason: '  ' })).toEqual({ ok: false, reason: 'reason' });
    expect(await act(principal, esha, { action: 'reopen', reason: 'Parent sent 123456789012' })).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await act(principal, asha, { action: 'reopen', reason: 'Paid already' })).toEqual({ ok: false, reason: 'not_written_off' });
    await expect(as(principal, (c) => c.query(`update rte_claims set state = 'raised', reopen_reason = 'x', reopened_by = $2 where claim_id = $1`, [asha, PRINCIPAL]))).rejects.toThrow(/paid claim stays as it is/);
    expect(await act(principal, esha, { action: 'reopen', reason: 'The district will pay the rest after its revised order.' })).toEqual({ ok: true, state: 'raised', dueMinor: 800000 });
    expect(await claimOf(S.esha, Y_LAST)).toMatchObject({ state: 'raised', write_off_note: null, settled_by: null, reopened_by: PRINCIPAL, reopen_reason: 'The district will pay the rest after its revised order.' });
    expect(await act(principal, esha, { action: 'reopen', reason: 'Again' })).toEqual({ ok: false, reason: 'not_written_off' });
    const reopened = (await audit('rte.claim_reopened'))[0];
    expect(reopened).toMatchObject({ actor_user_id: PRINCIPAL, before_state: { state: 'written_off' }, after_state: { state: 'raised', dueMinor: 800000, reasonGiven: true } });
    // Written off again by the school admin, for the erasure below.
    expect(await act(admin, esha, { action: 'write_off', note: 'The revised order did not come.' })).toMatchObject({ ok: true });
  });

  it('an unpaid claim moves on through the age buckets on what is still due; a paid one leaves the list', async () => {
    const at = async (today: string) => (await desk(accountant, Y_THIS, today)).ageing.find((y) => y.label === THIS.label)!;
    const buckets = (y: Awaited<ReturnType<typeof at>>) => Object.fromEntries(y.buckets.map((b) => [b.bucket, b.minor]));
    // Asha 12,500, Bina and Dev 11,000 each, all raised on the year's first day.
    expect(buckets(await at(addDays(THIS.start, 30)))).toEqual({ upTo90: 3450000, upTo180: 0, upTo365: 0, overYear: 0 });
    expect(buckets(await at(addDays(THIS.start, 100)))).toEqual({ upTo90: 0, upTo180: 3450000, upTo365: 0, overYear: 0 });
    expect(buckets(await at(addDays(THIS.start, 400)))).toEqual({ upTo90: 0, upTo180: 0, upTo365: 0, overYear: 3450000 });
    expect(await unpaidPastFirstBucket(db.pg, A, addDays(THIS.start, 100))).toBe(3);
    expect(await unpaidPastFirstBucket(db.pg, A, addDays(THIS.start, 30))).toBe(0);
    // Bina: 4,000 paid, so 7,000 still due is what ages; then the rest, and she leaves the list.
    const bina = (await claimOf(S.bina, Y_THIS)).claim_id;
    expect(await pay(accountant, bina, '4000', THIS.start, 'PFMS/HR/0070')).toMatchObject({ ok: true, dueMinor: 700000 });
    expect(buckets(await at(addDays(THIS.start, 100)))).toEqual({ upTo90: 0, upTo180: 3050000, upTo365: 0, overYear: 0 });
    expect(await pay(accountant, bina, '7000', THIS.start, 'PFMS/HR/0071')).toMatchObject({ ok: true, state: 'paid' });
    expect(await at(addDays(THIS.start, 100))).toMatchObject({ claimed_minor: 3450000, paid_minor: 1100000, due_minor: 2350000 });
    expect(await unpaidPastFirstBucket(db.pg, A, addDays(THIS.start, 100))).toBe(2);
  });

  it('the evidence file: the child’s own captured documents or a typed note, never an Aadhaar number or card', async () => {
    const add = (who: Who, input: Partial<{ studentId: string; kind: string; documentId: string | null; note: string | null }>) => as(who, (c) => addEvidence(c, actor(who), { studentId: S.asha, kind: 'admission_order', documentId: null, note: null, ...input }));
    expect(await add(accountant, {})).toEqual({ ok: false, reason: 'nothing' });
    expect(await add(accountant, { kind: 'passport', note: 'x' })).toEqual({ ok: false, reason: 'kind' });
    expect(await add(accountant, { note: 'Aadhaar 1234-5678-9012 seen' })).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await add(accountant, { documentId: DOC.ashaAadhaar })).toEqual({ ok: false, reason: 'document' });
    expect(await add(accountant, { studentId: S.chetan, note: 'Not RTE' })).toEqual({ ok: false, reason: 'not_rte' });
    expect(await add(teacher, { note: 'x' })).toEqual({ ok: false, reason: 'not_allowed' });
    expect((await add(accountant, { kind: 'lottery', documentId: DOC.ashaBirth, note: 'Lottery list 3, number 14' })).ok).toBe(true);
    const income = await add(admin, { kind: 'income_or_category', note: 'Income certificate seen by the office.' });
    expect(income.ok).toBe(true);
    await expect(as(accountant, (c) => c.query(`insert into rte_evidence (school_id, student_id, kind, document_id, added_by) values ($1, $2, 'other', $3, $4)`, [A, S.asha, DOC.ashaAadhaar, ACCOUNTANT]))).rejects.toThrow(/never an Aadhaar card/);
    await expect(as(accountant, (c) => c.query(`insert into rte_evidence (school_id, student_id, kind, note, added_by) values ($1, $2, 'other', 'Seen 1234 5678 9012 3456', $3)`, [A, S.asha, ACCOUNTANT]))).rejects.toThrow(/rte_evidence_note_check/);
    expect(child(await desk(accountant, Y_THIS), S.asha).evidence.map((e) => e.kind)).toEqual(['lottery', 'income_or_category']);
    expect(await as(principal, (c) => removeEvidence(c, actor(principal), (income as { evidenceId: string }).evidenceId))).toEqual({ ok: true });
    expect(JSON.stringify(await audit('rte.evidence_added'))).not.toContain('Lottery list');
  });

  it('roles are held by the database: a teacher, the coordinator, another school and the platform read nothing, receipts too', async () => {
    const counts = (who: Who) => as(who, async (c) => (await c.query(`select (select count(*)::int from rte_rates) as rates, (select count(*)::int from rte_claims) as claims, (select count(*)::int from rte_claim_receipts) as receipts, (select count(*)::int from rte_evidence) as evidence, (select count(*)::int from audit_log where event_action like 'rte.%') as audit`)).rows[0]);
    const mine = await counts(accountant);
    expect(mine).toMatchObject({ rates: 3, claims: 6, evidence: 1 });
    expect(mine.receipts).toBeGreaterThan(0);
    for (const who of [teacher, coordinator, principalB]) {
      expect(await counts(who), `${who.role} ${who.school}`).toEqual({ rates: 0, claims: 0, receipts: 0, evidence: 0, audit: 0 });
      const changed = await as(who, async (c) => (await c.query(`update rte_claims set state = 'written_off', write_off_note = 'x', settled_by = $1 returning claim_id`, [who.user])).rows);
      expect(changed).toEqual([]);
    }
    expect(await as(teacher, (c) => loadDesk(c, actor(teacher), { sessionId: Y_THIS }))).toBeNull();
    for (const table of ['rte_rates', 'rte_claims', 'rte_claim_receipts', 'rte_evidence']) await expect(platform((c) => c.query(`select count(*) from ${table}`)), table).rejects.toThrow(/permission denied/);
    // Another school cannot record a payment on School A's claim.
    const dev = (await claimOf(S.dev, Y_THIS)).claim_id;
    await expect(as(principalB, (c) => c.query(`insert into rte_claim_receipts (school_id, claim_id, amount_minor, received_on, reference, recorded_by) values ($1, $2, 100, $3, 'x', $4)`, [A, dev, THIS.start, PRINCIPAL_B]))).rejects.toThrow(/row-level security|foreign key|claim of the school/);
    expect(await as(principalB, (c) => actOnClaim(c, actor(principalB), dev, { action: 'write_off', note: 'x' }))).toEqual({ ok: false, reason: 'not_found' });
  });

  it('the claim sheet as a CSV, to the rupee: what was paid and what is still due, with a total', async () => {
    const file = rteSheetCsv('en', await desk(accountant, Y_THIS));
    expect(file.header).toEqual(['Child', 'Admission no.', 'Class', 'School fee for the year (₹)', 'State rate (₹)', 'Claim (₹)', 'Paid by the state (₹)', 'Still due (₹)', 'Claimed at', 'State', 'Raised on', 'Paid on', 'Reference', 'Evidence']);
    const byName = Object.fromEntries(file.rows.map((r) => [r[0], r]));
    expect(byName.Asha).toEqual(['Asha', 'A-1', '5-A', '19351.50', '12500.00', '12500.00', '0.00', '12500.00', 'The state rate', 'Raised', THIS.start, '', '', 1]);
    expect(byName.Bina.slice(5, 13)).toEqual(['11000.00', '11000.00', '0.00', 'The state rate', 'Paid', THIS.start, THIS.start, 'PFMS/HR/0070; PFMS/HR/0071']);
    // Gita, in 6-A now, is ready to raise at 11,000: the sheet counts her proposed claim too.
    expect(file.rows[file.rows.length - 1]).toEqual(['Total', '', '', '', '', '45500.00', '11000.00', '23500.00', '', '', '', '', '', '']);
    expect(rteSheetCsv('hi', await desk(accountant, Y_THIS)).header[6]).toBe('राज्य ने दिया (₹)');
  });

  it('My Day: the three roles see the claims unpaid past the first bucket, and nobody does on a plan without the desk', async () => {
    const provider = TODAY_PROVIDERS.find((p) => p.type === 'rte-claims-unpaid')!;
    const load = (who: Who) => as(who, (c) => provider.load(c, { schoolId: A, userId: who.user, role: who.role, sunday: false } as never));
    // Today's count (the claims raised on the year's first day are past 90 days from July on).
    const expected = await unpaidPastFirstBucket(db.pg, A);
    expect(await load(accountant)).toEqual(expected ? [{ id: 'rte-claims-unpaid', type: 'rte-claims-unpaid', moduleId: 'fees', state: 'todo', count: expected, href: '/app/fees/rte' }] : []);
    expect(await load(teacher)).toEqual([]);
    await db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'starter')`, [A]);
    expect(await as(accountant, async (c) => (await c.query(`select school_plan_has_feature($1, 'rte-claim-desk') as yes`, [A])).rows[0].yes)).toBe(false);
    expect(await load(accountant)).toEqual([]);
    await db.pg.query(`delete from school_subscriptions where school_id = $1`, [A]);
  });

  it('an erasure removes the evidence file and clears the notes and reasons; the claims and payments are kept', async () => {
    const esha = (await claimOf(S.esha, Y_LAST)).claim_id;
    expect((await as(accountant, (c) => addEvidence(c, actor(accountant), { studentId: S.esha, kind: 'income_or_category', documentId: null, note: 'Category certificate seen by the office.' }))).ok).toBe(true);
    const before = { claim: await claimOf(S.esha, Y_LAST), receipts: await receiptsOf(esha) };
    expect(before.claim).toMatchObject({ state: 'written_off', write_off_note: 'The revised order did not come.', reopen_reason: 'The district will pay the rest after its revised order.' });
    // The app's role may not clear a note itself, and the accountant may not run the erasure.
    await expect(as(principal, (c) => c.query(`update rte_claims set write_off_note = null, notes_erased_at = now() where claim_id = $1`, [esha]))).rejects.toThrow(/never change|stays as it is/);
    await expect(as(accountant, (c) => c.query(`select public.erase_student_rte_notes($1)`, [S.esha]))).rejects.toThrow(/principal or the school admin/);
    // Another school's principal erases nothing of School A's.
    expect(await as(principalB, async (c) => (await c.query(`select public.erase_student_rte_notes($1) as n`, [S.esha])).rows[0].n)).toBe(0);
    const done = await as(principal, (c) => pseudonymizeStudent(c, A, S.esha));
    expect(done.rteRowsErased).toBe(2); // one evidence row, one claim's notes
    const after = await claimOf(S.esha, Y_LAST);
    expect(after).toMatchObject({ state: 'written_off', write_off_note: null, reopen_reason: null, amount_minor: before.claim.amount_minor, settled_by: before.claim.settled_by, reopened_by: PRINCIPAL });
    expect(after.notes_erased_at).not.toBeNull();
    expect(await receiptsOf(esha)).toEqual(before.receipts);
    expect((await db.pg.query(`select count(*)::int as n from rte_evidence where student_id = $1`, [S.esha])).rows[0].n).toBe(0);
    expect(child(await desk(accountant, Y_LAST), S.esha).claim).toMatchObject({ write_off_note: null, reopen_reason: null, received_minor: 500000 });
    // Asha's notes are untouched.
    expect((await db.pg.query(`select count(*)::int as n from rte_evidence where student_id = $1`, [S.asha])).rows[0].n).toBe(1);
  });

  it('no rte audit row holds a note, a reason, a reference or a source sentence', async () => {
    const rows = JSON.stringify((await db.pg.query(`select before_state, after_state from audit_log where event_action like 'rte.%'`)).rows);
    for (const typed of ['PFMS', 'UTR', 'Haryana', 'district', 'revised order', 'Lottery', 'Category certificate', 'Income certificate']) expect(rows, typed).not.toContain(typed);
    expect(rows).toContain('"noted":true');
    expect(rows).toContain('"reasonGiven":true');
  });

  it('the migration stops, naming the table and column, if an existing row is one the new rule refuses', async () => {
    const sql = readFileSync(path.join(ROOT, 'supabase/migrations', readdirSync(path.join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_c225_rte_closeout.sql'))!), 'utf8');
    const check = sql.match(/do \$\$[\s\S]*?end \$\$;/)![0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await db.pg.transaction(async (tx: any) => {
      await tx.query(`alter table rte_evidence drop constraint rte_evidence_note_check`);
      await tx.query(`set local session_replication_role = replica`);
      await tx.query(`insert into rte_evidence (school_id, student_id, kind, note, added_by) values ($1, $2, 'other', 'Seen 1234 5678 9012', $3)`, [A, S.asha, ACCOUNTANT]);
      const failed = await tx.exec(check).then(() => null, (e: Error) => e.message);
      throw Object.assign(new Error('roll back'), { failed });
    }).catch((e: { failed?: string }) => e.failed);
    expect(outcome).toMatch(/rte_evidence\.note \(1 rows\)/);
    expect((await db.pg.query(`select count(*)::int as n from pg_constraint where conname = 'rte_evidence_note_check'`)).rows[0].n).toBe(1);
  });
});
