import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { LatencyTiles } from '@/components/control/ai/LatencyTiles';
import { RESOLVER_WHOLE_TARGET_MS, loadLatencyTiles, statusOf, targetsOf } from '@/lib/ai/latency';
import { PROFILES } from '@/lib/ai/platform';
import { qcRules, recordQc } from '@/lib/ai/qc/rules';
import { t } from '@/lib/i18n';
import type { Sql } from '@/lib/jobs/types';

// W16-A5: the latency tiles on the Control AI dashboard, on the real migrations (PGlite): the middle (p50) and the slow
// end (p95) of the first words and of the whole answer over the last 24 hours, for each family profile, from seeded
// ledger and quality-check rows; the colour words; the quality check's own table is append-only and written through its
// function; old rows are removed with the ledger's. Made-up numbers only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asRole = <T>(role: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const refused = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return 'allowed';
  } catch (e) {
    return String((e as Error).message);
  }
};

const ledger = (profile: string, ms: number | null, outcome = 'ok', hoursAgo = 1) =>
  q(
    `insert into control.ai_usage_ledger (at, day, profile_id, provider_id, model, route_position, outcome, latency_ms)
     values (now() - ($2 || ' hours')::interval, current_date, $1, 'anthropic', 'm', 0, $3, $4)`,
    [profile, String(hoursAgo), outcome, ms]
  );
const qc = (profile: string, first: number | null, hoursAgo = 1) =>
  q(
    `insert into control.ai_qc_results (at, day, profile_id, ok, problems, first_text_ms, whole_ms) values (now() - ($2 || ' hours')::interval, current_date, $1, true, '{}', $3, 9000)`,
    [profile, String(hoursAgo), first]
  );
const tile = async (id: string) => (await asRole('nca_super', (tx) => loadLatencyTiles(tx as unknown as Sql))).find((x) => x.profileId === id)!;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
}, 90_000);
afterAll(async () => db?.stop());
beforeEach(async () => {
  await db.pg.exec('delete from control.ai_usage_ledger; delete from control.ai_qc_results');
});

describe('the tiles', () => {
  it('give the middle and the slow end of the whole answer from the last 24 hours of the ledger, and of the first words from the quality check', async () => {
    for (const ms of [1000, 2000, 3000, 4000, 5000]) await ledger('family.resolver', ms);
    // Not counted: older than 24 hours, a failed attempt, an attempt with no time, another profile.
    await ledger('family.resolver', 99_000, 'ok', 30);
    await ledger('family.resolver', 99_000, 'upstream_timeout');
    await ledger('family.resolver', null);
    await ledger('family.summary', 7000);
    for (const ms of [2000, 4000, 6000, 8000, 30_000]) await qc('family.resolver', ms);
    await qc('family.resolver', 99_000, 30);

    const r = await tile('family.resolver');
    expect(r.whole).toEqual({ spread: { p50: 3000, p95: 4800, n: 5 }, targetMs: RESOLVER_WHOLE_TARGET_MS, status: 'ok' });
    // p95 of 2, 4, 6, 8 and 30 seconds is 25.6 s: over the 12 s first-words time, while the middle (6 s) is within it.
    expect(r.firstText).toEqual({ spread: { p50: 6000, p95: 25_600, n: 5 }, targetMs: 12_000, status: 'slow' });
    expect(r.status).toBe('slow');
    expect((await tile('family.summary')).whole.spread).toEqual({ p50: 7000, p95: 7000, n: 1 });
  });

  it('show a profile whose middle is over its time as over, and one with no answers as nothing to compare', async () => {
    await ledger('family.homework', 45_000);
    await ledger('family.homework', 50_000);
    const hw = await tile('family.homework');
    expect(hw.whole).toMatchObject({ targetMs: 40_000, status: 'over' });
    expect(hw.status).toBe('over');
    expect(await tile('family.plan')).toMatchObject({ status: 'none', whole: { spread: null, status: 'none' }, firstText: { spread: null, status: 'none' } });
  });

  it('list every family profile, and only those', async () => {
    const tiles = await asRole('nca_super', (tx) => loadLatencyTiles(tx as unknown as Sql));
    expect(tiles.map((x) => x.profileId)).toEqual(PROFILES.filter((p) => p.audience === 'family').map((p) => p.id));
    expect(tiles.some((x) => x.profileId.startsWith('exams.'))).toBe(false);
  });

  it('take a target from the caller for a profile that has none (the voice targets, once known)', async () => {
    await ledger('family.text_to_speech', 1500);
    const none = await tile('family.text_to_speech');
    expect(none.whole.targetMs).toBeNull();
    expect(none.status).toBe('none');
    const withTarget = (await asRole('nca_super', (tx) => loadLatencyTiles(tx as unknown as Sql, { 'family.text_to_speech': { wholeMs: 2000 } }))).find((x) => x.profileId === 'family.text_to_speech')!;
    expect(withTarget.whole).toMatchObject({ targetMs: 2000, status: 'ok' });
  });

  it('colour: on target, slow end over, over, or nothing to compare', () => {
    const s = (p50: number, p95: number) => ({ p50, p95, n: 3 });
    expect(statusOf(s(1, 2), 5)).toBe('ok');
    expect(statusOf(s(1, 9), 5)).toBe('slow');
    expect(statusOf(s(6, 9), 5)).toBe('over');
    expect(statusOf(null, 5)).toBe('none');
    expect(statusOf(s(1, 2), null)).toBe('none');
    expect(targetsOf(PROFILES.find((p) => p.id === 'family.resolver')!)).toEqual({ firstTextMs: 12_000, wholeMs: 20_000 });
  });
});

