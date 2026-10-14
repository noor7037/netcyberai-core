import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { takePayment } from '@/lib/fees/payments';
import { credentialsMeta, encryptionKey, gatewayAllowed, keysProblem, openCredentials, recordTest, saveCredentials, seal, setGatewayAccess, unseal } from '@/lib/payments/credentials';
import { listMethods, setMethod } from '@/lib/payments/methods';

// Payment rails (docs/24 §3.1, §3.2, §3.8, C171): the encrypted, write-only
// credentials store; the methods a school offers; and the evidence every
// credit goes through. The keys below are made up for these tests and work
// nowhere.

const KEY = Buffer.alloc(32, 7).toString('base64');
const ENV = { PAYMENT_CREDENTIALS_KEY: KEY, PAYMENT_CREDENTIALS_KEY_VERSION: '1' };
const TEST_KEYS = { keyId: 'rzp_test_FICTIONALKEY0001', keySecret: 'fictional-key-part-AAAA1111bbbb', webhookSecret: 'fictional-hook-part-CCCC2222' };
const LIVE_KEYS = { keyId: 'rzp_live_FICTIONALKEY0002', keySecret: 'fictional-key-part-DDDD3333eeee', webhookSecret: 'fictional-hook-part-FFFF4444' };
const NEVER = [TEST_KEYS.keySecret, TEST_KEYS.webhookSecret, LIVE_KEYS.keySecret, LIVE_KEYS.webhookSecret, TEST_KEYS.keyId, LIVE_KEYS.keyId];

describe('sealing a school’s keys', () => {
  const k = encryptionKey(ENV)!;
  it('what is stored is not the keys, and opens only in its own place with its own key', () => {
    const sealed = seal(k, 'school-1', 'razorpay', 'test', TEST_KEYS);
    for (const s of NEVER) expect(JSON.stringify(sealed)).not.toContain(s);
    const row = { ciphertext: sealed.ciphertext, iv: sealed.iv, tag: sealed.tag, key_version: sealed.keyVersion };
    expect(unseal(k, 'school-1', 'razorpay', 'test', row)).toEqual(TEST_KEYS);
    // Copied onto another school, or into live: it does not open.
    expect(() => unseal(k, 'school-2', 'razorpay', 'test', row)).toThrow();
    expect(() => unseal(k, 'school-1', 'razorpay', 'live', row)).toThrow();
    // Changed by one character, or opened with another key or key version: it does not open.
    expect(() => unseal(k, 'school-1', 'razorpay', 'test', { ...row, ciphertext: `${row.ciphertext.slice(0, -4)}AAAA` })).toThrow();
    expect(() => unseal({ key: Buffer.alloc(32, 9), version: 1 }, 'school-1', 'razorpay', 'test', row)).toThrow();
    expect(() => unseal({ key: k.key, version: 2 }, 'school-1', 'razorpay', 'test', row)).toThrow(/another key version/);
    // Sealing the same keys twice gives different bytes (a fresh nonce each time).
    expect(seal(k, 'school-1', 'razorpay', 'test', TEST_KEYS).ciphertext).not.toBe(sealed.ciphertext);
  });
  it('there is no key unless the server was given a proper one; the app never makes one up', () => {
    for (const env of [{}, { PAYMENT_CREDENTIALS_KEY: '' }, { PAYMENT_CREDENTIALS_KEY: 'too-short' }, { PAYMENT_CREDENTIALS_KEY: Buffer.alloc(16, 1).toString('base64') }, { PAYMENT_CREDENTIALS_KEY: KEY, PAYMENT_CREDENTIALS_KEY_VERSION: '0' }]) expect(encryptionKey(env)).toBeNull();
    expect(encryptionKey(ENV)?.version).toBe(1);
  });
  it('a test key is refused as a live one, and the other way round', () => {
    expect(keysProblem('razorpay', 'test', TEST_KEYS)).toBeNull();
    expect(keysProblem('razorpay', 'live', TEST_KEYS)).toBe('wrong_mode');
    expect(keysProblem('razorpay', 'test', LIVE_KEYS)).toBe('wrong_mode');
    expect(keysProblem('razorpay', 'test', { ...TEST_KEYS, keyId: 'not-a-key' })).toBe('key_id');
    expect(keysProblem('razorpay', 'test', { ...TEST_KEYS, keySecret: 'short' })).toBe('key_secret');
    expect(keysProblem('razorpay', 'test', { ...TEST_KEYS, webhookSecret: 'has a space' })).toBe('webhook_secret');
  });
});

