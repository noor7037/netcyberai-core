import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { alertsOf, loadHealth } from '@/lib/control/health';

// M2-11 (C285): Control → Apps health. Failures alert only past the minimum of requests and the share; a family cap
// refusal, a failed key test and a nearly spent video quota alert; the loader reads as the platform role, counts only.

const T = { aiFailureShare: 0.2, aiMinRequests: 10, videoQuotaShare: 0.8 };
const p = (profileId: string, requestsToday: number, failuresToday: number, capRefusalsToday = 0) => ({ profileId, requestsToday, failuresToday, capRefusalsToday, requestsMonth: requestsToday, tokensMonth: 0 });

describe('alerts', () => {
  it('fail past the minimum and the share only', () => {
    expect(alertsOf({ profiles: [p('family.resolver', 9, 9)], failedKeys: [], video: { used: 0, limit: 90 } }, T)).toEqual([]);
    expect(alertsOf({ profiles: [p('family.resolver', 10, 2)], failedKeys: [], video: { used: 0, limit: 90 } }, T)).toEqual([{ kind: 'ai_failures', profileId: 'family.resolver', failures: 2, requests: 10 }]);
    expect(alertsOf({ profiles: [p('family.resolver', 10, 1)], failedKeys: [], video: { used: 0, limit: 90 } }, T)).toEqual([]);
  });
  it('a cap refusal, a failed key test and the video quota near its end', () => {
    expect(alertsOf({ profiles: [p('family.homework', 3, 0, 2)], failedKeys: ['youtube'], video: { used: 72, limit: 90 } }, T).map((a) => a.kind)).toEqual(['ai_cap', 'key_test_failed', 'video_quota']);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into control.ai_usage (day, profile_id, provider_id, model, requests, failures, cap_refusals, tokens_in, tokens_out) values ('2026-10-22', 'family.resolver', 'anthropic', 'm', 20, 5, 1, 100, 200), ('2026-10-01', 'family.resolver', 'anthropic', 'm', 4, 0, 0, 10, 10);
    insert into content.video_searches (day, searches) values ('2026-10-22', 80);
  `);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

describe('loading as the platform role', () => {
  it('today and the month per profile, the quota, the counts and the alerts', async () => {
    const h = await db.pg.transaction(async (tx: { query: (s: string) => Promise<unknown> }) => {
      await tx.query('set local role nca_super');
      return loadHealth(tx as never, '2026-10-22');
    });
    expect(h.profiles).toEqual([{ profileId: 'family.resolver', requestsToday: 20, failuresToday: 5, capRefusalsToday: 1, requestsMonth: 24, tokensMonth: 320 }]);
    expect(h.video).toEqual({ used: 80, limit: 90 });
    expect(h.counts.plansBuilt7d).toBe(0);
    expect(h.alerts.map((a: { kind: string }) => a.kind)).toEqual(['ai_failures', 'ai_cap', 'video_quota']);
  });
});
