import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { classSubjects } from '@/lib/family/catalog';
import { activeChild, listChildren, syllabusBoardOf } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { FamilySessionRevokedError, withFamilyContext } from '@/lib/family/db';
import { familyModuleOn } from '@/lib/family/flags';
import { newLadder, parseRead, PHOTO_MAX_BYTES, screenPhoto, sealLadder, viewOf } from '@/lib/family/homework';
import { claimSubject, setting } from '@/lib/family/learning';
import type { Subject } from '@/lib/family/modules';
import { requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { activePromptVersion, prepareText, type PreparedText } from '@/lib/ai/platform';
import { homeworkPrompt } from '@/lib/ai/prompts/family.homework';
import { sniffImageType } from '@/lib/storage/file-storage';
import { indiaDate } from '@/lib/time/india';

// The homework helper reads a photo (M2-6, C280): POST { photo: <base64 of a JPEG, PNG or WebP> }. The photo is
// screened here (a real photo, at most 3 MB, no Aadhaar number or card in its words), counted against the child's photo
// questions for the day (Control: family.photo_questions_per_day), read once by the family.homework profile (a
// provider cleared for minors), and dropped: it is never stored or logged. The answer is a sealed ladder token and
// what the phone may see of it (src/lib/family/homework.ts). No database connection is held while the AI reads (F1-3).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// parseRead keeps a subject only when it is one of these (the class's own), else 'other'.
type Pending = { prepared: PreparedText; childId: string; freeSubject: string | null; subjects: Subject[]; day: string };
const refund = (db: { query: (sql: string, p?: unknown[]) => Promise<unknown> }, accountId: string, childId: string, day: string) =>
  db.query(`update family.day_counts set photo_questions = greatest(photo_questions - 1, 0) where account_id = $1 and child_id = $2 and day = $3`, [accountId, childId, day]);

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const claims = { accountId: session.accountId, tokenVersion: session.tokenVersion };
  const body = (await req.json().catch(() => null)) as { photo?: unknown } | null;
  const b64 = typeof body?.photo === 'string' ? body.photo.replace(/^data:image\/[a-z]+;base64,/, '') : '';
  if (!b64) return NextResponse.json({ error: 'not_a_photo' }, { status: 400 });
  if (b64.length > Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 4) return NextResponse.json({ error: 'too_big' }, { status: 413 });
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;

  try {
    // 0. The screen, before any database work or vendor call.
    const screen = await screenPhoto(bytes, sniffImageType);
    if (!screen.ok) return NextResponse.json({ error: screen.reason }, { status: 422 });

    // 1. The checks, the day's count and the AI platform's own checks, in one short transaction.
    const first = await withFamilyContext(claims, async (db): Promise<Pending | NextResponse> => {
      const children = await listChildren(db, session.accountId);
      const child = activeChild(children, chosen);
      if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      if (!(await consentState(db, session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 403 });
      if (!(await familyModuleOn(db, 'homework', session.accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
      const day = indiaDate();
      const limit = Math.max(0, Math.round(await setting(db, 'family.photo_questions_per_day', 3)));
      const taken = await db.query(
        `insert into family.day_counts as d (account_id, child_id, day, photo_questions) select $1, $2, $3, 1 where $4::int > 0
         on conflict (child_id, day) do update set photo_questions = d.photo_questions + 1 where d.photo_questions < $4::int
         returning photo_questions`,
        [session.accountId, child.childId, day, limit]
      );
      if (taken.rows.length === 0) return NextResponse.json({ error: 'photo_cap', limit }, { status: 429 });
      const subjects = await classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel, today: day });
      const prompt = homeworkPrompt(await activePromptVersion(db, 'family.homework'));
      const account = await accountSummary(db, session.accountId);
      const prepared = await prepareText(
        db,
        { accountId: session.accountId, childFirstNames: children.map((c) => c.firstName), parentEmail: account?.email ?? '', day },
        'family.homework',
        {
          system: prompt.system({ board: syllabusBoardOf(child), classLevel: child.classLevel, classSubjects: subjects, language: child.language, style: child.style }),
          messages: [{ role: 'user', content: prompt.user(), images: [{ mediaType: screen.mediaType, base64: b64 }] }],
          responseFormat: 'json',
          maxTokens: 1500,
        }
      );
      if (!prepared.ok) {
        await refund(db, session.accountId, child.childId, day);
        return NextResponse.json({ error: `ai_${prepared.reason}` }, { status: 503 });
      }
      return { prepared: prepared.text, childId: child.childId, freeSubject: child.freeSubject, subjects, day };
    });
    if (first instanceof NextResponse) return first;

    // 2. The provider reads the photo, with no database connection held.
    const sent = await first.prepared.send();

    // 3. The metering and the answer, in a second short transaction.
    return await withFamilyContext(claims, async (db) => {
      await sent.record(db);
      if (!sent.result.ok) {
        await refund(db, session.accountId, first.childId, first.day);
        return NextResponse.json({ error: 'ai_failed' }, { status: 503 });
      }
      const parsed = parseRead(sent.result.text, first.subjects);
      if (!parsed.ok) {
        // A photo the model could not turn into a ladder is not counted; a refusal it chose (a face, personal details,
        // no question) is.
        if (parsed.reason === 'failed') await refund(db, session.accountId, first.childId, first.day);
        return NextResponse.json({ error: parsed.reason === 'failed' ? 'ai_failed' : parsed.reason }, { status: 422 });
      }
      // The child's free subject applies as in Understand: a question of a closed subject is not answered.
      if (parsed.read.subject !== 'other' && !(await claimSubject(db, session.accountId, first.childId, parsed.read.subject as Subject))) {
        await refund(db, session.accountId, first.childId, first.day);
        return NextResponse.json({ error: 'not_open', subject: parsed.read.subject, freeSubject: first.freeSubject }, { status: 403 });
      }
      const ladder = newLadder(parsed.read, { accountId: session.accountId, childId: first.childId });
      return NextResponse.json({ token: sealLadder(ladder), view: viewOf(ladder) });
    });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
    throw err;
  }
}
