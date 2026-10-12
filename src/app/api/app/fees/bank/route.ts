import { NextRequest, NextResponse } from 'next/server';
import { FEES_PARTS } from '@/lib/fees/page-data';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import type { ColumnMap } from '@/lib/bank/parse';
import { MAX_STATEMENT_CHARS, addAccount, importStatement, listAccounts, listImports, previewStatement } from '@/lib/bank/statements';
import { bankLists, markNotAFee, matchByHand, matchStatementRows } from '@/lib/bank/match';
import { FINANCE } from '@/lib/fees/structures';

// The school's bank accounts and statements (docs/24 §3.4 path B, C176).
//   GET   the accounts and the latest uploads
//   POST  { action: 'account', label, bankName, accountLast4, ifsc }        add an account (principal or school admin)
//         { action: 'preview', accountId, text, map?, from, to }           read a statement and show what is in it; saves nothing
//         { action: 'import', accountId, text, map, from, to, confirmed }  keep its credit rows, once the count and total shown are confirmed; then match them
//         { action: 'match' }                                              look at every unmatched row again
//         { action: 'by_hand', rowId, linkId, reason }                     a person ties a credit to a family's payment link
//         { action: 'not_a_fee', rowId, reason }                           a person sets a credit aside
// The statement travels as the CSV's text; nothing is stored but its credit rows and its SHA-256.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await FEES_PARTS.bank(db, { schoolId: claims.schoolId, role: claims.role }));
  });
}

const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 200 ? v : undefined);
function columnMap(raw: unknown): ColumnMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const headerRow = num(m.headerRow);
  const date = num(m.date);
  const narration = num(m.narration);
  if (headerRow === undefined || date === undefined || narration === undefined) return null;
  return { headerRow, date, narration, credit: num(m.credit), debit: num(m.debit), amount: num(m.amount), drCr: num(m.drCr), balance: num(m.balance), reference: num(m.reference) };
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const text = (v: unknown, max = 100) => (typeof v === 'string' && v.length <= max ? v : '');
    if (body?.action === 'account') {
      const made = await addAccount(db, actor, { label: text(body.label), bankName: text(body.bankName), accountLast4: text(body.accountLast4), ifsc: text(body.ifsc) });
      if (made.ok) return NextResponse.json({ accountId: made.accountId }, { status: 201 });
      return made.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(made.reason === 'exists' ? 409 : 400, 'the account was not added', { code: made.reason });
    }
    if (body?.action === 'match') {
      const run = await matchStatementRows(db, actor);
      return 'notAllowed' in run ? ruleError(403, 'not_allowed') : NextResponse.json({ matched: run });
    }
    if (body?.action === 'by_hand' || body?.action === 'not_a_fee') {
      if (!isUuid(body.rowId) || (body.action === 'by_hand' && !isUuid(body.linkId))) return ruleError(400, 'not_sent_properly');
      const done = body.action === 'by_hand' ? await matchByHand(db, actor, body.rowId as string, body.linkId as string, text(body.reason, 300)) : await markNotAFee(db, actor, body.rowId as string, text(body.reason, 300));
      if (done.ok) return NextResponse.json({ ok: true, outcome: done.credit?.outcome ?? null, receiptNo: done.credit?.receiptNo ?? null, unappliedMinor: done.credit?.unappliedMinor ?? 0 });
      if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
      return jsonError(done.reason === 'no_row' || done.reason === 'no_link' ? 404 : done.reason === 'already_decided' || done.reason === 'reported_for_another' || done.reason === 'already_credited' ? 409 : 400, 'the credit was not decided', { code: done.reason });
    }
    if ((body?.action !== 'preview' && body?.action !== 'import') || !isUuid(body.accountId) || typeof body.text !== 'string' || body.text.length > MAX_STATEMENT_CHARS) return ruleError(400, 'not_sent_properly');
    const period = { from: text(body.from, 10), to: text(body.to, 10) };
    if (body.action === 'preview') {
      const preview = await previewStatement(db, actor, { accountId: body.accountId as string, text: body.text, map: columnMap(body.map), period });
      if ('notAllowed' in preview) return ruleError(403, 'not_allowed');
      if ('noAccount' in preview) return jsonError(404, 'not found', { code: 'no_account' });
      return NextResponse.json({ preview });
    }
    const map = columnMap(body.map);
    const confirmed = body.confirmed as { creditRows?: unknown; creditTotalMinor?: unknown } | undefined;
    if (!map || typeof confirmed?.creditRows !== 'number' || typeof confirmed.creditTotalMinor !== 'number') return ruleError(400, 'not_sent_properly');
    const result = await importStatement(db, actor, { accountId: body.accountId as string, text: body.text, map, period, confirmed: { creditRows: confirmed.creditRows, creditTotalMinor: confirmed.creditTotalMinor } });
    if (result.ok) {
      const run = await matchStatementRows(db, actor);
      return NextResponse.json({ ...result, matched: 'notAllowed' in run ? null : run }, { status: 201 });
    }
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'no_account' ? 404 : result.reason === 'not_confirmed' ? 409 : 400, 'the statement was not kept', { code: result.reason, problem: result.problem ?? null });
  });
}
