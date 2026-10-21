import { NextRequest } from 'next/server';
import { endBanner, parseWithReason } from '@/lib/control/apps';
import { runChange } from '../../change';

// End a banner now. Audited as app_banner.end.
export function POST(req: NextRequest) {
  return runChange(req, async (db, actor, body) => {
    const input = parseWithReason(body, 'bannerId');
    if (!input.ok) return input;
    return endBanner(db, actor, input);
  });
}
