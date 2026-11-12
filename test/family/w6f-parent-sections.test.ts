import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ParentArea, TABS } from '@/components/family/ParentArea';
import { PARENT_APP_KEYS } from '@/components/family/parent/keys';
import { familyWords } from '@/lib/family/words';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }), usePathname: () => '/family/parent' }));

// C506: the parent area is four tabs in a bottom bar (Home, Children, School, Me). Every consent switch stays on Me.
const words = familyWords('en', Object.keys(en).filter((k) => k.startsWith('fam.')) as never[]);
const child = { childId: 'c1', firstName: 'Asha', classLevel: 9, board: 'cbse', language: 'en' as const, style: 'en' as const, stateCode: '', freeSubject: null, subjects: [] };
const child2 = { ...child, childId: 'c2', firstName: 'Ravi', classLevel: 4 };
const today = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];
const week = (id: string, answers: number[]) => ({
  childId: id,
  days: today.map((day, i) => ({ day, answers: answers[i] })),
  subjects: [{ subject: 'mathematics', answered: 10, correct: 7 }],
  latest: [{ title: 'Fractions', subject: 'mathematics', answered: 10, correct: 7, mastered: false, lastOn: '2026-11-11' }],
});
const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(ParentArea, { w: words, lang: 'en', children: [child], states: [], studyCore: true, calm: [], photo: { granted: false, renew: true }, voice: { granted: false }, offers: { granted: false }, ...over } as never));
const panel = (html: string, id: string) => {
  const from = html.indexOf(`data-parent-panel="${id}"`);
  const next = [...TABS].map((t) => html.indexOf(`data-parent-panel="${t}"`)).filter((i) => i > from).sort((a, b) => a - b)[0];
  return html.slice(from, next);
};

