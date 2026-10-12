import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { findReferenceCode, findUtr, guessColumnMap, parseBankAmount, parseBankDate, readStatement, type ColumnMap } from '@/lib/bank/parse';
import { parseCsv } from '@/lib/import/csv';
import { addAccount, importStatement, listImports, previewStatement } from '@/lib/bank/statements';

// Bank statements, path B (docs/24 §3.4, §3.7, C176).
//
// EVERY STATEMENT IN THIS FILE IS FICTIONAL. "An Example Bank" does not exist; the layouts below are written by
// hand to exercise the reader (separate credit and debit columns; one amount column with a Dr/Cr marker; a
// preamble above the table; totals under it). None is a copy of a real bank's download, and no real bank's
// format has been checked against this reader.

const TWO_COLUMNS = `FICTIONAL TEST STATEMENT - An Example Bank - not a real bank
Account ending 4821,,,,,
Txn Date,Description,Ref No,Debit,Credit,Balance
01/04/2099,UPI/CR/409912345678/A PARENT/NCA-7K3Q9MPD,,,"2,300.50","1,02,300.50"
02/04/2099,NEFT TO A SUPPLIER,N123,"10,000.00",,"92,300.50"
03-Apr-2099,UPI/CR/409912345679/ANOTHER PARENT,,,"1,00,000.00","1,92,300.50"
03-Apr-2099,CHQ DEP 000123,000123,,500,"1,92,800.50"
,Total,,"10,000.00","1,02,800.50",
*** End of statement ***
`;
const ONE_COLUMN = `FICTIONAL TEST STATEMENT - An Example Bank - not a real bank
Date,Narration,Amount,Dr/Cr,Balance
05/04/2099,UPI 409912345680 nca 7k3q9mpe,"4,600.00",Cr,"1,97,400.50 Cr"
05/04/2099,ATM WDL,"2,000.00",DR,"1,95,400.50 Cr"
`;
const APRIL = { from: '2099-04-01', to: '2099-04-30' };

