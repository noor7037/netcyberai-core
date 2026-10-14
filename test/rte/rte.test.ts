import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { pseudonymizeStudent } from '@/lib/consent/dsr';
import { addHead, addStructureVersion } from '@/lib/fees/structures';
import { buildClaim } from '@/lib/free-tools/rte-claim';
import { addEvidence, loadDesk, raiseClaims, removeEvidence, settleClaim, typeRate, unpaidPastFirstBucket, type Desk, type DeskChild } from '@/lib/rte/desk';
import { ageOf, claimFor, hasTwelveDigitRun, isOnlyTwelveDigits, minorToPlainRupees, monthsOf, yearFeeMinor } from '@/lib/rte/rules';
import { rteSheetCsv } from '@/lib/rte/sheet-csv';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// The RTE claim desk (docs/28 slice 10c, C223). The acceptance test: the claim equals min(rate, fee) to the rupee
// for each child and year; a paid claim leaves the unpaid list, and an unpaid one moves on through the age buckets
// as time passes; no claim is raised without the state rate; the roles are held by the database. Every name and
// figure is made up.

describe('the rules, with no database', () => {
  it('the claim is the free tool’s own rule: the lower of the state rate and the fee, exact to the paisa', () => {
    expect(claimFor(1250000, 1935150)).toEqual({ amountMinor: 1250000, applied: 'rate' });
    expect(claimFor(1250000, 1200000)).toEqual({ amountMinor: 1200000, applied: 'fee' });
    expect(claimFor(1250000, 1250000)).toEqual({ amountMinor: 1250000, applied: 'equal' });
    expect(claimFor(1250001, 1250000)).toEqual({ amountMinor: 1250000, applied: 'fee' });
    expect(claimFor(1250000, 0)).toEqual({ amountMinor: 0, applied: 'fee' });
    // The same figures typed in rupees into the free tool itself give the same claim.
    const tool = buildClaim({ year: '2026-27', rate: '12,500', fee: '19351.50', classFees: [], documents: [], ageing: [] }, [{ name: 'Asha', cls: '5-A', admitted: '', docs: [] }], { y: 2026, m: 10, d: 14 });
    expect(Math.round(tool.claims[0].claim * 100)).toBe(claimFor(1250000, 1935150).amountMinor);
    expect(() => claimFor(0, 100)).toThrow();
    expect(() => claimFor(10.5, 100)).toThrow();
  });

  it('the year’s fee is the class’s structure month by month, in the heads RTE covers, as dues are raised; a one-time fee is not counted', () => {
    const session = { label: '2026-27', start_date: '2026-04-01', end_date: '2027-03-31' };
    expect(monthsOf(session)).toHaveLength(12);
    expect(monthsOf(session)[0]).toBe('2026-04');
    expect(monthsOf(session)[11]).toBe('2027-03');
    const v1 = { effective_from: '2026-04-01', items: [{ head_id: 'tuition', amount_minor: 150050, frequency: 'monthly' as const }, { head_id: 'transport', amount_minor: 80000, frequency: 'monthly' as const }, { head_id: 'admission', amount_minor: 500000, frequency: 'one_time' as const }, { head_id: 'exam', amount_minor: 30000, frequency: 'quarterly' as const }, { head_id: 'annual', amount_minor: 200000, frequency: 'annual' as const }] };
    const v2 = { ...v1, effective_from: '2026-07-01', items: v1.items.map((i) => (i.head_id === 'tuition' ? { ...i, amount_minor: 165000 } : i)) };
    const covered = new Set(['tuition', 'admission', 'exam', 'annual']);
    // Tuition: 3 x 1,500.50 + 9 x 1,650 = 19,351.50. Exam: 4 quarters x 300 = 1,200. Annual: 2,000 once. Transport not covered; admission one-time.
    expect(yearFeeMinor([v2, v1], covered, session)).toBe(450150 + 1485000 + 120000 + 200000);
    expect(yearFeeMinor([v1], new Set(['tuition']), session)).toBe(12 * 150050);
    // A structure that begins in July charges from July.
    expect(yearFeeMinor([{ ...v1, effective_from: '2026-07-01' }], new Set(['tuition']), session)).toBe(9 * 150050);
    expect(yearFeeMinor([], covered, session)).toBeNull();
    expect(yearFeeMinor([{ ...v1, effective_from: '2027-04-01' }], covered, session)).toBeNull();
  });

  it('a claim ages by the free tool’s buckets, and a paid one is in none', () => {
    expect(ageOf('2025-06-01', '2025-07-01', 100)).toEqual({ days: 30, bucket: 'upTo90' });
    expect(ageOf('2025-06-01', '2025-08-30', 100)).toEqual({ days: 90, bucket: 'upTo90' });
    expect(ageOf('2025-06-01', '2025-08-31', 100)).toEqual({ days: 91, bucket: 'upTo180' });
    expect(ageOf('2025-06-01', '2026-01-01', 100)).toEqual({ days: 214, bucket: 'upTo365' });
    expect(ageOf('2025-06-01', '2026-06-02', 100)).toEqual({ days: 366, bucket: 'overYear' });
    expect(ageOf('2025-06-01', '2026-06-02', 0)).toEqual({ days: 366, bucket: 'paid' });
  });

  it('never an Aadhaar number: a run of 12 digits in a note, or a value that is only 12 digits', () => {
    for (const s of ['1234 5678 9012', 'Aadhaar 123456789012 seen', '1234-5678-9012', '123456789012']) expect(hasTwelveDigitRun(s), s).toBe(true);
    for (const s of ['Lottery 2026/14', 'SBIN0001234 order', '1234567890123', 'Phone 98765 43210']) expect(hasTwelveDigitRun(s), s).toBe(false);
    expect(isOnlyTwelveDigits('1234 5678 9012')).toBe(true);
    expect(isOnlyTwelveDigits('IMPS 123456789012')).toBe(false);
    expect(minorToPlainRupees(1935150)).toBe('19351.50');
    expect(minorToPlainRupees(5)).toBe('0.05');
  });
});

