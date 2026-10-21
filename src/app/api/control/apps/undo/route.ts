import { NextRequest } from 'next/server';
import { parseReason, undoChange } from '@/lib/control/apps';
import { runChange } from '../change';

// Undo one earlier change on this screen: restores the state it recorded as "before", in one step. Audited as
// app_change.undo; a change is undone once.
export function POST(req: NextRequest) {
  return runChange(req, async (db, actor, body) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const id = typeof b.auditId === 'string' || typeof b.auditId === 'number' ? String(b.auditId) : '';
    return undoChange(db, actor, id, parseReason(b.reason));
  });
}
