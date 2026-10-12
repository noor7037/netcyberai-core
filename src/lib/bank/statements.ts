import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { FINANCE } from '@/lib/fees/structures';
import { parseCsv } from '@/lib/import/csv';
import { fileSha256, guessColumnMap, readStatement, type ColumnMap, type ParseProblem, type ParsedStatement } from './parse';

// Bank statements in the database (docs/24 §3.4 path B, §3.7, C176).
//   1. The uploader sees a PREVIEW: how many credit rows, their total, the period, the balances. Nothing is saved.
//   2. They confirm those two numbers. Only then are the credit rows kept.
// A row already here (the same statement again, or an overlapping one) is not added twice: the answer says how many
// rows were new. Nothing in this file credits anything: matching rows to payments is a separate step.

type Actor = { schoolId: string; userId: string; role: StaffRole };
export const MAX_STATEMENT_CHARS = 2_000_000;
export const MAX_STATEMENT_ROWS = 5_000;

export type BankAccount = { account_id: string; label: string; bank_name: string; account_last4: string; ifsc: string | null; statement_profile: ColumnMap | null };
export async function listAccounts(db: PoolClient, schoolId: string): Promise<BankAccount[]> {
  return (await db.query(`select account_id, label, bank_name, account_last4, ifsc, statement_profile from bank_accounts where school_id = $1 order by lower(label)`, [schoolId])).rows;
}

export type AccountResult = { ok: true; accountId: string } | { ok: false; reason: 'not_allowed' | 'label' | 'bank' | 'last4' | 'ifsc' | 'exists' };
export async function addAccount(db: PoolClient, actor: Actor, input: { label: string; bankName: string; accountLast4: string; ifsc: string }): Promise<AccountResult> {
  if (actor.role !== 'principal' && actor.role !== 'school_admin') return { ok: false, reason: 'not_allowed' };
  const label = input.label.trim().replace(/\s+/g, ' ');
  const bank = input.bankName.trim().replace(/\s+/g, ' ');
  const ifsc = input.ifsc.trim().toUpperCase();
  if (!label || label.length > 60) return { ok: false, reason: 'label' };
  if (!bank || bank.length > 60) return { ok: false, reason: 'bank' };
  if (!/^[0-9]{4}$/.test(input.accountLast4)) return { ok: false, reason: 'last4' };
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return { ok: false, reason: 'ifsc' };
  const made = await db.query(`insert into bank_accounts (school_id, label, bank_name, account_last4, ifsc, created_by) values ($1, $2, $3, $4, $5, $6) on conflict (school_id, label) do nothing returning account_id`, [actor.schoolId, label, bank, input.accountLast4, ifsc || null, actor.userId]);
  if (made.rowCount !== 1) return { ok: false, reason: 'exists' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'bank.account_added', targetType: 'bank_accounts', targetId: made.rows[0].account_id, beforeState: undefined, afterState: { label, bank, accountLast4: input.accountLast4 } });
  return { ok: true, accountId: made.rows[0].account_id };
}

