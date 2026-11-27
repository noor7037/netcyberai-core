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
  it('keeps aria-current and every tab’s name, on an ink dock with 56 px tabs', async () => {
    const { FamilyTabs } = await import('@/components/family/FamilyTabs');
    const html = renderToStaticMarkup(h(FamilyTabs, { tabs: ['home', 'study', 'english', 'future'], navLabel: 'Main menu', labels: { home: 'Home', study: 'Study', english: 'English', tech: 'Tech Lab', draw: 'Draw', future: 'Future' } }));
    expect(html).toContain('bg-ink');
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/family"|href="\/family"[^>]*aria-current="page"/);
    for (const name of ['Home', 'Study', 'English', 'Future']) expect(html).toContain(`>${name}<`);
    expect(html.match(/class="fam-press fam-tab"/g)?.length).toBe(4);
    const css = readFileSync(path.join(ROOT, 'src/app/(family)/family/family.css'), 'utf8');
    expect(css).toMatch(/\.fam-tab \{[^}]*min-height: 56px/);
  });

  // 17 Nov 2026 (founder): edge to edge on a phone, every name always shown, each tab its own logo colour.
  it('is edge to edge on a phone, a centred column on a wide screen, and shows every name, each tab in its own colour', async () => {
    const { FamilyTabs, TAB_TONE } = await import('@/components/family/FamilyTabs');
    const labels = { home: 'Home', study: 'Study', english: 'English', tech: 'Tech Lab', draw: 'Draw', future: 'Future' };
    const html = renderToStaticMarkup(h(FamilyTabs, { tabs: ['home', 'study', 'english', 'tech', 'draw', 'future'], navLabel: 'Main menu', labels }));
    expect(html).not.toContain('sr-only');
    expect(html.match(/data-tab-label/g)?.length).toBe(6);
    expect(html).toMatch(/<nav[^>]*class="fixed inset-x-0 bottom-0[^"]*"/);
    expect(html).toMatch(/class="fam-dock mx-auto flex w-full[^"]*pb-\[calc\(var\(--fam-bottom,0px\)[^"]*lg:max-w-\[68rem\]/);
    // Five distinct colours, all logo tokens (tailwind.config.ts maps them to design-tokens.ts).
    const tones = Object.values(TAB_TONE).map((t) => t.text);
    expect(new Set(tones).size).toBe(6);
    for (const [tab, t] of Object.entries(TAB_TONE)) expect(html, tab).toContain(t.text);
    // The open tab (Home here: /family/progress) has its icon on its colour's disc.
    expect(html).toContain(`fam-tab-ico ${TAB_TONE.home.disc} text-ink`);
  });

  it('every tab colour clears 4.5:1 on the ink dock, and ink clears it on each colour', async () => {
    const { TAB_TONE } = await import('@/components/family/FamilyTabs');
    const { colors, lessonColors } = await import('@/lib/design-tokens');
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    for (const t of Object.values(TAB_TONE)) {
      const name = t.text.replace('text-', '') as keyof typeof colors;
      expect(colors[name], name).toBeTruthy();
      expect(ratio(colors[name], lessonColors.ink), name).toBeGreaterThanOrEqual(4.5);
    }
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
