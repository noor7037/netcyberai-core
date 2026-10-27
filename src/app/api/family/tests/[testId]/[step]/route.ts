import { NextRequest, NextResponse } from 'next/server';
import { familyClaims } from '@/lib/family/db';
import { answerFrom, childLeftTest, childSaveAnswer, childStartTest, childSubmitTest, sittingChild } from '@/lib/family/online-tests';
import { familyRead, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

// Sitting a school's online test in child mode (AQ-4, C365). The child using the app now (chosen on the parent's phone,
// or a child's own phone's child), matched to a school student; the school's database decides the rest, by its clock.
//   POST start    {}                                              → the attempt (started now, or the one being sat),
//                                                                   its deadline, the server's time and the questions
//   POST answer   { attemptId, questionId, answer, flagged, seq } → { result: 'saved' } or 409 { error: 'closed' }
//   POST submit   { attemptId }                                   → { result: 'submitted' | 'timed_out' | 'done' }
//   POST left     { attemptId }                                   → { result: 'noted' | 'closed' }
// No answer, mark or key is ever sent back but the child's own saved answers.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);
const STEPS = new Set(['start', 'answer', 'submit', 'left']);
const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function POST(req: NextRequest, { params }: { params: { testId: string; step: string } }) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const testId = uuid(params.testId);
  if (!testId || !STEPS.has(params.step)) return notFound();
  const body = await jsonBody(req);
  const who = await familyRead(g.session, (db) => sittingChild(db, g.session.accountId, req.cookies.get(FAMILY_CHILD_COOKIE)?.value));
  if (!who) return notFound();
  const claims = familyClaims(g.session);
  const noStore = { headers: { 'Cache-Control': 'no-store' } };

  if (params.step === 'start') {
    const sitting = await childStartTest(claims, who.links, who.childId, testId);
    if (sitting.outcome === 'not_found') return notFound();
    return NextResponse.json(sitting, noStore);
  }
  const attemptId = uuid(body.attemptId);
  if (!attemptId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (params.step === 'answer') {
    const questionId = uuid(body.questionId);
    const answer = answerFrom(body.answer);
    const seq = body.seq;
    if (!questionId || answer === 'bad' || typeof body.flagged !== 'boolean' || typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1 || seq > 1_000_000_000) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const result = await childSaveAnswer(claims, who.links, who.childId, { attemptId, questionId, answer, flagged: body.flagged, seq });
    if (result === 'saved') return NextResponse.json({ result }, noStore);
    return NextResponse.json({ error: result }, { status: result === 'not_found' ? 404 : result === 'bad_answer' ? 400 : 409 });
  }
  const result = params.step === 'submit' ? await childSubmitTest(claims, who.links, who.childId, attemptId) : await childLeftTest(claims, who.links, who.childId, attemptId);
  if (result === 'not_found') return notFound();
  return NextResponse.json({ result }, noStore);
}
