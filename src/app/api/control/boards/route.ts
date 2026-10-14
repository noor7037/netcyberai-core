import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { addBoard, addPreset, controlBoards } from '@/lib/exams/boards';

// Control → Boards & grading (docs/27 row 9a, C213). NetCyberAI staff only, as the platform role.
//   GET   every board, every preset (the replaced ones too) and how many schools record each board
//   POST  { action: 'board', boardId, name }  a new board
//   POST  { action: 'preset', boardId, level, sourceTitle, sourceUrl, sourceReadOn, bands, passMark, components,
//           coScholastic, notes, replacesPresetId | null }  a new preset, or one that replaces a preset of the board
// A preset is never changed: a new one replaces it. Each is audited with who and when.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => controlBoards(db));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ boards: run.value }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null || Array.isArray(b) || (b.action !== 'board' && b.action !== 'preset')) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const by = { userId: guard.claims.sub };
  if (b.action === 'board') {
    const run = await asLiveStaff(guard.claims, (db) => addBoard(db, by, { boardId: b.boardId, name: b.name }));
    if ('refused' in run) return run.refused;
    const r = run.value;
    if (r.ok) return NextResponse.json({ ok: true, boardId: r.boardId }, { status: 201 });
    return NextResponse.json({ error: 'the board was not added', code: r.reason }, { status: r.reason === 'id_taken' || r.reason === 'name_taken' ? 409 : 400 });
  }
  const run = await asLiveStaff(guard.claims, (db) => addPreset(db, by, b));
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json({ ok: true, presetId: r.presetId }, { status: 201 });
  return NextResponse.json({ error: 'the preset was not added', code: r.reason, ...(r.at === undefined ? {} : { at: r.at }) }, { status: r.reason === 'replaced_already' ? 409 : 400 });
}
