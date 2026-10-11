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
      // With a button, the button's words exist in both languages. Without one,
      // the sentence says who can do it, or that nothing is needed.
      if (isMessageKey(`empty.${id}.action`)) expect(t('hi', `empty.${id}.action` as any), id).toMatch(DEVANAGARI);
      else expect(todo, id).toMatch(/Ask your school admin|The office|tell the office|Nothing is needed from you|Guardians section above|refresh the page/);
    }
  });

  it('the student list tells an empty school, an empty search and "nobody waiting" apart', () => {
    expect(render('en', { id: 'students', onAction: () => undefined })).toContain('Add your first student');
    const noMatch = render('en', { id: 'students-no-match', onAction: () => undefined });
    expect(noMatch).toContain('No student matches your search');
    expect(noMatch).toMatch(/<button[^>]*>Clear the search<\/button>/);
    expect(noMatch).not.toContain('first student');
    expect(render('en', { id: 'students-none-waiting', onAction: () => undefined })).toContain('No student is waiting for consent');
    const view = src('components/students/StudentsView.tsx');
    expect(view).toMatch(/search \? \(\s*<TeachEmpty id="students-no-match"/);
    expect(view).toMatch(/statusFilter === 'pending_consent' \? \(\s*<TeachEmpty id="students-none-waiting"/);
  });

  it('a list that could not be loaded says that, not that it is empty', () => {
    const html = render('en', { id: 'not-loaded' });
    expect(html).toContain('This could not be loaded');
    expect(html).not.toContain('<button');
    expect(src('components/students/StudentDetailView.tsx')).toMatch(/guardiansFailed \? <TeachEmpty id="not-loaded"/);
    expect(src('components/attendance/AttendanceView.tsx')).toMatch(/source === 'failed' \? <TeachEmpty id="not-loaded"/);
  });

  it('where the person can act the button is there, and it does the thing', () => {
    const withButton = render('en', { id: 'guardians', onAction: () => undefined });
    expect(withButton).toContain('No guardian linked yet');
    expect(withButton).toContain('the student becomes active when both required consents are granted');
    expect(withButton).toMatch(/<button[^>]*>Add guardian<\/button>/);
    const withLink = render('en', { id: 'attendance-roster', href: '/app/students' });
    expect(withLink).toMatch(/<a[^>]*href="\/app\/students"[^>]*>Open students<\/a>/);
  });

  it('where the person’s role cannot act there is no button, and the sentence says who can', () => {
    const html = render('en', { id: 'guardians-view' }); // what a teacher sees on a student's page
    expect(html).not.toContain('<button');
    expect(html).toContain('The office adds guardians. Ask your school admin');
    expect(html).not.toContain('Add a parent or guardian.');
    expect(src('components/students/StudentDetailView.tsx')).toMatch(/canEdit \? <TeachEmpty id="guardians"[^:]*: <TeachEmpty id="guardians-view"/);
    expect(src('components/students/FamilyPanel.tsx')).toContain("view.canManage ? 'family-guardians' : 'guardians-view'");
    const roster = render('en', { id: 'attendance-roster-view' });
    expect(roster).toContain('Ask your school admin');
    expect(roster).not.toContain('href=');
    expect(src('components/attendance/AttendanceView.tsx')).toMatch(/office \? <TeachEmpty id="attendance-roster" href="\/app\/students" \/> : <TeachEmpty id="attendance-roster-view"/);
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
    const files = ['components/students/StudentsView.tsx', 'components/students/StudentDetailView.tsx', 'components/students/FamilyPanel.tsx', 'components/students/DsrPanel.tsx', 'components/attendance/AttendanceView.tsx', 'components/timetable/TimetableView.tsx', 'components/pulse/NeedsHelpView.tsx', 'components/account/StaffAccounts.tsx', 'components/academics/SyllabusView.tsx', 'app/(school)/app/compliance/page.tsx'];
    const all = files.map(src).join('\n');
    for (const id of EMPTY_IDS) expect(new RegExp(`<TeachEmpty[^>]*['"]${id}['"]`).test(all), id).toBe(true);
    // The lines these screens used to show, wherever they were written (text, a string, a prop).
    for (const old of ['No guardians linked yet', 'No classes yet', 'No requests on record', 'No siblings linked', 'No siblings you can see', 'No accounts match', 'Nothing to show yet', 'No subject assignments yet', 'No classes assigned to you yet', 'No active students in this class.', 'emptyTitle="No students yet"']) {
      expect(all.includes(old), old).toBe(false);
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

  it('a sentence says what the code does: the menu, search, "New", My Day and the refused changes', () => {
    const of = (id: string) => moduleOffSentence('en', MODULE_REGISTRY.find((m) => m.id === id)!);
    // Students: scan and family linking are refused too (the write guard), and it leaves search, New and My Day.
    for (const words of ['scan an ID card', 'link a family', 'search', '“New”', 'My Day', 'Records are kept']) expect(of('students')).toContain(words);
    // Parents: data requests are refused as well as consent.
    expect(of('parents')).toContain('data request');
    // Attendance: the "+ New" action and coordinators.
    for (const words of ['“New”', 'coordinators', 'My Day']) expect(of('attendance')).toContain(words);
    // Staff: the screen and search go; nothing is claimed about what still works.
    expect(of('staff')).toContain('search');
    expect(of('staff')).not.toContain('still work');
    // Admissions carries Import CSV with it.
    expect(of('admissions')).toContain('Import CSV');
    // No sentence says the school's data is deleted or becomes unreadable.
    for (const m of MODULE_REGISTRY) expect(moduleOffSentence('en', m), m.id).not.toMatch(/deleted|erased|cannot be read|unreadable/i);
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

  it('a suspended school sees everything off except help and tickets, and is told its account is paused', () => {
    const html = list('en', ents('suspended', ['students', 'attendance']));
    expect(state(html, 'students')).toBe('false');
    expect(state(html, 'help-center')).toBe('true');
    expect(html).toContain('account is paused');
  });

  it('a read-only school is told that what is on can be opened but nothing can be saved', () => {
    expect(list('en', ents('read_only', ['students']))).toContain('nothing can be saved');
    expect(list('en', ents('full', ['students']))).not.toContain('nothing can be saved');
  });

  it('modules with a working part are in the main list; only the truly unbuilt are folded away', () => {
    const html = list('en', ents('full', ['students']));
    const folded = html.slice(html.indexOf('<details'));
    for (const id of ['staff', 'admissions', 'fees', 'students']) expect(folded.includes(`data-module="${id}"`), id).toBe(false);
    expect(folded).toContain('data-module="ptm"');
  });

  it('Settings is reachable: the office’s menu links to it', () => {
    const layout = src('app/(school)/app/layout.tsx');
    expect(layout).toContain("href: '/app/settings'");
    expect(layout).toMatch(/isOffice \? \[settings\] : \[\]/);
    expect(t('hi', 'shell.settings')).toMatch(DEVANAGARI);
  });

  it('in Hindi the list is in Hindi', () => {
    const html = list('hi', ents('full', ['students']));
    expect(html).toContain('आपके स्कूल में क्या चालू है');
    expect(html).toContain('बंद होने पर:');
    expect(html).toContain('विद्यार्थी');
  });
});
