import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Fees in the Family app (W20-A, H1), on the real schema through the real pool:
//   1. A linked parent sees only their own matched child's dues (with the concession), receipts and the school's UPI.
//   2. Another family's child, and another account, see nothing of it.
//   3. "Pay by UPI" gives the family's one payment link: the school's UPI ID, the right paise, made once.
//   4. "I have paid" lands as the school's own direct-UPI claim, for the office to check; nothing is credited.
//   5. The parent's session writes nothing in the school's fee tables.
//   6. The office's nightly reminder reaches the Family app's feed.

const A = 'd3000000-0000-4000-8000-00000000000a';
const B = 'd3000000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'd3000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'd3000000-0000-4000-8000-0000000000a2';
const P1 = 'd3000000-0000-4000-8000-0000000000e1'; // guardian of S1 and S3 (one family)
const P2 = 'd3000000-0000-4000-8000-0000000000e2'; // guardian of S2 (another family)
const S1 = 'd3000000-0000-4000-8000-0000000005a1';
const S2 = 'd3000000-0000-4000-8000-0000000005a2';
const S3 = 'd3000000-0000-4000-8000-0000000005a3';
const SB = 'd3000000-0000-4000-8000-0000000005b1';
const FAMILY = 'd3000000-0000-4000-8000-00000000f001';
const C6 = 'd3000000-0000-4000-8000-0000000000c6';
const HEAD = 'd3000000-0000-4000-8000-0000000000d1';
const L1 = 'd3000000-0000-4000-8000-000000000f01'; // S1 tuition: 1,500 less a 300 concession, 300 paid, past its date
const L2 = 'd3000000-0000-4000-8000-000000000f02'; // S1: 500 due in 3 days (the reminder's line)
const L3 = 'd3000000-0000-4000-8000-000000000f03'; // S2 (another family): 999 due in 3 days, 100 paid
const L4 = 'd3000000-0000-4000-8000-000000000f04'; // S3 (S1's sibling, not matched in the app): 400 due in 10 days
const LB = 'd3000000-0000-4000-8000-000000000f09'; // School B
const ACCOUNT = 'f9300000-0000-4000-8000-0000000000a1';
const OTHER_ACCOUNT = 'f9300000-0000-4000-8000-0000000000b1';
const CHILD = 'f9300000-0000-4000-8000-0000000000c1';
const OTHER_CHILD = 'f9300000-0000-4000-8000-0000000000c2';
const UPI = { upiId: 'school.fees@okbank', payeeName: 'School A', bankName: 'An Example Bank', accountLast4: '4821', ifsc: 'EXMP0001234', verifiers: ['accountant', 'principal'], principalLimitMinor: 0, notify: 'digest' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let cookie = '';
let otherCookie = '';
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
const indiaDay = (offset: number) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asStaff = (role: string, user: string) => (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': A, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query('set local role nca_super');
    return fn(c);
  });
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const call = async (method: 'GET' | 'POST', route: string, body: unknown, c = cookie, search = '') => {
  const mod = await import(`@/app/api/family/school/${route}/route`);
  const url = `http://localhost/api/family/school/${route}${search}`;
  const res = await mod[method](new NextRequest(url, method === 'GET' ? { headers: { cookie: c } } : { method, headers: { cookie: c, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status as number, body: await res.json() };
};
const fees = (childId = CHILD, c = cookie) => call('GET', 'fees', null, c, `?childId=${childId}`);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-school-fees-tests-0123456789ab';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Anil Accountant', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${ACCOUNTANT}', '${A}', 'accountant', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6}', '${A}', '6-A', '6', 'A');
    insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'FAM-1', '${PRINCIPAL}');
    insert into students (student_id, school_id, admission_no, name, class_id, status, family_id) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6}', 'active', '${FAMILY}'), ('${S3}', '${A}', 'A-3', 'Kiran Kumar', '${C6}', 'active', '${FAMILY}'),
      ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6}', 'active', null), ('${SB}', '${B}', 'B-1', 'Other School Child', null, 'active', null);
    insert into parents (parent_id, school_id, name, phone, relation, email) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father', 'rajesh@example.invalid'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother', null);
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P1}', '${S3}'), ('${A}', '${P2}', '${S2}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S3}', 'core_records', true, 'school_attested', 'v1'),
      ('${A}', '${S1}', 'operational_communication', true, 'school_attested', 'v1');
    insert into fee_heads (head_id, school_id, name) values ('${HEAD}', '${A}', 'Tuition');
    insert into fees_ledger (fee_id, school_id, student_id, head_id, period_key, gross_minor, concession_minor, amount_minor, due_date) values
      ('${L1}', '${A}', '${S1}', '${HEAD}', '2026-11', 150000, 30000, 120000, '${indiaDay(-2)}'),
      ('${L2}', '${A}', '${S1}', null, null, null, 0, 50000, '${indiaDay(3)}'),
      ('${L3}', '${A}', '${S2}', '${HEAD}', '2026-11', 99900, 0, 99900, '${indiaDay(3)}'),
      ('${L4}', '${A}', '${S3}', '${HEAD}', '2026-11', 40000, 0, 40000, '${indiaDay(10)}'),
      ('${LB}', '${B}', '${SB}', null, null, null, 0, 70000, '${indiaDay(3)}');
    insert into payment_methods (school_id, method, enabled, settings, updated_by) values ('${A}', 'direct_upi', true, '${JSON.stringify(UPI)}', '${PRINCIPAL}');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org'), ('${OTHER_ACCOUNT}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${OTHER_CHILD}', '${OTHER_ACCOUNT}', 'Zoya', 6, 'CBSE', 'en', 'en', 'IN-DL');
  `);
  // Money received at the counter, as the office takes it today: S1's tuition in part, and the other family's in part.
  const { takePayment } = await import('@/lib/fees/payments');
  const actor = { schoolId: A, userId: ACCOUNTANT, role: 'accountant' as never };
  expect(await asStaff('accountant', ACCOUNTANT)((c) => takePayment(c, actor, { studentId: S1, scope: 'student', amountMinor: 30000, method: 'cash', reference: null, allocations: [{ feeId: L1, amountMinor: 30000 }] }))).toMatchObject({ ok: true });
  expect(await asStaff('accountant', ACCOUNTANT)((c) => takePayment(c, actor, { studentId: S2, scope: 'student', amountMinor: 10000, method: 'cash', reference: null, allocations: [{ feeId: L3, amountMinor: 10000 }] }))).toMatchObject({ ok: true });

  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' };
  cookie = `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
  const o = { accountId: OTHER_ACCOUNT, tokenVersion: 0, sessionId: 's2' };
  otherCookie = `ncf_session=${await signFamilySession(o)}; ncf_parent=${await signParentMode(o)}`;
  // The school's office gives P1 a code; the parent connects and matches Aarav (not Kiran) to the app's child.
  const { issueConnectCode } = await import('@/lib/school-link');
  const { code } = await asStaff('principal', PRINCIPAL)((c) => issueConnectCode(c, { userId: PRINCIPAL, role: 'principal', schoolId: A }, P1));
  const linked = await call('POST', 'connect', { code });
  expect(linked.status).toBe(200);
  expect(await call('POST', 'children', { linkId: linked.body.linkId, pairs: [{ studentId: S1, childId: CHILD }, { studentId: S3, childId: null }] })).toEqual({ status: 200, body: { ok: true } });
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('1-2. what a linked parent reads', () => {
  it('the matched child’s dues with the concession and what was paid, the total, the receipts and the school’s UPI', async () => {
    const r = await fees();
    expect(r.status).toBe(200);
    const f = r.body.fees;
    expect(f.studentName).toBe('Aarav Kumar');
    expect(f.dues.map((d: Record<string, unknown>) => [d.feeId, d.head, d.grossMinor, d.concessionMinor, d.netMinor, d.paidMinor, d.balanceMinor, d.overdue])).toEqual([
      [L1, 'Tuition', 150000, 30000, 120000, 30000, 90000, true],
      [L2, null, 50000, 0, 50000, 0, 50000, false],
    ]);
    expect(f.totalMinor).toBe(140000);
    expect(f.receipts).toEqual([{ receiptNo: expect.any(String), issuedAt: expect.any(String), method: 'cash', amountMinor: 30000, reversed: false }]);
    expect(f.upi).toBe(true);
    expect(f.pay).toBeNull();
    // Nothing of the other family: not its dues, its payment, nor its receipt.
    expect(JSON.stringify(r.body)).not.toContain(L3);
    expect(JSON.stringify(r.body)).not.toContain('Bela');
  });

  it('as the guardian, the school’s own rules show only this guardian’s children’s fee rows', async () => {
    const { withGuardianContext } = await import('@/lib/auth/db');
    const link = (await q(`select link_id from family.school_links where account_id = $1 and revoked_at is null`, [ACCOUNT]))[0].link_id;
    const seen = await withGuardianContext(claims, link, async (c) => ({
      dues: (await c.query(`select fee_id from fees_ledger order by fee_id`)).rows.map((x) => x.fee_id),
      payments: (await c.query(`select p.fee_id from payments p`)).rows.map((x) => x.fee_id),
      receipts: (await c.query(`select student_id from receipts`)).rows.map((x) => x.student_id),
    }));
    expect(seen.dues).toEqual([L1, L2, L4]);
    expect(seen.payments).toEqual([L1]);
    expect(seen.receipts).toEqual([S1]);
  });

  it('a child not matched, another account, or no parent mode: nothing', async () => {
    expect((await fees(OTHER_CHILD)).status).toBe(404);
    expect((await fees(OTHER_CHILD, otherCookie)).status).toBe(404);
    expect((await fees(CHILD, otherCookie)).status).toBe(404);
    expect((await fees(CHILD, cookie.replace(/; ncf_parent=[^;]+/, ''))).status).toBe(403);
    expect((await fees('not-a-uuid')).status).toBe(400);
  });
});

