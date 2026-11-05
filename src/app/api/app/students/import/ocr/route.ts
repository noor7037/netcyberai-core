import { NextRequest, NextResponse } from 'next/server';
import { canWriteMasterData, requireAppSession } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { prepareRegisterRead, registerPages, sendRegisterRead, REGISTER_MAX_BYTES, REGISTER_MAX_PAGES } from '@/lib/students/register-read';

// POST /api/app/students/import/ocr (W21-M5): a photographed page of the school's paper admission register (or a PDF
// scan), read into rows for the import's review screen. The office only (the import's own roles). Nothing is written to
// students: the office corrects the rows and imports them through POST /api/app/students/import.
//
// multipart: `page` (1–3 files: JPEG, PNG or a PDF scan). 200 { rows, floor }; 400 { error } for a file that is not a
// page; 403 forbidden; 409 { error: 'read_only' }; 429 { error: 'daily_limit' }; 503 { error: <the platform's
// refusal> } when the reader is not set up; 502 { error: 'failed' | 'not_json' } when the reading did not come back.

// The reader's chain may take up to its callMs (90 s, src/lib/ai/platform.ts) while the office waits.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  const { claims } = guard;
  if (!canWriteMasterData(claims.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > REGISTER_MAX_BYTES + 64_000) return NextResponse.json({ error: 'too_large' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const parts = (form?.getAll('page') ?? []).filter((p): p is File => typeof p !== 'string');
  if (parts.length === 0) return NextResponse.json({ error: 'no_file' }, { status: 400 });
  if (parts.length > REGISTER_MAX_PAGES) return NextResponse.json({ error: 'too_many' }, { status: 400 });
  const files = await Promise.all(parts.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()) })));
  const pages = registerPages(files);
  if (!pages.ok) return NextResponse.json({ error: pages.reason }, { status: 400 });

  const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
  try {
    const asked = await withTenantContext(claims, (db) => prepareRegisterRead(db, actor, pages.images));
    if (!asked.ok) {
      const status = asked.reason === 'read_only' ? 409 : asked.reason === 'daily_limit' ? 429 : 503;
      return NextResponse.json({ error: asked.reason }, { status });
    }
    const answer = await sendRegisterRead(asked.text, (save) => withTenantContext(claims, save), actor, pages.images.length);
    if (!answer.ok) return NextResponse.json({ error: answer.reason }, { status: 502 });
    return NextResponse.json({ rows: answer.rows, floor: answer.floor, pages: pages.images.length });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
