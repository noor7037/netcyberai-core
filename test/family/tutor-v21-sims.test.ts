import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Noor, 16 Nov 2026 (v21): simulations for every class, the broader match chain, OLabs as a link card, Virtual Labs embedded, no
// GeoGebra. The match runs on the real seed file; the table's check constraint runs on the real migrations (PGlite). No network.

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { SimCard } from '@/components/family/blocks/SimCard';
import { classSpan, matchSim, simFor, simRowsFromCsv, simUpsertSql, SIM_TIERS, type SimRow } from '@/lib/family/curated-sims';
import { checkSim, LINK_ONLY_HOSTS, SIM_FRAME_HOSTS, SIM_HOSTS, SIM_SOURCES, simMode } from '@/lib/family/sim-hosts';
import { EMBED_ORDER } from '@/lib/family/visuals/embed-order';

const { rows: ALL, skipped } = simRowsFromCsv(readFileSync('scripts/seed/curated_sims.csv', 'utf8'));
const lang = (l: string) => ALL.filter((r) => r.language === l);
const row = (o: Partial<SimRow>): SimRow => ({ class: '6-8', subject: 'Science', chapter_name: '', topic: 'lever', language: 'en', source: 'phet', title: 'Balancing Act', embed_url: 'https://phet.colorado.edu/sims/html/balancing-act/latest/balancing-act_en.html', page_url: 'https://phet.colorado.edu/en/simulations/balancing-act', licence: 'CC BY 4.0', preview: null, chapter_number: '', ...o });
const words = { 'fam.elab.trySim': 'Try it yourself', 'fam.elab.simOpen': 'Open', 'fam.elab.simFrom': 'From', 'fam.elab.labOpen': 'Open lab', 'fam.elab.labNote': 'Opens on its own site.' };

