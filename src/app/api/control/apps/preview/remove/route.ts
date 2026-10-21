import { NextRequest } from 'next/server';
import { parseWithReason, removePreview } from '@/lib/control/apps';
import { runChange } from '../../change';

// Take an account off the staff-preview list. Audited as preview_account.remove.
export function POST(req: NextRequest) {
  return runChange(req, async (db, actor, body) => {
    const input = parseWithReason(body, 'accountId');
    if (!input.ok) return input;
    return removePreview(db, actor, input);
  });
}
