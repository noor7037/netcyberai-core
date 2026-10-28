import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { loadAiOverview, setSpendAlert, undoChange } from '@/lib/ai/control';
import { AI_UPKEEP_JOB, LEDGER_KEEP_DAYS, aiUpkeepHandler } from '@/lib/ai/gateway/upkeep';
import { renderEmail } from '@/lib/email/templates';
import type { ClaimedJob, JobQueue, JobSpec } from '@/lib/jobs/types';

// W5-7 (C394; C230-AQ named both gaps): the AI gateway's hourly upkeep on the real migrations (PGlite): the daily spend
// alert to the founders, once a day, from the known cost only; and the ledger kept for 90 days, the tables staying
// append-only for every session role. Made-up people only.

const FOUNDER = 'f5700000-0000-4000-8000-0000000000f1';
const NOW = new Date('2026-10-28T08:00:00Z'); // 13:30 in India
const TODAY = '2026-10-28';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asRole = <T>(role: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });
const platform = <T>(fn: (tx: never) => Promise<T>) => asRole('nca_super', (tx) => fn(tx as never));
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const refused = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return 'allowed';
  } catch (e) {
    return String((e as Error).message);
  }
};
const by = { userId: FOUNDER };
const enqueued: JobSpec[] = [];
const queue = { enqueue: async (_db: unknown, spec: JobSpec) => (enqueued.push(spec), { id: String(enqueued.length), created: true }) } as unknown as JobQueue;
const job = { id: '1', type: AI_UPKEEP_JOB, payload: { at: '2026-10-28T08' }, idempotencyKey: 'ai.upkeep:2026-10-28T08', schoolId: null, attempts: 1, maxAttempts: 3 } as unknown as ClaimedJob;
const run = () => aiUpkeepHandler({ platform: platform as never, queue, now: () => NOW })(job);
const cost = (day: string, usd: number | null, outcome = 'ok') =>
  q(`insert into control.ai_usage_ledger (day, profile_id, provider_id, model, route_position, outcome, cost_usd) values ($1, 'family.resolver', 'anthropic', 'm', 0, $2, $3)`, [day, outcome, usd]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder')`, [FOUNDER]);
}, 90_000);
afterAll(async () => db?.stop());
beforeEach(async () => {
  enqueued.length = 0;
  await db.pg.exec(`delete from control.ai_usage_ledger; delete from control.ai_reply_checks; delete from control.settings where key = 'ai.spend_alert_usd_per_day'`);
});

describe('the daily spend alert', () => {
  it('is off until Control sets it: no email, whatever the day costs', async () => {
    await cost(TODAY, 500);
    await run();
    expect(enqueued).toEqual([]);
  });

  it('at or over the amount: one email to the founders, keyed by the day; under it, none; unpriced answers counted apart', async () => {
    expect(await platform((tx) => setSpendAlert(tx, by, 1))).toEqual({ ok: true });
    await cost(TODAY, 0.6);
    await cost('2026-10-27', 5); // yesterday's cost is not today's
    await cost(TODAY, null);
    await cost(TODAY, null, 'upstream_timeout'); // a failed attempt with no price is not an unpriced answer
    await run();
    expect(enqueued).toEqual([]);
    await cost(TODAY, 0.4);
    await run();
    await run();
    expect(enqueued).toHaveLength(2);
    for (const e of enqueued) {
      expect(e).toEqual({
        type: 'email.send',
        idempotencyKey: `email.send:ai_spend_alert:${TODAY}`,
        payload: { to: 'founders', template: 'ai_spend_alert', data: { day: TODAY, spentUsd: '1.00', limitUsd: '1.00', unpriced: '1', url: 'https://netcyberai.com/control/ai' } },
        maxAttempts: 4,
      });
    }
    const mail = renderEmail('ai_spend_alert', enqueued[0].payload.data as Record<string, unknown>, {});
    expect(mail.subject).toBe('AI spend alert: US$1.00 today');
    expect(mail.text).toContain('1 answers today had no price set');
    // Control → AI shows the alert and the day's known cost (its own today, so only the shape is fixed here).
    const overview = await platform((tx) => loadAiOverview(tx));
    expect(overview.spendAlert).toBe(1);
    expect(overview.spentToday).toEqual({ usd: expect.any(Number), unpriced: expect.any(Number) });
  });

  it('Control: 0.01 to 10,000 US$ or off, audited, and one step undone', async () => {
    for (const bad of [0, -1, 10_001, Number.NaN]) expect(await platform((tx) => setSpendAlert(tx, by, bad))).toEqual({ ok: false, code: 'spend' });
    expect(await platform((tx) => setSpendAlert(tx, by, 25.5))).toEqual({ ok: true });
    expect(await platform((tx) => setSpendAlert(tx, by, null))).toEqual({ ok: true });
    const [last] = await q(`select audit_id, before_state, after_state from audit_log where event_action = 'ai.spend_alert_changed' order by audit_id desc limit 1`);
    expect([last.before_state.value, last.after_state.value]).toEqual([25.5, null]);
    expect(await platform((tx) => undoChange(tx, by, String(last.audit_id)))).toEqual({ ok: true });
    expect(await q(`select value from control.settings where key = 'ai.spend_alert_usd_per_day'`)).toEqual([{ value: 25.5 }]);
  });
});

