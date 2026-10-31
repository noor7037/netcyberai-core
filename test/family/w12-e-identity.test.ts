import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, familyButtonVariants } from '@/components/family/ui/Button';
import { SubjectGrid } from '@/components/family/ui/SubjectGrid';
import { lessonColors, lessonTints } from '@/lib/design-tokens';
import { PALETTE, SUBJECT_THEME, subjectTheme, type PaletteName } from '@/lib/family/subject-theme';
import { SUBJECT_IDS } from '@/lib/family/subjects';
import tailwind from '../../tailwind.config';

// W12-E (C419): the last dark blue in the Family app. The subject colours and the shared button come from the lesson
// identity (paper, ink, saffron, teal, plum and the five tints). No class, token or gradient of the old blues is left
// under the Family tree, every subject tile pair holds AA, and the button variants render. Made-up content only.

const ROOT = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}
const FAMILY_FILES = [...walk(path.join(ROOT, 'src/components/family')), ...walk(path.join(ROOT, 'src/app/(family)'))];
// Code lines only: a comment may name the old colours to say they are gone.
const codeLines = (file: string) => readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));

// The repository's one contrast helper, as the checker itself calls it.
function ratios(pairs: [string, string][]): number[] {
  const code = 'import json, sys\nsys.path.insert(0, "scripts")\nfrom check_contrast import contrast_ratio\nprint(json.dumps([contrast_ratio(a, b) for a, b in json.loads(sys.argv[1])]))';
  return JSON.parse(execFileSync('python3', ['-c', code, JSON.stringify(pairs)], { cwd: ROOT, encoding: 'utf8' })) as number[];
}

// A class from the theme to the colour it paints, over a white card.
const TINT_OF = Object.fromEntries(Object.entries(lessonTints).map(([k, v]) => [k, v])) as Record<string, { tint: string; accent: string }>;
function hexOf(cls: string): string {
  const m = /^(?:bg|text)-(.+)$/.exec(cls);
  if (!m) throw new Error(`not a colour class: ${cls}`);
  const name = m[1];
  if (name === 'ink') return lessonColors.ink;
  if (name === 'white') return '#FFFFFF';
  if (name === 'saffron') return lessonColors.saffron;
  if (name === 'saffron-deep') return lessonColors.saffronDeep;
  if (name === 'saffron/10') return blend(lessonColors.saffron, '#FFFFFF', 0.1);
  const lesson = /^lesson-(mint|butter|lilac|blush|sky)(-deep)?$/.exec(name);
  if (lesson) return lesson[2] ? TINT_OF[lesson[1]].accent : TINT_OF[lesson[1]].tint;
  throw new Error(`unknown colour: ${cls}`);
}
function blend(top: string, under: string, alpha: number): string {
  const c = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const px = [0, 1, 2].map((i) => Math.round(c(top, i) * alpha + c(under, i) * (1 - alpha)));
  return `#${px.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
const split = (s: string) => s.split(/\s+/).filter(Boolean);
const bgOf = (s: string) => split(s).find((c) => c.startsWith('bg-'))!;
const textOf = (s: string) => split(s).find((c) => c.startsWith('text-'))!;

describe('no dark blue under the Family tree', () => {
  it('has no royal, midnight or violet class, token or hex in any code line', () => {
    const hits: string[] = [];
    for (const file of FAMILY_FILES) {
      for (const line of codeLines(file)) if (/royal|midnight|violet/i.test(line)) hits.push(`${path.relative(ROOT, file)}: ${line.trim().slice(0, 100)}`);
    }
    expect(hits).toEqual([]);
  });

  it('has no sapphire or electric blue class either', () => {
    const hits: string[] = [];
    for (const file of FAMILY_FILES.filter((f) => /\.tsx?$/.test(f))) {
      for (const line of codeLines(file)) if (/\b(?:bg|text|border|ring|from|to|via|outline|accent|stroke|fill)-(?:sapphire|electric)\b/.test(line)) hits.push(`${path.relative(ROOT, file)}: ${line.trim().slice(0, 100)}`);
    }
    expect(hits).toEqual([]);
  });

  it('uses the shared product Button nowhere in the Family tree (its sapphire is for the school and Control screens)', () => {
    const hits = FAMILY_FILES.filter((f) => /\.tsx?$/.test(f) && readFileSync(f, 'utf8').includes("@/components/ui/Button"));
    expect(hits.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe('the subject colours', () => {
  it('draw every subject from the six identity palettes, with no gradient', () => {
    for (const s of SUBJECT_IDS) {
      const t = SUBJECT_THEME[s];
      expect(Object.values(PALETTE).some((p) => p.tile === t.tile && p.chip === t.chip), s).toBe(true);
      for (const cls of [t.tile, t.chip, t.soft, t.ink]) expect(cls, s).not.toMatch(/gradient|\bfrom-|\bto-|\bvia-|royal|midnight|violet/);
    }
  });

  it('keeps one stable colour per subject, and Mathematics is a light sky, not dark blue', () => {
    const want: Record<string, PaletteName> = { mathematics: 'sky', science: 'mint', social_science: 'butter', english: 'lilac', hindi: 'blush', sanskrit: 'saffron', evs: 'mint', physics: 'saffron', chemistry: 'blush', biology: 'mint' };
    for (const [s, p] of Object.entries(want)) expect(subjectTheme(s).tile, s).toBe(PALETTE[p].tile);
    expect(subjectTheme('mathematics').hex).toBe(lessonTints.sky.accent);
    expect(subjectTheme('mathematics').tile).toBe('bg-lesson-sky text-ink');
  });

  it('gives the subjects of a class studied together (class 9 and 10) six different colours', () => {
    const tiles = ['mathematics', 'science', 'social_science', 'english', 'hindi', 'sanskrit'].map((s) => subjectTheme(s).tile);
    expect(new Set(tiles).size).toBe(6);
  });

  it('holds AA on every tile pair, chip pair and coloured text, on white and on its tint', () => {
    const pairs: [string, string][] = [];
    const labels: string[] = [];
    for (const [s, t] of Object.entries(SUBJECT_THEME)) {
      pairs.push([hexOf(textOf(t.tile)), hexOf(bgOf(t.tile))]);
      labels.push(`${s} tile ${t.tile}`);
      pairs.push([hexOf(textOf(t.chip)), hexOf(bgOf(t.chip))]);
      labels.push(`${s} chip ${t.chip}`);
      pairs.push([hexOf(t.ink), '#FFFFFF']);
      labels.push(`${s} ink on white ${t.ink}`);
      pairs.push([hexOf(t.ink), hexOf(t.soft)]);
      labels.push(`${s} ink on soft ${t.ink} ${t.soft}`);
      pairs.push([hexOf('text-ink'), hexOf(t.soft)]);
      labels.push(`${s} text on soft ${t.soft}`);
      pairs.push([t.hex, '#FFFFFF']);
      labels.push(`${s} drawing colour ${t.hex} on white`);
    }
    const got = ratios(pairs);
    got.forEach((r, i) => expect(r, labels[i]).toBeGreaterThanOrEqual(4.5));
  });

  it('shows the same colour on the Home tile as the theme says', () => {
    const words = { free: 'Free', locked: 'Locked', start: 'Start here', meter: (c: number, m: number) => `${c} checked, ${m} mastered` };
    const tiles = SUBJECT_IDS.map((s) => ({ subject: s, name: s, open: true, free: false, checked: 0, mastered: 0 }));
    const html = renderToStaticMarkup(h(SubjectGrid, { title: 'Your subjects', words, tiles }));
    for (const s of SUBJECT_IDS) {
      const a = new RegExp(`<a class="([^"]*)" href="/family/study\\?subject=${s}"`).exec(html);
      expect(a?.[1], s).toContain(SUBJECT_THEME[s].tile);
    }
    expect(html).not.toMatch(/bg-gradient|\bfrom-|text-white">(Mathematics|mathematics)/);
  });

  it('is in the Tailwind config, so the classes exist', () => {
    const lesson = (tailwind.theme?.extend?.colors as Record<string, Record<string, string>>).lesson;
    for (const [name, v] of Object.entries(lessonTints)) {
      expect(lesson[name]).toBe(v.tint);
      expect(lesson[`${name}-deep`]).toBe(v.accent);
    }
  });
});

