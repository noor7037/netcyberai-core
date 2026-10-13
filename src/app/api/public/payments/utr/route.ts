import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { reportUtr } from '@/lib/payments/upi';
import { tellPaymentInitiated } from '@/lib/fees/whatsapp';
import { notifyNewReport } from '@/lib/payments/upi-alerts';
import { indiaDate } from '@/lib/time/india';

// POST { token, utr }: a parent says they paid by UPI and gives the UTR (docs/24 §3.3 step 5, C174). No account: the
// link's token is what lets them say it. It is recorded as a claim. Nothing is credited and no receipt is made here:
// the school verifies it in its own bank first. There is no screenshot or file field, here or anywhere.
export const dynamic = 'force-dynamic';
const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.token !== 'string' || typeof body?.utr !== 'string' || body.utr.length > 40) return NextResponse.json({ error: 'not sent properly', code: 'utr' }, { status: 400 });
  const result = await platform((db) => reportUtr(db, body.token, body.utr, async (schoolId, reportId) => {
      await notifyNewReport(db, jobQueue, schoolId, reportId, indiaDate());
      // The parent is told on WhatsApp too, in the same words as the page: noted, the school will verify (C188).
      await tellPaymentInitiated(db, reportId);
    })
  );
  if (result.ok) return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ error: 'the UTR was not recorded', code: result.reason }, { status: result.reason === 'no_such_link' ? 404 : result.reason === 'utr' ? 400 : 409 });
}
