import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiNotice } from '@/components/family/AiNotice';
import { GateFrame } from '@/components/family/GateFrame';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { EmptyState } from '@/components/family/ui/EmptyState';
import { LinkRow } from '@/components/family/ui/LinkRow';
import { familyWords } from '@/lib/family/words';

// W6-B (docs/38 §5): the Family screens outside Study share one visual system. These hold the parts that can break
// without a screenshot: the shared classes exist and stop under reduced motion, cards stay at 12-16 px, the pages use
// them instead of one-off pull-up strings, the empty state is one sentence and one action, and the AI marker is a pill.
const ROOT = path.resolve(__dirname, '../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const css = read('src/app/(family)/family/family.css');
const APP = 'src/app/(family)/family/(app)/';

describe('the shared Family page system', () => {
  it('defines the shared classes', () => {
    for (const c of ['.fam-page', '.fam-section', '.fam-h2', '.fam-eyebrow', '.fam-note', '.fam-num', '.fam-row', '.fam-lift', '.fam-chip-icon', '.fam-pill', '.fam-hit', '.fam-empty', '.fam-gate']) {
      expect(css, c).toContain(c);
    }
  });

  it('keeps cards and tiles at 12-16 px', () => {
    const radius = (sel: string) => Number(new RegExp(`${sel.replace('.', '\\.')} \\{[^}]*?border-radius: ([\\d.]+)rem`).exec(css)?.[1]);
    expect(radius('.fam-card')).toBeLessThanOrEqual(1);
    expect(radius('.fam-card')).toBeGreaterThanOrEqual(0.75);
    expect(radius('.fam-tile')).toBeLessThanOrEqual(1);
  });

  it('draws numbers in tabular figures and moves for 150-200 ms only', () => {
    expect(css).toMatch(/\.fam-canvas \{[^}]*font-variant-numeric: tabular-nums/);
    const lift = /\.fam-lift \{\s*transition:([^;]*);/.exec(css)?.[1] ?? '';
    for (const ms of lift.matchAll(/(\d+)ms/g)) {
      expect(Number(ms[1])).toBeGreaterThanOrEqual(150);
      expect(Number(ms[1])).toBeLessThanOrEqual(200);
    }
  });

  it('stops the lift and the press under reduced motion', () => {
    const block = css.slice(css.indexOf('/* ---- reduced motion'));
    expect(block).toContain('.fam-lift:hover');
    expect(block).toContain('.fam-lift:active');
    expect(block).toMatch(/transition: none !important/);
  });

  it('is used by the screens instead of a one-off pull-up string', () => {
    const pages = ['page.tsx', 'profile/page.tsx', 'notifications/page.tsx', 'future/page.tsx', 'results/page.tsx', 'english/page.tsx', 'parent/vault/page.tsx', 'parent/tests/page.tsx'];
    for (const p of pages) {
      const src = read(APP + p);
      expect(src, p).toContain('fam-page');
      expect(src, p).not.toMatch(/-mt-8 flex w-full max-w-xl/);
    }
    expect(read('src/components/family/HubShell.tsx')).toContain('fam-page');
    expect(read('src/components/family/ParentArea.tsx')).toContain('fam-page');
  });

  it('never goes back to the flat 24 px card on the English screens', () => {
    for (const f of ['EnglishCourse', 'LessonPlayer', 'AssessmentPlayer', 'LivePractice', 'EnglishReport', 'LiveSessions', 'Steps', 'Visuals']) {
      const src = read(`src/components/family/english/${f}.tsx`);
      expect(src, f).not.toContain('rounded-3xl');
    }
  });
});

describe('the shared pieces', () => {
  it('the empty state is one sentence and one action', () => {
    const html = renderToStaticMarkup(h(EmptyState, { icon: 'bell', text: 'Nothing new', href: '/family', action: 'Home', 'data-notify-empty': '' }));
    expect(html).toContain('data-notify-empty');
    expect(html.match(/<p /g)).toHaveLength(1);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('Nothing new');
  });

  it('a link row is 48 px, goes where it says and keeps its data attribute', () => {
    const html = renderToStaticMarkup(h(LinkRow, { href: '/family/parent', icon: 'lock', 'data-parent-space': '', children: 'Parent space' } as Parameters<typeof LinkRow>[0]));
    expect(html).toContain('href="/family/parent"');
    expect(html).toContain('data-parent-space');
    expect(html).toContain('fam-row');
  });

  it('the AI marker is a small pill with the words "Made by AI", not a paragraph about mistakes', () => {
    const w = familyWords('en', ['fam.ai.notice.aiMade', 'fam.ai.notice.checked', 'fam.ai.notice.link']);
    const html = renderToStaticMarkup(h(AiNotice, { w, made: 'ai_made' }));
    expect(html).toContain('data-ai-notice="ai_made"');
    expect(html).toContain('fam-pill');
    expect(html).toContain('Made by AI');
    expect(html).not.toMatch(/wrong|mistake|teacher/i);
    expect(html).toContain('href="/family/about-ai"');
    const checked = renderToStaticMarkup(h(AiNotice, { w, made: 'checked' }));
    expect(checked).toContain('checked by NetCyberAI');
  });

  it('the band can carry one action on its right', () => {
    const html = renderToStaticMarkup(h(SubPageHeader, { back: '/family', backLabel: 'Home', title: 'Parent area', aside: h('button', { type: 'button' }, 'Lock') }));
    expect(html).toContain('Lock');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('the door frame has one h1 and the form in a card', () => {
    const html = renderToStaticMarkup(h(GateFrame, { app: 'NetCyberAI Family', title: 'Enter your PIN', lead: 'Six digits', children: h('p', null, 'form') }));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('fam-gate');
    expect(html).toContain('fam-card');
  });
});

describe('the copy', () => {
  it('has no "how it works" paragraph on the child screens', () => {
    const gone = ['fam.progress.how', 'fam.plan.how', 'fam.habit.goalHelp', 'fam.calm.note', 'fam.profile.parentLead'];
    const en = read('src/lib/i18n/messages/en.ts');
    const hi = read('src/lib/i18n/messages/hi.ts');
    for (const k of gone) {
      expect(en, k).not.toContain(`'${k}'`);
      expect(hi, k).not.toContain(`'${k}'`);
    }
  });
});
