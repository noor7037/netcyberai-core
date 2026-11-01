import { NextRequest, NextResponse } from 'next/server';
import { reportCardBundle, type BundleFiles } from '@/lib/exams/report-card-files';
import { zip } from '@/lib/export/xlsx';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// "Get every report card" (W14-F): one zip of the class's report cards made as files for the publication in force, in
// roll order. The rows are read under the viewer's own row rules (the office and the class teacher); the files are then
// fetched from the store with the connection already given back. 409 while nothing is ready yet; 503 when the store
// does not answer.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  let found: BundleFiles | null = null;
  const res = await appRoute(req, async ({ claims, db }) => {
    const r = await reportCardBundle(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (r === 'not_allowed') return ruleError(403, 'not_allowed');
    if (r === 'not_found') return ruleError(404, 'not_found');
    if (r === 'not_published' || !r.files.length) return NextResponse.json({ error: 'not_ready', code: 'not_ready' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    found = r;
    return NextResponse.json({ found: true });
  });
  const bundle = found as BundleFiles | null;
  if (!bundle) return res;
  const files: { name: string; data: Uint8Array }[] = [];
  for (const f of bundle.files) {
    let data: Uint8Array | null = null;
    try {
      data = await supabaseFileStorage.get(f.key);
    } catch {
      data = null;
    }
    if (!data) return NextResponse.json({ error: 'unavailable', code: 'storage' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
    files.push({ name: f.name, data });
  }
  return new NextResponse(Buffer.from(zip(files)), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${bundle.name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