describe('reading what an Indian bank writes', () => {
  it('dates are day first', () => {
    expect(parseBankDate('05/04/2099')).toBe('2099-04-05');
    expect(parseBankDate('5-4-99')).toBe('2099-04-05');
    expect(parseBankDate('05-Apr-2099')).toBe('2099-04-05');
    expect(parseBankDate('05 April 2099')).toBe('2099-04-05');
    expect(parseBankDate('2099-04-05')).toBe('2099-04-05');
    expect(parseBankDate('05/04/2099 14:32:10')).toBe('2099-04-05');
    expect(parseBankDate('31/02/2099')).toBeNull();
    expect(parseBankDate('13/13/2099')).toBeNull();
    expect(parseBankDate('Total')).toBeNull();
  });
  it('amounts: Indian grouping, Dr and Cr, brackets, a minus; never a guess', () => {
    expect(parseBankAmount('1,00,000.00')).toBe(10000000);
    expect(parseBankAmount('100,000.5')).toBe(10000050);
    expect(parseBankAmount('2300.50')).toBe(230050);
    expect(parseBankAmount('₹ 500')).toBe(50000);
    expect(parseBankAmount('500.00 Cr')).toBe(50000);
    expect(parseBankAmount('500.00 Dr.')).toBe(-50000);
    expect(parseBankAmount('(500.00)')).toBe(-50000);
    expect(parseBankAmount('-500')).toBe(-50000);
    expect(parseBankAmount('')).toBe(0);
    expect(parseBankAmount('-')).toBe(0);
    for (const bad of ['1,0,0', '12.345', 'five hundred', '1.2.3', '1e5', '500 500']) expect(parseBankAmount(bad), bad).toBeNull();
  });
  it('a UTR or our code is read only when there is exactly one', () => {
    expect(findUtr('UPI/CR/409912345678/A PARENT')).toBe('409912345678');
    expect(findUtr('409912345678 and 409912345679')).toBeNull();
    expect(findUtr('acct 4099123456789')).toBeNull(); // 13 digits is not a UTR
    expect(findReferenceCode('paid nca-7k3q9mpd thanks')).toBe('7K3Q9MPD');
    expect(findReferenceCode('NCA7K3Q9MPD')).toBe('7K3Q9MPD');
    expect(findReferenceCode('NCA-7K3Q9MPD NCA-7K3Q9MPE')).toBeNull();
    expect(findReferenceCode('NCA-7K3Q9MPDX')).toBeNull();
  });
  it('the columns are guessed from their names, under a preamble', () => {
    expect(guessColumnMap(parseCsv(TWO_COLUMNS))).toEqual({ headerRow: 2, date: 0, narration: 1, credit: 4, debit: 3, amount: undefined, drCr: undefined, balance: 5, reference: 2 });
    expect(guessColumnMap(parseCsv(ONE_COLUMN))).toMatchObject({ headerRow: 1, date: 0, narration: 1, amount: 2, drCr: 3, balance: 4 });
    expect(guessColumnMap(parseCsv('a,b,c\n1,2,3\n'))).toBeNull();
  });
  it('credit rows only; totals and notes under the table are not rows', () => {
    const read = readStatement(TWO_COLUMNS, guessColumnMap(parseCsv(TWO_COLUMNS))!, APRIL);
    if (!read.ok) throw new Error(JSON.stringify(read.problem));
    const s = read.statement;
    expect([s.rowsRead, s.credits.length, s.debitRows, s.creditTotalMinor]).toEqual([4, 3, 1, 230050 + 10000000 + 50000]);
    expect([s.openingBalanceMinor, s.closingBalanceMinor]).toEqual([10000000, 19280050]);
    expect(s.credits[0]).toMatchObject({ valueDate: '2099-04-01', amountMinor: 230050, utr: '409912345678', referenceCode: '7K3Q9MPD', balanceAfterMinor: 10230050 });
    expect(s.credits[2]).toMatchObject({ amountMinor: 50000, utr: null, referenceCode: null });
    expect(new Set(s.credits.map((c) => c.identity)).size).toBe(3);
  });
  it('one amount column with a Dr/Cr marker', () => {
    const read = readStatement(ONE_COLUMN, guessColumnMap(parseCsv(ONE_COLUMN))!, APRIL);
    if (!read.ok) throw new Error(JSON.stringify(read.problem));
    expect(read.statement.credits).toHaveLength(1);
    expect(read.statement.credits[0]).toMatchObject({ amountMinor: 460000, utr: '409912345680', referenceCode: '7K3Q9MPE' });
    expect(read.statement.debitRows).toBe(1);
  });
  it('two lines the same in every cell are two rows', () => {
    const text = `Date,Narration,Credit\n01/04/2099,CASH DEP,500\n01/04/2099,CASH DEP,500\n`;
    const read = readStatement(text, { headerRow: 0, date: 0, narration: 1, credit: 2 }, APRIL);
    expect(read.ok && read.statement.credits.length).toBe(2);
    expect(read.ok && read.statement.credits[0].identity !== read.statement.credits[1].identity).toBe(true);
  });
  it('a line that does not read stops the whole statement, with its line', () => {
    const map: ColumnMap = { headerRow: 0, date: 0, narration: 1, credit: 2 };
    expect(readStatement(`Date,Narration,Credit\n01/04/2099,X,500\n1st April,Y,500\n`, map, APRIL)).toEqual({ ok: false, problem: { reason: 'bad_date', line: 3, value: '1st April' } });
    expect(readStatement(`Date,Narration,Credit\n01/04/2099,X,5 hundred\n`, map, APRIL)).toEqual({ ok: false, problem: { reason: 'bad_amount', line: 2, value: '5 hundred' } });
    expect(readStatement(`Date,Narration,Credit\n01/05/2099,X,500\n`, map, APRIL)).toEqual({ ok: false, problem: { reason: 'outside_period', line: 2, value: '2099-05-01' } });
    expect(readStatement(`Date,Narration,Credit,Debit\n01/04/2099,X,,500\n`, { ...map, debit: 3 }, APRIL)).toEqual({ ok: false, problem: { reason: 'no_credits' } });
    expect(readStatement(`Date,Narration,Credit\n`, map, APRIL)).toEqual({ ok: false, problem: { reason: 'no_rows' } });
    expect(readStatement(`Date,Narration,Amount,Type\n01/04/2099,X,500,maybe\n`, { headerRow: 0, date: 0, narration: 1, amount: 2, drCr: 3 }, APRIL)).toMatchObject({ ok: false, problem: { reason: 'bad_amount', value: 'maybe' } });
  });
});

