import { NextRequest } from 'next/server';
import { parseFlagInput, setFlag } from '@/lib/control/apps';
import { runChange } from '../change';

// Set one module's flag (or the whole app's kill switch, module "*"): on or off, for whom, until when, with the
// message shown in its place and the reason for the change. Audited as app_flag.set.
export function POST(req: NextRequest) {
  return runChange(req, async (db, actor, body) => {
    const input = parseFlagInput(body);
    if (!input.ok) return input;
    return setFlag(db, actor, input.value);
  });
}