describe('the parent area in four tabs', () => {
  it('has the four tabs in one bottom bar, Home open, each other panel hidden but mounted', () => {
    const html = render();
    expect(TABS).toEqual(['home', 'children', 'school', 'me']);
    expect(html.match(/data-parent-bar/g)?.length).toBe(1);
    const tabs = [...html.matchAll(/data-parent-tab="(\w+)"/g)].map((m) => m[1]);
    expect(tabs).toEqual([...TABS]);
    expect(html).toMatch(/aria-current="page"[^>]*data-parent-tab="home"|data-parent-tab="home"[^>]*aria-current="page"/);
    expect(html.match(/data-parent-panel="\w+" hidden=""/g)?.length).toBe(3);
    expect(html).not.toContain('role="tablist"');
  });

  it('keeps every consent switch on the Me panel', () => {
    const html = render();
    const me = panel(html, 'me');
    expect(me.match(/role="switch"/g)?.length).toBe(4);
    expect(me).toContain('data-consent="photo_input"');
    expect(me).toContain('data-consent-changed="photo_input"');
    expect(me).toContain('data-consent-voice');
    expect(me).toContain('data-consent="offers"');
    expect(html.match(/role="switch"/g)?.length).toBe(4);
  });

  it('puts every old section within reach: rows on Me and Children, the parts on School', () => {
    const html = render({
      english: { granted: true },
      habit: [{ childId: 'c1', goal: 4, jar: null, summary: { done: 1, goal: 4, masteredCount: 0, masteredTitles: [], support: null }, talk: null }],
      slots: { overview: h('p', { 'data-slot-overview': true }), children: h('p', { 'data-slot-phones': true }), school: h('p', { 'data-slot-school': true }), learning: h('p', { 'data-slot-learning': true }) },
    });
    const me = panel(html, 'me');
    for (const r of ['learning', 'privacy', 'language', 'signout', 'delete']) expect(me).toContain(`data-parent-row="${r}"`);
    expect(me).toContain('data-slot-learning');
    expect(me).toContain(words['fam.parent.signOutAll']);
    expect(me).toContain(words['fam.parent.deleteAccountYes']);
    const kids = panel(html, 'children');
    for (const r of ['manage', 'habit', 'phones']) expect(kids).toContain(`data-parent-row="${r}"`);
    expect(kids).toContain('data-child-edit');
    expect(kids).toContain('data-parent-english');
    expect(kids).toContain('data-slot-overview');
    expect(kids).toContain('data-slot-phones');
    expect(panel(html, 'school')).toContain('data-slot-school');
  });

  it('lists what needs the parent as cards with one action each, or says nothing does', () => {
    expect(render()).toContain('data-parent-needs-none');
    const html = render({ needs: [{ kind: 'renew' }, { kind: 'requests_declined', n: 2 }, { kind: 'meeting', name: 'Asha' }] });
    expect(html.match(/data-parent-need="/g)?.length).toBe(3);
    expect(html.match(new RegExp(`>${words['fam.parent.needs.open']}<`, 'g'))?.length).toBe(3);
    expect(html).toContain(words['fam.parent.needs.renew']);
    expect(html).toContain('Chapter requests that could not be made: 2.');
  });

  it('shows one card per child on Home, with the real figures', () => {
    const html = render({
      children: [child, child2],
      calm: [
        { childId: 'c1', answers: 10, right: 7, topics: 3, mastered: 2, practisedTitles: [] },
        { childId: 'c2', answers: 0, right: 0, topics: 0, mastered: 0, practisedTitles: [] },
      ],
      weeks: [week('c1', [0, 4, 0, 3, 3, 0, 0]), week('c2', [0, 0, 0, 0, 0, 0, 0])],
      habit: [{ childId: 'c1', goal: 5, jar: null, summary: { done: 1, goal: 5, masteredCount: 0, masteredTitles: [], support: null }, talk: null }],
    });
    const home = panel(html, 'home');
    expect(home.match(/data-child-card="/g)?.length).toBe(2);
    const first = home.slice(home.indexOf('data-child-card="c1"'), home.indexOf('data-child-card="c2"'));
    // Three days with answers, against the parent's own goal of five.
    expect(first).toContain('3 of 5 days with answers in the last 7 days');
    expect(first).toContain('>7<');
    expect(first).toContain('>3<');
    expect(first).toContain('>2<');
    expect(first).toContain(words['fam.parent.app.chipMastered']);
    expect(first).toContain('Asha');
    // A child with no answers yet gets the honest sentence, not zero charts.
    const second = home.slice(home.indexOf('data-child-card="c2"'));
    expect(second).toContain('data-child-empty');
    expect(second).toContain('Ravi has not answered anything yet.');
    expect(second).not.toContain(words['fam.parent.app.chipRight']);
  });

  it('shows the chosen child on Children: bars of answers, subject meters, the latest topics, the gutter-safe switcher', () => {
    const html = render({ children: [child, child2], weeks: [week('c1', [0, 4, 0, 3, 3, 0, 0]), week('c2', [0, 0, 0, 0, 0, 0, 0])] });
    const kids = panel(html, 'children');
    expect(kids).toContain('data-parent-switcher');
    expect(kids).toMatch(/data-parent-switcher[^>]*scroll-px-4|scroll-px-4[^>]*data-parent-switcher/);
    expect(kids).toContain('Answers checked per day: 0, 4, 0, 3, 3, 0, 0. Total 10.');
    expect(kids).toContain('role="meter"');
    expect(kids).toContain('70%');
    expect(kids).toContain('Fractions');
    expect(kids).not.toContain('minutes');
  });

  it('says so for a new family with nothing yet, and for no linked school', () => {
    const none = render({ children: [] });
    expect(panel(none, 'home')).toContain(words['fam.parent.app.noKids']);
    expect(panel(none, 'children')).toContain(words['fam.parent.app.noKids']);
    const fresh = render({ children: [child], weeks: [week('c1', [0, 0, 0, 0, 0, 0, 0])] });
    expect(panel(fresh, 'children')).toContain('Asha has not answered anything yet.');
    expect(panel(render(), 'school')).toContain('Connect your child&#x27;s school with its code');
  });

  it('shows one sentence and one action when Learning has nothing', () => {
    const html = render({ slots: {} });
    expect(panel(html, 'me')).toContain(words['fam.parent.learningEmpty']);
    expect(panel(html, 'me')).toContain(words['fam.parent.goChildren']);
    expect(panel(render({ slots: { learning: h('p', { 'data-learning-body': true }, 'x') } }), 'me')).not.toContain('data-parent-empty');
  });

  it('has every new word in English and Hindi', () => {
    for (const k of PARENT_APP_KEYS) {
      expect((en as Record<string, string>)[k], k).toBeTruthy();
      expect((hi as Record<string, string>)[k], k).toBeTruthy();
    }
    const keys = Object.keys(en).filter((k) => /^fam\.parent\.needs\./.test(k));
    for (const k of keys) expect((hi as Record<string, string>)[k], k).toBeTruthy();
  });
});
