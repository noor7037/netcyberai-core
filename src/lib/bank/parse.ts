import { createHash } from 'crypto';
import { parseCsv } from '@/lib/import/csv';

// Reading a bank statement (docs/24 §3.4 path B, §3.7, C176). A statement is
// the bank's own record, downloaded by the school from net banking as CSV.
// Every bank lays its columns out differently, so the school tells us once
// which column is which (the "column map"); this file then reads any
// statement of that account the same way. No bank API, no guessing at money.
//
// - CREDIT ROWS ONLY are kept: money that came in.
// - Indian formats: 1,00,000.00; a Dr/Cr column; "500.00 Cr"; brackets or a
//   minus sign for money going out; dates as 05/04/2026, 05-04-2026,
//   05-Apr-2026, 05 Apr 2026 or 2026-04-05. A date is day first: a
//   statement from an Indian bank is never month first.
// - Anything that does not parse stops the upload with the line it is on.
//   A statement is never half read.

export type ColumnMap = {
  headerRow: number; // 0-based index of the row that holds the column names
  date: number;
  narration: number;
  credit?: number; // a credit-only column
  debit?: number; // a debit-only column (used to tell credits from debits when both exist)
  amount?: number; // one amount column ...
  drCr?: number; // ... with a column saying Dr or Cr, or with the sign on the amount itself
  balance?: number;
  reference?: number; // the bank's own reference / cheque / UTR column, if it has one
};

export type CreditRow = { valueDate: string; narration: string; amountMinor: number; balanceAfterMinor: number | null; utr: string | null; referenceCode: string | null; identity: string };
export type ParsedStatement = { rowsRead: number; credits: CreditRow[]; creditTotalMinor: number; debitRows: number; periodFrom: string; periodTo: string; openingBalanceMinor: number | null; closingBalanceMinor: number | null };
export type ParseProblem = { reason: 'no_rows' | 'bad_map' | 'bad_date' | 'bad_amount' | 'no_credits' | 'outside_period'; line?: number; value?: string };

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
const real = (y: string, m: string, d: string) => (!Number.isNaN(Date.parse(`${y}-${m}-${d}T00:00:00Z`)) && new Date(`${y}-${m}-${d}T00:00:00Z`).getUTCDate() === Number(d) ? `${y}-${m}-${d}` : null);

// A date as an Indian bank writes it, to YYYY-MM-DD. Day first, always.
export function parseBankDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i, '');
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return real(m[1], m[2], m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return real(m[3].length === 2 ? `20${m[3]}` : m[3], m[2].padStart(2, '0'), m[1].padStart(2, '0'));
  m = /^(\d{1,2})[ /-]([A-Za-z]{3})[A-Za-z]*[ /,-]+(\d{2}|\d{4})$/.exec(s);
  const month = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return m && month ? real(m[3].length === 2 ? `20${m[3]}` : m[3], month, m[1].padStart(2, '0')) : null;
}

