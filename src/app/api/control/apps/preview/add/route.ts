import { NextRequest } from 'next/server';
import { addPreview, parseWithReason } from '@/lib/control/apps';
import { runChange } from '../../change';

// Put a family account on the staff-preview list (C230-V), from Control → Family → People. Audited as
// preview_account.add; Undo takes it off.
export function POST(req: NextRequest) {
  return runChange(req, async (db, actor, body) => {
    const input = parseWithReason(body, 'accountId');
    if (!input.ok) return input;
    return addPreview(db, actor, input);
  });
}