describe('the Family button', () => {
  it('is saffron with ink text for the primary and secondary, an ink outline on paper for the outline', () => {
    expect(familyButtonVariants.primary).toBe('bg-saffron text-ink hover:bg-saffron/90');
    expect(familyButtonVariants.secondary).toBe(familyButtonVariants.primary);
    expect(familyButtonVariants.outline).toContain('border-ink');
    expect(familyButtonVariants.outline).toContain('bg-paper');
    expect(familyButtonVariants.outline).toContain('text-ink');
  });

  it('renders every variant at 44 px with the press, and no navy', () => {
    for (const variant of ['primary', 'secondary', 'outline'] as const) {
      const html = renderToStaticMarkup(h(Button, { variant }, 'Set the jar'));
      expect(html, variant).toContain('min-h-[44px]');
      expect(html, variant).toContain('fam-press');
      expect(html, variant).toContain('Set the jar');
      expect(html, variant).not.toMatch(/sapphire|royal|midnight|violet|gradient/);
    }
    expect(renderToStaticMarkup(h(Button, {}, 'Go'))).toContain('bg-saffron');
    expect(renderToStaticMarkup(h(Button, { variant: 'outline' }, 'Go'))).toContain('border-2 border-ink');
  });

  it('renders a link as an anchor and keeps a disabled button faded', () => {
    expect(renderToStaticMarkup(h(Button, { href: '/family/parent' }, 'Open'))).toMatch(/^<a [^>]*href="\/family\/parent"/);
    expect(renderToStaticMarkup(h(Button, { disabled: true }, 'Wait'))).toContain('disabled');
    expect(renderToStaticMarkup(h(Button, {}, 'x'))).toContain('disabled:opacity-60');
  });

  it('holds AA for ink on saffron and ink on paper', () => {
    const [a, b] = ratios([
      [lessonColors.ink, lessonColors.saffron],
      [lessonColors.ink, lessonColors.paper],
    ]);
    expect(a).toBeGreaterThanOrEqual(4.5);
    expect(b).toBeGreaterThanOrEqual(4.5);
  });
});
