import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoadmapView } from '@/components/family/careers/RoadmapView';
import { buildBundle } from '@/lib/family/careers/catalog';
import { filterCareers } from '@/lib/family/careers/filter';
import { applyPlan, planImport } from '@/lib/family/careers/import-plan';
import { buildLanes, crossesForCareer, crossesForStream } from '@/lib/family/careers/lanes';
import { opensNow } from '@/lib/family/careers/opens-now';
import { seedRows } from '@/lib/family/careers/seed-build';
import { projectForFamily, visibleToFamily } from '@/lib/family/careers/visibility';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import type { CareerCard, CrossPath, Roadmap } from '@/lib/family/careers/types';

const bundle = buildBundle();
const { desired } = seedRows(bundle);
const TODAY = '2026-11-15';

const LIMIT: Record<string, number> = {
  name_en: 80, name_hi: 80, title_en: 160, title_hi: 160, summary_en: 800, summary_hi: 800,
  horizon_en: 400, horizon_hi: 400, compete_en: 1500, compete_hi: 1500,
  requirement_en: 900, requirement_hi: 900, exam_name_en: 120, exam_name_hi: 120,
  detail_en: 800, detail_hi: 800, via_en: 300, via_hi: 300, conditions_en: 900, conditions_hi: 900,
  example_en: 500, example_hi: 500, step_key: 120, action_key: 200, cross_key: 80, route_key: 80,
};

describe('career seed', () => {
  it('covers IT, management, trades and government, all pending general guidance', () => {
    const fields = new Set(bundle.fields.map((f) => f.id));
    expect(fields.has('information_technology')).toBe(true);
    expect(fields.has('management')).toBe(true);
    expect(fields.has('trades')).toBe(true);
    expect(fields.has('government')).toBe(true);
    expect(bundle.careers.length).toBeGreaterThanOrEqual(80);
    expect(bundle.careers.length).toBeLessThanOrEqual(120);
    for (const c of bundle.careers) {
      expect(c.title[1].length).toBeGreaterThan(0);
      expect(c.summary[1].length).toBeGreaterThan(0);
    }
    for (const row of desired) {
      expect(row.reviewDue >= TODAY).toBe(true);
      for (const [k, v] of Object.entries(row.write)) {
        if (typeof v === 'string' && k in LIMIT) expect(v.length, `${row.table}.${row.key}.${k}`).toBeLessThanOrEqual(LIMIT[k]!);
        if (typeof v === 'string') expect(v.includes('<') || v.includes('>')).toBe(false);
      }
    }
  });

  it('imports twice without un-approving an unchanged row', () => {
    const first = planImport(desired, []);
    expect(first.insert.length).toBe(desired.length);
    const stored = new Map();
    applyPlan(stored, first);
    const rows = [...stored.values()];
    const other = rows[1]!;
    other.reviewState = 'approved';
    const second = planImport(desired, [...stored.values()]);
    expect(second.insert).toEqual([]);
    expect(second.update).toEqual([]);
    expect(second.unchanged).toBe(desired.length);
    const edited = { ...desired[0]!, hash: 'ab'.repeat(32) };
    const third = planImport([edited, ...desired.slice(1)], [...stored.values()]);
    expect(third.update.map((r) => r.key)).toContain(desired[0]!.key);
    applyPlan(stored, third);
    expect(stored.get(`${desired[0]!.table}\t${desired[0]!.key}`)!.reviewState).toBe('pending');
    expect(stored.get(`${other.table}\t${other.key}`)!.reviewState).toBe('approved');
  });
});

describe('who can see a career', () => {
  const row = { reviewState: 'approved' as const, reviewDue: '2027-11-15' };

  it('hides pending, rejected and a review that is more than 180 days late', () => {
    expect(visibleToFamily(row, TODAY)).toBe(true);
    expect(visibleToFamily({ ...row, reviewState: 'pending' }, TODAY)).toBe(false);
    expect(visibleToFamily({ ...row, reviewState: 'rejected' }, TODAY)).toBe(false);
    expect(visibleToFamily({ ...row, reviewDue: '2026-05-01' }, TODAY)).toBe(false);
    expect(projectForFamily([{ ...row, reviewState: 'pending' }, row], TODAY)).toEqual([row]);
  });

  it('does not filter careers by state', () => {
    const load = readFileSync('src/lib/family/careers/load.ts', 'utf8');
    const sql = readFileSync('supabase/migrations/20261115120000_career_hub_a.sql', 'utf8');
    expect(load.includes('state_code') || load.includes('stateCode')).toBe(false);
    expect(sql.includes('state_code')).toBe(false);
  });
});

describe('what opens now', () => {
  it('follows the class, and science keeps both PCM and PCB', () => {
    for (const n of [-2, 0, 5, 8]) expect(opensNow(n, null).kind).toBe('plan_ahead');
    expect(opensNow(9, null).openLane).toBe('after_10');
    expect(opensNow(10, 'science').kind).toBe('stream_choice');
    expect(opensNow(11, 'science').streams).toEqual(['science-pcm', 'science-pcb']);
    expect(opensNow(12, 'commerce').streams).toEqual(['commerce']);
    expect(opensNow(12, 'humanities').streams).toEqual(['arts']);
    expect(opensNow(12, null).streams).toContain('vocational');
  });
});