describe('3-4. paying by UPI and saying so', () => {
  it('"Pay by UPI" gives the family’s one link: the school’s UPI ID and everything the family owes, to the paisa, made once', async () => {
    const r = await call('POST', 'fees', { childId: CHILD });
    expect(r.status).toBe(200);
    const pay = r.body.pay;
    // Aarav 900 + 500, and his sibling Kiran 400: the family's one link (C168).
    expect(pay.amountMinor).toBe(180000);
    expect(pay.upiId).toBe('school.fees@okbank');
    expect(pay.reference).toMatch(/^NCA-[A-HJ-KM-NP-Z2-9]{8}$/);
    const uri = new URL(pay.uri);
    expect(uri.protocol).toBe('upi:');
    expect(uri.searchParams.get('pa')).toBe('school.fees@okbank');
    expect(uri.searchParams.get('am')).toBe('1800.00');
    expect(uri.searchParams.get('tn')).toBe(pay.reference);
    expect(pay.qrSvg).toMatch(/^<svg/);
    expect(JSON.stringify(r.body)).not.toMatch(/token/i);
    expect(await q(`select origin, created_by, amount_minor::int as amount, family_id from payment_links where school_id = $1`, [A])).toEqual([{ origin: 'family_app', created_by: null, amount: 180000, family_id: FAMILY }]);
    expect((await call('POST', 'fees', { childId: CHILD })).body.pay.reference).toBe(pay.reference);
    expect(await q(`select count(*)::int as n from payment_links`)).toEqual([{ n: 1 }]);
    expect((await fees()).body.fees.pay).toMatchObject({ reference: pay.reference, amountMinor: 180000, claim: 'none' });
  });

  it('only the platform role makes a link with no person', async () => {
    const tried = await asStaff('accountant', ACCOUNTANT)((c) =>
      c.query(`insert into payment_links (school_id, student_id, token, amount_minor, created_by, origin, expires_at) values ($1, $2, repeat('x', 43), 100, null, 'family_app', now() + interval '1 day')`, [A, S2])
    ).then(() => 'allowed', (e: Error) => e.message);
    expect(tried).not.toBe('allowed');
  });

  it('"I have paid" with the UTR lands as the school’s claim; the office sees it; nothing is credited', async () => {
    const paidBefore = await q(`select count(*)::int as n from payments`);
    expect(await call('POST', 'fees/claim', { childId: CHILD, utr: '1234 5678' })).toEqual({ status: 400, body: { error: 'utr' } });
    expect(await call('POST', 'fees/claim', { childId: CHILD, utr: '123456789012' }, otherCookie)).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await call('POST', 'fees/claim', { childId: CHILD, utr: '1234 5678 9012' })).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select utr, status, amount_minor::int as amount from payment_reports`)).toEqual([{ utr: '123456789012', status: 'reported', amount: 180000 }]);
    const { waitingReports } = await import('@/lib/payments/upi');
    const waiting = await asStaff('accountant', ACCOUNTANT)((c) => waitingReports(c, A));
    expect(waiting.map((w: { utr: string; amount_minor: number; payer: string }) => [w.utr, w.amount_minor, w.payer])).toEqual([['123456789012', 180000, 'FAM-1 · Aarav Kumar']]);
    expect(await q(`select count(*)::int as n from payments`)).toEqual(paidBefore);
    expect((await fees()).body.fees.pay.claim).toBe('being_verified');
    expect(await call('POST', 'fees/claim', { childId: CHILD, utr: '123456789013' })).toEqual({ status: 409, body: { error: 'already_reported' } });
  });
});

describe('5. the parent writes nothing', () => {
  it('a guardian session cannot add, change or remove a payment, a receipt, a fee name or a reminder', async () => {
    const { withGuardianContext } = await import('@/lib/auth/db');
    const link = (await q(`select link_id from family.school_links where account_id = $1 and revoked_at is null`, [ACCOUNT]))[0].link_id;
    const attempt = (sql: string) => withGuardianContext(claims, link, (c) => c.query(sql)).then((r) => `rows:${r.rowCount}`, () => 'refused');
    expect(await attempt(`insert into payments (school_id, fee_id, amount_minor, method) values ('${A}', '${L2}', 100, 'upi')`)).toBe('refused');
    expect(await attempt(`update receipts set reference = 'x'`)).toMatch(/^(refused|rows:0)$/);
    expect(await attempt(`delete from fee_heads`)).toMatch(/^(refused|rows:0)$/);
    expect(await attempt(`update fee_heads set name = 'x'`)).toMatch(/^(refused|rows:0)$/);
    expect(await q(`select name from fee_heads`)).toEqual([{ name: 'Tuition' }]);
  });
});

describe('6. the reminder reaches the feed', () => {
  it('the office’s nightly reminder (email) shows in the Family app’s feed with what is still owed of it', async () => {
    await db.pg.query(`insert into school_settings (school_id, module_id, setting_values, schema_version, updated_by) values ($1, 'fees', $2, 6, $3) on conflict (school_id, module_id) do update set setting_values = excluded.setting_values`, [A, JSON.stringify({ reminders_enabled: true }), PRINCIPAL]);
    const { runFeeReminders } = await import('@/lib/fees/reminders');
    const { createPgJobQueue } = await import('@/lib/jobs/pg-queue');
    const today = indiaDay(0);
    const run = await platform((c) => runFeeReminders(c, createPgJobQueue(platform), A, today, {}));
    expect(run.sent).toBeGreaterThan(0);
    expect(await q(`select fee_id, outcome, channel from fee_reminders where payer_id = $1`, [FAMILY])).toEqual([{ fee_id: L2, outcome: 'sent', channel: 'email' }]);
    const { withFamilyContext } = await import('@/lib/auth/db');
    const { activeLinks, schoolFeeRemindersFor } = await import('@/lib/family/school');
    const links = await withFamilyContext(claims, (c) => activeLinks(c, ACCOUNT));
    const feed = await schoolFeeRemindersFor(claims, links, []);
    expect(feed).toEqual([{ id: expect.any(String), schoolName: 'School A', amountMinor: 50000, dueDate: indiaDay(3), sentOn: today }]);
    // Off with the school's notices; and the pure list shows it as a 'fee' item.
    expect(await schoolFeeRemindersFor(claims, links, ['notices'])).toEqual([]);
    const { buildNotifications } = await import('@/lib/family/notifications');
    expect(buildNotifications({ news: null, fees: feed, tonight: [], requests: [] }).map((i) => i.kind)).toEqual(['fee']);
    // Another account's family has no link and reads nothing.
    expect(await schoolFeeRemindersFor({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, links, [])).toEqual([]);
  });
});
