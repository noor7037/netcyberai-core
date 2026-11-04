import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActivityTiles } from '@/components/family/home/ActivityTiles';
import { MissionCard, type MissionWords } from '@/components/family/home/MissionCard';
import { Mascot } from '@/components/family/mascot/Mascot';
import { AverageBar, StatTiles } from '@/components/family/progress/ProgressParts';
import type { DayPlan } from '@/lib/family/plan';
import { progressStats, weekBars, weekDays } from '@/lib/family/progress-view';

vi.mock('next/navigation', () => ({ usePathname: () => '/family/progress' }));

// W19-C: the Family app's new look on real data. The progress maths (pure), the home's mission and activity tiles and
// the Progress screen's parts rendered from fixture data, the dock, and the mascot's size. Every name is made up.
const ROOT = path.resolve(__dirname, '../..');

describe('the progress maths', () => {
  it('counts topics checked and mastered, and gives no average before the first checked topic', () => {
    expect(progressStats([], 2)).toEqual({ subjects: 2, checked: 0, mastered: 0, average: null });
    expect(progressStats([{ mastered: true }, { mastered: false }, { mastered: false }], 1)).toEqual({ subjects: 1, checked: 3, mastered: 1, average: 33 });
    expect(progressStats([{ mastered: true }, { mastered: true }], 3).average).toBe(100);
  });

  it('lays the last seven India days out oldest first, today last, a day without answers as 0', () => {
    const days = weekDays('2026-11-04', [{ day: '2026-11-04', n: 6 }, { day: '2026-10-30', n: 3 }, { day: '2026-10-20', n: 9 }]);
    expect(days.map((d) => d.day)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    expect(days.map((d) => d.n)).toEqual([0, 3, 0, 0, 0, 0, 6]);
    const bars = weekBars(days, '2026-11-04');
    expect(bars.map((b) => b.share)).toEqual([0, 0.5, 0, 0, 0, 0, 1]);
    expect(bars.filter((b) => b.today).map((b) => b.day)).toEqual(['2026-11-04']);
    expect(weekBars(weekDays('2026-11-04', []), '2026-11-04').every((b) => b.share === 0)).toBe(true);
  });
});

const words: MissionWords = { title: "Today's mission", start: 'Start', next: (t) => `Next: ${t}`, progress: '1 of 2 done', minutes: 'About 15 minutes', complete: 'All done', emptyLead: 'Pick a subject.', study: 'Start studying', done: 'Done', todo: 'To do' };
const plan = (done: boolean[]): DayPlan => ({
  day: '2026-11-04',
  minutes: 15,
  complete: done.length > 0 && done.every(Boolean),
  items: done.map((d, i) => ({ kind: 'next', topicKey: `cbse.c6.science.ch01.t0${i + 1}`, subject: 'science', minutes: 10, title: `Magnet topic ${i + 1}`, done: d, isTopic: true })),
});

describe('the home on fixture data', () => {
  it('shows the next topic of today’s plan with a Start that opens it', () => {
    const html = renderToStaticMarkup(h(MissionCard, { plan: plan([true, false]), words }));
    expect(html).toContain('data-family-mission');
    expect(html).toContain('Magnet topic 2');
    expect(html).toContain('1 of 2 done');
    expect(html).toMatch(/data-mission-start[^>]*|href="\/family\/understand\?kind=topic&amp;key=cbse\.c6\.science\.ch01\.t02"/);
    expect(html).toContain('width:50%');
    expect(html).not.toContain('data-plan-empty');
  });

  it('says the plan is done when every item is, and shows the mascot with one way in when it is empty', () => {
    const done = renderToStaticMarkup(h(MissionCard, { plan: plan([true, true]), words }));
    expect(done).toContain('data-plan-complete');
    expect(done).not.toContain('data-mission-start');
    const empty = renderToStaticMarkup(h(MissionCard, { plan: plan([]), words }));
    expect(empty).toContain('data-plan-empty');
    expect(empty).toContain('data-mascot');
    expect(empty).toContain('href="/family/study"');
  });

  it('draws the activity tiles with the numbers given, each opening Progress', () => {
    const html = renderToStaticMarkup(h(ActivityTiles, { title: 'Your activity', seeAll: 'See all', open: 'Open your progress', tiles: [{ key: 'checked', title: 'Topics', value: 12, label: 'topics checked' }, { key: 'days', title: 'This week', value: 3, label: 'days with the plan done' }] }));
    expect(html).toContain('>12<');
    expect(html).toContain('>3<');
    expect(html.match(/href="\/family\/progress"/g)?.length).toBe(3);
    expect(renderToStaticMarkup(h(ActivityTiles, { title: 'x', seeAll: 'y', open: 'z', tiles: [] }))).toBe('');
  });
});

describe('the Progress screen’s parts', () => {
  it('draws the three stat tiles and the average with its number, or the words before the first topic', () => {
    const tiles = renderToStaticMarkup(h(StatTiles, { tiles: [{ key: 'subjects', label: 'Subjects open', value: 2 }, { key: 'checked', label: 'Topics checked', value: 9 }, { key: 'mastered', label: 'Topics mastered', value: 4 }] }));
    expect(tiles.match(/data-stat=/g)?.length).toBe(3);
    expect(tiles).toContain('>9<');
    const bar = renderToStaticMarkup(h(AverageBar, { title: 'Average progress', value: 44, label: 'Average progress: 44%', note: 'Mastered out of checked.', none: 'Nothing yet.' }));
    expect(bar).toContain('44%');
    expect(bar).toContain('Mastered out of checked.');
    const none = renderToStaticMarkup(h(AverageBar, { title: 'Average progress', value: null, label: '', note: 'n', none: 'Nothing yet.' }));
    expect(none).toContain('Nothing yet.');
    expect(none).not.toContain('%');
  });
});

describe('the dock and the mascot', () => {
  it('keeps aria-current and every tab’s name, on an ink pill with 56 px tabs', async () => {
    const { FamilyTabs } = await import('@/components/family/FamilyTabs');
    const html = renderToStaticMarkup(h(FamilyTabs, { tabs: ['home', 'study', 'english', 'future'], navLabel: 'Main menu', labels: { home: 'Home', study: 'Study', english: 'English', future: 'Future' } }));
    expect(html).toContain('bg-ink');
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/family"|href="\/family"[^>]*aria-current="page"/);
    for (const name of ['Home', 'Study', 'English', 'Future']) expect(html).toContain(`>${name}<`);
    expect(html.match(/class="fam-press fam-tab"/g)?.length).toBe(4);
    const css = readFileSync(path.join(ROOT, 'src/app/(family)/family/family.css'), 'utf8');
    expect(css).toMatch(/\.fam-tab \{[^}]*min-height: 56px/);
  });

  it('draws the mascot in under 8 kB with the logo tokens only (no hex of its own)', () => {
    const svg = renderToStaticMarkup(h(Mascot, {}));
    expect(svg.length).toBeLessThan(8 * 1024);
    const src = readFileSync(path.join(ROOT, 'src/components/family/mascot/Mascot.tsx'), 'utf8');
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    for (const f of ['src/components/family/home/art.tsx', 'src/components/family/home/ActivityTiles.tsx', 'src/components/family/home/MissionCard.tsx', 'src/components/family/progress/ProgressParts.tsx', 'src/components/family/progress/WeekChart.tsx'])
      expect(readFileSync(path.join(ROOT, f), 'utf8').match(/#[0-9a-fA-F]{6}\b/g), f).toBeNull();
  });
});
