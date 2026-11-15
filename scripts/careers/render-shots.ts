// Renders phone-width HTML for the Career Hub screenshots. No database and no network.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoadmapView } from '../../src/components/family/careers/RoadmapView';
import { buildBundle } from '../../src/lib/family/careers/catalog';
import { STREAM_KEY, LEVEL_KEY } from '../../src/lib/family/careers/labels';
import { buildLanes } from '../../src/lib/family/careers/lanes';
import { expandCareer } from '../../src/lib/family/careers/seed-build';
import type { CareerCard, CrossPath, Roadmap } from '../../src/lib/family/careers/types';
import { t, type Lang } from '../../src/lib/i18n';

const out = 'docs/screenshots/career/html';
mkdirSync(out, { recursive: true });

const css = `
  body { margin: 0; background: #FBF8F3; color: #1C1B1A; font-family: system-ui, sans-serif; }
  main, article { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .card, .fam-card, li a, section { background: #fff; border-radius: 16px; padding: 12px; }
  h2, h3 { margin: 0 0 6px; font-size: 16px; }
  p, li { font-size: 14px; line-height: 1.4; }
  .muted, .text-slate { color: #5c564e; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { border: 1px solid #E7E1D6; border-radius: 999px; padding: 10px 14px; font-weight: 700; font-size: 14px; background: #fff; }
  [data-cross] { border: 1px dashed #1C1B1A; }
  details { background: #fff; border-radius: 16px; padding: 8px 12px; }
  [data-mindmap] { display: none; }
  svg { display: none; }
`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=390"><title>${title}</title><style>${css}</style></head><body>${body}</body></html>`;
}

const bundle = buildBundle();
const career = bundle.careers.find((c) => c.slug === 'junior-web-developer')!;
const expanded = expandCareer(career);
const card: CareerCard = {
  slug: career.slug,
  fieldId: career.field,
  fieldName: { en: 'Information technology', hi: 'सूचना प्रौद्योगिकी' },
  level: career.level,
  title: { en: career.title[0], hi: career.title[1] },
  summary: { en: career.summary[0], hi: career.summary[1] },
  streams: career.streams,
  minLevel: career.min,
  govGroup: career.gov ?? null,
  isco: career.isco ?? null,
  onet: career.onet ?? null,
  nco: career.nco ?? null,
  officialUrl: career.url ?? null,
  horizon: career.horizon ? { en: career.horizon[0], hi: career.horizon[1] } : null,
  compete: { en: expanded.compete[0], hi: expanded.compete[1] },
};
const lanes = buildLanes({
  steps: expanded.steps.map((s) => ({
    key: s.key, lane: s.lane, sort: s.sort, requirement: { en: s.en, hi: s.hi },
    examName: s.examEn ? { en: s.examEn, hi: s.examHi ?? '' } : null,
    futureSeriesKey: s.series ?? null, officialUrl: s.url ?? null,
  })),
  actions: expanded.actions.map((a) => ({
    key: a.key, stage: a.stage, type: a.type, title: { en: a.title[0], hi: a.title[1] },
    detail: { en: a.detail[0], hi: a.detail[1] }, effort: a.effort, cost: a.cost, officialUrl: a.url ?? null,
  })),
  laterals: [],
});
const cross: CrossPath = {
  key: 'arts-to-computing',
  via: { en: bundle.crosses[0]!.via[0], hi: bundle.crosses[0]!.via[1] },
  conditions: { en: bundle.crosses[0]!.conditions[0], hi: bundle.crosses[0]!.conditions[1] },
  streams: bundle.crosses[0]!.streams,
  toSlugs: bundle.crosses[0]!.toSlugs,
  anyGraduate: false,
  officialUrl: bundle.crosses[0]!.url ?? null,
};
const map: Roadmap = { career: card, lanes, crosses: [cross] };

function list(lang: Lang): string {
  const shown = bundle.careers.filter((c) => c.field === 'information_technology').slice(0, 8);
  const items = shown.map((c) => `<li><a><strong>${lang === 'hi' ? c.title[1] : c.title[0]}</strong><div class="muted">${t(lang, LEVEL_KEY[c.level])}</div></a></li>`).join('');
  return page('list', `<main><h2>${t(lang, 'fam.career.fields')}</h2><ul>${items}</ul><p class="muted">${t(lang, 'fam.career.guidanceNote')}</p></main>`);
}

function stream(lang: Lang): string {
  const chips = (Object.keys(STREAM_KEY) as (keyof typeof STREAM_KEY)[]).map((id) => `<span class="chip">${t(lang, STREAM_KEY[id])}</span>`).join('');
  return page('stream', `<main><section class="card"><h2>${t(lang, 'fam.career.opensNowTitle')}</h2><p>${t(lang, 'fam.career.opensStream')}</p><p class="muted">${t(lang, 'fam.career.guidanceNote')}</p></section><h2>${t(lang, 'fam.career.chooseStream')}</h2><div class="chips">${chips}</div></main>`);
}

for (const lang of ['en', 'hi'] as const) {
  writeFileSync(`${out}/${lang}-stream.html`, stream(lang));
  writeFileSync(`${out}/${lang}-list.html`, list(lang));
  const road = renderToStaticMarkup(createElement(RoadmapView, { roadmap: map, lang, openLane: 'entrance' }));
  writeFileSync(`${out}/${lang}-roadmap.html`, page('roadmap', road));
}
console.log('wrote html');
