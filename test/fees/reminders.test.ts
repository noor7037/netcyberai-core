import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { renderEmail } from '@/lib/email/templates';
import { feeClearance, overrideClearance } from '@/lib/fees/clearance';
import { feesNightlyHandler } from '@/lib/fees/nightly';
import { recordFollowUp } from '@/lib/fees/recovery';
import { runFeeReminders } from '@/lib/fees/reminders';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { indiaDate } from '@/lib/time/india';

// Fee reminders by email and the clearance gate (docs/23 6g, C179). Every address here is on example.invalid.

describe('the reminder email', () => {
  it('names the school, the amount and the date, with the link; never a child', () => {
    const data = { schoolName: 'A <b>School</b>', amount: '2,300.50', dueDate: '2099-04-10', payUrl: 'https://example.invalid/pay/tok' };
    const before = renderEmail('fee_reminder', { ...data, kind: 'before_3' });
    expect(before.subject).toBe('Fee reminder: ₹2,300.50, A <b>School</b>');
    expect(before.html).toContain('A &lt;b&gt;School&lt;/b&gt;');
    expect(before.html).not.toContain('<b>School</b>');
    expect(before.text).toContain('are due on 10-04-2099');
    expect(before.text).toContain('https://example.invalid/pay/tok');
    expect(renderEmail('fee_reminder', { ...data, kind: 'due_day' }).text).toContain('are due today');
    const after = renderEmail('fee_reminder', { ...data, kind: 'after_7', payUrl: '' });
    expect(after.subject).toMatch(/^Fees overdue: /);
    expect(after.text).toContain('Please pay at the school office.');
    expect(after.html).not.toContain('<a ');
    expect(renderEmail('fee_reminder', { ...data, kind: 'due_day', total: '3,000.00' }).text).toContain('₹3,000.00 in all');
    expect(before.text).not.toContain('in all');
  });
});

