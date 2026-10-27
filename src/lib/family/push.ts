import { listChildren } from './children';
import { familyClaims, withFamilyContext, type FamilyClaims } from './db';
import { homePlan, plusOpen } from './home-plan';
import { familyModuleOn } from './flags';
import { activeLinks, NEWS_KINDS, notifyOff, readSchoolNewsFor, schoolTodayFor, type NotifyKind } from './school';
import { pushEndpointAllowed, sendWebPush, subscriptionKeysOk, type PushOutcome, type PushSender } from './web-push';

// Telling a family, on its browsers, of what is new (M3-8b, C339; 07 M3-8: new homework, a sent notice, a published
// result, tonight's plan; the supervisor's answer 1 in C230-AD).
//   - The parent turns notifications on in the parent area; the browser's subscription is the account's own row.
//   - Every ten minutes one job (family.push_scan) goes through the accounts with a browser to tell. For each, inside
//     that account's own family session: what is new from each connected school since the last push, read as the
//     guardian by the school's own rules (school.ts, readSchoolNewsFor); and, once an evening from 18:30 in India,
//     tonight's practice or plan when there is one. One message per kind, to each of the account's browsers.
//   - A kind the parent turned off is never pushed. The first scan only sets the marks: no pile of old news.
//   - What a message says is fixed: the kind and the page it opens (public/sw.js words it), never a name, marks, fees
//     or any personal detail. No database connection is held while a push service answers.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
type Platform = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export const MAX_SUBSCRIPTIONS = 10;
export const DROP_AFTER_FAILURES = 5;
const TONIGHT_FROM_MINUTES = 18 * 60 + 30; // 18:30 in India

// The page each kind opens: the school's part is in the parent area (behind the PIN); tonight's is the child's home.
export const PUSH_PAGE: Record<NotifyKind, string> = { homework: '/family/parent', notices: '/family/parent', results: '/family/parent', tonight: '/family' };

export type SubscribeResult = { ok: true } | { ok: false; reason: 'bad_subscription' };

// A browser the parent turned notifications on in: only a known push service's address, with well-formed keys.
export async function saveSubscription(db: Db, accountId: string, raw: unknown, lang: 'en' | 'hi'): Promise<SubscribeResult> {
  const sub = raw && typeof raw === 'object' ? (raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }) : {};
  if (!pushEndpointAllowed(sub.endpoint) || !subscriptionKeysOk(sub.keys?.p256dh, sub.keys?.auth)) return { ok: false, reason: 'bad_subscription' };
  // The same browser again (a new key after the browser renewed it): the row is brought up to date.
  await db.query(
    `insert into family.push_subscriptions (account_id, endpoint, p256dh, auth, lang) values ($1, $2, $3, $4, $5)
     on conflict (account_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, failures = 0`,
    [accountId, sub.endpoint, sub.keys!.p256dh, sub.keys!.auth, lang]
  );
  await db.query(
    `delete from family.push_subscriptions where account_id = $1 and sub_id not in (select sub_id from family.push_subscriptions where account_id = $1 order by created_at desc limit $2)`,
    [accountId, MAX_SUBSCRIPTIONS]
  );
  return { ok: true };
}

export async function removeSubscription(db: Db, accountId: string, endpoint: unknown): Promise<boolean> {
  if (typeof endpoint !== 'string') return false;
  return ((await db.query(`delete from family.push_subscriptions where account_id = $1 and endpoint = $2`, [accountId, endpoint])).rowCount ?? 0) > 0;
}

export async function hasSubscription(db: Db, accountId: string): Promise<boolean> {
  return (await db.query(`select 1 from family.push_subscriptions where account_id = $1 limit 1`, [accountId])).rows.length > 0;
}

// Minutes since midnight in India.
const indiaMinutes = (at: Date) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at).split(':').map(Number);
  return h * 60 + m;
};
const indiaDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(at);

type Mark = { scope: string; kind: NotifyKind; upto: string };
export type AccountPush = { kinds: NotifyKind[]; sent: number; gone: number; failed: number };