const A = 'a7000000-0000-4000-8000-000000000001';
const B = 'a7000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'a7000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'a7000000-0000-4000-8000-0000000000a2';
const TEACHER = 'a7000000-0000-4000-8000-0000000000a3';
const B_PRINCIPAL = 'a7000000-0000-4000-8000-0000000000b1';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const teacher: Who = { role: 'teacher', user: TEACHER };
const other: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const count = async (sql: string) => Number((await db.pg.query(sql)).rows[0].n);
const refused = async (run: () => Promise<unknown>) => run().then(() => 'allowed', (e: Error) => e.message);

describe('on the real schema', () => {
  let account = '';
  const map = guessColumnMap(parseCsv(TWO_COLUMNS))!;
  const keep = (who: Who, text: string, period = APRIL, confirmed = { creditRows: 3, creditTotalMinor: 10280050 }, use: ColumnMap = map) =>
    as(who, (c) => importStatement(c, actor(who), { accountId: account, text, map: use, period, confirmed }));

  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant'),
        ('${TEACHER}', '${A}', 'teacher@school-a.example', 'teacher', 'Teacher A'), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Principal B');
      insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${ACCOUNTANT}', '${A}', 'accountant', true), ('${TEACHER}', '${A}', 'teacher', true), ('${B_PRINCIPAL}', '${B}', 'principal', true);
    `);
  }, 120_000);
  afterAll(async () => db?.close?.());

  it('the principal adds the account; the accountant cannot; a name is used once', async () => {
    const input = { label: 'Fees account', bankName: 'An Example Bank', accountLast4: '4821', ifsc: 'EXMP0001234' };
    expect(await as(accountant, (c) => addAccount(c, actor(accountant), input))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => addAccount(c, actor(principal), { ...input, accountLast4: '48211' }))).toEqual({ ok: false, reason: 'last4' });
    expect(await as(principal, (c) => addAccount(c, actor(principal), { ...input, ifsc: 'BAD' }))).toEqual({ ok: false, reason: 'ifsc' });
    // The database refuses it too, whatever the app says.
    expect(await refused(() => as(accountant, (c) => c.query(`insert into bank_accounts (school_id, label, bank_name, account_last4, created_by) values ($1, 'Mine', 'An Example Bank', '0000', $2)`, [A, ACCOUNTANT])))).toMatch(/row-level security/);
    const made = await as(principal, (c) => addAccount(c, actor(principal), input));
    expect(made.ok).toBe(true);
    account = made.accountId;
    expect(await as(principal, (c) => addAccount(c, actor(principal), input))).toEqual({ ok: false, reason: 'exists' });
  });

  it('the preview shows the count and the total and saves nothing', async () => {
    const preview = await as(accountant, (c) => previewStatement(c, actor(accountant), { accountId: account, text: TWO_COLUMNS, map: null, period: APRIL }));
    expect(preview.map).toMatchObject({ headerRow: 2, credit: 4 });
    expect(preview.summary).toMatchObject({ creditRows: 3, creditTotalMinor: 10280050, debitRows: 1, rowsRead: 4 });
    expect(await count(`select count(*) as n from bank_credit_rows`)).toBe(0);
    expect(await count(`select count(*) as n from bank_statement_imports`)).toBe(0);
    expect(await as(teacher, (c) => previewStatement(c, actor(teacher), { accountId: account, text: TWO_COLUMNS, map: null, period: APRIL }))).toEqual({ notAllowed: true });
    expect(await as(other, (c) => previewStatement(c, actor(other), { accountId: account, text: TWO_COLUMNS, map: null, period: APRIL }))).toEqual({ noAccount: true });
  });

  it('column names nobody recognises: the uploader is shown the top of the file to choose from', async () => {
    const preview = await as(accountant, (c) => previewStatement(c, actor(accountant), { accountId: account, text: 'FICTIONAL TEST STATEMENT\nA,B,C\n01/04/2099,X,500\n', map: null, period: APRIL }));
    expect(preview).toMatchObject({ map: null, summary: null, problem: { reason: 'no_map' } });
    expect(preview.firstLines[1]).toEqual(['A', 'B', 'C']);
  });

  it('nothing is kept unless the numbers confirmed are the numbers read', async () => {
    expect(await keep(accountant, TWO_COLUMNS, APRIL, { creditRows: 3, creditTotalMinor: 10280051 })).toEqual({ ok: false, reason: 'not_confirmed' });
    expect(await keep(accountant, TWO_COLUMNS, APRIL, { creditRows: 2, creditTotalMinor: 10280050 })).toEqual({ ok: false, reason: 'not_confirmed' });
    expect(await keep(teacher, TWO_COLUMNS)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await keep(accountant, TWO_COLUMNS.replace('"2,300.50"', 'lots'))).toMatchObject({ ok: false, reason: 'unreadable', problem: { reason: 'bad_amount', line: 4 } });
    expect(await count(`select count(*) as n from bank_credit_rows`)).toBe(0);
  });

  it('confirmed: the credit rows are kept, the columns remembered, the upload audited', async () => {
    const kept = await keep(accountant, TWO_COLUMNS);
    expect(kept).toMatchObject({ ok: true, creditRows: 3, rowsAdded: 3, alreadyHere: 0, balanceContinues: null, sameFileBefore: false });
    const rows = (await db.pg.query(`select value_date::text as d, amount_minor::int as a, utr, reference_code as code, match_status as s, evidence_id from bank_credit_rows order by value_date, amount_minor`)).rows;
    expect(rows).toEqual([
      { d: '2099-04-01', a: 230050, utr: '409912345678', code: '7K3Q9MPD', s: 'unmatched', evidence_id: null },
      { d: '2099-04-03', a: 50000, utr: null, code: null, s: 'unmatched', evidence_id: null },
      { d: '2099-04-03', a: 10000000, utr: '409912345679', code: null, s: 'unmatched', evidence_id: null },
    ]);
    // The next statement of this account needs no map from the uploader.
    const next = await as(accountant, (c) => previewStatement(c, actor(accountant), { accountId: account, text: TWO_COLUMNS, map: null, period: APRIL }));
    expect(next.map).toEqual(JSON.parse(JSON.stringify(map)));
    const audit = (await db.pg.query(`select after_state from audit_log where event_action = 'bank.statement_uploaded'`)).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].after_state)).not.toContain('PARENT'); // counts and totals, never a narration
    // Nothing was credited: importing a statement touches no ledger.
    expect(await count(`select count(*) as n from payment_evidence`)).toBe(0);
  });

  it('the same statement again adds nothing', async () => {
    expect(await keep(principal, TWO_COLUMNS)).toMatchObject({ ok: true, rowsAdded: 0, alreadyHere: 3, sameFileBefore: true });
    expect(await count(`select count(*) as n from bank_credit_rows`)).toBe(3);
  });

  it('a statement that overlaps adds only its new rows', async () => {
    const overlap = TWO_COLUMNS.replace(',Total,', '04/04/2099,UPI/CR/409912345681/A THIRD PARENT,,,750.00,"1,93,550.50"\n,Total,');
    expect(await keep(accountant, overlap, APRIL, { creditRows: 4, creditTotalMinor: 10355050 })).toMatchObject({ ok: true, creditRows: 4, rowsAdded: 1, alreadyHere: 3, sameFileBefore: false });
    expect(await count(`select count(*) as n from bank_credit_rows`)).toBe(4);
    const uploads = await as(accountant, (c) => listImports(c, A));
    expect(uploads.map((u: { rows_added: number }) => u.rows_added).sort()).toEqual([0, 1, 3]);
    expect(uploads[0].uploaded_by_name).toBeTruthy();
  });

  it('balance continuity: a statement that begins where the last ended, and one that does not', async () => {
    const may = (opening: string, closing: string) => `FICTIONAL TEST STATEMENT - An Example Bank - not a real bank\nTxn Date,Description,Ref No,Debit,Credit,Balance\n02/05/2099,UPI/CR/409912345690/A PARENT,,,100.00,"${closing}"\n`.replace('OPEN', opening);
    const mayMap: ColumnMap = { ...map, headerRow: 1 };
    const period = { from: '2099-05-01', to: '2099-05-31' };
    // April closed at 1,93,550.50, so a May statement whose first line leaves 1,93,650.50 continues it.
    expect(await keep(accountant, may('', '1,93,650.50'), period, { creditRows: 1, creditTotalMinor: 10000 }, mayMap)).toMatchObject({ ok: true, balanceContinues: true });
    const june = { from: '2099-06-01', to: '2099-06-30' };
    const gap = may('', '2,50,000.00').replace('02/05/2099', '02/06/2099').replace('409912345690', '409912345691');
    expect(await keep(accountant, gap, june, { creditRows: 1, creditTotalMinor: 10000 }, mayMap)).toMatchObject({ ok: true, balanceContinues: false, rowsAdded: 1 });
    expect(await count(`select count(*) as n from bank_statement_imports where balance_continues = false`)).toBe(1);
  });

  it('a bank row is never edited or removed; an upload is never changed', async () => {
    const id = (await db.pg.query(`select row_id from bank_credit_rows order by value_date limit 1`)).rows[0].row_id;
    expect(await refused(() => as(accountant, (c) => c.query(`update bank_credit_rows set amount_minor = 1 where row_id = $1`, [id])))).toMatch(/never edited/);
    expect(await refused(() => as(accountant, (c) => c.query(`update bank_credit_rows set utr = '111111111111' where row_id = $1`, [id])))).toMatch(/never edited/);
    expect(await refused(() => as(principal, (c) => c.query(`delete from bank_credit_rows where row_id = $1`, [id])))).toMatch(/permission denied/);
    expect(await refused(() => as(principal, (c) => c.query(`delete from bank_statement_imports`)))).toMatch(/permission denied/);
    expect(await refused(() => as(principal, (c) => c.query(`update bank_statement_imports set credit_rows = 1`)))).toMatch(/permission denied/);
  });

  it('only the finance roles see statements, and only their own school’s', async () => {
    expect((await as(teacher, (c) => c.query(`select 1 from bank_credit_rows`))).rows).toHaveLength(0);
    expect((await as(teacher, (c) => c.query(`select 1 from bank_accounts`))).rows).toHaveLength(0);
    expect((await as(other, (c) => c.query(`select 1 from bank_credit_rows`))).rows).toHaveLength(0);
    expect((await as(other, (c) => c.query(`select 1 from bank_statement_imports`))).rows).toHaveLength(0);
    // An upload cannot be written in someone else's name.
    expect(await refused(() => as(accountant, (c) => c.query(`insert into bank_statement_imports (school_id, account_id, file_sha256, period_from, period_to, rows_read, credit_rows, credit_total_minor, rows_added, uploaded_by) values ($1, $2, repeat('a', 64), '2099-07-01', '2099-07-02', 1, 1, 100, 1, $3)`, [A, account, PRINCIPAL])))).toMatch(/row-level security/);
  });

  it('holidays: the office adds and removes them; everyone in the school can read them', async () => {
    const add = (who: Who) => refused(() => as(who, (c) => c.query(`insert into school_holidays (school_id, holiday_date, name, created_by) values ($1, '2099-08-15', 'Independence Day', $2)`, [who.school ?? A, who.user])));
    expect(await add(teacher)).toMatch(/row-level security/);
    expect(await add(accountant)).toMatch(/row-level security/);
    expect(await add(principal)).toBe('allowed');
    expect((await as(teacher, (c) => c.query(`select name from school_holidays`))).rows).toEqual([{ name: 'Independence Day' }]);
    expect((await as(other, (c) => c.query(`select 1 from school_holidays`))).rows).toHaveLength(0);
    expect((await as(teacher, (c) => c.query(`delete from school_holidays`))).rowCount).toBe(0);
    expect((await as(principal, (c) => c.query(`delete from school_holidays`))).rowCount).toBe(1);
  });
});