export type Preview = {
  map: ColumnMap | null; // the map used: the one given, else the account's saved one, else a guess from the headers
  firstLines: string[][]; // the top of the file, for the uploader to say which line holds the column names and check the map
  summary: { rowsRead: number; creditRows: number; creditTotalMinor: number; debitRows: number; periodFrom: string; periodTo: string; openingBalanceMinor: number | null; closingBalanceMinor: number | null; firstCredits: { valueDate: string; narration: string; amountMinor: number }[] } | null;
  problem: ParseProblem | { reason: 'too_big' | 'no_map' | 'period' } | null;
};
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function read(text: string, map: ColumnMap | null, period: { from: string; to: string }): { preview: Preview; statement: ParsedStatement | null } {
  if (text.length > MAX_STATEMENT_CHARS) return { preview: { map, firstLines: [], summary: null, problem: { reason: 'too_big' } }, statement: null };
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length > MAX_STATEMENT_ROWS + 60) return { preview: { map, firstLines: [], summary: null, problem: { reason: 'too_big' } }, statement: null };
  const use = map ?? guessColumnMap(rows);
  const firstLines = rows.slice(0, 40).map((r) => r.slice(0, 30).map((c) => c.slice(0, 60)));
  if (!use) return { preview: { map: null, firstLines, summary: null, problem: { reason: 'no_map' } }, statement: null };
  if (!isDate(period.from) || !isDate(period.to) || period.to < period.from) return { preview: { map: use, firstLines, summary: null, problem: { reason: 'period' } }, statement: null };
  const parsed = readStatement(text, use, period);
  if (!parsed.ok) return { preview: { map: use, firstLines, summary: null, problem: parsed.problem }, statement: null };
  const s = parsed.statement;
  return { preview: { map: use, firstLines, summary: { rowsRead: s.rowsRead, creditRows: s.credits.length, creditTotalMinor: s.creditTotalMinor, debitRows: s.debitRows, periodFrom: s.periodFrom, periodTo: s.periodTo, openingBalanceMinor: s.openingBalanceMinor, closingBalanceMinor: s.closingBalanceMinor, firstCredits: s.credits.slice(0, 5).map((c) => ({ valueDate: c.valueDate, narration: c.narration.slice(0, 80), amountMinor: c.amountMinor })) }, problem: null }, statement: s };
}

// Step 1: nothing is saved. A map of null means "use the account's saved one, or guess".
export async function previewStatement(db: PoolClient, actor: Actor, input: { accountId: string; text: string; map: ColumnMap | null; period: { from: string; to: string } }): Promise<Preview | { notAllowed: true } | { noAccount: true }> {
  if (!FINANCE.includes(actor.role)) return { notAllowed: true };
  const account = (await db.query(`select statement_profile from bank_accounts where school_id = $1 and account_id = $2`, [actor.schoolId, input.accountId])).rows[0];
  if (!account) return { noAccount: true };
  return read(input.text, input.map ?? (account.statement_profile as ColumnMap | null), input.period).preview;
}

export type ImportResult =
  | { ok: true; importId: string; creditRows: number; rowsAdded: number; alreadyHere: number; creditTotalMinor: number; balanceContinues: boolean | null; sameFileBefore: boolean }
  | { ok: false; reason: 'not_allowed' | 'no_account' | 'not_confirmed' | 'unreadable'; problem?: Preview['problem'] };

