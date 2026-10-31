import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HabitCard } from '@/components/family/HabitCard';
import { PlanCard } from '@/components/family/PlanCard';
import { secondColor, toneColor } from '@/components/family/blocks/InteractiveViews';
import { SUBJECT_IDS } from '@/lib/family/subjects';
import type { ChildHabit } from '@/lib/family/habit';
import type { DayPlan } from '@/lib/family/plan';

// F2 on D1 (C230-Q; docs/family-app/prompts/F2_HANDOVER.md item 3): every M2 screen draws on D1's layer. These files
// may not go back to the old flat card (`rounded-3xl bg-white … shadow-sm ring-1 ring-slate/10`) or to a device emoji
// or symbol character as an icon (they look different on every phone); a page pulled up under a band is `relative`, a
// scrolling row is `relative`, and a button that can be disabled looks disabled.
const ROOT = path.resolve(__dirname, '../..');
const FILES = [
  'src/components/family/PlanCard.tsx',
  'src/components/family/HabitCard.tsx',
  'src/components/family/HabitParent.tsx',
  'src/components/family/HomeworkHelper.tsx',
  'src/components/family/WorksheetScreen.tsx',
  'src/components/family/VideoPicks.tsx',
  'src/components/family/ParentArea.tsx',
  'src/components/family/VoiceInput.tsx',
  'src/components/family/blocks/InteractiveViews.tsx',
  'src/components/family/offline/PackButton.tsx',
  'src/components/family/offline/OfflineShelf.tsx',
  'src/components/family/offline/DataSaverSwitch.tsx',
  'src/app/(family)/family/offline/page.tsx',
  'src/app/(family)/family/(app)/study/homework/page.tsx',
  'src/app/(family)/family/(app)/study/worksheet/[topic]/page.tsx',
  'src/app/(family)/family/(app)/parent/worksheet/[topic]/page.tsx',
];
// The files that draw a card of their own (the others sit inside one).
const CARDS = FILES.filter((f) => !/HabitParent|VoiceInput|InteractiveViews|PackButton|parent\/worksheet/.test(f));
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
// Code only: comments may name what they replaced.
const code = (f: string) => read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const classStrings = (src: string) => [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)].map((m) => m[1] ?? m[2] ?? m[3]);

describe('the M2 screens on D1', () => {
  it('never draws the old flat card', () => {
    for (const f of FILES) {
      const src = code(f);
      expect(src, f).not.toMatch(/rounded-3xl bg-white/);
      for (const line of src.split('\n')) expect(/shadow-sm/.test(line) && /ring-slate\/10/.test(line), `${f}: ${line.trim()}`).toBe(false);
    }
  });

  it('draws its cards with fam-card', () => {
    for (const f of CARDS) expect(code(f), f).toContain('fam-card');
  });

  it('uses no device emoji or symbol character as an icon', () => {
    for (const f of FILES) {
      const src = code(f);
      expect(src.match(/\p{Extended_Pictographic}/gu), f).toBeNull();
      expect(src.match(/[✓✔★☆▶►◀←→↑↓]/g), f).toBeNull();
    }
  });

  it('keeps a page pulled up under its band, and every scrolling row, relative', () => {
    for (const f of FILES) {
      for (const cls of classStrings(code(f))) {
        if (/(^|\s)-mt-\d/.test(cls) || /overflow-x-auto/.test(cls)) expect(cls.split(/\s+/), `${f}: ${cls}`).toContain('relative');
      }
    }
  });

  it('makes a button that can be disabled look disabled', () => {
    let seen = 0;
    for (const f of FILES) {
      // A class kept in a constant (`className={CTA}`) is read from the constant.
      let src = code(f);
      for (const [, name, value] of src.matchAll(/const ([A-Z][A-Z_]*) =\s*'([^']*)'/g)) src = src.split(`className={${name}}`).join(`className="${value}"`);
      for (const b of src.split('<button').slice(1).map((x) => x.split('</button>')[0])) {
        if (!/\bdisabled=\{/.test(b)) continue;
        seen++;
        expect(b, `${f}: <button${b.slice(0, 120)}`).toContain('disabled:opacity-60');
        expect(b, `${f}: <button${b.slice(0, 120)}`).toContain('disabled:cursor-not-allowed');
      }
    }
    expect(seen).toBeGreaterThanOrEqual(6);
  });
});

// The colours chosen at run time, which scripts/check_contrast.py cannot read (F2_HANDOVER "HOW TO AVOID" 5).
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe('the drawings take their subject colour (InteractiveViews)', () => {
  it('draws every subject in a colour that stands out on the white card, at AA', () => {
    for (const s of SUBJECT_IDS) {
      expect(toneColor(s), s).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(onWhite(toneColor(s)), s).toBeGreaterThanOrEqual(4.5);
      expect(onWhite(secondColor(s)), s).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('never gives the second colour the subject colour itself', () => {
    for (const s of SUBJECT_IDS) expect(secondColor(s), s).not.toBe(toneColor(s));
  });

  it('keeps the colours mathematics and science had before', () => {
    expect(toneColor('mathematics').toUpperCase()).toBe('#0369A1');
    expect(toneColor('science').toUpperCase()).toBe('#0F766E');
  });
});

describe('PlanCard and HabitCard on D1', () => {
  const plan: DayPlan = {
    day: '2026-10-22',
    minutes: 21,
    complete: false,
    items: [
      { kind: 'revisit', topicKey: 'cbse.c9.mathematics.u1.ch01.t01', subject: 'mathematics', minutes: 5, title: 'Rational numbers', done: true, isTopic: true },
      { kind: 'weak', topicKey: 'cbse.c9.science.u1.ch01.t01', subject: 'science', minutes: 6, title: 'Matter', done: false, isTopic: true },
      { kind: 'next', topicKey: 'cbse.c9.hindi.u1.ch01', subject: 'hindi', minutes: 10, title: 'दो बैलों की कथा', done: false, isTopic: false },
    ],
  };

  it('shows the day as a ring with its words, and each item in its subject colour on a solid background', () => {
    const html = renderToStaticMarkup(h(PlanCard, { plan, lang: 'en' }));
    expect(html).toContain('fam-card');
    expect(html).toContain('stroke-dasharray');
    expect(html).toContain('1 of 3 done');
    for (const s of ['bg-lesson-sky-deep', 'bg-lesson-mint-deep', 'bg-lesson-blush-deep']) expect(html).toContain(s);
    expect(html).not.toMatch(/bg-gradient|\bfrom-/);
  });

  it('says the progress in Hindi on a Hindi screen', () => {
    expect(renderToStaticMarkup(h(PlanCard, { plan, lang: 'hi' }))).toContain('3 में से 1 हो गए');
  });

  it('draws the week with drawn ticks and the badges with drawn stars', () => {
    const habit: ChildHabit = { goal: 4, week: [true, false, true, true, false, false, true], doneDays: 4, badges: [{ topicKey: 'cbse.c9.mathematics.u1.ch01.t02', title: 'Irrational numbers', masteredOn: '2026-10-20' }], jar: null };
    const html = renderToStaticMarkup(h(HabitCard, { habit, lang: 'en' }));
    expect(html.match(/data-day-done="true"/g)).toHaveLength(4);
    expect(html).toContain('stroke-dasharray');
    expect(html).not.toMatch(/[✓★]/);
    expect(html.match(/fam-card/g)).toHaveLength(2);
  });
});