const A = 'aa000000-0000-4000-8000-000000000001';
const T = 'aa000000-0000-4000-8000-000000000002'; // a test school
const PRINCIPAL = 'aa000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'aa000000-0000-4000-8000-0000000000a2';
const TEACHER = 'aa000000-0000-4000-8000-0000000000a3';
const FAMILY = 'aa000000-0000-4000-8000-00000000f001';
const sid = (n: number) => `aa000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const pid = (n: number) => `aa000000-0000-4000-8000-0000007000${String(n).padStart(2, '0')}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const teacher: Who = { role: 'teacher', user: TEACHER };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const today = indiaDate();
const day = (offset: number) => indiaDate(new Date(Date.now() + offset * 86400_000));
const night = (school = A, on = today) => platform((c) => runFeeReminders(c, queue, school, on));
const emails = async () => (await db.pg.query(`select payload->'to' as "to", payload->'data' as data, idempotency_key as key from jobs where type = 'email.send' and payload->>'template' = 'fee_reminder' order by created_at, job_id`)).rows;
const reminders = async () => (await db.pg.query(`select s.name, r.which, r.outcome, r.held_reason as why from fee_reminders r join fees_ledger l on l.fee_id = r.fee_id join students s on s.student_id = l.student_id order by s.name, r.which`)).rows;
const switchOn = (on: boolean, school = A) => db.pg.query(`insert into school_settings (school_id, module_id, setting_values, schema_version, updated_by) values ($1, 'fees', $2, 6, $3) on conflict (school_id, module_id) do update set setting_values = excluded.setting_values`, [school, JSON.stringify({ reminders_enabled: on }), PRINCIPAL]);
const reset = () => db.pg.exec(`set session_replication_role = replica; delete from fee_reminders; delete from jobs; delete from payment_link_lines; delete from payment_links; delete from fee_followups; delete from fee_concessions; set session_replication_role = origin;`);
const refused = async (run: () => Promise<unknown>) => run().then(() => 'allowed', (e: Error) => e.message);

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // Asha and Bina are one family (guardian with an email, consent given); Chetan's guardian has no email;
    // Deepa's guardian has an email but consent is withdrawn; Esha's fee is due on another day.
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${T}', 'Test School', 'IN-DL', true);
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant'), ('${TEACHER}', '${A}', 'teacher@school-a.example', 'teacher', 'Teacher A');
      insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${ACCOUNTANT}', '${A}', 'accountant', true), ('${TEACHER}', '${A}', 'teacher', true);
      insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'FAM-1', '${PRINCIPAL}');
      insert into students (student_id, school_id, admission_no, name, family_id) values ('${sid(1)}', '${A}', 'A-1', 'Asha', '${FAMILY}'), ('${sid(2)}', '${A}', 'A-2', 'Bina', '${FAMILY}'), ('${sid(3)}', '${A}', 'A-3', 'Chetan', null), ('${sid(4)}', '${A}', 'A-4', 'Deepa', null), ('${sid(5)}', '${A}', 'A-5', 'Esha', null), ('${sid(9)}', '${T}', 'T-1', 'Test Child', null);
      alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;
      insert into parents (parent_id, school_id, name, phone, email) values ('${pid(1)}', '${A}', 'Guardian One', '+910000000001', ' Guardian.One@example.invalid '), ('${pid(3)}', '${A}', 'Guardian Three', '+910000000003', null),
        ('${pid(4)}', '${A}', 'Guardian Four', '+910000000004', 'guardian.four@example.invalid'), ('${pid(5)}', '${A}', 'Guardian Five', '+910000000005', 'guardian.five@example.invalid'), ('${pid(9)}', '${T}', 'Test Guardian', '+910000000009', 'test.guardian@example.invalid');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${pid(1)}', '${sid(1)}'), ('${A}', '${pid(1)}', '${sid(2)}'), ('${A}', '${pid(3)}', '${sid(3)}'), ('${A}', '${pid(4)}', '${sid(4)}'), ('${A}', '${pid(5)}', '${sid(5)}'), ('${T}', '${pid(9)}', '${sid(9)}');
      insert into fees_ledger (school_id, student_id, amount_minor, due_date) values
        ('${A}', '${sid(1)}', 100000, '${day(3)}'), ('${A}', '${sid(2)}', 50000, '${today}'), ('${A}', '${sid(3)}', 70000, '${day(-7)}'), ('${A}', '${sid(4)}', 90000, '${today}'), ('${A}', '${sid(5)}', 60000, '${day(5)}'), ('${T}', '${sid(9)}', 10000, '${today}');
      insert into payment_methods (school_id, method, enabled, settings, updated_by) values ('${A}', 'direct_upi', true, '{}', '${PRINCIPAL}');
    `);
    const consent = (student: string, granted: boolean, at: string) => db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) select $1, $2, 'operational_communication', $3, (enum_range(null::consent_method))[1], 'v1', $4`, [A, student, granted, at]);
    for (const s of [1, 2, 5]) await consent(sid(s), true, '2026-01-01T00:00:00Z');
    await consent(sid(4), true, '2026-01-01T00:00:00Z');
    await consent(sid(4), false, '2026-02-01T00:00:00Z'); // withdrawn later: the latest row decides
    await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [T, sid(9)]);
  }, 120_000);
  afterAll(async () => db?.close?.());

  it('nothing is sent until the school switches reminders on; a test school never sends', async () => {
    expect(await night()).toEqual({ sent: 0, held: 0, linksMade: 0, byWhatsApp: 0 });
    await switchOn(true, T);
    expect(await night(T)).toEqual({ sent: 0, held: 0, linksMade: 0, byWhatsApp: 0 });
    expect(await emails()).toEqual([]);
    expect(await reminders()).toEqual([]);
  });

  it('switched on: one email a family for the lines due in 3 days, today and 7 days ago, with the family’s link; held ones say why', async () => {
    await switchOn(true);
    expect(await night()).toEqual({ sent: 2, held: 2, linksMade: 1, byWhatsApp: 0 });
    const sent = await emails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['guardian.one@example.invalid']);
    expect(sent[0].data).toMatchObject({ schoolName: 'School A', amount: '500.00', dueDate: today, kind: 'due_day', total: '1,500.00' }); // Bina's is due today; with Asha's, ₹1,500 in all
    const link = (await db.pg.query(`select token, amount_minor::int as amount, created_by, origin, family_id, reference_code, (select count(*)::int from payment_link_lines n where n.link_id = k.link_id) as lines from payment_links k`)).rows;
    expect(link).toEqual([expect.objectContaining({ amount: 150000, created_by: null, origin: 'reminder_job', family_id: FAMILY, lines: 2 })]);
    expect(sent[0].data.payUrl).toMatch(new RegExp(`/pay/${link[0].token}$`));
    expect(JSON.stringify(sent[0])).not.toMatch(/Asha|Bina/);
    expect(await reminders()).toEqual([
      { name: 'Asha', which: 'before_3', outcome: 'sent', why: null },
      { name: 'Bina', which: 'due_day', outcome: 'sent', why: null },
      { name: 'Chetan', which: 'after_7', outcome: 'held', why: 'no_email' },
      { name: 'Deepa', which: 'due_day', outcome: 'held', why: 'no_consent' },
    ]);
    // The same night again: nothing more.
    expect(await night()).toEqual({ sent: 0, held: 0, linksMade: 0, byWhatsApp: 0 });
    expect(await emails()).toHaveLength(1);
  });

  it('one reminder a family a day: a second line the same day is held; the open link is used again another day', async () => {
    await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 20000, $3)`, [A, sid(1), day(-7)]);
    expect(await night()).toEqual({ sent: 0, held: 1, linksMade: 0, byWhatsApp: 0 });
    expect((await reminders()).find((r: { name: string; which: string }) => r.name === 'Asha' && r.which === 'after_7')).toMatchObject({ outcome: 'held', why: 'one_a_day' });
    // Three days on, Asha's first fee is due that day: the same open link goes out.
    expect(await night(A, day(3))).toMatchObject({ sent: 1, linksMade: 0 });
    expect(await emails()).toHaveLength(2);
    expect((await db.pg.query(`select count(*)::int as n from payment_links`)).rows[0].n).toBe(1);
  });

  it('a promise whose date is still to come holds the reminder; once it has passed, reminders resume; hardship holds them all', async () => {
    await reset();
    expect((await as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'promise', studentId: sid(1), note: 'After salary', promiseDate: day(2) }))).ok).toBe(true);
    expect(await night()).toMatchObject({ sent: 0 });
    expect((await reminders()).filter((r: { name: string }) => r.name === 'Asha' || r.name === 'Bina').map((r: { why: string }) => r.why)).toEqual(['promise', 'promise', 'promise']);
    expect(await emails()).toEqual([]);
    // The promise date has passed and the promise is still open: the day-3 line is reminded.
    expect(await night(A, day(3))).toMatchObject({ sent: 1 });
    expect(await emails()).toHaveLength(1);
    await reset();
    expect((await as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'hardship', studentId: sid(2), note: 'Lost work', percentOff: 25 }))).ok).toBe(true);
    expect(await night()).toMatchObject({ sent: 0 });
    expect(await night(A, day(3))).toMatchObject({ sent: 0 });
    expect((await reminders()).filter((r: { name: string }) => r.name === 'Asha' || r.name === 'Bina').every((r: { why: string }) => r.why === 'hardship')).toBe(true);
    expect(await emails()).toEqual([]);
  });

  it('a fee already paid is not reminded; the nightly job runs the reminders', async () => {
    await reset();
    await db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method) select school_id, fee_id, amount_minor, 'cash' from fees_ledger where student_id = $1`, [sid(2)]);
    await feesNightlyHandler({ platform, queue, now: () => new Date() })({ payload: {} } as never);
    const sent = await emails();
    expect(sent).toHaveLength(1);
    expect(sent[0].data).toMatchObject({ amount: '200.00', kind: 'after_7', total: '1,200.00' }); // Asha's two lines; Bina's is paid
    expect((await reminders()).some((r: { name: string }) => r.name === 'Bina')).toBe(false);
  });

  it('a school role cannot write a reminder row, and a teacher reads none', async () => {
    const fee = (await db.pg.query(`select fee_id from fees_ledger where student_id = $1`, [sid(5)])).rows[0].fee_id;
    expect(await refused(() => as(principal, (c) => c.query(`insert into fee_reminders (school_id, fee_id, which, payer_id, outcome, run_date) values ($1, $2, 'due_day', $3, 'sent', current_date)`, [A, fee, sid(5)])))).toMatch(/permission denied/);
    expect((await as(teacher, (c) => c.query(`select 1 from fee_reminders`))).rows).toHaveLength(0);
    expect((await as(accountant, (c) => c.query(`select 1 from fee_reminders`))).rows.length).toBeGreaterThan(0);
  });

  it('who made a link: only the nightly reminder makes one without a person, and it never changes (C180)', async () => {
    const insert = (creator: string | null, origin: string) => `insert into payment_links (school_id, student_id, token, amount_minor, created_by, origin, expires_at) values ('${A}', '${sid(5)}', '${'t'.repeat(40)}', 100, ${creator ? `'${creator}'` : 'null'}, '${origin}', now() + interval '1 day')`;
    // A school role: no link without a creator, whatever origin it claims.
    expect(await refused(() => as(accountant, (c) => c.query(insert(null, 'person'))))).toMatch(/origin_names_creator|row-level security/);
    expect(await refused(() => as(accountant, (c) => c.query(insert(null, 'reminder_job'))))).toMatch(/only the nightly reminder/);
    expect(await refused(() => as(principal, (c) => c.query(insert(null, 'reminder_job'))))).toMatch(/only the nightly reminder/);
    expect(await refused(() => as(accountant, (c) => c.query(insert(ACCOUNTANT, 'reminder_job'))))).toMatch(/origin_names_creator|only the nightly reminder/);
    // The database's owner cannot either: the rule is about who writes, not about rights.
    expect(await refused(() => db.pg.query(insert(null, 'reminder_job')))).toMatch(/only the nightly reminder/);
    // The platform role cannot leave out the origin and so pass a nameless link off as a person's.
    expect(await refused(() => platform((c) => c.query(insert(null, 'person'))))).toMatch(/origin_names_creator|row-level security/);
    // A person's link is made as before, and neither field changes afterwards.
    expect(await refused(() => as(accountant, (c) => c.query(insert(ACCOUNTANT, 'person'))))).toBe('allowed');
    expect(await refused(() => as(accountant, (c) => c.query(`update payment_links set created_by = '${PRINCIPAL}' where token = '${'t'.repeat(40)}'`)))).toMatch(/never changes/);
    expect(await refused(() => platform((c) => c.query(`update payment_links set origin = 'reminder_job', created_by = null where token = '${'t'.repeat(40)}'`)))).toMatch(/never changes/);
    expect(await refused(() => as(accountant, (c) => c.query(`update payment_links set status = 'cancelled', closed_at = now() where token = '${'t'.repeat(40)}'`)))).toBe('allowed');
  });

  it('clearance: held while fees are owed; the principal lets it through with a reason; more dues hold it again', async () => {
    expect(await as(accountant, (c) => feeClearance(c, A, sid(2)))).toMatchObject({ owedMinor: 0, cleared: true });
    expect(await as(accountant, (c) => feeClearance(c, A, sid(3)))).toMatchObject({ owedMinor: 70000, cleared: false, override: null });
    expect(await as(accountant, (c) => overrideClearance(c, actor(accountant), sid(3), 'x'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => overrideClearance(c, actor(principal), sid(3), '  '))).toEqual({ ok: false, reason: 'reason' });
    expect(await as(principal, (c) => overrideClearance(c, actor(principal), sid(2), 'x'))).toEqual({ ok: false, reason: 'nothing_owed' });
    expect(await as(principal, (c) => overrideClearance(c, actor(principal), sid(3), 'The family is moving city; the trust has waived the balance'))).toEqual({ ok: true });
    expect(await as(accountant, (c) => feeClearance(c, A, sid(3)))).toMatchObject({ owedMinor: 70000, cleared: true, override: { by: 'Priya Principal', owedMinor: 70000 } });
    await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 5000, $3)`, [A, sid(3), today]);
    expect(await as(accountant, (c) => feeClearance(c, A, sid(3)))).toMatchObject({ owedMinor: 75000, cleared: false });
    expect((await db.pg.query(`select count(*)::int as n from audit_log where event_action = 'fees.clearance_overridden'`)).rows[0].n).toBe(1);
    // The database: the accountant cannot write an override, nobody edits one, a teacher reads none.
    expect(await refused(() => as(accountant, (c) => c.query(`insert into fee_clearance_overrides (school_id, student_id, owed_minor, reason, decided_by) values ($1, $2, 1, 'x', $3)`, [A, sid(3), ACCOUNTANT])))).toMatch(/row-level security/);
    expect(await refused(() => as(principal, (c) => c.query(`update fee_clearance_overrides set reason = 'y'`)))).toMatch(/permission denied/);
    expect((await as(teacher, (c) => c.query(`select 1 from fee_clearance_overrides`))).rows).toHaveLength(0);
    expect(await as(teacher, (c) => feeClearance(c, A, sid(3)))).toBeNull();
  });
});