describe('the ledger kept 90 days', () => {
  it('rows older than 90 days go, from the ledger and the reply checks; the 90th day stays', async () => {
    const old = '2026-07-29'; // 91 days before
    const kept = '2026-07-30'; // 90 days before
    await cost(old, 1);
    await cost(kept, 1);
    await cost(TODAY, 1);
    await q(`insert into control.ai_reply_checks (day, reply_profile, checks) values ($1, null, 3), ($2, null, 3)`, [old, TODAY]);
    await run();
    expect((await q(`select day::text as day from control.ai_usage_ledger order by day`)).map((r: { day: string }) => r.day)).toEqual([kept, TODAY]);
    expect((await q(`select day::text as day from control.ai_reply_checks`)).map((r: { day: string }) => r.day)).toEqual([TODAY]);
    expect(LEDGER_KEEP_DAYS).toBe(90);
  });

  it('only through the function, the platform role only, never fewer than 90 days; the tables stay append-only', async () => {
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`select control.ai_ledger_retention($1::date, 30)`, [TODAY])))).toMatch(/keep at least 90 days/);
    for (const role of ['family_app', 'app_user']) expect(await refused(() => asRole(role, (tx) => tx.query(`select control.ai_ledger_retention($1::date, 90)`, [TODAY])))).toMatch(/permission denied/);
    for (const role of ['family_app', 'app_user', 'nca_super']) {
      expect(await refused(() => asRole(role, (tx) => tx.query(`delete from control.ai_usage_ledger`)))).toMatch(/permission denied/);
      expect(await refused(() => asRole(role, (tx) => tx.query(`delete from control.ai_reply_checks`)))).toMatch(/permission denied/);
    }
    const fns = await q(
      `select p.proname, r.rolname from pg_proc p cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
        where p.proname in ('ai_ledger_retention', 'ai_upkeep_enqueue', 'record_reply_checks') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')`
    );
    expect(fns).toEqual([]);
  });

  it('the hourly job is queued once an hour, and only once the runner lists it', async () => {
    await q(`delete from jobs where type = 'ai.upkeep'`);
    await q(`update platform_settings set value = '[]'::jsonb where key = 'jobs.handlers'`);
    await q(`select public.ai_upkeep_enqueue()`);
    expect(await q(`select 1 from jobs where type = 'ai.upkeep'`)).toEqual([]);
    await q(`update platform_settings set value = '["ai.upkeep"]'::jsonb where key = 'jobs.handlers'`);
    await q(`select public.ai_upkeep_enqueue()`);
    await q(`select public.ai_upkeep_enqueue()`);
    expect(await q(`select 1 from jobs where type = 'ai.upkeep'`)).toHaveLength(1);
  });
});
