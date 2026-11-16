import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Tutor v21 (16 Nov 2026): the shared visual cache, one search for the same words, each source's free limits, the 429
// pause, the per-answer cap, the relevance check (no moth for "energy") and the photo routing, on the real migrations
// (PGlite). Every outside source is a scripted function. Made-up words and pictures only.

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { parseBlockLine } from '@/lib/family/blocks';
import type { Elaboration } from '@/lib/family/elaboration';
import { pickPhoto } from '@/lib/family/visuals/commons';
import { fillElaboration } from '@/lib/family/visuals/elab-fill';
import { RateLimited, guarded, resetLimits, retryAfterS, runVisualAnswer, type WithDb } from '@/lib/family/visuals/limits';
import { relevant } from '@/lib/family/visuals/relevance';
import { cachedVisual, classBand, forgetVisualCache } from '@/lib/family/visuals/shared-cache';
import { askable, commons, routeFor, searchSources } from '@/lib/family/visuals/sources';
import { MODEL3D_ORDER, SOURCE_LIMITS } from '@/lib/family/visuals/source-limits';

type Pg = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }>; transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T> };
let db: { pg: Pg; stop: () => Promise<void> };
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const asFamily: WithDb = (fn) =>
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role family_app');
    return fn(tx);
  });

const pic = (name: string) => ({ url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/500px-${name}.jpg`, pageUrl: `https://commons.wikimedia.org/wiki/File:${name}.jpg`, author: 'A. Author', licence: 'CC BY 4.0', licenceUrl: null, source: 'commons' });
let n = 0;
const fresh = (w: string) => `${w} ${++n}x`;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
}, 120_000);
afterAll(async () => {
  await db?.stop();
});
beforeEach(() => {
  forgetVisualCache();
  resetLimits();
  vi.restoreAllMocks();
});

describe('migration and row security', () => {
  it('applies, and family_app reaches the tables only through the functions', async () => {
    for (const t of ['visual_cache', 'visual_source_usage', 'visual_source_pauses', 'visual_source_hours']) {
      await expect(asFamily((c) => c.query(`select * from content.${t}`))).rejects.toThrow(/permission denied/);
    }
    await expect(asFamily((c) => c.query(`insert into content.visual_cache (kind, query_key, subject, class_band, state) values ('photo', 'x', '', '', 'hit')`))).rejects.toThrow(/permission denied/);
    const r = await asFamily(async (c) => (await c.query(`select state from content.visual_lookup('photo', 'rls check', '', '', 86400, 3600)`)).rows[0]);
    expect(r.state).toBe('claimed');
    await expect(asFamily((c) => c.query(`select * from content.visual_source_summary(1)`))).rejects.toThrow(/permission denied/);
  });
});

