import { NextRequest, NextResponse } from 'next/server';
import { courseCatalog } from '@/lib/family/tech/catalog';
import { saveLab } from '@/lib/family/tech/progress';
import { techError, withTech } from '@/lib/family/tech/request';

export const dynamic = 'force-dynamic';

const LAB_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withTech(req, async ({ db, accountId, child }) => {
    if (!LAB_ID.test(params.id)) return techError('not_found', 404);
    const known = courseCatalog().labs.some((lab) => lab.id === params.id);
    if (!known) return techError('not_found', 404);
    const saved = await saveLab(db, accountId, child.childId, params.id);
    return NextResponse.json({ ok: true, saved }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