// An amount as an Indian bank writes it, to paise, with its sign: + in, - out, 0 for an empty cell. null: not an amount.
export function parseBankAmount(raw: string): number | null {
  let s = raw.trim();
  if (s === '' || s === '-' || s === '--') return 0;
  let sign = 1;
  const suffix = /\s*\(?\b(cr|dr)\b\.?\)?$/i.exec(s);
  if (suffix) {
    if (suffix[1].toLowerCase() === 'dr') sign = -1;
    s = s.slice(0, suffix.index).trim();
  }
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    sign = -sign;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) s = s.slice(1).trim();
  s = s.replace(/^(₹|rs\.?|inr)\s*/i, '');
  // Digits with commas wherever a bank puts them (1,00,000 or 100,000), and at most two decimals.
  if (!/^\d{1,3}(,\d{2,3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.replace(/,/g, '').split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0') || '0');
  return Number.isSafeInteger(minor) ? sign * minor : null;
}

// The 12-digit UTR / RRN in a narration or reference cell, when there is exactly one.
export function findUtr(...cells: string[]): string | null {
  const found = new Set(cells.flatMap((c) => c.match(/(?<![0-9])[0-9]{12}(?![0-9])/g) ?? []));
  return found.size === 1 ? [...found][0] : null;
}
// Our own reference code, as a UPI app passes it on: NCA-7K3Q9MPD, with or without the dash, in any case.
export function findReferenceCode(...cells: string[]): string | null {
  const found = new Set(cells.flatMap((c) => [...c.toUpperCase().matchAll(/NCA[-\s]?([A-HJKMNP-Z2-9]{8})(?![A-Z0-9])/g)].map((m) => m[1])));
  return found.size === 1 ? [...found][0] : null;
}

// Which column is which, guessed from the header names, for the uploader to check and correct.
export function guessColumnMap(rows: readonly string[][]): ColumnMap | null {
  const is = (cell: string, ...words: string[]) => words.some((w) => cell.toLowerCase().replace(/[^a-z]/g, '').includes(w));
  for (let r = 0; r < Math.min(rows.length, 40); r += 1) {
    const cells = rows[r];
    const find = (...words: string[]) => cells.findIndex((c) => is(c, ...words));
    const date = cells.findIndex((c) => is(c, 'valuedate', 'txndate', 'transactiondate', 'date'));
    const narration = find('narration', 'description', 'particulars', 'remarks', 'details');
    const credit = find('credit', 'deposit');
    const amount = cells.findIndex((c) => is(c, 'amount') && !is(c, 'credit', 'debit', 'deposit', 'withdrawal'));
    if (date < 0 || narration < 0 || (credit < 0 && amount < 0)) continue;
    const opt = (i: number) => (i >= 0 ? i : undefined);
    return { headerRow: r, date, narration, credit: opt(credit), debit: opt(find('debit', 'withdrawal')), amount: credit < 0 ? opt(amount) : undefined, drCr: credit < 0 ? opt(cells.findIndex((c) => /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|txn type)$/i.test(c.trim()))) : undefined, balance: opt(find('balance')), reference: opt(find('refno', 'reference', 'chequeno', 'chqno', 'utr')) };
  }
  return null;
}

export function readStatement(text: string, map: ColumnMap, period: { from: string; to: string }): { ok: true; statement: ParsedStatement } | { ok: false; problem: ParseProblem } {
  const all = parseCsv(text.replace(/^﻿/, ''));
  const body = all.slice(map.headerRow + 1);
  const width = Math.max(map.date, map.narration, map.credit ?? 0, map.debit ?? 0, map.amount ?? 0, map.drCr ?? 0, map.balance ?? 0, map.reference ?? 0);
  if (map.headerRow < 0 || map.headerRow >= all.length || (map.credit === undefined && map.amount === undefined)) return { ok: false, problem: { reason: 'bad_map' } };
  const credits: CreditRow[] = [];
  const seen = new Map<string, number>();
  let rowsRead = 0;
  let debitRows = 0;
  let opening: number | null = null;
  let closing: number | null = null;
  for (let i = 0; i < body.length; i += 1) {
    const cells = body[i];
    const line = map.headerRow + 2 + i;
    const cell = (index: number | undefined) => (index === undefined ? '' : (cells[index] ?? '').trim());
    // Blank lines, and the totals or notes a bank prints under the table (no date in the date column), are not rows.
    if (cells.every((c) => c.trim() === '') || (cells.length <= width && cell(map.date) === '')) continue;
    const valueDate = parseBankDate(cell(map.date));
    if (!valueDate) {
      if (cell(map.date) === '' || /total|balance|summary|statement|page|\*{3}/i.test(cells.join(' '))) continue;
      return { ok: false, problem: { reason: 'bad_date', line, value: cell(map.date).slice(0, 40) } };
    }
    rowsRead += 1;
    let signed: number | null;
    if (map.credit !== undefined) {
      const credit = parseBankAmount(cell(map.credit));
      const debit = map.debit === undefined ? 0 : parseBankAmount(cell(map.debit));
      if (credit === null || debit === null) return { ok: false, problem: { reason: 'bad_amount', line, value: (credit === null ? cell(map.credit) : cell(map.debit)).slice(0, 40) } };
      signed = Math.abs(credit) > 0 ? Math.abs(credit) : -Math.abs(debit);
    } else {
      const amount = parseBankAmount(cell(map.amount));
      if (amount === null) return { ok: false, problem: { reason: 'bad_amount', line, value: cell(map.amount).slice(0, 40) } };
      const marker = cell(map.drCr).toLowerCase().replace(/[^a-z]/g, '');
      signed = map.drCr === undefined ? amount : marker.startsWith('cr') || marker === 'c' || marker === 'credit' ? Math.abs(amount) : marker.startsWith('dr') || marker === 'd' || marker === 'debit' ? -Math.abs(amount) : null;
      if (signed === null) return { ok: false, problem: { reason: 'bad_amount', line, value: cell(map.drCr).slice(0, 40) } };
    }
    const balance = map.balance === undefined || cell(map.balance) === '' ? null : parseBankAmount(cell(map.balance));
    if (map.balance !== undefined && balance === null && cell(map.balance) !== '') return { ok: false, problem: { reason: 'bad_amount', line, value: cell(map.balance).slice(0, 40) } };
    if (balance !== null) {
      if (opening === null) opening = balance - signed;
      closing = balance;
    }
    if (signed <= 0) {
      if (signed < 0) debitRows += 1;
      continue; // money going out, or a line with no money: not kept
    }
    if (valueDate < period.from || valueDate > period.to) return { ok: false, problem: { reason: 'outside_period', line, value: valueDate } };
    const narration = cell(map.narration).replace(/\s+/g, ' ').slice(0, 500);
    const reference = cell(map.reference);
    // The bank's own line is the row's identity. Two lines the same in every cell (it happens: two parents, the same
    // amount, the same minute, no balance column) are told apart by which one they are in the statement.
    const base = [valueDate, signed, narration, reference, balance ?? ''].join('|');
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    credits.push({ valueDate, narration, amountMinor: signed, balanceAfterMinor: balance, utr: findUtr(narration, reference), referenceCode: findReferenceCode(narration, reference), identity: createHash('sha256').update(`${base}|${nth}`).digest('hex') });
  }
  if (rowsRead === 0) return { ok: false, problem: { reason: 'no_rows' } };
  const creditTotalMinor = credits.reduce((t, c) => t + c.amountMinor, 0);
  if (credits.length === 0 || creditTotalMinor === 0) return { ok: false, problem: { reason: 'no_credits' } };
  return { ok: true, statement: { rowsRead, credits, creditTotalMinor, debitRows, periodFrom: period.from, periodTo: period.to, openingBalanceMinor: opening, closingBalanceMinor: closing } };
}

export const fileSha256 = (text: string) => createHash('sha256').update(text).digest('hex');
