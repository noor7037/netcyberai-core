import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { addFamilyBoard, listFamilyBoardsForControl, renameFamilyBoard, type FamilyBoardProblem } from '@/lib/content/family-boards';

// Control → Boards, the family app's boards (C230-AP): content.boards. NetCyberAI staff only, as the platform role.
//   GET   every family board, with how many syllabus versions it has
//   POST  { action: 'add', boardId, nameEn, nameHi }     a new board
//   POST  { action: 'rename', boardId, nameEn, nameHi }  its names corrected (the id never changes)
// Each change is audited with who and when.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => listFamilyBoardsForControl(db));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ boards: run.value }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null || Array.isArray(b) || (b.action !== 'add' && b.action !== 'rename')) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const by = { userId: guard.claims.sub };
  const fields = { boardId: b.boardId, nameEn: b.nameEn, nameHi: b.nameHi };
  const run = await asLiveStaff(guard.claims, async (db): Promise<{ ok: true } | { ok: false; reason: FamilyBoardProblem }> => (b.action === 'add' ? addFamilyBoard(db, by, fields) : renameFamilyBoard(db, by, fields)));
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json({ ok: true }, { status: b.action === 'add' ? 201 : 200 });
  return NextResponse.json({ error: 'not saved', code: r.reason }, { status: r.reason === 'id_taken' ? 409 : r.reason === 'not_found' ? 404 : 400 });
}
