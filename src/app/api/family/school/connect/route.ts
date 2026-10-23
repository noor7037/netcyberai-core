import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { connectSchool } from '@/lib/family/school';
import { indiaDate } from '@/lib/time/india';

// Connect a school (C230-AA): the parent, in parent mode, enters the code the school's office made for them. A wrong,
// used or expired code says only that it did not work (never which), and an account gets 10 tries a day.
export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  if (typeof body.code !== 'string' || body.code.length > 20) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  return familyRun(g.session, async (db) => {
    const r = await connectSchool(db, g.session.accountId, body.code, indiaDate());
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === 'too_many_tries' ? 429 : 400 });
    return NextResponse.json({ linkId: r.linkId, schoolName: r.schoolName });
  });
}