describe('shared cache', () => {
  it('a hit is kept a day and a miss an hour, across servers (the table), then searched again', async () => {
    const words = fresh('kinetic energy');
    let calls = 0;
    const found = async () => (++calls, pic('Kinetic_energy'));
    expect(await cachedVisual('photo', words, 'physics', 'middle', found, { withDb: asFamily })).toEqual(pic('Kinetic_energy'));
    forgetVisualCache(); // another server: only the table
    expect(await cachedVisual('photo', words, 'physics', 'middle', found, { withDb: asFamily })).toEqual(pic('Kinetic_energy'));
    expect(calls).toBe(1);
    await q(`update content.visual_cache set fetched_at = now() - interval '25 hours' where query_key = $1`, [words.toLowerCase()]);
    forgetVisualCache();
    await cachedVisual('photo', words, 'physics', 'middle', found, { withDb: asFamily });
    expect(calls).toBe(2);

    const none = fresh('nothing fits');
    let misses = 0;
    const empty = async () => (++misses, null);
    expect(await cachedVisual('photo', none, 'physics', 'middle', empty, { withDb: asFamily })).toBeNull();
    forgetVisualCache();
    expect(await cachedVisual('photo', none, 'physics', 'middle', empty, { withDb: asFamily })).toBeNull();
    expect(misses).toBe(1);
    await q(`update content.visual_cache set fetched_at = now() - interval '61 minutes' where query_key = $1`, [none.toLowerCase()]);
    forgetVisualCache();
    await cachedVisual('photo', none, 'physics', 'middle', empty, { withDb: asFamily });
    expect(misses).toBe(2);
    // Another class band is its own entry.
    await cachedVisual('photo', words, 'physics', 'senior', found, { withDb: asFamily });
    expect(calls).toBe(3);
  });

  it('the same words asked at once spend one search, here and across servers', async () => {
    const words = fresh('force push pull');
    let calls = 0;
    const slow = async () => {
      ++calls;
      await new Promise((r) => setTimeout(r, 30));
      return pic('Force');
    };
    const all = await Promise.all(Array.from({ length: 5 }, () => cachedVisual('photo', words, 'physics', 'middle', slow, { withDb: asFamily })));
    expect(calls).toBe(1);
    expect(all.every((p) => p?.url === pic('Force').url)).toBe(true);
    // A second server while the first still searches: it waits for the first one's answer.
    const other = fresh('force push pull');
    await asFamily((c) => c.query(`select * from content.visual_lookup('photo', $1, 'physics', 'middle', 86400, 3600)`, [other.toLowerCase()]));
    setTimeout(() => void asFamily((c) => c.query(`select content.visual_save('photo', $1, 'physics', 'middle', $2::jsonb)`, [other.toLowerCase(), JSON.stringify(pic('Other'))])), 20);
    expect((await cachedVisual('photo', other, 'physics', 'middle', slow, { withDb: asFamily, waitMs: 40 }))?.url).toBe(pic('Other').url);
    expect(calls).toBe(1);
  });

  it('five steps with the same words make one search per form of the words', async () => {
    const t = fresh('democracy');
    const step = (text: string) => ({ text, say: text, q: t });
    const elab = parseBlockLine(
      JSON.stringify({
        type: 'elaboration', term: t, icon: '🗳️', definition: step('People choose their leaders.'),
        levels: { basic: 'We vote.', intermediate: 'Elected members make laws.', advanced: 'Parliament is answerable to the people.', say: 'Levels.', q: t },
        real_life: step('Your school elects a class monitor.'), try_it: { question: 'Who chooses the monitor?', right: 'The class.', hint: 'Think.', say: 'Who?', q: t }, future: step('You will vote at 18.'),
        checks: [{ question: 'Who chooses?', options: ['People', 'No one'], answer: 0, right: 'People.', hint: 'Step 1.' }, { question: 'At what age?', options: ['18', '5'], answer: 0, right: '18.', hint: 'Step 5.' }, { question: 'Who makes laws?', options: ['Elected members', 'Nobody'], answer: 0, right: 'Elected members.', hint: 'Step 2.' }],
      })
    ) as unknown as Elaboration;
    const asked = new Map<string, number>();
    const search = async (query: string) => (asked.set(query, (asked.get(query) ?? 0) + 1), null);
    await fillElaboration({ ...elab, pics: [null, null, null, null, null] }, { subject: 'civics', classLevel: 7, search, model: async () => null, withDb: asFamily });
    expect([...asked.values()].every((c) => c === 1)).toBe(true);
    expect(asked.size).toBeLessThanOrEqual(2);
  });

  it('class bands cover LKG to Class 12', () => {
    expect([-2, 0, 2, 3, 5, 6, 8, 9, 10, 11, 12].map(classBand)).toEqual(['early', 'early', 'early', 'primary', 'primary', 'middle', 'middle', 'secondary', 'secondary', 'senior', 'senior']);
    expect(classBand(null)).toBe('');
  });
});

describe('the gate', () => {
  it('skips a source at its limit before asking it (shared counter)', async () => {
    const lim = SOURCE_LIMITS.unsplash.perHour!;
    await q(`insert into content.visual_source_usage (bucket, period, started, calls) values ('unsplash', 'hour', date_trunc('hour', now()), $1), ('unsplash', 'hour', date_trunc('hour', now()) - interval '1 hour', $1)`, [lim]);
    let asked = 0;
    const got = await runVisualAnswer({ withDb: asFamily, env: { UNSPLASH_ACCESS_KEY: 'made-up' } }, () => guarded('unsplash', async () => (++asked, 'x')));
    expect(got).toBeNull();
    expect(asked).toBe(0);
    const [h] = await q(`select calls, skips from content.visual_source_hours where source = 'unsplash' and hour = date_trunc('hour', now())`);
    expect(h).toMatchObject({ calls: 0, skips: 1 });
    // The api.data.gov key serves Smithsonian; its counter is shared with Smithsonian 3D.
    expect(SOURCE_LIMITS.smithsonian.bucket).toBe(SOURCE_LIMITS.smithsonian3d.bucket);
  });

  it('a 429 pauses the source for every server until Retry-After, then it is asked again (fake clock)', async () => {
    let t = 1_000_000;
    let asked = 0;
    const run = (fn: () => Promise<string>) => runVisualAnswer({ now: () => t }, () => guarded('wellcome', fn));
    expect(await run(async () => (++asked, Promise.reject(new RateLimited(120))))).toBeNull();
    t += 60_000;
    expect(await run(async () => (++asked, 'x'))).toBeNull();
    expect(asked).toBe(1);
    t += 61_000;
    expect(await run(async () => (++asked, 'x'))).toBe('x');
    expect(asked).toBe(2);
    expect(retryAfterS('30')).toBe(30);
    expect(retryAfterS(null)).toBeNull();
    // Shared: the pause row stops another server (no memory of its own) too.
    expect(await runVisualAnswer({ withDb: asFamily }, () => guarded('aic', () => Promise.reject(new RateLimited(null))))).toBeNull();
    const [p] = await q(`select extract(epoch from until - now())::int as s from content.visual_source_pauses where bucket = 'aic'`);
    expect(p.s).toBeGreaterThan(800);
    resetLimits();
    expect(await runVisualAnswer({ withDb: asFamily }, () => guarded('aic', async () => (++asked, 'x')))).toBeNull();
    expect(asked).toBe(2);
    await q(`update content.visual_source_pauses set until = now() - interval '1 second' where bucket = 'aic'`);
    expect(await runVisualAnswer({ withDb: asFamily }, () => guarded('aic', async () => 'x'))).toBe('x');
  });

  it('a source with no key is skipped quietly and logged once; the photo still comes from a free source', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    let asked = 0;
    for (let i = 0; i < 3; i++) await runVisualAnswer({ env: {} }, () => guarded('pexels', async () => (++asked, 'x')));
    expect(asked).toBe(0);
    expect(log.mock.calls.filter((c) => String(c[0]).includes('pexels skipped: its key is not set'))).toHaveLength(1);
    expect(askable(['smithsonian'], { DATA_GOV_API_KEY: 'made-up' }).map((s) => s.id)).toEqual(['smithsonian']);
    expect(askable(['pexels', 'pixabay', 'commons'], {}).map((s) => s.id)).toEqual(['commons']);
  });

  it('caps the outside calls of one answer', async () => {
    let asked = 0;
    await runVisualAnswer({ cap: 3 }, async () => {
      for (let i = 0; i < 5; i++) await guarded('commons', async () => (++asked, null));
    });
    expect(asked).toBe(3);
  });
});