describe('roadmap', () => {
  const card = (over: Partial<CareerCard>): CareerCard => ({
    slug: 'software-engineer', fieldId: 'information_technology', fieldName: { en: 'Information technology', hi: 'सूचना प्रौद्योगिकी' }, level: 'professional',
    title: { en: 'Software engineer', hi: 'सॉफ्टवेयर इंजीनियर' },
    summary: { en: 'Builds software.', hi: 'सॉफ्टवेयर बनाता है।' },
    streams: ['science-pcm'], minLevel: 'ug', isco: '2512', onet: null, nco: null, govGroup: null,
    officialUrl: 'https://nta.ac.in', horizon: null,
    compete: { en: 'A public portfolio comes first.', hi: 'पहले सार्वजनिक पोर्टफोलियो।' },
    ...over,
  });
  const cross: CrossPath = {
    key: 'arts-to-computing', via: { en: 'Add mathematics', hi: 'गणित जोड़ें' },
    conditions: { en: 'A bridge course in mathematics, then the computing seat the college allows.', hi: 'गणित का सेतु कोर्स, फिर कॉलेज जिस कंप्यूटिंग सीट की अनुमति दे।' },
    streams: ['arts'], toSlugs: ['software-engineer'], anyGraduate: false, officialUrl: 'https://nios.ac.in',
  };

  it('builds seven lanes and keeps a cross path on the arts stream', () => {
    const lanes = buildLanes({
      steps: [{ key: 'a', lane: 'entrance', sort: 1, requirement: { en: 'JEE Main for many seats.', hi: 'कई सीटों के लिए जेईई मेन।' }, examName: { en: 'JEE Main', hi: 'जेईई मेन' }, futureSeriesKey: 'nta.jee_main', officialUrl: null }],
      actions: [{ key: 'p', stage: 'during_bachelor', type: 'portfolio', title: { en: 'Public code', hi: 'सार्वजनिक कोड' }, detail: { en: 'Show finished work.', hi: 'तैयार काम दिखाएँ।' }, effort: 'medium', cost: 'free', officialUrl: null }],
      laterals: [],
    });
    expect(lanes.map((l) => l.id)).toEqual(['during_10', 'after_10', 'during_12', 'entrance', 'bachelor', 'first_job', 'years']);
    expect(lanes.find((l) => l.id === 'bachelor')!.actions).toHaveLength(1);
    expect(crossesForStream('arts', [cross])).toHaveLength(1);
    const law: CrossPath = { ...cross, key: 'science-to-law', streams: ['science-pcm'], toSlugs: ['advocate'], anyGraduate: false };
    const upsc: CrossPath = { ...cross, key: 'any-graduate-upsc', streams: [], toSlugs: ['ias'], anyGraduate: true };
    const diploma: CrossPath = { ...cross, key: 'diploma-to-btech', streams: ['vocational'], toSlugs: ['software-engineer'], anyGraduate: false };
    const fieldOf = (slug: string) => (slug === 'advocate' || slug === 'ias' ? 'government' : slug === 'software-engineer' ? 'information_technology' : undefined);
    const aiml = { slug: 'ai-ml-engineer', fieldId: 'information_technology', streams: ['science-pcm', 'vocational'] as const };
    expect(crossesForCareer(aiml, [law, upsc, diploma, cross], fieldOf).map((c) => c.key)).toEqual(['diploma-to-btech']);
    expect(crossesForCareer({ slug: 'software-engineer', fieldId: 'information_technology', streams: ['science-pcm'] }, [cross], fieldOf).map((c) => c.key)).toEqual(['arts-to-computing']);
    const map: Roadmap = { career: card({}), lanes, crosses: [cross] };
    const html = renderToStaticMarkup(createElement(RoadmapView, { roadmap: map, lang: 'hi', openLane: 'entrance' }));
    expect(html).toContain('सॉफ्टवेयर इंजीनियर');
    expect(html).toContain('सामान्य मार्गदर्शन, आधिकारिक सूचना जाँचें');
    expect(html).toContain('stroke-dasharray');
    expect(html).toContain('data-lane="entrance"');
    const enHtml = renderToStaticMarkup(createElement(RoadmapView, { roadmap: map, lang: 'en', openLane: 'during_10' }));
    expect(enHtml).toContain('Software engineer');
    expect(enHtml).toContain('General guidance, verify the official notice');
    expect(enHtml).toContain('data-lane="during_10"');
  });

  it('search matches Hindi and English and drops a pending card', () => {
    const cards = [card({}), card({ slug: 'chartered-accountant', title: { en: 'Chartered accountant', hi: 'चार्टर्ड अकाउंटेंट' }, fieldId: 'management', streams: ['commerce'] })];
    expect(filterCareers(cards, { q: 'अकाउंटेंट' }).map((c) => c.slug)).toEqual(['chartered-accountant']);
    expect(projectForFamily([{ reviewState: 'pending', reviewDue: '2027-11-15' }], TODAY)).toEqual([]);
  });
});

describe('career words', () => {
  it('has the same English and Hindi keys', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('fam.career.') || k.startsWith('control.careers.') || k === 'control.content.careersLink');
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect(hi[k as keyof typeof hi], k).toBeTruthy();
  });

  it('keeps the test fixture out of the family dataset', () => {
    const files = readdirSync('data/careers');
    for (const f of files) {
      const text = readFileSync(`data/careers/${f}`, 'utf8');
      expect(text.includes('example.invalid')).toBe(false);
      expect(text.includes('TEST ·')).toBe(false);
    }
  });
});
