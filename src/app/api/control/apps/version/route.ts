import { NextRequest } from 'next/server';
import { parseMinShell, setMinShell } from '@/lib/control/apps';
import { runChange } from '../change';

// The oldest app shell version still accepted. Audited as app_version.set.
export function POST(req: NextRequest) {
  return runChange(req, async (db, actor, body) => {
    const input = parseMinShell(body);
    if (!input.ok) return input;
    return setMinShell(db, actor, input);
  });
}
