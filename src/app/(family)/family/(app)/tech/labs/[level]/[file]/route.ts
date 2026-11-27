import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { withTech } from '@/lib/family/tech/request';

export const dynamic = 'force-dynamic';

const LEVEL = /^L[1-3]$/;
const FILE = /^[a-z0-9][a-z0-9-]{0,40}\.html$/;

// A lab page, for a signed-in family only. The files are the tested prototypes, served unchanged.
export async function GET(req: NextRequest, { params }: { params: { level: string; file: string } }) {
  if (!LEVEL.test(params.level) || !FILE.test(params.file)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const file = path.join(process.cwd(), 'content/tech/labs', params.level, params.file);
  if (!file.startsWith(path.join(process.cwd(), 'content/tech/labs'))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return withTech(req, async () => {
    if (!fs.existsSync(file)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const html = fs.readFileSync(file, 'utf8');
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "frame-ancestors 'self'",
        'Referrer-Policy': 'same-origin',
      },
    });
  });
}
