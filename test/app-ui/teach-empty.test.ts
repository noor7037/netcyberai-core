import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LangProvider } from '@/components/app-shell/LangContext';
import { EMPTY_IDS, TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { ModuleSwitchList } from '@/components/settings/ModuleSwitchList';
import { ALWAYS_ON_MODULES, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { isMessageKey, t } from '@/lib/i18n';
import { moduleOffSentence, needsOwnSentence } from '@/lib/i18n/module-off';

vi.mock('next/navigation', () => ({ usePathname: () => '/app/students', useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

// Empty states that teach, and what a module being off means (docs/19
// rules 7 and 8, C139).

const DEVANAGARI = /[ऀ-ॿ]/;
const src = (rel: string) => readFileSync(path.join(__dirname, '../../src', rel), 'utf8');
const render = (lang: 'en' | 'hi', props: Record<string, unknown>) => renderToStaticMarkup(h(LangProvider, { lang, children: h(TeachEmpty, props as any) }));

describe('an empty list says what to do next, and carries the button', () => {
  it('every empty state has what is missing and one plain sentence on what to do, in English and Hindi', () => {
    for (const id of EMPTY_IDS) {
      for (const part of ['title', 'do']) {
        const key = `empty.${id}.${part}`;
        expect(isMessageKey(key), key).toBe(true);
        if (isMessageKey(key)) {
          expect(t('hi', key), key).toMatch(DEVANAGARI);
          expect(t('en', key).length, key).toBeLessThanOrEqual(part === 'title' ? 60 : 180);
        }
      }
      const todo = t('en', `empty.${id}.do` as any);
      // It tells the person to do something, or who can: never only "nothing here".
      expect(todo, id).toMatch(/\b(Add|Ask|Check|If|When|Each|The office|link|log|raise|use)\b/i);
    }
  });

  it('where the person can act the button is there, and it does the thing', () => {
    const withButton = render('en', { id: 'guardians', onAction: () => undefined });
    expect(withButton).toContain('No guardian linked yet');
    expect(withButton).toContain('Consent can be recorded only after one is linked');
    expect(withButton).toMatch(/<button[^>]*>Add guardian<\/button>/);
    const withLink = render('en', { id: 'attendance-roster', href: '/app/students' });
    expect(withLink).toMatch(/<a[^>]*href="\/app\/students"[^>]*>Open students<\/a>/);
  });

  it('where the person’s role cannot act there is no button, and the sentence says who can', () => {
    const html = render('en', { id: 'guardians' }); // a teacher: no onAction given
    expect(html).not.toContain('<button');
    expect(render('en', { id: 'siblings-view' })).toContain('Ask your school admin');
    expect(render('en', { id: 'taught-today-teacher' })).toContain('Ask your school admin');
    expect(render('en', { id: 'support-access' })).toContain('Nothing is needed from you');
  });

  it('in Hindi it is Hindi, and marked so', () => {
    const html = render('hi', { id: 'students', onAction: () => undefined });
    expect(html).toContain('lang="hi"');
    expect(html).toContain('अभी कोई विद्यार्थी नहीं है');
    expect(html).toContain('>विद्यार्थी जोड़ें<');
  });

  it('every empty state is used by a screen, and the bare "No … yet." lines are gone from those screens', () => {
    const files = ['components/students/StudentsView.tsx', 'components/students/StudentDetailView.tsx', 'components/students/FamilyPanel.tsx', 'components/students/DsrPanel.tsx', 'components/attendance/AttendanceView.tsx', 'components/account/StaffAccounts.tsx', 'components/academics/SyllabusView.tsx', 'app/(school)/app/compliance/page.tsx'];
    const all = files.map(src).join('\n');
    for (const id of EMPTY_IDS) expect(all.includes(`id="${id}"`), id).toBe(true);
    for (const f of files) {
      const bare = src(f).match(/>\s*(No [a-z ]+ (yet|linked|on record|match|you can see)\.?|Nothing to show yet\.?)\s*</gi) ?? [];
      expect(bare, f).toEqual([]);
    }
  });
});

describe('one plain sentence on what a module being off changes, and for whom', () => {
  it('every module has its sentence in English and Hindi', () => {
    for (const m of MODULE_REGISTRY) {
      const en = moduleOffSentence('en', m);
      const hi = moduleOffSentence('hi', m);
      expect(en.length, m.id).toBeGreaterThan(20);
      expect(en.length, m.id).toBeLessThanOrEqual(200);
      expect(hi, m.id).toMatch(DEVANAGARI);
      expect(en, m.id).not.toMatch(DEVANAGARI);
      expect(en, m.id).not.toMatch(/\{\w+\}/);
    }
  });

  it('a module that is built has a sentence of its own, written for it', () => {
    for (const m of MODULE_REGISTRY.filter(needsOwnSentence)) expect(isMessageKey(`moduleOff.${m.id}`), m.id).toBe(true);
  });

  it('a module that is not built says so, and names the roles whose menu it leaves', () => {
    const ptm = MODULE_REGISTRY.find((m) => m.id === 'ptm')!;
    expect(moduleOffSentence('en', ptm)).toBe('Not built yet. Switched off, its “Soon” entry leaves the menu of: Principal, School admin, Teacher.');
    expect(moduleOffSentence('hi', ptm)).toContain('प्रधानाचार्य');
  });

  it('the always-on modules say they cannot be switched off', () => {
    for (const id of ALWAYS_ON_MODULES) expect(moduleOffSentence('en', MODULE_REGISTRY.find((m) => m.id === id)!)).toContain('Always on');
  });

  it('a sentence names who is affected', () => {
    for (const id of ['students', 'attendance', 'parents', 'setup', 'academics', 'communication', 'compliance', 'dashboard', 'admissions']) {
      expect(moduleOffSentence('en', MODULE_REGISTRY.find((m) => m.id === id)!), id).toMatch(/office|Teachers|Nobody|principal|accountant/i);
    }
  });
});

describe('the school’s Settings list', () => {
  const ents = (accessMode: SchoolEntitlements['accessMode'], on: string[]): SchoolEntitlements => ({ schoolId: 's', plan: 'standard', accessMode, modules: Object.fromEntries(on.map((id) => [id, { enabled: true, source: 'plan' as const }])) });
  const list = (lang: 'en' | 'hi', e: SchoolEntitlements) => renderToStaticMarkup(h(ModuleSwitchList, { entitlements: e, lang }));
  const state = (html: string, id: string) => new RegExp(`data-module="${id}" data-on="(true|false)"`).exec(html)?.[1];

  it('shows every module with its state and its sentence', () => {
    const html = list('en', ents('full', ['students', 'attendance']));
    for (const m of MODULE_REGISTRY) expect(html, m.id).toContain(`data-module="${m.id}"`);
    expect(state(html, 'students')).toBe('true');
    expect(state(html, 'fees')).toBe('false');
    expect(state(html, 'raise-ticket')).toBe('true');
    expect(html).toContain('Nobody can add or change a student');
    expect(html).toContain('>Always on<');
    expect(html).toMatch(/href="\/app\/help\/ticket\/new"[^>]*>Raise a ticket</);
  });

  it('a suspended school sees everything off except help and tickets', () => {
    const html = list('en', ents('suspended', ['students', 'attendance']));
    expect(state(html, 'students')).toBe('false');
    expect(state(html, 'help-center')).toBe('true');
  });

  it('in Hindi the list is in Hindi', () => {
    const html = list('hi', ents('full', ['students']));
    expect(html).toContain('आपके स्कूल में क्या चालू है');
    expect(html).toContain('बंद होने पर:');
    expect(html).toContain('विद्यार्थी');
  });
});