const A = 'a2000000-0000-4000-8000-000000000001';
const B = 'a2000000-0000-4000-8000-000000000002';
const FOUNDER = 'a2000000-0000-4000-8000-0000000000f1';
const PRINCIPAL = 'a2000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'a2000000-0000-4000-8000-0000000000a2';
const TEACHER = 'a2000000-0000-4000-8000-0000000000a3';
const STUDENT = 'a2000000-0000-4000-8000-000000500001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const save = (keys = TEST_KEYS, mode = 'test', env: Record<string, string | undefined> = ENV, by: { from: 'school' | 'control'; reason?: string; userId?: string } = { from: 'school' }) => platform((c) => saveCredentials(c, { schoolId: A, userId: by.userId ?? PRINCIPAL, from: by.from, reason: by.reason }, { provider: 'razorpay', mode, keys }, env));

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'f@x.invalid', 'super_admin', 'Founder'),
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant A'), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A');
      insert into students (student_id, school_id, admission_no, name) values ('${STUDENT}', '${A}', 'A-1', 'Asha');
      alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;
      insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ('${A}', '${STUDENT}', 150050, '2026-04-10');
    `);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('with no encryption key on the server, saving is refused in plain words and nothing is stored', async () => {
    expect(await save(TEST_KEYS, 'test', {})).toEqual({ ok: false, reason: 'no_encryption_key' });
    expect((await db.pg.query(`select count(*)::int as n from payment_credentials`)).rows[0].n).toBe(0);
    const en = readFileSync(path.resolve(__dirname, '../../src/lib/i18n/messages/en.ts'), 'utf8');
    expect(en).toMatch(/'rails\.keys\.error\.no_encryption_key': 'Keys cannot be saved yet: this server has not been given its encryption key/);
  });

  it('keys are saved encrypted, test and live apart; a screen gets the last four characters, who and when, and nothing else', async () => {
    const saved = await save();
    expect(saved).toMatchObject({ ok: true, meta: { provider: 'razorpay', mode: 'test', keyLast4: '0001', savedByName: 'Principal A', savedFrom: 'school', testOk: null } });
    expect(await save(LIVE_KEYS, 'live', ENV, { from: 'control', reason: 'Entered for the school at its request', userId: FOUNDER })).toMatchObject({ ok: true, meta: { mode: 'live', keyLast4: '0002', savedByName: null, savedFrom: 'control' } });
    expect(await save(LIVE_KEYS, 'live', ENV, { from: 'control', reason: ' ' })).toEqual({ ok: false, reason: 'reason' });
    expect(await save(LIVE_KEYS, 'test')).toEqual({ ok: false, reason: 'wrong_mode' });
    const meta = await platform((c) => credentialsMeta(c, A));
    expect(meta.map((m: { mode: string; keyLast4: string }) => [m.mode, m.keyLast4])).toEqual([['live', '0002'], ['test', '0001']]);
    expect(Object.keys(meta[0]).sort()).toEqual(['configId', 'keyLast4', 'mode', 'provider', 'savedAt', 'savedByName', 'savedFrom', 'testMessage', 'testOk', 'testedAt']);
    // Another school has none of it.
    expect(await platform((c) => credentialsMeta(c, B))).toEqual([]);
    // The server's payment path, and only it, opens them; saving again clears the last test result.
    const test = meta.find((m: { mode: string }) => m.mode === 'test');
    expect(await platform((c) => openCredentials(c, test.configId, ENV))).toEqual({ schoolId: A, provider: 'razorpay', mode: 'test', keys: TEST_KEYS });
    expect(await platform((c) => openCredentials(c, test.configId, {}))).toBeNull();
    expect(await platform((c) => openCredentials(c, 'not-an-id', ENV))).toBeNull();
    await platform((c) => recordTest(c, test.configId, true, 'Razorpay accepted the keys.'));
    expect((await platform((c) => credentialsMeta(c, A))).find((m: { mode: string }) => m.mode === 'test')).toMatchObject({ testOk: true });
    await save({ ...TEST_KEYS, keySecret: 'fictional-key-part-ZZZZ9999yyyy' });
    expect((await platform((c) => credentialsMeta(c, A))).find((m: { mode: string }) => m.mode === 'test')).toMatchObject({ testOk: null, configId: test.configId });
    await save();
  });

  it('WRITE-ONLY: no key is in any response, any log line, the audit trail or any column of any table', async () => {
    const logged: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' '))));
    const answers = [await save(), await save(LIVE_KEYS, 'live', ENV, { from: 'control', reason: 'Rotated', userId: FOUNDER }), await save(TEST_KEYS, 'live'), await save({ ...TEST_KEYS, keySecret: 'x' }), await platform((c) => credentialsMeta(c, A))];
    spies.forEach((s) => s.mockRestore());
    // Every row of every table in the database, as text.
    const tables = (await db.pg.query(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')`)).rows.map((r: { relname: string }) => r.relname);
    let everything = '';
    for (const t of tables) everything += JSON.stringify((await db.pg.query(`select to_jsonb(x) as row from ${t} x`)).rows);
    expect(everything).toContain('payments.credentials_saved'); // the audit rows are in what is searched
    for (const secret of NEVER) {
      expect(JSON.stringify(answers), 'a response').not.toContain(secret);
      expect(logged.join('\n'), 'a log line').not.toContain(secret);
      expect(everything, 'a table').not.toContain(secret);
    }
    // The audit row says what was saved, by whom and why: the last four characters only.
    expect((await db.pg.query(`select after_state from audit_log where school_id = $1 and event_action = 'payments.credentials_saved' order by audit_id desc limit 1`, [A])).rows[0].after_state).toEqual({ provider: 'razorpay', mode: 'live', keyLast4: '0002', from: 'control', reasoned: true }); // never a reason's words (C224)
    // Review of C224: the founder's words from Control are kept where only the founder reads them (C124); a school's own save gives none.
    expect((await db.pg.query(`select r.reason from entitlement_change_reasons r join audit_log a on a.audit_id = r.audit_id where a.school_id = $1 and a.event_action = 'payments.credentials_saved' order by a.audit_id`, [A])).rows.map((r: { reason: string }) => r.reason)).toEqual(['Entered for the school at its request', 'Rotated']);
    // The files that handle keys write no log line at all, and the routes answer with the saved metadata only.
    for (const f of ['src/lib/payments/credentials.ts', 'src/lib/payments/setup.ts', 'src/app/api/app/fees/payment-setup/route.ts', 'src/app/api/control/schools/[schoolId]/payments/route.ts']) {
      const text = readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
      expect(text, f).not.toMatch(/console\./);
      if (f.includes('/api/')) expect(text, f).not.toMatch(/openCredentials|unseal|keySecret:\s*result|ciphertext/);
    }
  });

  it('no school role can read or write the stored keys, not even the principal; only the platform role can', async () => {
    for (const who of [principal, accountant, teacher]) {
      await expect(as(who, (c) => c.query(`select 1 from payment_credentials`)), who.role).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`update payment_credentials set key_last4 = 'XXXX'`)), who.role).rejects.toThrow(/permission denied/);
    }
    expect((await platform((c) => c.query(`select count(*)::int as n from payment_credentials`))).rows[0].n).toBe(2);
  });

  it('a gateway is NetCyberAI’s to allow, with a reason; the school reads it and cannot change it', async () => {
    expect(await platform((c) => gatewayAllowed(c, A, 'razorpay'))).toBe(false);
    expect(await platform((c) => setGatewayAccess(c, { userId: FOUNDER }, A, 'razorpay', true, '  '))).toBe(false);
    expect(await platform((c) => setGatewayAccess(c, { userId: FOUNDER }, A, 'razorpay', true, 'The school asked for cards and net banking'))).toBe(true);
    expect(await platform((c) => gatewayAllowed(c, A, 'razorpay'))).toBe(true);
    expect((await as(principal, (c) => c.query(`select allowed from payment_gateway_access`))).rows).toEqual([{ allowed: true }]);
    await expect(as(principal, (c) => c.query(`update payment_gateway_access set allowed = false`))).rejects.toThrow(/permission denied/);
    expect((await as(teacher, (c) => c.query(`select 1 from payment_gateway_access`))).rows).toEqual([]);
  });

  it('methods: the counter is on by default; the office switches others; a gateway only when it is ready', async () => {
    expect((await as(accountant, (c) => listMethods(c, A))).map((m: { method: string; enabled: boolean }) => [m.method, m.enabled])).toEqual([['counter', true], ['direct_upi', false], ['razorpay', false]]);
    const ready = async () => true;
    const notReady = async () => false;
    expect(await as(accountant, (c) => setMethod(c, actor(accountant), { method: 'razorpay', enabled: true, sortOrder: 1 }, ready))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => setMethod(c, actor(principal), { method: 'razorpay', enabled: true, sortOrder: 1 }, notReady))).toEqual({ ok: false, reason: 'gateway_not_ready' });
    expect(await as(principal, (c) => setMethod(c, actor(principal), { method: 'cheque-by-post', enabled: true, sortOrder: 1 }, ready))).toEqual({ ok: false, reason: 'method' });
    expect(await as(principal, (c) => setMethod(c, actor(principal), { method: 'razorpay', enabled: true, sortOrder: 0 }, ready))).toEqual({ ok: true });
    expect((await as(accountant, (c) => listMethods(c, A))).map((m: { method: string; enabled: boolean }) => [m.method, m.enabled])).toEqual([['counter', true], ['razorpay', true], ['direct_upi', false]]);
    // Switching off never needs the gateway to be ready.
    expect(await as(principal, (c) => setMethod(c, actor(principal), { method: 'razorpay', enabled: false, sortOrder: 2 }, notReady))).toEqual({ ok: true });
    await expect(as(accountant, (c) => c.query(`update payment_methods set enabled = true`))).resolves.toMatchObject({ rowCount: 0 }); // RLS: not the office
    expect((await as(teacher, (c) => c.query(`select 1 from payment_methods`))).rows).toEqual([]);
    expect((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'payments.method_changed'`, [A])).rows[0].n).toBe(2);
  });

  it('every credit has its evidence: the counter’s too; evidence is unique for ever and what it says never changes', async () => {
    const paid = await as(accountant, (c) => takePayment(c, actor(accountant), { studentId: STUDENT, scope: 'student', amountMinor: 50050, method: 'cash', reference: null, allocations: null }));
    expect(paid).toMatchObject({ ok: true });
    const evidence = (await db.pg.query(`select v.source, v.external_id, v.amount_minor::int as amount, v.applied_minor::int as applied, v.decided_by, r.evidence_id = v.evidence_id as linked from payment_evidence v join receipts r on r.receipt_id = v.receipt_id where v.school_id = $1`, [A])).rows;
    expect(evidence).toEqual([{ source: 'counter', external_id: `receipt:${paid.receiptId}`, amount: 50050, applied: 50050, decided_by: ACCOUNTANT, linked: true }]);
    // No credit without evidence: every receipt in the school names one.
    expect((await db.pg.query(`select count(*)::int as n from receipts where school_id = $1 and evidence_id is null`, [A])).rows[0].n).toBe(0);
    await expect(db.pg.query(`insert into payment_evidence (school_id, source, external_id, amount_minor, decided_by) values ($1, 'counter', $2, 1, $3)`, [B, `receipt:${paid.receiptId}`, PRINCIPAL])).rejects.toThrow(/payment_evidence_source_external_id_key/);
    await expect(as(accountant, (c) => c.query(`update payment_evidence set amount_minor = 1`))).rejects.toThrow(/never edited/);
    await expect(as(accountant, (c) => c.query(`update payment_evidence set external_id = 'receipt:other'`))).rejects.toThrow(/never edited/);
    await expect(as(accountant, (c) => c.query(`delete from payment_evidence`))).rejects.toThrow(/permission denied/);
    // A person's decision must name the person and the reason; a school's confirmation must name who confirmed.
    await expect(db.pg.query(`insert into payment_evidence (school_id, source, external_id, amount_minor, rule) values ($1, 'bank_statement_row', 'row-1', 100, 'manual')`, [A])).rejects.toThrow(/check/);
    await expect(db.pg.query(`insert into payment_evidence (school_id, source, external_id, amount_minor) values ($1, 'school_confirmed', 'utr-1', 100)`, [A])).rejects.toThrow(/check/);
    expect((await as(teacher, (c) => c.query(`select 1 from payment_evidence`))).rows).toEqual([]);
  });
});