describe('relevance and routing', () => {
  it('rejects a moth for "energy doing work" and keeps a matching diagram', () => {
    expect(relevant('energy doing work', 'File:Moth on a leaf.jpg Lepidoptera of India')).toBe(false);
    expect(relevant('energy doing work', 'File:Kinetic and potential energy diagram.png Physics diagrams')).toBe(true);
    expect(relevant('fractions', 'A pizza cut into halves and quarters')).toBe(true);
    const page = (title: string, cats: string, index: number) => ({ title, index, imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title}/500px-${title}`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}`, mime: 'image/jpeg', size: 1000, width: 800, height: 600, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, Artist: { value: 'A' }, Categories: { value: cats } } }] });
    const answer = { query: { pages: [page('Moth.jpg', 'Lepidoptera', 0), page('Work_energy.jpg', 'Energy diagrams', 1)] } };
    const accept = (about: string) => relevant('energy doing work', about);
    expect(pickPhoto(answer, accept)?.pageUrl).toContain('Work_energy.jpg');
    expect(pickPhoto({ query: { pages: [page('Moth.jpg', 'Lepidoptera', 0)] } }, accept)).toBeNull();
  });

  it('a search with only a moth is no photograph (the step keeps its diagram)', async () => {
    const page = { title: 'File:Moth.jpg', index: 0, imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Moth.jpg/500px-Moth.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Moth.jpg', mime: 'image/jpeg', size: 1000, width: 800, height: 600, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, Artist: { value: 'A' }, Categories: { value: 'Moths' } } }] };
    const f = (async (u: string) => (new URL(u).hostname === 'commons.wikimedia.org' ? Response.json({ query: { pages: [page] } }) : Response.json({ results: [] }))) as never;
    expect(await commons('energy doing work', {}, f)).toBeNull();
    expect(await searchSources('energy doing work', { subject: 'science', env: {}, fetcher: f })).toBeNull();
  });

  it('abstract ideas go to Commons and Openverse; iNaturalist only for living things', () => {
    for (const w of ['energy doing work', 'force and motion', 'fractions of a pizza', 'democracy']) {
      const r = routeFor('science', w);
      expect(r.slice(0, 2)).toEqual(['commons', 'openverse']);
      expect(r).not.toContain('inaturalist');
    }
    expect(routeFor('biology', 'frog life cycle')[0]).toBe('inaturalist');
    expect(routeFor('evs', 'human heart')[0]).toBe('wellcome');
    expect(routeFor('geography', 'monsoon clouds')[0]).toBe('nasa');
    expect(routeFor('history', 'mughal painting')).toContain('aic');
    expect(routeFor(null, 'anything').slice(-4)).toEqual(['pexels', 'pixabay', 'smithsonian', 'unsplash']);
    expect(MODEL3D_ORDER).toEqual(['pubchem', 'pdb', 'nasa3d', 'smithsonian3d', 'sketchfab', 'polypizza']);
  });
});
