import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LESSON_TINT_OF, lessonColors, lessonShape, lessonTints, lessonType, type LessonTint } from '@/lib/design-tokens';
import { DirectAnswer, ExplanationView } from '@/components/family/blocks/BlockViews';
import { TutorAvatar } from '@/components/family/TutorAvatar';
import { UnderstandView } from '@/components/family/UnderstandView';
import type { ResolverEvent } from '@/lib/family/resolver';
import type { Explanation } from '@/lib/family/blocks';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// W10-3 (C412): the lesson identity on the Understand page. The tokens exist and match the stylesheet, every tint and
// accent holds its contrast (by scripts/check_contrast.py's own contrast_ratio), the direct answer comes from the
// explanation and leads the page, and nothing moves under prefers-reduced-motion. Made-up content only.

const ROOT = path.resolve(__dirname, '../..');
const CSS = readFileSync(path.join(ROOT, 'src/app/(family)/family/family.css'), 'utf8');
const LESSON_CSS = CSS.slice(CSS.indexOf('the lesson identity (W10-3, C412)'));
const TINTS = Object.keys(lessonTints) as LessonTint[];

// The repository's one contrast helper, called as the checker itself calls it.
function ratios(pairs: [string, string][]): number[] {
  const code = 'import json, sys\nsys.path.insert(0, "scripts")\nfrom check_contrast import contrast_ratio\nprint(json.dumps([contrast_ratio(a, b) for a, b in json.loads(sys.argv[1])]))';
  return JSON.parse(execFileSync('python3', ['-c', code, JSON.stringify(pairs)], { cwd: ROOT, encoding: 'utf8' })) as number[];
}
const cssVar = (name: string) => new RegExp(`--fl-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(LESSON_CSS)?.[1]?.toUpperCase();

const EXPLANATION: Explanation = {
  type: 'explanation',
  title: 'Shadows',
  idea: 'A shadow forms where an object blocks light.',
  paragraphs: ['Light travels in straight lines, so the space behind an object gets no light.'],
  example: 'Your hand held in front of a torch makes a dark shape on the wall.',
  steps: ['Light leaves the torch.', 'Your hand stops some of it.'],
  terms: [],
};
const w = familyWords('en', UNDERSTAND_KEYS);

describe('the lesson tokens (src/lib/design-tokens.ts)', () => {
  it('has the surfaces, the three accents and five tints, with no dark blue', () => {
    expect(lessonColors).toMatchObject({ paper: '#FBF8F3', ink: '#1C1B1A', saffron: '#E8702A', teal: '#0F766E', plum: '#6D28D9' });
    expect(TINTS).toEqual(['mint', 'butter', 'lilac', 'blush', 'sky']);
    for (const hex of [...Object.values(lessonColors), ...TINTS.flatMap((t) => [lessonTints[t].tint, lessonTints[t].accent])]) {
      expect(['#002357', '#061233', '#1D4ED8', '#1E3A8A', '#2563EB', '#4400F0']).not.toContain(hex);
    }
    expect(lessonType.display).toMatch(/ui-rounded/);
    expect(lessonShape).toEqual({ space: 8, radius: 16, enterMs: 180 });
  });

  it('gives every block kind of the brief its tint', () => {
    const want: Record<string, LessonTint> = { explanation: 'mint', worked_example: 'butter', key_points: 'butter', figure: 'lilac', diagram: 'lilac', mind_map: 'lilac', timeline: 'lilac', check: 'blush', steps: 'sky', practice: 'sky', videos: 'sky' };
    for (const [kind, tint] of Object.entries(want)) expect(LESSON_TINT_OF[kind], kind).toBe(tint);
  });

  it('is the same set of values the stylesheet carries', () => {
    const named: Record<string, string> = { paper: lessonColors.paper, card: lessonColors.card, ink: lessonColors.ink, muted: lessonColors.muted, saffron: lessonColors.saffron, 'saffron-deep': lessonColors.saffronDeep, teal: lessonColors.teal, plum: lessonColors.plum };
    for (const t of TINTS) {
      named[t] = lessonTints[t].tint;
      named[`${t}-accent`] = lessonTints[t].accent;
    }
    for (const [name, hex] of Object.entries(named)) expect(cssVar(name), name).toBe(hex);
  });
});

describe('contrast, by scripts/check_contrast.py', () => {
  it('ink and muted text pass on the paper, the card and every tint; white numerals pass on every accent', () => {
    const grounds = [lessonColors.paper, lessonColors.card, ...TINTS.map((t) => lessonTints[t].tint)];
    const pairs: [string, string][] = [
      ...grounds.map((g): [string, string] => [lessonColors.ink, g]),
      ...grounds.map((g): [string, string] => [lessonColors.muted, g]),
      ...TINTS.map((t): [string, string] => ['#FFFFFF', lessonTints[t].accent]),
    ];
    const r = ratios(pairs);
    r.slice(0, grounds.length).forEach((x, i) => expect(x, `ink on ${pairs[i][1]}`).toBeGreaterThanOrEqual(7));
    r.slice(grounds.length).forEach((x, i) => expect(x, `${pairs[grounds.length + i].join(' on ')}`).toBeGreaterThanOrEqual(4.5));
  });

  it('the accents pass where they carry text', () => {
    const pairs: [string, string][] = [
      [lessonColors.ink, lessonColors.saffron], // a follow-up chip on hover, the retry button
      ['#FFFFFF', lessonColors.teal], // the subject chip, "Checked by NetCyberAI"
      ['#FFFFFF', lessonColors.plum], // "AI-made"
      [lessonColors.plum, lessonTints.lilac.tint], // the "Made by AI" link
      [lessonColors.saffronDeep, lessonColors.paper], // the page kicker
    ];
    for (const [x, i] of ratios(pairs).map((v, k) => [v, k] as const)) expect(x, pairs[i].join(' on ')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the direct answer', () => {
  it('is the explanation idea beside the drawn tutor face', () => {
    const html = renderToStaticMarkup(h(DirectAnswer, { b: EXPLANATION }));
    expect(html).toContain('data-direct-answer');
    expect(html).toContain('data-tutor-avatar');
    expect(html).toContain(EXPLANATION.idea);
    expect(renderToStaticMarkup(h(TutorAvatar))).toContain(`fill="${lessonColors.plum}"`);
  });

  it('is not said twice: the lead explanation draws without its idea, any other with it', () => {
    expect(renderToStaticMarkup(h(ExplanationView, { b: EXPLANATION, w, tone: 'science', lead: true }))).not.toContain(EXPLANATION.idea);
    expect(renderToStaticMarkup(h(ExplanationView, { b: EXPLANATION, w, tone: 'science' }))).toContain(EXPLANATION.idea);
  });

  it('leads the Understand page, then the numbered sections, the follow-ups, and the videos last', () => {
    const initial: ResolverEvent[] = [
      { t: 'meta', label: 'ai_made', cached: true, title: 'Shadows', subject: 'science', topicKey: 'cbse.c6.science.u1.ch1.t1' },
      { t: 'block', block: EXPLANATION },
      { t: 'block', block: { type: 'key_points', points: ['Light goes straight.', 'Blocked light leaves a shadow.'] } },
      { t: 'block', block: { type: 'videos', items: [{ videoId: 'madeUpVid01', title: 'Shadows (made-up)', channel: 'Made-up', seconds: 300 }] } },
      { t: 'done', complete: true },
    ] as ResolverEvent[];
    const html = renderToStaticMarkup(h(UnderstandView, { w, input: { kind: 'topic', key: 'cbse.c6.science.u1.ch1.t1' }, tone: 'science', initial }));
    expect(html).toContain('fam-lesson');
    const at = (s: string) => html.indexOf(s);
    expect(at('data-direct-answer')).toBeGreaterThan(-1);
    expect(at('data-direct-answer')).toBeLessThan(at('data-block="explanation"'));
    expect(at('data-block="key_points"')).toBeLessThan(at('data-follow-ups'));
    expect(at('data-follow-ups')).toBeLessThan(at('data-block="videos"'));
    expect(html.split(EXPLANATION.idea).length - 1).toBe(1);
  });

  // W10-4 (C413): rolled out; a typed question (the tutor window) wears it too, under the "Direct answer" heading.
  it('dresses a typed question (the tutor window) the same way, the direct answer under its heading', () => {
    const initial = [{ t: 'meta', label: 'ai_made', cached: false, title: 'Q', subject: 'science', topicKey: null }, { t: 'block', block: EXPLANATION }, { t: 'done', complete: true }] as unknown as ResolverEvent[];
    const html = renderToStaticMarkup(h(UnderstandView, { w, input: { kind: 'question', text: 'Why do shadows form?' }, tone: 'science', initial }));
    expect(html).toContain('fam-lesson');
    expect(html).toContain('data-direct-answer');
    expect(html.indexOf('Direct answer')).toBeGreaterThan(-1);
    expect(html.indexOf('Direct answer')).toBeLessThan(html.indexOf('<section data-direct-answer'));
    expect(html.split(EXPLANATION.idea).length - 1).toBe(1);
    expect(html).not.toContain('data-show-model');
  });
});

describe('motion', () => {
  it('enters in 180 ms and stops under prefers-reduced-motion', () => {
    expect(LESSON_CSS).toMatch(/--fl-enter:\s*180ms/);
    expect(LESSON_CSS).toMatch(/\.fam-lesson \.fam-rise \{\s*animation: fam-lesson-in var\(--fl-enter\)/);
    const reduce = LESSON_CSS.slice(LESSON_CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toMatch(/\.fam-lesson \.fam-rise,[\s\S]*\.fam-lesson \[data-result\] \{\s*animation: none !important;/);
    expect(reduce).toMatch(/\.fam-lesson \.fam-lesson-chip \{\s*transition: none !important;/);
  });

  it('draws no gradient in the lesson styles', () => {
    expect(LESSON_CSS).not.toMatch(/gradient\(/);
  });
});

// W10-4 (C413): the identity rolled out. The Family screens the harness pictures (Home, Study with the tutor's feed, the
// parent area, English, the hubs, the door pages) are drawn from these files: none of them carries a dark-blue class,
// the bands are paper with ink, and the page is paper.
describe('the identity on every Family screen (W10-4)', () => {
  const SCREENS = [
    'src/app/(family)/family/(app)/page.tsx',
    'src/app/(family)/family/(app)/study/page.tsx',
    'src/app/(family)/family/(app)/parent/page.tsx',
    'src/components/family/SubPageHeader.tsx',
    'src/components/family/FamilyHeader.tsx',
    'src/components/family/FamilyTabs.tsx',
    'src/components/family/GateFrame.tsx',
    'src/components/family/NotifyBell.tsx',
    'src/components/family/ChildSwitcher.tsx',
    'src/components/family/HubShell.tsx',
    'src/components/family/UnderstandView.tsx',
    'src/components/family/VideoPicks.tsx',
    'src/components/family/VoiceInput.tsx',
    'src/components/family/HabitCard.tsx',
    'src/components/family/PlanCard.tsx',
    'src/components/family/FirstSteps.tsx',
    'src/components/family/HomePlanSection.tsx',
    'src/components/family/SchoolSection.tsx',
    'src/components/family/SyllabusList.tsx',
    'src/components/family/SchoolSyllabus.tsx',
    'src/components/family/ChapterRequestPanel.tsx',
    'src/components/family/ParentArea.tsx',
    'src/components/family/HabitParent.tsx',
    'src/components/family/ChildPhoneSection.tsx',
    'src/components/family/PinGate.tsx',
    'src/components/family/school-test/TestList.tsx',
    'src/components/family/offline/DataSaverSwitch.tsx',
    'src/components/family/offline/PackButton.tsx',
    'src/components/family/english/PlayerShell.tsx',
    'src/components/family/english/EnglishCourse.tsx',
    'src/components/family/english/LessonPlayer.tsx',
    'src/components/family/english/LiveSessions.tsx',
    'src/components/family/english/theme.ts',
    ...readdirSync(path.join(ROOT, 'src/components/family/tutor')).map((f) => `src/components/family/tutor/${f}`),
    ...readdirSync(path.join(ROOT, 'src/components/family/ui')).map((f) => `src/components/family/ui/${f}`),
  ];
  const DARK_BLUE = /\b(?:bg|text|ring|from|via|to|border|fill|stroke|decoration|outline|shadow)-(?:royal|violet|midnight)(?:-deep)?\b/g;

  it('leaves no royal, violet or midnight class on those screens', () => {
    for (const f of SCREENS) expect(readFileSync(path.join(ROOT, f), 'utf8').match(DARK_BLUE), f).toBeNull();
  });

  it('draws every band on paper with ink, and the page on paper', () => {
    for (const f of ['src/components/family/SubPageHeader.tsx', 'src/components/family/FamilyHeader.tsx', 'src/components/family/GateFrame.tsx']) {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, f).toMatch(/fam-band[^"`]*bg-paper/);
      expect(src, f).not.toMatch(/fam-band[^"`]*bg-gradient/);
    }
    const page = CSS.slice(CSS.indexOf('.fam-canvas {'), CSS.indexOf('}', CSS.indexOf('.fam-canvas {')));
    expect(page).toMatch(/background-color: #fbf8f3/);
    expect(page).not.toMatch(/gradient\(/);
    expect(CSS).toMatch(/\.fam-canvas,\n\.fam-lesson \{\n\s+--fl-paper/);
  });

  it('wears the lesson look wherever an answer is drawn, in the tutor feed too', () => {
    const tutor = readFileSync(path.join(ROOT, 'src/components/family/tutor/TutorWindow.tsx'), 'utf8');
    expect(tutor).toMatch(/data-feed-answer className="fam-lesson/);
    expect(tutor).toContain('DirectAnswerCard');
  });
});
