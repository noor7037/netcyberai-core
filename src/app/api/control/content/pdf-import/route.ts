import { NextRequest, NextResponse } from 'next/server';
import { activePromptVersion, prepareText, type PreparedText } from '@/lib/ai/platform';
import { syllabusExtractPrompt } from '@/lib/ai/prompts/content.syllabus_extract';
import { writeAuditLog } from '@/lib/audit/log';
import { asLiveStaff } from '@/lib/control/billing-route';
import { importCatalog } from '@/lib/content/library';
import { catalogCsv, checkMeta, extractedCatalog, pdfPages, PDF_MAX_BYTES } from '@/lib/content/pdf-import';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';
import { indiaDate } from '@/lib/time/india';

// Control → Content → import a catalog from a board's PDF (M2-12, C286; docs/family-app/10 §4.2, 03 §9).
//   POST { pdf: <base64, at most 10 MB>, sourceUrl, board, classLevel, subject, academicYear }
// NetCyberAI staff with their authenticator, as for the CSV import. The PDF's text layer is read here (no OCR), sent page
// by page to the content.syllabus_extract profile, and only lines whose title is on their page are kept
// (src/lib/content/pdf-import.ts). They become one draft version through the CSV import's own path: in review, imported
// by this account, who can never approve it. The PDF is read in this request and dropped: never stored or logged.
// No database connection is held while the AI reads (F1-3): the checks and the AI platform's own in one short
// transaction, the call with none, the metering and the draft in a second.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Body = { pdf?: unknown; sourceUrl?: unknown; board?: unknown; classLevel?: unknown; subject?: unknown; academicYear?: unknown };
const refuse = (code: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error: code, code, ...extra }, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const claims = guard.claims;
  const b = (await req.json().catch(() => null)) as Body | null;
  if (typeof b !== 'object' || b === null || typeof b.pdf !== 'string') return refuse('not_sent', 400);
  const checked = checkMeta(b);
  if (!checked.ok) return refuse(checked.reason, 400);
  const meta = checked.meta;
  const b64 = b.pdf.replace(/^data:application\/pdf;base64,/, '');
  if (b64.length > Math.ceil((PDF_MAX_BYTES * 4) / 3) + 4) return refuse('too_big', 413);
  const read = pdfPages(new Uint8Array(Buffer.from(b64, 'base64')));
  if (!read.ok) return refuse(read.reason, 422);
  const pages = read.pages;
  const day = indiaDate();

  // 1. The board is one the library knows; the profile is switched on; the request is cleaned. One short transaction.
  const first = await asLiveStaff(claims, async (db): Promise<{ prepared: PreparedText; version: string } | NextResponse> => {
    const known = await db.query(`select 1 from content.boards where board_id = $1`, [meta.board]);
    if (known.rows.length === 0) return refuse('board_unknown', 422);
    const prompt = syllabusExtractPrompt(await activePromptVersion(db, 'content.syllabus_extract'));
    const ask = { board: meta.board, classLevel: meta.classLevel, subject: meta.subject, academicYear: meta.academicYear, pages };
    const prepared = await prepareText(db, { accountId: claims.sub, childFirstNames: [], day }, 'content.syllabus_extract', {
      system: prompt.system(ask),
      messages: [{ role: 'user', content: prompt.user(ask) }],
      responseFormat: 'json',
      maxTokens: 16000,
    });
    if (!prepared.ok) return refuse(`ai_${prepared.reason}`, 503);
    return { prepared: prepared.text, version: prompt.version };
  });
  if ('refused' in first) return first.refused;
  if (first.value instanceof NextResponse) return first.value;
  const { prepared, version } = first.value;

  // 2. The provider reads the pages, with no database connection held.
  const sent = await prepared.send();

  // 3. The metering, then the draft through the CSV import's path, in a second short transaction.
  const second = await asLiveStaff(claims, async (db) => {
    await sent.record(db);
    if (!sent.result.ok) return refuse('ai_failed', 503);
    const extracted = extractedCatalog(sent.result.text, pages, meta);
    if (!extracted) return refuse('ai_unreadable', 502);
    if (extracted.chapters === 0) return refuse('nothing_found', 422, { dropped: extracted.dropped });
    const done = await importCatalog(db, { userId: claims.sub }, catalogCsv(extracted.lines, meta, day), { preview: false, today: day });
    if (!done.committed || done.versions.length !== 1) return refuse('not_imported', 422, { problems: done.problems });
    const v = done.versions[0];
    await writeAuditLog(db, {
      schoolId: null,
      actorUserId: claims.sub,
      actorRole: 'super_admin',
      eventAction: 'content.syllabus.extracted',
      targetType: 'content_syllabus_version',
      targetId: v.versionId,
      afterState: { pages: pages.length, kept: extracted.lines.length, dropped: extracted.dropped.length, promptVersion: version },
    });
    return NextResponse.json({ version: v, dropped: extracted.dropped, pages: pages.length }, { status: 201, headers: NO_STORE });
  });
  if ('refused' in second) return second.refused;
  return second.value;
}
