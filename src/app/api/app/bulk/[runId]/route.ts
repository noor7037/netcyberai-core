import { NextRequest, NextResponse } from 'next/server';
import { getBulkRun } from '@/lib/frameworks/bulk-engine';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError } from '@/lib/frameworks/route';

// A bulk run's progress and result (C112). RLS shows a run to the person
// who started it and to the principal and school admin.
export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  if (!isUuid(params.runId)) return jsonError(404, 'run not found');
  return appRoute(req, async ({ claims, db }) => {
    const run = await getBulkRun(db, claims.schoolId, params.runId);
    return run ? NextResponse.json({ run }) : jsonError(404, 'run not found');
  });
}
