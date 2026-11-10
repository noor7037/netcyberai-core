import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { LEARN_TYPES, allowedLearnFile, learnCacheControl, sameTag } from '@/lib/family/learn-files';
import { requireFamily } from '@/lib/family/request';

// The chapter reader and its labs (reader/, labs/), served to a signed-in family only (founder, 9 Nov 2026). The two
// folders are plain files that load each other by relative paths (the reader frames ../labs/index.html), so they are
// served side by side under /family/learn/. Only the files a child's page needs: the pages, their scripts and styles,
// the chapter and lab data, and the images; never the checker scripts, the contracts or the smoke page.
// The middleware already sends a request without a family session to sign-in; this route checks again itself.

const ROOT = process.cwd();
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const guard = await requireFamily(req);
  if (guard.error) return guard.error;
  const rel = allowedLearnFile(params.path ?? []);
  if (!rel) return new NextResponse('Not found', { status: 404 });
  const type = LEARN_TYPES[path.extname(rel).toLowerCase()];
  if (!type) return new NextResponse('Not found', { status: 404 });
  try {
    // The real file must still be inside reader/ or labs/ (no link out of them).
    const file = await realpath(path.join(ROOT, rel));
    const top = rel.startsWith('reader/') ? 'reader' : 'labs';
    if (!file.startsWith(path.join(await realpath(path.join(ROOT, top)), path.sep))) return new NextResponse('Not found', { status: 404 });
    const body = await readFile(file);
    // A tag of the file's own bytes (W24): a browser asks again on every load and gets "not changed" (no body) while the
    // file is the same, so a new reader or lab reaches every phone at once, with no version number to remember.
    const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
    const headers = {
      'Content-Type': type,
      ETag: etag,
      // Pictures keep a week (their names change with their content); every page, script, style and data file is checked.
      'Cache-Control': learnCacheControl(rel),
      'X-Robots-Tag': 'noindex',
    };
    if (sameTag(req.headers.get('if-none-match'), etag)) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(body, { headers });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