// One account's turn: what to tell, the pushes, then the marks and the browsers' health. Returns what was pushed.
export async function pushForAccount(claims: FamilyClaims, at: Date, send: PushSender = sendWebPush): Promise<AccountPush> {
  const accountId = claims.accountId;
  const scanAt = at.toISOString();
  const today = indiaDay(at);
  // 1. In the account's own session: its browsers, choices, links, marks, and whether tonight has anything.
  const state = await withFamilyContext(claims, async (db) => {
    const subs = (await db.query(`select sub_id, endpoint, p256dh, auth, lang from family.push_subscriptions where account_id = $1`, [accountId])).rows as {
      sub_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      lang: string;
    }[];
    const off = await notifyOff(db, accountId);
    const links = await activeLinks(db, accountId);
    const marks = (await db.query(`select scope, kind, upto from family.push_sent where account_id = $1`, [accountId])).rows.map((r) => ({
      scope: String(r.scope),
      kind: r.kind as NotifyKind,
      upto: new Date(r.upto as string).toISOString(),
    })) as Mark[];
    let planTonight = false;
    if (!off.includes('tonight') && (await familyModuleOn(db, 'home_plan', accountId)) && (await plusOpen(db, accountId))) {
      for (const c of await listChildren(db, accountId)) if ((await homePlan(db, accountId, c, today, c.language))?.tonight) planTonight = true;
    }
    return { subs, off, links, marks, planTonight };
  });
  if (!state.subs.length) return { kinds: [], sent: 0, gone: 0, failed: 0 };
  const markOf = (scope: string, kind: NotifyKind) => state.marks.find((m) => m.scope === scope && m.kind === kind)?.upto ?? null;

  // 2. The school's news since the last push, as the guardian; a link never pushed for only gets its marks.
  const kinds = new Set<NotifyKind>();
  const newMarks: Mark[] = [];
  for (const l of state.links) {
    const since = Object.fromEntries(NEWS_KINDS.map((k) => [k, markOf(l.linkId, k)])) as Record<(typeof NEWS_KINDS)[number], string | null>;
    if (l.children.length && NEWS_KINDS.some((k) => since[k] !== null)) {
      const n = await readSchoolNewsFor(claims, l, Object.fromEntries(NEWS_KINDS.map((k) => [k, since[k] ?? scanAt])) as Record<(typeof NEWS_KINDS)[number], string>);
      for (const k of NEWS_KINDS) if (n && n[k] > 0 && since[k] !== null && !state.off.includes(k)) kinds.add(k);
    }
    for (const k of NEWS_KINDS) newMarks.push({ scope: l.linkId, kind: k, upto: scanAt });
  }
  // 3. Tonight, once an evening: the home plan's night, or what a matched child's class covered today.
  const tonightDone = (markOf('tonight', 'tonight') ?? '').slice(0, 10) === today;
  if (!state.off.includes('tonight') && !tonightDone && indiaMinutes(at) >= TONIGHT_FROM_MINUTES) {
    let tonight = state.planTonight;
    for (const l of state.links) for (const c of l.children) if (!tonight) tonight = ((await schoolTodayFor(claims, [l], c.childId))?.tonight.length ?? 0) > 0;
    if (tonight) {
      kinds.add('tonight');
      newMarks.push({ scope: 'tonight', kind: 'tonight', upto: `${today}T13:00:00.000Z` });
    }
  }

  // 4. The pushes, with no database connection held.
  const outcomes = new Map<string, PushOutcome[]>();
  for (const s of state.subs) {
    const lang = s.lang === 'hi' ? 'hi' : 'en';
    const got: PushOutcome[] = [];
    for (const k of kinds) got.push(await send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, { k, u: PUSH_PAGE[k], l: lang }));
    outcomes.set(s.sub_id, got);
  }

  // 5. The marks move on; a browser that ended it goes; failures are counted, and five in a row remove it.
  await withFamilyContext(claims, async (db) => {
    for (const m of newMarks) {
      await db.query(
        `insert into family.push_sent (account_id, scope, kind, upto) values ($1, $2, $3, $4) on conflict (account_id, scope, kind) do update set upto = greatest(family.push_sent.upto, excluded.upto)`,
        [accountId, m.scope, m.kind, m.upto]
      );
    }
    for (const [subId, got] of outcomes) {
      if (got.includes('gone')) await db.query(`delete from family.push_subscriptions where account_id = $1 and sub_id = $2`, [accountId, subId]);
      else if (got.includes('failed')) {
        await db.query(`update family.push_subscriptions set failures = failures + 1 where account_id = $1 and sub_id = $2`, [accountId, subId]);
        await db.query(`delete from family.push_subscriptions where account_id = $1 and sub_id = $2 and failures >= $3`, [accountId, subId, DROP_AFTER_FAILURES]);
      } else if (got.length) await db.query(`update family.push_subscriptions set failures = 0, last_ok_at = now() where account_id = $1 and sub_id = $2`, [accountId, subId]);
    }
  });
  const all = [...outcomes.values()].flat();
  return { kinds: [...kinds], sent: all.filter((o) => o === 'sent').length, gone: all.filter((o) => o === 'gone').length, failed: all.filter((o) => o === 'failed').length };
}

export const PUSH_SCAN_JOB = 'family.push_scan';

// The list from this run's place: the next account each ten minutes.
export function scanOrder<T>(list: readonly T[], at: Date): T[] {
  const from = list.length ? Math.floor(at.getTime() / 600_000) % list.length : 0;
  return [...list.slice(from), ...list.slice(0, from)];
}

// A run stops taking new accounts after this long, well inside the runner's limit; the rest are told next time.
export const SCAN_BUDGET_MS = 200_000;

// The job: every account with a browser to tell, one after another. One account's trouble never stops the others. Each
// run starts at a different place in the list (by its ten minutes), so a run cut short by its time never leaves the same
// families out every time.
export function pushScanHandler({ platform, send = sendWebPush, now = () => new Date(), budgetMs = SCAN_BUDGET_MS }: { platform: Platform; send?: PushSender; now?: () => Date; budgetMs?: number }) {
  return async (): Promise<void> => {
    const at = now();
    const started = Date.now();
    const listed = await platform(async (db) => (await db.query(`select account_id, token_version from family.push_accounts()`)).rows as { account_id: string; token_version: number }[]);
    for (const a of scanOrder(listed, at)) {
      if (Date.now() - started > budgetMs) break;
      try {
        await pushForAccount(familyClaims({ accountId: a.account_id, tokenVersion: Number(a.token_version) }), at, send);
      } catch (err) {
        console.error('[push] an account was skipped', err instanceof Error ? err.name : 'error');
      }
    }
  };
}