describe('the seed file', () => {
  it('reads whole, with no GeoGebra anywhere', () => {
    expect(skipped).toEqual([]);
    expect(ALL.length).toBeGreaterThan(584);
    expect(ALL.some((r) => r.source === 'geogebra' || /geogebra/i.test(`${r.embed_url} ${r.page_url} ${r.licence}`))).toBe(false);
    expect(SIM_SOURCES).not.toContain('geogebra');
    expect(EMBED_ORDER).not.toContain('geogebra');
    for (const f of ['src/lib/family/sim-hosts.ts', 'src/lib/family/visuals/embed-order.ts', 'scripts/sims/candidates.mjs', 'scripts/sims/candidates-v21.mjs', 'scripts/sims/build_sims_csv.mjs', 'next.config.js'])
      expect(readFileSync(f, 'utf8').toLowerCase()).not.toContain('geogebra');
  });
  it('has rows in Science and Maths for every class 1 to 8, and in the senior classes still', () => {
    const covers = (subject: RegExp, c: number) => ALL.some((r) => subject.test(r.subject) && (classSpan(r.class)?.[0] ?? 99) <= c && c <= (classSpan(r.class)?.[1] ?? -1));
    for (let c = 1; c <= 8; c++) {
      expect(covers(/^Science$/, c), `Science, class ${c}`).toBe(true);
      expect(covers(/^Maths$/, c), `Maths, class ${c}`).toBe(true);
    }
    for (const c of [9, 10]) expect(covers(/^Science$/, c)).toBe(true);
    for (const c of [11, 12]) for (const s of [/^Physics$/, /^Chemistry$/, /^Maths$/, /^Biology$/]) expect(covers(s, c), `${s}, class ${c}`).toBe(true);
  });
  it('Class 5 "energy" finds PhET Energy Forms and Changes, in English and in Hindi', () => {
    const en = matchSim(lang('en'), { subject: 'science', term: 'energy' }, { classLevel: 5 });
    expect(en?.source).toBe('phet');
    expect(en?.embed).toContain('/energy-forms-and-changes/');
    expect(en?.embed).toMatch(/_en\.html$/);
    const hi = matchSim(lang('hi'), { subject: 'science', term: 'ऊर्जा', topicEn: 'energy' }, { classLevel: 5 });
    expect(hi?.embed).toContain('/energy-forms-and-changes/');
    expect(hi?.embed).toMatch(/_hi\.html$/);
    expect(matchSim(lang('hi'), { subject: 'science', term: 'ऊर्जा' }, { classLevel: 5 })?.embed).toMatch(/_hi\.html$/);
    // EVS (Classes 1 to 5) is served by a Science row.
    expect(matchSim(lang('en'), { subject: 'evs', term: 'magnets' }, { classLevel: 2 })?.embed).toContain('magnet-and-compass');
  });
  it('simFor goes Hindi then English, tier by tier', async () => {
    const calls: string[] = [];
    const db = {
      query: async (sql: string, p?: unknown[]) => {
        if (/curated_sims\(/.test(sql)) { calls.push(String(p?.[0])); return { rows: lang(String(p?.[0])) as never[] }; }
        return { rows: [] };
      },
    };
    expect((await simFor(db, { subject: 'science', term: 'energy' }, { classLevel: 5 }, 'hi'))?.embed).toMatch(/_hi\.html$/);
    expect(calls).toEqual(['hi']);
    // A Hindi answer on a topic only the English rows hold falls back to English.
    const onlyEn = { query: async (sql: string, p?: unknown[]) => (/curated_sims\(/.test(sql) ? { rows: (p?.[0] === 'en' ? [row({ class: '4-8', topic: 'seesaw' })] : []) as never[] } : { rows: [] }) };
    expect((await simFor(onlyEn, { subject: 'science', term: 'seesaw' }, { classLevel: 5 }, 'hi'))?.title).toBe('Balancing Act');
  });
});

describe('the broader match chain', () => {
  const near = [row({ class: '7-8', topic: 'lever' })];
  it('exact, then the class band plus or minus two, never further for a band-specific simulation', () => {
    expect(matchSim(near, { subject: 'science', term: 'lever' }, { classLevel: 7 })).not.toBeNull();
    expect(matchSim(near, { subject: 'science', term: 'lever' }, { classLevel: 5 })).not.toBeNull(); // two below
    expect(matchSim(near, { subject: 'science', term: 'lever' }, { classLevel: 10 })).not.toBeNull(); // two above
    expect(matchSim(near, { subject: 'science', term: 'lever' }, { classLevel: 4 })).toBeNull(); // three below: only a generic sim
    expect(matchSim(near, { subject: 'science', term: 'lever' }, { classLevel: 11 })).toBeNull(); // three above
  });
  it('a generic simulation (four classes or more) may serve a class outside its band', () => {
    const generic = [row({ class: '1-8', topic: 'magnets', title: 'Magnet and Compass' })];
    expect(matchSim(generic, { subject: 'science', term: 'magnets' }, { classLevel: 11 })?.title).toBe('Magnet and Compass');
    const narrow = [row({ class: '3-5', topic: 'magnets' })];
    expect(matchSim(narrow, { subject: 'science', term: 'magnets' }, { classLevel: 11 })).toBeNull();
  });
  // 18 Nov 2026: the parent-topic tier is gone. A third of a topic's words, or the chapter's, is not a reason to show a
  // simulation: a wrong one is worse than none (an area model under a speed sum).
  it('no parent-topic tier: a loose fit through the chapter or a third of the topic shows nothing', () => {
    const parent = [row({ class: '6-7', topic: 'electric circuit symbols', title: 'Circuit Kit' })];
    const ask = { subject: 'science' as const, term: 'wires', topicEn: 'electric current in wires', chapterEn: 'Electricity' };
    expect(matchSim(parent, ask, { classLevel: 6 })).toBeNull();
    expect(matchSim(parent, { subject: 'science' as const, term: 'electric circuit symbols' }, { classLevel: 6 })?.title).toBe('Circuit Kit');
    expect(SIM_TIERS.map((t) => t.name)).toEqual(['exact', 'near class', 'generic']);
    expect(SIM_TIERS.every((t) => t.min >= 0.67)).toBe(true);
  });
  it('never a different subject', () => {
    const maths = [row({ subject: 'Maths', class: '1-8', topic: 'magnets' })];
    expect(matchSim(maths, { subject: 'science', term: 'magnets' }, { classLevel: 5 })).toBeNull();
    expect(matchSim(lang('en'), { subject: 'english', term: 'energy' }, { classLevel: 5 })).toBeNull();
    expect(matchSim(lang('en'), { subject: null, term: 'energy' }, { classLevel: 5 })).toBeNull();
  });
  it('never a simulation whose lowest class is more than three above the child', () => {
    const adv = [row({ class: '9-12', topic: 'energy' })];
    expect(matchSim(adv, { subject: 'science', term: 'energy' }, { classLevel: 5 })).toBeNull();
    expect(matchSim(adv, { subject: 'science', term: 'energy' }, { classLevel: 6 })).not.toBeNull();
    for (let c = 1; c <= 5; c++) {
      const hit = matchSim(lang('en'), { subject: 'science', term: 'photoelectric effect', topicEn: 'photoelectric effect' }, { classLevel: c });
      expect(hit?.embed ?? '').not.toContain('photoelectric');
    }
  });
});

describe('the card per host', () => {
  const card = (source: string, embed: string) => checkSim({ source, title: 'A lab', embed, page: embed, licence: 'x' })!;
  it('OLabs refuses framing: a link card; PhET, NASA Eyes and Virtual Labs: the tap-to-load frame', () => {
    const olabs = card('olabs', 'https://www.olabs.edu.in/?sub=96&brch=50&sim=1&cnt=1');
    expect(simMode(olabs)).toBe('link');
    const link = renderToStaticMarkup(h(SimCard, { sim: olabs, w: words }));
    expect(link).toContain('data-elab-lab-link');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).toContain('Open lab');
    expect(link).toContain('min-h-[44px]');
    expect(link).not.toContain('<iframe');
    expect(link).not.toContain('data-elab-sim-open');
    for (const [source, url] of [['phet', 'https://phet.colorado.edu/sims/html/density/latest/density_en.html'], ['vlabs', 'https://vlab.amrita.edu/?sub=1&brch=74&sim=191&cnt=1'], ['nasa_eyes', 'https://eyes.nasa.gov/apps/solar-system/']]) {
      const c = card(source, url);
      expect(simMode(c)).toBe('iframe');
      const html = renderToStaticMarkup(h(SimCard, { sim: c, w: words }));
      expect(html).toContain('data-elab-sim-open');
      expect(html).not.toContain('data-elab-lab-link');
    }
  });
  it('the frame-src has the framed hosts and never the link-only one', () => {
    expect(LINK_ONLY_HOSTS).toEqual(['www.olabs.edu.in']);
    expect(SIM_HOSTS.olabs).toEqual(['www.olabs.edu.in']);
    expect(SIM_FRAME_HOSTS).toContain('vlab.amrita.edu');
    expect(SIM_FRAME_HOSTS).not.toContain('www.olabs.edu.in');
    const cfg = readFileSync('next.config.js', 'utf8');
    for (const host of [...SIM_FRAME_HOSTS, 'www.youtube-nocookie.com']) expect(cfg).toContain(`'${host}'`);
    expect(cfg).not.toContain('olabs');
  });
  it('an address off the source host is refused', () => {
    expect(checkSim({ source: 'olabs', title: 't', embed: 'https://evil.example/?sub=1', page: 'https://www.olabs.edu.in/' })).toBeNull();
    expect(ALL.filter((r) => r.source === 'olabs').length).toBeGreaterThan(100);
    expect(ALL.filter((r) => r.source === 'vlabs').length).toBeGreaterThan(10);
  });
});

describe('the source check migration, on the real migrations', () => {
  let db: { pg: { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> };
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
  }, 120_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await db?.stop();
  });
  it('the seed file loads whole, an olabs row and a vlabs row insert, GeoGebra is refused', async () => {
    for (let i = 0; i < ALL.length; i += 200) await db.pg.query(simUpsertSql(ALL.slice(i, i + 200)));
    const { rows } = await db.pg.query(`select source, count(*)::int as n from content.curated_topic_sims group by source`);
    const by = new Map(rows.map((r: { source: string; n: number }) => [r.source, r.n]));
    expect(by.get('olabs')).toBeGreaterThan(100);
    expect(by.get('vlabs')).toBeGreaterThan(10);
    expect(by.get('phet')).toBeGreaterThan(500);
    const ins = (source: string) => db.pg.query(`insert into content.curated_topic_sims (class, subject, topic, language, source, title, embed_url, page_url) values ('7', 'Science', 'test', 'en', $1, 't', 'https://www.olabs.edu.in/?sub=96&sim=9999', 'https://www.olabs.edu.in/?sub=96&sim=9999')`, [source]);
    await expect(ins('olabs')).resolves.toBeDefined();
    await expect(ins('geogebra')).rejects.toThrow();
    await expect(ins('nonsense')).rejects.toThrow();
  }, 120_000);
});
