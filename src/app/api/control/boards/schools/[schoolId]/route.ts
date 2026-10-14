import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { schoolBoard, setSchoolBoard } from '@/lib/exams/boards';
import { isUuid } from '@/lib/frameworks/custom-fields';

// A school's board, from Control's school page (docs/27 row 9a, C213). NetCyberAI staff only. The school is the one
// in the address.
//   GET   the board the school records, who set it and when, and the boards to choose from
//   POST  { boardId | null }  record it (audited)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const run = await asLiveStaff(guard.claims, async (db) => ({
    board: await schoolBoard(db, params.schoolId),
    boards: (await db.query(`select board_id, name from boards order by lower(name), board_id`)).rows.map((r) => ({ boardId: r.board_id as string, name: r.name as string })),
  }));
  if ('refused' in run) return run.refused;
  if (!run.value.board) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(run.value, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const boardId = b?.boardId === null ? null : typeof b?.boardId === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(b.boardId) ? (b.boardId as string) : undefined;
  if (!isUuid(params.schoolId) || boardId === undefined) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const run = await asLiveStaff(guard.claims, (db) => setSchoolBoard(db, { userId: guard.claims.sub, role: 'super_admin' }, params.schoolId, boardId));
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json({ ok: true, changed: r.changed });
  return NextResponse.json({ error: 'the board was not recorded', code: r.reason }, { status: r.reason === 'not_found' ? 404 : 400 });
}
