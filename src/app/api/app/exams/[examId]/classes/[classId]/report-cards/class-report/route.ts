import { NextRequest, NextResponse } from 'next/server';
import { blocksHtml, classReport, classReportBlocks } from '@/lib/exams/report-card-files';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { t } from '@/lib/i18n';

// "Class report" (W14-F): one page with the class summary of the publication in force, from results.ts: each subject's
// average, highest and lowest percent and how many passed, then every child's total, percent and grade in roll order.
// In the reader's language (?lang=hi, else English), to read or print. The office and the class teacher, only while
// the result is published.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  const lang = req.nextUrl.searchParams.get('lang') === 'hi' ? 'hi' : 'en';
  return appRoute(req, async ({ claims, db }) => {
    const r = await classReport(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (r === 'not_allowed') return ruleError(403, 'not_allowed');
    if (r === 'not_found') return ruleError(404, 'not_found');
    if (r === 'not_published') return NextResponse.json({ error: 'not_published', code: 'not_published' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    const title = `${t(lang, 'rcf.classReport')} · ${r.summary.exam} · ${r.summary.className}`;
    return new NextResponse(blocksHtml(classReportBlocks(r.summary, r.school, lang), lang, title), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  });
}
