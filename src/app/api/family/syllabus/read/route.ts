import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { checkSyllabusRequest, draftFromCatalogLines, draftFromReply, isUuid, keepDraft, PROBLEM_STATUS, type RequestProblem } from '@/lib/family/child-syllabus';
import { extractedCatalog, pdfPages, PDF_MAX_BYTES } from '@/lib/content/pdf-import';
import { FamilySessionRevokedError, withFamilyContext } from '@/lib/family/db';
import { PHOTO_MAX_BYTES, screenPhoto } from '@/lib/family/homework';
import { jsonBody, requireParent } from '@/lib/family/request';
import { activePromptVersion, prepareText, type PreparedText } from '@/lib/ai/platform';
import { familySyllabusPrompt } from '@/lib/ai/prompts/family.syllabus_extract';
import { sniffImageType } from '@/lib/storage/file-storage';
import { indiaDate } from '@/lib/time/india';

// A parent's own syllabus (C230-AB): one photo of a book's contents page, or one PDF of the contents or syllabus,
// becomes a draft list of chapters and topics.
//   POST { childId, subject, photo: <base64 of a JPEG, PNG or WebP, at most 3 MB>, syllabusId? }
//   POST { childId, subject, pdf: <base64 of a PDF with text, at most 3 MB> }
// A PDF's text is read here (src/lib/content/pdf-import.ts, as Control's catalog import); only titles printed on their
// own page are kept (extractedCatalog), so nothing the model makes up reaches the draft.
// Parent mode and the study_core consent. The photo is screened here first (a real photo, not too big, no Aadhaar
// number or card in its words), read once by the family.syllabus_extract profile through the AI platform, and dropped:
// it is never stored or logged. The titles it gives start a new draft, or join the end of the draft named by
// syllabusId (up to 5 photos, one request each: the hosting refuses a body over 4.5 MB). A draft is never shown to the
// child; the parent checks, edits and saves it (POST /api/family/syllabus). No database connection is held while the
// AI reads (F1-3).
export const dynamic = 'force-dynamic';
// Longer than a whole answer's own limit (C323, C230-X): a slow read ends in the parent's plain message.
export const maxDuration = 300;

const refuse = (reason: RequestProblem | 'bad_request', extra: Record<string, unknown> = {}) => NextResponse.json({ error: reason, ...extra }, { status: PROBLEM_STATUS[reason] });

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const p = await requireParent(req);
  if (p.error) return p.error;
  const session = p.session;
  const accountId = session.accountId;
  const claims = { accountId, tokenVersion: session.tokenVersion };
  const draftId = body.syllabusId ?? null;
  if (!isUuid(body.childId) || typeof body.subject !== 'string' || (draftId !== null && !isUuid(draftId))) return refuse('bad_request');
  const childId = body.childId;
  const subject = body.subject;
  const isPdf = typeof body.pdf === 'string';
  const b64 = isPdf ? (body.pdf as string).replace(/^data:application\/pdf;base64,/, '') : typeof body.photo === 'string' ? body.photo.replace(/^data:image\/[a-z]+;base64,/, '') : '';
  if (!b64) return NextResponse.json({ error: 'not_a_photo' }, { status: 400 });
  if (b64.length > Math.ceil(((isPdf ? PDF_MAX_BYTES : PHOTO_MAX_BYTES) * 4) / 3) + 4) return NextResponse.json({ error: 'too_big' }, { status: 413 });
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  // A PDF starts its own draft; its text is read before anything else is paid for.
  if (isPdf && draftId !== null) return refuse('bad_request');
  const pdf = isPdf ? pdfPages(bytes) : null;
  if (pdf && !pdf.ok) return NextResponse.json({ error: pdf.reason }, { status: pdf.reason === 'too_big' ? 413 : 422 });
  const pages = pdf && pdf.ok ? pdf.pages : null;

  try {
    // 0. The cheap refusals first, so a refused request never pays for the photo screen.
    const early = await withFamilyContext(claims, (db) => checkSyllabusRequest(db, accountId, { childId, subject, draftId }));
    if (!early.ok) return refuse(early.reason);
    const screen = pages ? null : await screenPhoto(bytes, sniffImageType);
    if (screen && !screen.ok) return NextResponse.json({ error: screen.reason }, { status: 422 });

    // 1. The checks again and the AI platform's own (the family's daily cap taken), in one short transaction.
    const first = await withFamilyContext(claims, async (db): Promise<PreparedText | NextResponse> => {
      const checked = await checkSyllabusRequest(db, accountId, { childId, subject, draftId });
      if (!checked.ok) return refuse(checked.reason);
      const prompt = familySyllabusPrompt(await activePromptVersion(db, 'family.syllabus_extract'));
      const ask = { classLevel: checked.child.classLevel, subject, ...(pages ? { pages } : {}) };
      const account = await accountSummary(db, accountId);
      const prepared = await prepareText(
        db,
        { accountId, childFirstNames: checked.children.map((c) => c.firstName), parentEmail: account?.email ?? '', day: indiaDate() },
        'family.syllabus_extract',
        {
          system: prompt.system(ask),
          messages: [{ role: 'user', content: prompt.user(ask), ...(screen && screen.ok ? { images: [{ mediaType: screen.mediaType, base64: b64 }] } : {}) }],
          responseFormat: 'json',
          maxTokens: 4000,
        }
      );
      if (!prepared.ok) return NextResponse.json({ error: `ai_${prepared.reason}` }, { status: 503 });
      return prepared.text;
    });
    if (first instanceof NextResponse) return first;

    // 2. The provider reads the photo, with no database connection held.
    const sent = await first.send();

    // 3. The metering and the draft, in a second short transaction.
    return await withFamilyContext(claims, async (db) => {
      await sent.record(db);
      if (!sent.result.ok) return NextResponse.json({ error: 'ai_failed' }, { status: 503 });
      // A PDF keeps only the titles printed on their page; a photo's titles are a draft the parent checks line by line.
      const extracted = pages ? extractedCatalog(sent.result.text, pages, { board: 'FAMILY', classLevel: 1, subject }) : null;
      const chapters = pages ? (extracted ? draftFromCatalogLines(extracted.lines) : null) : draftFromReply(sent.result.text);
      if (chapters === null) return NextResponse.json({ error: 'ai_failed' }, { status: 503 });
      if (chapters.length === 0) return NextResponse.json({ error: 'nothing_found' }, { status: 422 });
      const kept = await keepDraft(db, accountId, { childId, subject, source: pages ? 'pdf' : 'photos', syllabusId: draftId, chapters });
      if (kept === 'not_found' || kept === 'too_many_photos') return refuse(kept);
      return NextResponse.json({ syllabus: kept });
    });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
    throw err;
  }
}
