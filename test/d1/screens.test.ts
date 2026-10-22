import fs from 'fs';
import path from 'path';
import emojiRegex from 'emoji-regex';
import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// D1-3 (C295): subject colours on every family screen from the one map, designed empty states in both languages, a
// skeleton wherever the phone waits, and pictures only through Picture/Pic (render-free checks of the source).

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const files = (d: string): string[] =>
  fs.readdirSync(path.join(ROOT, d)).flatMap((f) => {
    const p = path.join(d, f);
    return fs.statSync(path.join(ROOT, p)).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
const FAMILY = [...files('src/components/family'), ...files('src/app/(family)')];
// The home is D1-2's slice; the English course keeps its own track colours (docs/family-app/12).
const SUBJECT_SCREENS = FAMILY.filter((f) => !f.includes('/english/'));

describe('D1-3 subject colours on every screen', () => {
  it('has no two-subject tone table left', () => {
    for (const f of FAMILY) expect(read(f), f).not.toMatch(/SUBJECT_TONE/);
  });

  it('never picks a subject colour by hand (science ? emerald : royal)', () => {
    for (const f of SUBJECT_SCREENS) expect(read(f), f).not.toMatch(/(subject|tone|\bs)\s*===\s*'(science|evs|biology)'\s*\?/);
  });

  it('draws each screen’s subject surfaces from subjectColour', () => {
    const uses = [
      'src/app/(family)/family/(app)/study/page.tsx',
      'src/components/family/SubPageHeader.tsx',
      'src/components/family/blocks/BlockViews.tsx',
      'src/components/family/blocks/QuizView.tsx',
      'src/components/family/blocks/InteractiveViews.tsx',
      'src/components/family/HomeworkHelper.tsx',
      'src/components/family/VideoPicks.tsx',
      'src/components/family/offline/OfflineShelf.tsx',
      'src/components/family/ParentArea.tsx',
    ];
    for (const f of uses) expect(read(f), f).toMatch(/import \{[^}]*subjectColour[^}]*\} from '@\/lib\/family\/subject-colours'/);
    for (const p of ['understand/page.tsx', 'study/worksheet/[topic]/page.tsx']) expect(read(`src/app/(family)/family/(app)/${p}`), p).toMatch(/subject=\{line\.subject\}/);
  });

  it('writes no raw hex colour in a family screen', () => {
    for (const f of SUBJECT_SCREENS) expect(read(f).replace(/\/\/.*$/gm, ''), f).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
  });
});

describe('D1-3 empty and loading states', () => {
  const d13 = Object.keys(en).filter((k) => k.startsWith('fam.d13.'));

  it('has every new word in English and Hindi', () => {
    expect(d13.length).toBeGreaterThan(15);
    for (const k of d13) {
      expect((hi as Record<string, string>)[k], k).toBeTruthy();
      expect((hi as Record<string, string>)[k], k).not.toBe((en as Record<string, string>)[k]);
    }
  });

  it('designs each empty state with EmptyState or a picture', () => {
    const designed: [string, RegExp][] = [
      ['src/app/(family)/family/(app)/study/page.tsx', /fam\.d13\.study\.noCatalogTitle[\s\S]*fam\.d13\.study\.prePrimaryTitle|fam\.d13\.study\.prePrimaryTitle/],
      ['src/app/(family)/family/(app)/study/worksheet/[topic]/page.tsx', /<EmptyState/],
      ['src/components/family/offline/OfflineShelf.tsx', /<EmptyState[^>]*fam\.d13\.offline\.noneTitle/],
      ['src/components/family/ParentArea.tsx', /fam\.d13\.parent\.noChildrenTitle/],
      ['src/components/family/UnderstandView.tsx', /fam\.d13\.understand\.refusedTitle/],
      ['src/components/family/HomeworkHelper.tsx', /fam\.d13\.homework\.refusedTitle/],
      ['src/components/family/english/EnglishCourse.tsx', /fam\.d13\.english\.consentTitle[\s\S]*fam\.d13\.english\.offTitle/],
    ];
    for (const [f, re] of designed) expect(read(f), f).toMatch(re);
  });

  it('shows a Skeleton, never a bare pulse, where the phone waits', () => {
    for (const f of ['src/components/family/UnderstandView.tsx', 'src/components/family/HomeworkHelper.tsx', 'src/components/family/english/LessonPlayer.tsx', 'src/components/family/english/EnglishReport.tsx', 'src/components/family/english/EnglishCourse.tsx']) {
      expect(read(f), f).toMatch(/<Skeleton /);
      expect(read(f), f).not.toMatch(/h-\d+ animate-pulse rounded-3xl/);
    }
    for (const d of ['understand', 'study/worksheet/[topic]', 'english/lesson/[key]', 'parent/english/[childId]']) expect(read(`src/app/(family)/family/(app)/${d}/loading.tsx`)).toMatch(/<Skeleton /);
  });
});

describe('pictures only through Picture/Pic', () => {
  it('writes no emoji as text on a family screen', () => {
    // An emoji may appear only as a picture's name: e="…", pic="…", a quoted string handed to a picture, or a comment.
    const bad: string[] = [];
    for (const f of FAMILY) {
      const src = read(f)
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/'[^'\n]*'|"[^"\n]*"/g, '');
      for (const m of src.matchAll(emojiRegex())) if (!/^[©®™↗→←▶·—–…“”]$/u.test(m[0])) bad.push(`${f}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});