const A = 'c2230000-0000-4000-8000-000000000001';
const B = 'c2230000-0000-4000-8000-000000000002';
const u = (k: number) => `c2230000-0000-4000-8000-0000000001${String(k).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, ACCOUNTANT, TEACHER, COORDINATOR, PRINCIPAL_B] = [u(1), u(2), u(3), u(4), u(5), u(6)];
const C5 = u(51);
const C6 = u(52);
const Y25 = u(61);
const Y26 = u(62);
const S = { asha: u(71), bina: u(72), chetan: u(73), dev: u(74), esha: u(75), farah: u(76) };
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
const desk = (who: Who, sessionId: string, today: string) => as(who, (c) => loadDesk(c, actor(who), { sessionId, today })) as Promise<Desk>;
const child = (d: Desk, id: string) => d.children.find((c) => c.student_id === id) as DeskChild;
const rates: Record<string, string> = {};
const claimOf = async (studentId: string, sessionId: string) => (await db.pg.query(`select * from rte_claims where student_id = $1 and session_id = $2`, [studentId, sessionId])).rows[0];
const audit = async (action: string) => (await db.pg.query(`select actor_user_id, actor_role, target_id, before_state, after_state from audit_log where event_action = $1 order by audit_id`, [action])).rows;

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
        ('${Y25}', '${A}', '2025-26', '2025-04-01', '2026-03-31', false), ('${Y26}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${TEACHER}'), ('${C6}', '${A}', '6-A', null);
      insert into students (student_id, school_id, admission_no, name, class_id, status, rte_admission, rte_entry_class, rte_admitted_on) values
        ('${S.asha}', '${A}', 'A-1', 'Asha', '${C5}', 'pending_consent', true, '4-A', '2025-04-10'),
        ('${S.bina}', '${A}', 'A-2', 'Bina', '${C6}', 'pending_consent', true, '6-A', '2026-04-05'),
        ('${S.chetan}', '${A}', 'A-3', 'Chetan', '${C5}', 'pending_consent', false, null, null),
        ('${S.dev}', '${A}', 'A-4', 'Dev', '${C5}', 'pending_consent', true, '5-A', '2026-08-01'),
        ('${S.esha}', '${A}', 'A-5', 'Esha', '${C5}', 'pending_consent', true, '4-A', '2025-04-12'),
        ('${S.farah}', '${A}', 'A-6', 'Farah', null, 'pending_consent', true, '1-A', '2026-04-02');
      alter table students disable trigger user;
      update students set status = 'active' where student_id in ('${S.asha}', '${S.chetan}', '${S.dev}');
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
    // RTE covers the heads every child pays (C162): tuition and admission here, not transport.
    const tuition = await head('Tuition', true);
    const transport = await head('Transport', false);
    const admission = await head('Admission', true);
    const structure = async (classId: string, sessionId: string, effectiveFrom: string, items: { headId: string; amountMinor: number; frequency: 'monthly' | 'one_time' }[]) => {
      const r = await as(accountant, (c) => addStructureVersion(c, actor(accountant), { classId, sessionId, effectiveFrom, items }));
      if (!r.ok) throw new Error(`structure: ${r.reason}`);
    };
    // 5-A, 2026-27: tuition 1,500.50 a month from April and 1,650 from July; transport 800; admission 5,000 once.
    await structure(C5, Y26, '2026-04-01', [{ headId: tuition, amountMinor: 150050, frequency: 'monthly' }, { headId: transport, amountMinor: 80000, frequency: 'monthly' }, { headId: admission, amountMinor: 500000, frequency: 'one_time' }]);
    await structure(C5, Y26, '2026-07-01', [{ headId: tuition, amountMinor: 165000, frequency: 'monthly' }, { headId: transport, amountMinor: 80000, frequency: 'monthly' }, { headId: admission, amountMinor: 500000, frequency: 'one_time' }]);
    // 6-A, 2026-27: tuition 1,000 a month. 5-A, 2025-26: tuition 1,400 a month.
    await structure(C6, Y26, '2026-04-01', [{ headId: tuition, amountMinor: 100000, frequency: 'monthly' }]);
    await structure(C5, Y25, '2025-04-01', [{ headId: tuition, amountMinor: 140000, frequency: 'monthly' }]);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('no claim is raised without the state rate: not by the app, and not in the database', async () => {
    const d = await desk(accountant, Y26, '2026-10-14');
    expect(d.rate).toBeNull();
    expect(child(d, S.asha)).toMatchObject({ onSheet: true, blocked: 'no_rate', proposed: null, claim: null });
    expect(await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y26, studentIds: [S.asha], raisedOn: '2026-06-15' }))).toEqual({ ok: false, reason: 'no_rate' });
    await expect(as(accountant, (c) => c.query(`insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, null, 1250000, 1935150, 1250000, '2026-06-15', $5)`, [A, S.asha, Y26, C5, ACCOUNTANT]))).rejects.toThrow(/null value|not-null/);
    expect((await db.pg.query(`select count(*)::int as n from rte_claims`)).rows[0].n).toBe(0);
  });

  it('the state’s rate is typed with where it comes from; a new one replaces it and nothing is overwritten', async () => {
    const type = (who: Who, rate: string, source: string, sessionId = Y26) => as(who, (c) => typeRate(c, actor(who), { sessionId, rate, source }));
    expect(await type(accountant, '0', 'Haryana notification of 2026')).toEqual({ ok: false, reason: 'rate' });
    expect(await type(accountant, '12500.505', 'Haryana notification of 2026')).toEqual({ ok: false, reason: 'rate' });
    expect(await type(accountant, '12500', '  ')).toEqual({ ok: false, reason: 'source' });
    expect(await type(accountant, '12500', '1234 5678 9012')).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await type(teacher, '12500', 'Haryana notification of 2026')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await type(accountant, '12500', 'Haryana notification of 2026', u(99))).toEqual({ ok: false, reason: 'unknown_session' });
    const made = await type(accountant, '12,500', 'Haryana RTE notification for 2026-27, Annexure A');
    expect(made.ok).toBe(true);
    rates.y26first = (made as { rateId: string }).rateId;
    const d = await desk(principal, Y26, '2026-10-14');
    expect(d.rate).toMatchObject({ rate_minor: 1250000, source: 'Haryana RTE notification for 2026-27, Annexure A', typed_by: 'Anil Accountant' });
    // Never changed or removed, and never typed into the past.
    await expect(as(accountant, (c) => c.query(`update rte_rates set rate_minor = 1 where rate_id = $1`, [rates.y26first]))).rejects.toThrow(/permission denied/);
    await expect(as(accountant, (c) => c.query(`delete from rte_rates where rate_id = $1`, [rates.y26first]))).rejects.toThrow(/permission denied/);
    const typedAt = await as(accountant, async (c) => {
      await c.query(`insert into rte_rates (school_id, session_id, rate_minor, source, typed_by, typed_at) values ($1, $2, 1, 'Typed into the past', $3, '2020-01-01')`, [A, Y25, ACCOUNTANT]);
      const r = (await c.query(`select typed_at from rte_rates where source = 'Typed into the past'`)).rows[0].typed_at;
      throw Object.assign(new Error('roll back'), { typedAt: r });
    }).catch((e) => e.typedAt);
    expect(new Date(typedAt).getUTCFullYear()).toBeGreaterThan(2020);
    await expect(as(accountant, (c) => c.query(`insert into rte_rates (school_id, session_id, rate_minor, source, typed_by) values ($1, $2, 100, '123412341234', $3)`, [A, Y26, ACCOUNTANT]))).rejects.toThrow(/check constraint/);
    expect((await audit('rte.rate_typed')).map((r: { after_state: unknown }) => r.after_state)).toEqual([{ session: '2026-27', rateMinor: 1250000, source: 'Haryana RTE notification for 2026-27, Annexure A' }]);
  });

  it('the claim equals min(rate, fee) to the rupee for each child, from the class’s own fee structure', async () => {
    const d = await desk(accountant, Y26, '2026-10-14');
    // Asha, 5-A: tuition 3 x 1,500.50 + 9 x 1,650 = 19,351.50 (transport not covered, admission once): claimed at the rate, 12,500.
    expect(child(d, S.asha).proposed).toEqual({ fee_minor: 1935150, rate_minor: 1250000, amount_minor: 1250000, applied: 'rate' });
    // Bina, 6-A, waiting for consent (the accountant still sees her here): 12 x 1,000 = 12,000, below the rate: claimed at the fee.
    expect(child(d, S.bina).proposed).toEqual({ fee_minor: 1200000, rate_minor: 1250000, amount_minor: 1200000, applied: 'fee' });
    // Dev, 5-A, admitted in August: on this year's sheet. Farah has no class. Esha has left: not on this year's sheet. Chetan is not RTE.
    expect(child(d, S.dev).proposed?.amount_minor).toBe(1250000);
    expect(child(d, S.farah)).toMatchObject({ onSheet: true, blocked: 'no_class', proposed: null });
    expect(child(d, S.esha)).toMatchObject({ onSheet: false, offSheet: 'left', proposed: null });
    expect(child(d, S.chetan)).toBeUndefined();
    expect(d.totals).toMatchObject({ onSheet: 4, ready: 3, toRaiseMinor: 1250000 + 1200000 + 1250000, raisedMinor: 0 });

    const raised = await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y26, studentIds: [S.asha, S.chetan, S.farah], raisedOn: '2026-06-15' }));
    expect(raised).toMatchObject({ ok: true, raised: [{ studentId: S.asha, amountMinor: 1250000 }], skipped: [{ studentId: S.chetan, reason: 'not_rte' }, { studentId: S.farah, reason: 'no_class' }] });
    expect(await claimOf(S.asha, Y26)).toMatchObject({ state: 'raised', class_id: C5, rate_id: rates.y26first, rate_minor: 1250000, fee_minor: 1935150, amount_minor: 1250000, raised_on: expect.anything(), raised_by: ACCOUNTANT });
    // Once a year: the same child again is refused, by the app and the database.
    expect(await as(principal, (c) => raiseClaims(c, actor(principal), { sessionId: Y26, studentIds: [S.asha], raisedOn: '2026-06-15' }))).toEqual({ ok: false, reason: 'claimed' });
    await expect(as(principal, (c) => c.query(`insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, $5, 1250000, 1935150, 1250000, '2026-06-15', $6)`, [A, S.asha, Y26, C5, rates.y26first, PRINCIPAL]))).rejects.toThrow(/duplicate key|unique/);

    // A new rate replaces the old one for claims raised after it; Asha's keeps 12,500. Bina is now claimed at 11,000.
    const second = await as(admin, (c) => typeRate(c, actor(admin), { sessionId: Y26, rate: '11000', source: 'Haryana RTE notification for 2026-27, revised' }));
    rates.y26second = (second as { rateId: string }).rateId;
    const after = await desk(accountant, Y26, '2026-10-14');
    expect(after.rate?.rate_minor).toBe(1100000);
    expect(after.earlierRates.map((r) => r.rate_minor)).toEqual([1250000]);
    expect(child(after, S.asha).claim).toMatchObject({ rate_minor: 1250000, amount_minor: 1250000, applied: 'rate' });
    expect(child(after, S.bina).proposed).toEqual({ fee_minor: 1200000, rate_minor: 1100000, amount_minor: 1100000, applied: 'rate' });
    // The database will not take the old rate once a newer one is typed.
    await expect(as(accountant, (c) => c.query(`insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, $5, 1250000, 1200000, 1200000, '2026-06-15', $6)`, [A, S.bina, Y26, C6, rates.y26first, ACCOUNTANT]))).rejects.toThrow(/newer rate/);
    // Nor an amount other than the lower of the two, nor a rate the rate row does not hold.
    await expect(as(accountant, (c) => c.query(`insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, $5, 1100000, 1200000, 1200000, '2026-06-15', $6)`, [A, S.bina, Y26, C6, rates.y26second, ACCOUNTANT]))).rejects.toThrow(/check constraint/);
    await expect(as(accountant, (c) => c.query(`insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, $5, 1300000, 1200000, 1200000, '2026-06-15', $6)`, [A, S.bina, Y26, C6, rates.y26second, ACCOUNTANT]))).rejects.toThrow(/foreign key/);
    // Nor a child who is not RTE, nor a day after today.
    await expect(as(accountant, (c) => c.query(`insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, $5, 1100000, 1935150, 1100000, '2026-06-15', $6)`, [A, S.chetan, Y26, C5, rates.y26second, ACCOUNTANT]))).rejects.toThrow(/admitted under RTE/);
    await expect(as(accountant, (c) => c.query(`insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, $5, 1100000, 1200000, 1100000, (now() at time zone 'Asia/Kolkata')::date + 1, $6)`, [A, S.bina, Y26, C6, rates.y26second, ACCOUNTANT]))).rejects.toThrow(/never after today/);
    expect(await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y26, studentIds: [S.bina], raisedOn: '2026-03-31' }))).toEqual({ ok: false, reason: 'raised_on' });

    const bina = await as(admin, (c) => raiseClaims(c, actor(admin), { sessionId: Y26, studentIds: [S.bina, S.dev], raisedOn: '2026-07-01' }));
    expect(bina).toMatchObject({ ok: true, raised: [{ studentId: S.bina, amountMinor: 1100000 }, { studentId: S.dev, amountMinor: 1100000 }], skipped: [] });
    expect(await claimOf(S.bina, Y26)).toMatchObject({ rate_id: rates.y26second, rate_minor: 1100000, fee_minor: 1200000, amount_minor: 1100000 });
    const done = await desk(accountant, Y26, '2026-10-14');
    expect(done.totals).toMatchObject({ onSheet: 4, ready: 0, toRaiseMinor: 0, raisedMinor: 1250000 + 1100000 + 1100000, paidMinor: 0 });
    // Every claim raised is audited with the figures and the rule.
    const raisedRows = await audit('rte.claim_raised');
    expect(raisedRows).toHaveLength(3);
    expect(raisedRows[0]).toMatchObject({ actor_user_id: ACCOUNTANT, actor_role: 'accountant', after_state: { studentId: S.asha, session: '2026-27', rateMinor: 1250000, feeMinor: 1935150, amountMinor: 1250000, claimedAt: 'rate', raisedOn: '2026-06-15' } });
  });

  it('last year: a child who has left is on a year that is over, and one admitted later is not', async () => {
    await as(principal, (c) => typeRate(c, actor(principal), { sessionId: Y25, rate: '13000', source: 'Haryana RTE notification for 2025-26' }));
    const d = await desk(accountant, Y25, '2026-10-14');
    // 5-A, 2025-26: 12 x 1,400 = 16,800, above the rate: claimed at 13,000. Esha left, but the year is over.
    expect(child(d, S.asha).proposed).toEqual({ fee_minor: 1680000, rate_minor: 1300000, amount_minor: 1300000, applied: 'rate' });
    expect(child(d, S.esha).proposed?.amount_minor).toBe(1300000);
    expect(child(d, S.dev)).toMatchObject({ onSheet: false, offSheet: 'admitted_later', proposed: null });
    // Bina was admitted under RTE in April 2026, after 2025-26.
    expect(child(d, S.bina)).toMatchObject({ onSheet: false, offSheet: 'admitted_later' });
    expect(await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y25, studentIds: [S.dev], raisedOn: '2025-06-01' }))).toEqual({ ok: false, reason: 'not_on_sheet' });
    const r = await as(accountant, (c) => raiseClaims(c, actor(accountant), { sessionId: Y25, studentIds: [S.asha, S.esha], raisedOn: '2025-06-01' }));
    expect(r).toMatchObject({ ok: true, raised: [{ studentId: S.asha, amountMinor: 1300000 }, { studentId: S.esha, amountMinor: 1300000 }] });
    // The database: Dev was admitted under RTE after 2025-26 ended.
    const rate25 = (await db.pg.query(`select rate_id from rte_rates where session_id = $1`, [Y25])).rows[0].rate_id;
    await expect(as(accountant, (c) => c.query(`insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values ($1, $2, $3, $4, $5, 1300000, 1680000, 1300000, '2025-06-01', $6)`, [A, S.dev, Y25, C5, rate25, ACCOUNTANT]))).rejects.toThrow(/admitted under RTE/);
  });

  it('an unpaid claim moves on through the age buckets as time passes, year by year; a paid one leaves the unpaid list', async () => {
    const age = async (today: string) => (await desk(accountant, Y26, today)).ageing;
    // Two claims of 2025-26 raised on 2025-06-01 (13,000 each); three of 2026-27 raised on 2026-06-15 and 2026-07-01.
    const at = (rows: Awaited<ReturnType<typeof age>>, label: string) => rows.find((y) => y.label === label);
    const buckets = (y: ReturnType<typeof at>) => Object.fromEntries((y?.buckets ?? []).map((b) => [b.bucket, b.minor]));
    let rows = await age('2025-07-01');
    expect(rows.map((y) => y.label)).toEqual(['2025-26', '2026-27']);
    expect(buckets(at(rows, '2025-26'))).toEqual({ upTo90: 2600000, upTo180: 0, upTo365: 0, overYear: 0 });
    rows = await age('2025-10-01');
    expect(buckets(at(rows, '2025-26'))).toEqual({ upTo90: 0, upTo180: 2600000, upTo365: 0, overYear: 0 });
    rows = await age('2026-03-01');
    expect(buckets(at(rows, '2025-26'))).toEqual({ upTo90: 0, upTo180: 0, upTo365: 2600000, overYear: 0 });
    rows = await age('2026-10-14');
    expect(at(rows, '2025-26')).toMatchObject({ claims: 2, claimed_minor: 2600000, paid_minor: 0, due_minor: 2600000, oldest_days: 500 });
    expect(buckets(at(rows, '2025-26'))).toEqual({ upTo90: 0, upTo180: 0, upTo365: 0, overYear: 2600000 });
    // 2026-27 on 2026-10-14: Asha raised on 2026-06-15 (121 days), Bina and Dev on 2026-07-01 (105 days).
    expect(buckets(at(rows, '2026-27'))).toEqual({ upTo90: 0, upTo180: 1250000 + 1100000 + 1100000, upTo365: 0, overYear: 0 });
    expect(await unpaidPastFirstBucket(db.pg, A, '2026-10-14')).toBe(5);
    expect(await unpaidPastFirstBucket(db.pg, A, '2026-07-02')).toBe(2);

    // Asha's 2025-26 claim is paid: it leaves the unpaid list.
    const asha25 = (await claimOf(S.asha, Y25)).claim_id;
    const pay = (who: Who, paidOn: string, reference: string, id = asha25) => as(who, (c) => settleClaim(c, actor(who), id, { action: 'paid', paidOn, reference }));
    expect(await pay(accountant, '2025-05-31', 'PFMS/HR/2026/0042')).toEqual({ ok: false, reason: 'paid_on' });
    expect(await pay(accountant, '2099-01-01', 'PFMS/HR/2026/0042')).toEqual({ ok: false, reason: 'paid_on' });
    expect(await pay(accountant, '2026-02-01', '  ')).toEqual({ ok: false, reason: 'reference' });
    expect(await pay(accountant, '2026-02-01', '1234 5678 9012')).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await pay(teacher, '2026-02-01', 'PFMS/HR/2026/0042')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await pay(accountant, '2026-02-01', 'PFMS/HR/2026/0042')).toEqual({ ok: true });
    expect(await pay(principal, '2026-02-02', 'again')).toEqual({ ok: false, reason: 'settled' });
    expect(await claimOf(S.asha, Y25)).toMatchObject({ state: 'paid', reference: 'PFMS/HR/2026/0042', settled_by: ACCOUNTANT });
    rows = await age('2026-10-14');
    expect(at(rows, '2025-26')).toMatchObject({ claimed_minor: 2600000, paid_minor: 1300000, due_minor: 1300000 });
    expect(buckets(at(rows, '2025-26'))).toEqual({ upTo90: 0, upTo180: 0, upTo365: 0, overYear: 1300000 });
    expect(child(await desk(accountant, Y25, '2026-10-14'), S.asha).claim).toMatchObject({ state: 'paid', bucket: 'paid' });
    expect(await unpaidPastFirstBucket(db.pg, A, '2026-10-14')).toBe(4);

    // A paid claim stays as it is; what a claim is for never changes; a claim is never removed.
    await expect(as(principal, (c) => c.query(`update rte_claims set reference = 'other', settled_by = $2 where claim_id = $1`, [asha25, PRINCIPAL]))).rejects.toThrow(/stays as it is/);
    const bina = (await claimOf(S.bina, Y26)).claim_id;
    await expect(as(principal, (c) => c.query(`update rte_claims set amount_minor = 1, fee_minor = 1, settled_by = $2 where claim_id = $1`, [bina, PRINCIPAL]))).rejects.toThrow(/never change/);
    await expect(as(principal, (c) => c.query(`delete from rte_claims where claim_id = $1`, [bina]))).rejects.toThrow(/permission denied/);
    // Marked paid only by oneself.
    await expect(as(accountant, (c) => c.query(`update rte_claims set state = 'paid', paid_on = '2026-08-01', reference = 'x', settled_by = $2 where claim_id = $1`, [bina, PRINCIPAL]))).rejects.toThrow(/row-level security/);

    // Bina's is written off, with why; a note with an Aadhaar number is refused by the app and the database.
    const off = (who: Who, note: string) => as(who, (c) => settleClaim(c, actor(who), bina, { action: 'write_off', note }));
    expect(await off(admin, ' ')).toEqual({ ok: false, reason: 'note' });
    expect(await off(admin, 'Parent gave Aadhaar 1234 5678 9012')).toEqual({ ok: false, reason: 'aadhaar' });
    await expect(as(admin, (c) => c.query(`update rte_claims set state = 'written_off', write_off_note = 'Aadhaar 123456789012', settled_by = $2 where claim_id = $1`, [bina, ADMIN]))).rejects.toThrow(/check constraint/);
    expect(await off(admin, 'The district office refused: the income certificate came after the deadline.')).toEqual({ ok: true });
    const y26 = at(await age('2026-10-14'), '2026-27');
    expect(y26).toMatchObject({ claims: 3, written_off_minor: 1100000, due_minor: 1250000 + 1100000 });
    expect((await audit('rte.claim_paid'))[0]).toMatchObject({ actor_user_id: ACCOUNTANT, target_id: asha25, before_state: { state: 'raised', amountMinor: 1300000 }, after_state: { state: 'paid', paidOn: '2026-02-01', reference: 'PFMS/HR/2026/0042' } });
    expect((await audit('rte.claim_written_off'))[0]).toMatchObject({ actor_user_id: ADMIN, target_id: bina, after_state: { state: 'written_off', amountMinor: 1100000 } });
  });

  it('the evidence file: the child’s own captured documents or a typed note, never an Aadhaar number or an Aadhaar card', async () => {
    const add = (who: Who, input: Partial<{ studentId: string; kind: string; documentId: string | null; note: string | null }>) => as(who, (c) => addEvidence(c, actor(who), { studentId: S.asha, kind: 'admission_order', documentId: null, note: null, ...input }));
    expect(await add(accountant, {})).toEqual({ ok: false, reason: 'nothing' });
    expect(await add(accountant, { kind: 'passport', note: 'x' })).toEqual({ ok: false, reason: 'kind' });
    expect(await add(accountant, { note: 'Aadhaar 1234-5678-9012 seen' })).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await add(accountant, { documentId: DOC.chetanBirth })).toEqual({ ok: false, reason: 'document' });
    expect(await add(accountant, { documentId: DOC.ashaAadhaar })).toEqual({ ok: false, reason: 'document' });
    expect(await add(accountant, { studentId: S.chetan, note: 'Not RTE' })).toEqual({ ok: false, reason: 'not_rte' });
    expect(await add(teacher, { note: 'x' })).toEqual({ ok: false, reason: 'not_allowed' });
    const order = await add(accountant, { kind: 'lottery', documentId: DOC.ashaBirth, note: 'Lottery of 12 April 2025, list 3, number 14' });
    expect(order.ok).toBe(true);
    const income = await add(admin, { kind: 'income_or_category', note: 'Income certificate seen by the office on 10 April 2025.' });
    expect(income.ok).toBe(true);
    // The database holds the same rules.
    await expect(as(accountant, (c) => c.query(`insert into rte_evidence (school_id, student_id, kind, document_id, added_by) values ($1, $2, 'other', $3, $4)`, [A, S.asha, DOC.ashaAadhaar, ACCOUNTANT]))).rejects.toThrow(/never an Aadhaar card/);
    await expect(as(accountant, (c) => c.query(`insert into rte_evidence (school_id, student_id, kind, document_id, added_by) values ($1, $2, 'other', $3, $4)`, [A, S.asha, DOC.chetanBirth, ACCOUNTANT]))).rejects.toThrow(/own captured documents/);
    await expect(as(accountant, (c) => c.query(`insert into rte_evidence (school_id, student_id, kind, note, added_by) values ($1, $2, 'other', '123412341234', $3)`, [A, S.asha, ACCOUNTANT]))).rejects.toThrow(/check constraint/);
    await expect(as(accountant, (c) => c.query(`insert into rte_evidence (school_id, student_id, kind, note, added_by) values ($1, $2, 'other', 'x', $3)`, [A, S.chetan, ACCOUNTANT]))).rejects.toThrow(/admitted under RTE/);
    await expect(as(accountant, (c) => c.query(`insert into rte_evidence (school_id, student_id, kind, note, added_by) values ($1, $2, 'other', 'x', $3)`, [A, S.asha, ADMIN]))).rejects.toThrow(/row-level security/);
    await expect(as(accountant, (c) => c.query(`update rte_evidence set note = 'changed'`))).rejects.toThrow(/permission denied/);

    const d = await desk(accountant, Y26, '2026-10-14');
    const asha = child(d, S.asha);
    expect(asha.evidence.map((e) => [e.kind, e.document?.doc_type ?? null, e.added_by])).toEqual([['lottery', 'birth_certificate', 'Anil Accountant'], ['income_or_category', null, 'Asif Admin']]);
    // The Aadhaar card capture is never offered.
    expect(asha.documents.map((x) => x.document_id)).toEqual([DOC.ashaBirth]);
    expect(d.totals.noEvidence).toBe(3);

    expect(await as(principal, (c) => removeEvidence(c, actor(principal), (income as { evidenceId: string }).evidenceId))).toEqual({ ok: true });
    expect(await as(principal, (c) => removeEvidence(c, actor(principal), (income as { evidenceId: string }).evidenceId))).toEqual({ ok: false, reason: 'not_found' });
    expect(child(await desk(accountant, Y26, '2026-10-14'), S.asha).evidence).toHaveLength(1);
    expect((await audit('rte.evidence_added')).map((r: { after_state: { kind: string; withNote: boolean } }) => [r.after_state.kind, r.after_state.withNote])).toEqual([['lottery', true], ['income_or_category', true]]);
    // The note's words are not copied into the append-only audit trail.
    expect(JSON.stringify(await audit('rte.evidence_added'))).not.toContain('Lottery of 12 April');
    expect(await audit('rte.evidence_removed')).toHaveLength(1);
  });

  it('roles are held by the database: a teacher and the coordinator read nothing, another school nothing, the platform nothing', async () => {
    const counts = (who: Who) => as(who, async (c) => (await c.query(`select (select count(*)::int from rte_rates) as rates, (select count(*)::int from rte_claims) as claims, (select count(*)::int from rte_evidence) as evidence, (select count(*)::int from public.rte_claim_children()) as children, (select count(*)::int from audit_log where event_action like 'rte.%') as audit`)).rows[0]);
    expect(await counts(accountant)).toEqual({ rates: 3, claims: 5, evidence: 1, children: 5, audit: expect.any(Number) });
    expect((await counts(accountant)).audit).toBeGreaterThan(0);
    for (const who of [teacher, coordinator]) {
      expect(await counts(who), who.role).toEqual({ rates: 0, claims: 0, evidence: 0, children: 0, audit: 0 });
      expect(await as(who, (c) => loadDesk(c, actor(who), { sessionId: Y26 }))).toBeNull();
      await expect(as(who, (c) => c.query(`insert into rte_rates (school_id, session_id, rate_minor, source, typed_by) values ($1, $2, 100, 'From the teacher', $3)`, [A, Y26, who.user])), who.role).rejects.toThrow(/row-level security/);
      await expect(as(who, (c) => c.query(`insert into rte_evidence (school_id, student_id, kind, note, added_by) values ($1, $2, 'other', 'x', $3)`, [A, S.asha, who.user])), who.role).rejects.toThrow(/row-level security|admitted under RTE/);
      const changed = await as(who, async (c) => (await c.query(`update rte_claims set state = 'paid', paid_on = '2026-08-01', reference = 'x', settled_by = $1 returning claim_id`, [who.user])).rows);
      expect(changed, who.role).toEqual([]);
    }
    // Another school's principal: none of School A's rows, and cannot write into School A.
    expect(await counts(principalB)).toEqual({ rates: 0, claims: 0, evidence: 0, children: 0, audit: 0 });
    await expect(as(principalB, (c) => c.query(`insert into rte_rates (school_id, session_id, rate_minor, source, typed_by) values ($1, $2, 100, 'Into school A', $3)`, [A, Y26, PRINCIPAL_B]))).rejects.toThrow(/row-level security|foreign key/);
    // The platform role holds nothing on these tables.
    for (const table of ['rte_rates', 'rte_claims', 'rte_evidence']) await expect(platform((c) => c.query(`select count(*) from ${table}`)), table).rejects.toThrow(/permission denied/);
    // The person who acted still reads their own audit rows; everyone else outside the three roles reads none.
    expect(await as({ role: 'teacher', user: ACCOUNTANT, school: A }, async (c) => (await c.query(`select count(*)::int as n from audit_log where event_action like 'rte.%'`)).rows[0].n)).toBeGreaterThan(0);
  });

  it('the claim sheet as a CSV, to the rupee, with a total', async () => {
    const d = await desk(accountant, Y26, '2026-10-14');
    const file = rteSheetCsv('en', d);
    expect(file.header).toEqual(['Child', 'Admission no.', 'Class', 'School fee for the year (₹)', 'State rate (₹)', 'Claim (₹)', 'Claimed at', 'State', 'Raised on', 'Paid on', 'Reference', 'Evidence']);
    const byName = Object.fromEntries(file.rows.map((r) => [r[0], r]));
    expect(byName.Asha).toEqual(['Asha', 'A-1', '5-A', '19351.50', '12500.00', '12500.00', 'The state rate', 'Raised', '2026-06-15', '', '', 1]);
    expect(byName.Bina.slice(3, 8)).toEqual(['12000.00', '11000.00', '11000.00', 'The state rate', 'Written off']);
    expect(byName.Farah.slice(3, 8)).toEqual(['', '11000.00', '', '', 'Not raised']);
    expect(byName.Esha).toBeUndefined();
    // Written off is not counted in the total: Asha 12,500 + Dev 11,000.
    expect(file.rows[file.rows.length - 1]).toEqual(['Total', '', '', '', '', '23500.00', '', '', '', '', '', '']);
    expect(rteSheetCsv('hi', d).header[0]).toBe('बच्चा');
  });

  it('My Day: the three roles see the claims unpaid past the first age bucket, and nobody else', async () => {
    const provider = TODAY_PROVIDERS.find((p) => p.type === 'rte-claims-unpaid');
    expect(provider?.roles).toEqual(['principal', 'school_admin', 'accountant']);
    expect(provider?.moduleId).toBe('fees');
    const cards = await as(accountant, (c) => provider!.load(c, { schoolId: A, userId: ACCOUNTANT, role: 'accountant', sunday: false } as never));
    expect(cards).toEqual([{ id: 'rte-claims-unpaid', type: 'rte-claims-unpaid', moduleId: 'fees', state: 'todo', count: expect.any(Number), href: '/app/fees/rte' }]);
    expect(cards[0].count).toBeGreaterThanOrEqual(1);
    expect(await as(teacher, (c) => provider!.load(c, { schoolId: A, userId: TEACHER, role: 'teacher', sunday: false } as never))).toEqual([]);
  });
  it('lead, at integration: an erasure removes the child’s evidence file; their claims, money the state owes, are kept', async () => {
    const evidenceOf = async (student: string) => (await db.pg.query(`select count(*)::int as n from rte_evidence where student_id = $1`, [student])).rows[0].n;
    const added = await as(accountant, (c) => addEvidence(c, actor(accountant), { studentId: S.dev, kind: 'income_or_category', documentId: null, note: 'Category certificate seen by the office.' }));
    expect(added.ok).toBe(true);
    const claims = (await db.pg.query(`select count(*)::int as n from rte_claims where student_id = $1`, [S.dev])).rows[0].n;
    const ashaKept = await evidenceOf(S.asha);
    const done = await as(principal, (c) => pseudonymizeStudent(c, A, S.dev));
    expect([done.rteEvidenceRemoved, await evidenceOf(S.dev)]).toEqual([1, 0]);
    expect((await db.pg.query(`select count(*)::int as n from rte_claims where student_id = $1`, [S.dev])).rows[0].n).toBe(claims);
    expect(await evidenceOf(S.asha)).toBe(ashaKept);
  });
});
