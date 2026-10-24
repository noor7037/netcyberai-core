import { NextRequest, NextResponse } from 'next/server';
import { familyRead, jsonBody, requireParent } from '@/lib/family/request';
import { activeLinks, answerSchoolPulse } from '@/lib/family/school';

// The parent answers the school's Daily Pulse for a matched child (C336; C230-AD): understood, or needs help. Body:
// { linkId, studentId, pulseId, answer }. The database records it as a WhatsApp answer is, or says why not: already
// answered, closed (sent more than 24 hours ago), no_consent (the school holds no consent for messages: read only).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const linkId = uuid(body.linkId);
  const studentId = uuid(body.studentId);
  const pulseId = uuid(body.pulseId);
  const answer = body.answer === 'understood' || body.answer === 'needs_help' ? body.answer : null;
  if (!linkId || !studentId || !pulseId || !answer) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const claims = { accountId: g.session.accountId, tokenVersion: g.session.tokenVersion };
  const links = await familyRead(g.session, (db) => activeLinks(db, g.session.accountId));
  if (!links) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  const result = await answerSchoolPulse(claims, links, { linkId, studentId, pulseId, answer });
  if (result === 'recorded') return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result }, { status: result === 'not_found' ? 404 : 409 });
}