// Step 2: the uploader has confirmed the count and the total they were shown. If the file now reads differently
// (another map, another file), nothing is saved.
export async function importStatement(db: PoolClient, actor: Actor, input: { accountId: string; text: string; map: ColumnMap; period: { from: string; to: string }; confirmed: { creditRows: number; creditTotalMinor: number } }): Promise<ImportResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const account = (await db.query(`select account_id from bank_accounts where school_id = $1 and account_id = $2 for update`, [actor.schoolId, input.accountId])).rows[0];
  if (!account) return { ok: false, reason: 'no_account' };
  const { preview, statement } = read(input.text, input.map, input.period);
  if (!statement) return { ok: false, reason: 'unreadable', problem: preview.problem };
  if (statement.credits.length !== input.confirmed.creditRows || statement.creditTotalMinor !== input.confirmed.creditTotalMinor) return { ok: false, reason: 'not_confirmed' };

  const sha = fileSha256(input.text);
  const sameFileBefore = !!(await db.query(`select 1 from bank_statement_imports where school_id = $1 and account_id = $2 and file_sha256 = $3`, [actor.schoolId, input.accountId, sha])).rows[0];
  // Balance continuity: this statement should begin where the latest one before it ended. A gap means a statement
  // is missing in between (or one was edited). It is a warning for the uploader and the principal, not a refusal.
  const last = (await db.query(`select closing_balance_minor from bank_statement_imports where school_id = $1 and account_id = $2 and period_to < $3 and closing_balance_minor is not null order by period_to desc, uploaded_at desc limit 1`, [actor.schoolId, input.accountId, statement.periodFrom])).rows[0];
  const balanceContinues = last && statement.openingBalanceMinor !== null ? Number(last.closing_balance_minor) === statement.openingBalanceMinor : null;

  const c = statement.credits;
  // How many of these lines are already here (the account is locked, so nobody adds one in between).
  const alreadyHere = (await db.query(`select count(*)::int as n from bank_credit_rows where school_id = $1 and account_id = $2 and row_identity = any($3::text[])`, [actor.schoolId, input.accountId, c.map((r) => r.identity)])).rows[0].n as number;
  const rowsAdded = c.length - alreadyHere;
  const importId = (await db.query(
    `insert into bank_statement_imports (school_id, account_id, file_sha256, period_from, period_to, rows_read, credit_rows, credit_total_minor, rows_added, opening_balance_minor, closing_balance_minor, balance_continues, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $13, $9, $10, $11, $12) returning import_id`,
    [actor.schoolId, input.accountId, sha, statement.periodFrom, statement.periodTo, statement.rowsRead, statement.credits.length, statement.creditTotalMinor, statement.openingBalanceMinor, statement.closingBalanceMinor, balanceContinues, actor.userId, rowsAdded]
  )).rows[0].import_id as string;
  await db.query(
    `insert into bank_credit_rows (school_id, account_id, import_id, value_date, narration, utr, reference_code, amount_minor, balance_after_minor, row_identity)
     select $1, $2, $3, n.value_date, n.narration, n.utr, n.reference_code, n.amount_minor, n.balance_after, n.identity
       from unnest($4::date[], $5::text[], $6::text[], $7::text[], $8::bigint[], $9::bigint[], $10::text[]) as n(value_date, narration, utr, reference_code, amount_minor, balance_after, identity)
     on conflict (school_id, account_id, row_identity) do nothing`,
    [actor.schoolId, input.accountId, importId, c.map((r) => r.valueDate), c.map((r) => r.narration), c.map((r) => r.utr), c.map((r) => r.referenceCode), c.map((r) => r.amountMinor), c.map((r) => r.balanceAfterMinor), c.map((r) => r.identity)]
  );
  await db.query(`update bank_accounts set statement_profile = $3 where school_id = $1 and account_id = $2`, [actor.schoolId, input.accountId, JSON.stringify(input.map)]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'bank.statement_uploaded', targetType: 'bank_statement_imports', targetId: importId, beforeState: undefined, afterState: { fileSha256: sha, periodFrom: statement.periodFrom, periodTo: statement.periodTo, creditRows: c.length, creditTotalMinor: statement.creditTotalMinor, rowsAdded, balanceContinues, sameFileBefore } });
  return { ok: true, importId, creditRows: c.length, rowsAdded, alreadyHere, creditTotalMinor: statement.creditTotalMinor, balanceContinues, sameFileBefore };
}

export type ImportRow = { import_id: string; account_label: string; period_from: string; period_to: string; credit_rows: number; rows_added: number; credit_total_minor: number; balance_continues: boolean | null; uploaded_by_name: string | null; uploaded_at: string };
export async function listImports(db: PoolClient, schoolId: string): Promise<ImportRow[]> {
  const { rows } = await db.query(
    `select i.import_id, a.label as account_label, i.period_from::text as period_from, i.period_to::text as period_to, i.credit_rows, i.rows_added, i.credit_total_minor, i.balance_continues, u.display_name as uploaded_by_name, i.uploaded_at
       from bank_statement_imports i join bank_accounts a on a.school_id = i.school_id and a.account_id = i.account_id left join users u on u.user_id = i.uploaded_by
      where i.school_id = $1 order by i.uploaded_at desc limit 30`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, credit_total_minor: Number(r.credit_total_minor), uploaded_at: new Date(r.uploaded_at).toISOString() }));
}
