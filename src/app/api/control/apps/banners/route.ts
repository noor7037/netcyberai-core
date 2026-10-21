import { NextRequest } from 'next/server';
import { addBanner, parseBannerInput } from '@/lib/control/apps';
import { runChange } from '../change';

// Put up a banner for an app, in English and Hindi, with a start and an end. Audited as app_banner.create.
export function POST(req: NextRequest) {
  return runChange(req, async (db, actor, body) => {
    const input = parseBannerInput(body);
    if (!input.ok) return input;
    return addBanner(db, actor, input);
  });
}