describe('the screen', () => {
  it('shows each tile in the founder’s language, with the colour words and the targets', async () => {
    for (const ms of [1000, 2000, 3000]) await ledger('family.resolver', ms);
    const tiles = await asRole('nca_super', (tx) => loadLatencyTiles(tx as unknown as Sql));
    const html = renderToStaticMarkup(h(LatencyTiles, { tiles, lang: 'en' }));
    expect(html).toContain(t('en', 'control.ai.latency.title'));
    expect(html).toContain('data-ai-latency-profile="family.resolver"');
    expect(html).toContain('Typical 2.0 s, slow end 2.9 s (3 answers)');
    expect(html).toContain('Target: 20.0 s or less');
    expect(html).toContain(t('en', 'control.ai.latency.status.ok'));
    expect(html).toContain(t('en', 'control.ai.latency.wholeEmpty'));
    const hi = renderToStaticMarkup(h(LatencyTiles, { tiles, lang: 'hi' }));
    expect(hi).toContain(t('hi', 'control.ai.latency.title'));
    expect(hi).not.toContain('Typical');
  });
});

describe('the quality-check table', () => {
  it('is written through recordQc as the family role, read by the platform role only, and never changed', async () => {
    const answer = { firstTextMs: 1800, wholeMs: 9000, passagesGiven: true, band: 'c6_8' as const };
    const result = qcRules({ blocks: [], passagesGiven: true, firstTextMs: 1800, wholeMs: 9000, deadlineMs: 40_000 });
    expect(result.ok).toBe(false);
    const wrote = await asRole('family_app', (tx) => recordQc(tx as unknown as Sql, { day: '2026-11-02', profileId: 'family.resolver', answer }, result));
    expect(wrote).toBe(true);
    // Bad input writes nothing.
    expect(await asRole('family_app', (tx) => recordQc(tx as unknown as Sql, { day: 'today', profileId: 'family.resolver', answer }, result))).toBe(false);

    const rows = await asRole('nca_super', (tx) => tx.query(`select profile_id, ok, problems, first_text_ms, whole_ms, passages_given, band from control.ai_qc_results`));
    expect(rows.rows).toEqual([{ profile_id: 'family.resolver', ok: false, problems: ['no_citation', 'too_short'], first_text_ms: 1800, whole_ms: 9000, passages_given: true, band: 'c6_8' }]);

    expect(await refused(() => asRole('family_app', (tx) => tx.query('select * from control.ai_qc_results')))).toMatch(/permission denied/);
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`update control.ai_qc_results set ok = true`)))).toMatch(/permission denied/);
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`delete from control.ai_qc_results`)))).toMatch(/permission denied/);
    expect(await refused(() => asRole('family_app', (tx) => tx.query(`insert into control.ai_qc_results (day, profile_id, ok) values (current_date, 'family.resolver', true)`)))).toMatch(/permission denied/);
  });

  it('keeps ok in step with the problems it holds, and the ledger retention removes old rows', async () => {
    await asRole('family_app', (tx) => tx.query(`select control.record_qc_result(current_date, 'family.resolver', '{}', 100, 900, false, null)`));
    expect((await q(`select ok from control.ai_qc_results`))[0].ok).toBe(true);
    expect(await refused(() => q(`insert into control.ai_qc_results (day, profile_id, ok, problems) values (current_date, 'family.resolver', true, '{hung}')`))).toMatch(/violates check constraint/);
    await q(`insert into control.ai_qc_results (day, profile_id, ok, problems) values (current_date - 100, 'family.resolver', false, '{hung}')`);
    const removed = (await asRole('nca_super', (tx) => tx.query(`select control.ai_ledger_retention(current_date, 90) as n`))).rows[0].n;
    expect(removed).toBe(1);
    expect((await q(`select count(*)::int as n from control.ai_qc_results`))[0].n).toBe(1);
  });
});
