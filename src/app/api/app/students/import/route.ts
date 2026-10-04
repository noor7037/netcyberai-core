import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { runCsvImport } from '@/lib/import/run-import';
import { isForeignKeyViolation, isUniqueViolation } from '@/lib/db/pg-errors';

export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file (multipart form field) is required' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // ?preview=1: check every row and suggest siblings, write nothing (C116).
    const preview = req.nextUrl.searchParams.get('preview') === '1';
    const result = await runCsvImport(guard.claims, buffer, file.name, { preview });
    return NextResponse.json(result, { status: result.alreadyImported || preview ? 200 : 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost a race against an identical concurrent upload -- the other
      // request's csv_imports row is now the source of truth; the
      // client can safely re-request to fetch it (idempotent by design).
      return NextResponse.json(
        { error: 'this exact file is already being imported for this school -- retry to fetch the result' },
        { status: 409 }
      );
    }
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'a resolved reference did not belong to this school' }, { status: 400 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    if (err instanceof Error && err.message.startsWith('no data rows found')) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
