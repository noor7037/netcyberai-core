import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { examCandidates, setNumbering, undoWithdrawal, withdrawCandidate } from '@/lib/marking/candidates';
import { actorOf, mayRead, refusal } from '@/lib/marking/http';

// An exam's candidates and exam numbers (C348): its classes' rolls less the children the office withdrew from it, and
// the exam numbers (seat numbers) where the exam uses them.
//   GET   per class: on the roll, withdrawn, candidates, numbered; the withdrawals with their reasons.
//         The office and the coordinator read every class, a teacher their own.
//   (Each change is the office's only: the rules in src/lib/marking/candidates.ts check the role, the database the rows.)
//   POST  { action: 'withdraw', studentId, reason }      the office only
//   POST  { action: 'undo', studentId }                  the office only: a withdrawal taken back
//   POST  { action: 'numbering', numbering: 'roll' | 'seat', prefix? }   the office only: exam numbers on or off
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { examId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.examId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const data = await examCandidates(db, actorOf(claims), params.examId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

const ACTIONS = ['withdraw', 'undo', 'numbering'];

export async function POST(req: NextRequest, { params }: { params: { examId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.examId) || typeof b.action !== 'string' || !ACTIONS.includes(b.action)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const actor = actorOf(claims);
    const r =
      b.action === 'withdraw'
        ? await withdrawCandidate(db, actor, params.examId, b.studentId, b.reason)
        : b.action === 'undo'
          ? await undoWithdrawal(db, actor, params.examId, b.studentId)
          : await setNumbering(db, actor, params.examId, b.numbering, b.prefix);
    if (r.ok) return NextResponse.json({ ok: true });
    return refusal(r.reason);
  });
}
