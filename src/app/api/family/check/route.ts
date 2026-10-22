import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { DAY_MS, openItem, type ItemSecret } from '@/lib/family/items';
import { recordAnswer } from '@/lib/family/learning';
import { ANSWER_KEY, answerDay, offlineItemKey, packDays } from '@/lib/family/pack';
import { dayLabel, dayPlan } from '@/lib/family/plan';
import { indiaDate } from '@/lib/time/india';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

// A check or practice item (M1-5, C251): POST { token, hint: true } gives the hint first; POST { token, choice } checks
// the answer on the server (the phone never holds the key), records it (progress moves only on checked answers, M1-6),
// and says why, or what that wrong option shows.
//
// Offline chapter packs (M2-9, C283): a pack's items are sealed for the pack's life, so this route accepts tokens up to
// that life. An answer made offline is sent later with { key, answeredOn }: it counts on the day it was made when that
// day is real, not in the future and within the token's life (else today), so revisits and that day's plan move as on
// that day; and it is recorded once per key, however often the phone sends it. A queued answer may belong to another
// child of this account (the phone was switched since): the token says whose it is, and only the account's own children
// are tried.
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const key = typeof body.key === 'string' ? body.key : null;
  if (body.key !== undefined && (key === null || !ANSWER_KEY.test(key))) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const accountId = g.session.accountId;
    const children = await listChildren(db, accountId);
    const active = activeChild(children, chosen);
    const maxLife = (await packDays(db)) * DAY_MS;
    let child = active;
    let item: ItemSecret | null = active ? openItem(body.token, { accountId, childId: active.childId }, Date.now(), maxLife) : null;
    if (!item && key) {
      for (const c of children) {
        item = openItem(body.token, { accountId, childId: c.childId }, Date.now(), maxLife);
        if (item) {
          child = c;
          break;
        }
      }
    }
    if (!item || !child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (body.hint === true) return NextResponse.json({ hint: item.h });
    const choice = Number(body.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= item.w.length) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const today = indiaDate();
    const day = key ? answerDay(body.answeredOn, item, today) : today;
    const itemKey = key ? offlineItemKey(item, key) : undefined;
    if (itemKey) {
      // One answer per key: the second send of the same answer waits for the first, then finds it.
      await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`ncf-answer:${child.childId}:${key}`]);
      const seen = (await db.query(`select correct from family.attempts where account_id = $1 and child_id = $2 and item_key = $3 limit 1`, [accountId, child.childId, itemKey])).rows[0];
      if (seen) {
        const correct = seen.correct === true;
        return NextResponse.json({ correct, explanation: correct ? item.y : item.w[choice] || item.y, answer: correct ? choice : null, revisitOn: null, revisitDay: null, day, duplicate: true });
      }
    }
    // Recorded as checked: the only way progress moves (M1-6).
    const { correct, revisitOn } = await recordAnswer(db, { accountId, childId: child.childId, item, choice, hintUsed: body.hintUsed === true, day, itemKey });
    // An answer counted on an earlier day: that day's plan, if one was made, is marked from its answers again.
    if (day !== today) {
      const planned = (await db.query(`select 1 from family.plan_days where account_id = $1 and child_id = $2 and day = $3`, [accountId, child.childId, day])).rows.length > 0;
      if (planned) await dayPlan(db, accountId, child, day, child.language === 'hi' ? 'hi' : 'en');
    }
    // A wrong answer also says when the topic comes back (M2-2), so the child knows it is not the end of it.
    const revisitDay = revisitOn ? dayLabel(revisitOn, child.language) : null;
    return NextResponse.json({ correct, explanation: correct ? item.y : item.w[choice] || item.y, answer: correct ? choice : null, revisitOn, revisitDay, ...(key ? { day } : {}) });
  });
}
