import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { removeSubscription, saveSubscription } from '@/lib/family/push';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// Notifications on this browser (M3-8b, C339): the parent turns them on (the browser's subscription is kept for the
// account) or off. Body: { action: 'subscribe', subscription: { endpoint, keys: { p256dh, auth } } } or
// { action: 'unsubscribe', endpoint }. Only a known push service's address is kept.
export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  if (body.action !== 'subscribe' && body.action !== 'unsubscribe') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const accountId = g.session.accountId;
  return familyRun(g.session, async (db) => {
    if (body.action === 'unsubscribe') {
      await removeSubscription(db, accountId, body.endpoint);
      return NextResponse.json({ ok: true });
    }
    const lang = (await accountSummary(db, accountId))?.uiLanguage ?? 'en';
    const r = await saveSubscription(db, accountId, body.subscription, lang);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.reason }, { status: 400 });
  });
}
