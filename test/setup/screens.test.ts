import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SchoolChecklistPanel } from '@/components/control/SchoolChecklistPanel';
import { ChecklistView } from '@/components/setup/ChecklistView';
import { isMessageKey } from '@/lib/i18n';
import { CHECKLIST_HREFS, CHECKLIST_IDS, type ChecklistItem } from '@/lib/setup/checklist';
import { isRealDate, MAX_SESSION_LABEL, parseSessionInput } from '@/lib/setup/session-input';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// What the Setup screens say and take (docs/28 slice 10g, C244), without a database: the checklist drawn from its items
// in both languages, the words every step needs, and what a new session is asked for.

const items = (over: Partial<Record<(typeof CHECKLIST_IDS)[number], Partial<ChecklistItem>>> = {}): ChecklistItem[] =>
  CHECKLIST_IDS.map((id) => ({ id, done: false, count: 0, without: 0, href: CHECKLIST_HREFS[id], ...over[id] }));
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the words of the checklist', () => {
  it('every step has a title and a sentence for being open and for being done, in both languages', () => {
    for (const id of CHECKLIST_IDS) {
      expect(isMessageKey(`setup.check.${id}.title`), id).toBe(true);
      if (id === 'session') {
        for (const k of ['setup.check.session.todo', 'setup.check.session.notCurrent.one', 'setup.check.session.notCurrent.other', 'setup.check.session.done']) expect(isMessageKey(k), k).toBe(true);
      } else if (id === 'logo') {
        expect(isMessageKey('setup.check.logo.todo') && isMessageKey('setup.check.logo.done')).toBe(true);
      } else {
        expect(isMessageKey(`setup.check.${id}.todo`) || id === 'subjects', id).toBe(true);
        expect(isMessageKey(`setup.check.${id}.done.one`) && isMessageKey(`setup.check.${id}.done.other`), id).toBe(true);
      }
    }
    expect(Object.keys(hi).filter((k) => k.startsWith('setup.')).sort()).toEqual(Object.keys(en).filter((k) => k.startsWith('setup.')).sort());
  });
});

describe('the checklist drawn', () => {
  const view = (it: ChecklistItem[], lang: 'en' | 'hi', linked = true) => renderToStaticMarkup(h(ChecklistView, { items: it, lang, linked }));

  it('shows each step as done or to do with what exists, the steps done out of all, and a link to the screen where each is done', () => {
    const html = view(items({ session: { done: true, count: 1 }, classes: { done: true, count: 3 }, subjects: { count: 4, without: 2 }, staff: { count: 0 } }), 'en');
    const words = text(html);
    expect(html).toContain('data-done="2"');
    expect(html).toContain('data-total="9"');
    expect(words).toContain('2 of 9 steps done');
    expect(words).toContain('A session is current.');
    expect(words).toContain('3 classes');
    expect(words).toContain('4 subjects added. 2 classes have no subject taught yet.');
    expect(words).toContain('Nobody besides the principal can sign in yet.');
    expect([...html.matchAll(/data-check="(\w+)" data-check-done="(yes|no)"/g)].map((m) => `${m[1]}:${m[2]}`)).toEqual([
      'session:yes', 'classes:yes', 'subjects:no', 'staff:no', 'teachers:no', 'students:no', 'fees:no', 'timetable:no', 'logo:no',
    ]);
    expect([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))).toEqual(CHECKLIST_IDS.map((id) => CHECKLIST_HREFS[id]));
    expect(html).toContain('aria-valuenow="2"');
  });

  it('says what is wrong with the sessions and the subjects in its own words', () => {
    expect(text(view(items({ session: { count: 1 } }), 'en'))).toContain('One session is added, but it is not current. Make it current.');
    expect(text(view(items({ session: { count: 2 } }), 'en'))).toContain('2 sessions are added, but none is current. Make one current.');
    expect(text(view(items({ session: {} }), 'en'))).toContain('No session yet. Add one and make it current.');
    // Subjects added and no class yet: asks for the subjects to be given on Staff.
    expect(text(view(items({ subjects: { count: 1 } }), 'en'))).toContain('1 subject added. Give each class its subjects on Staff.');
    expect(text(view(items({ subjects: { count: 1, without: 1 } }), 'en'))).toContain('1 class has no subject taught yet.');
    expect(text(view(items({ subjects: { done: true, count: 5 } }), 'en'))).toContain('5 subjects, taught in every class');
  });

  it('says it is complete when every step is done, and nothing is a link where it is only read', () => {
    const all = items(Object.fromEntries(CHECKLIST_IDS.map((id) => [id, { done: true, count: 1 }])));
    const html = view(all, 'en');
    expect(text(html)).toContain('9 of 9 steps done');
    expect(text(html)).toContain('Every step is done. Your school is set up.');
    expect(view(all, 'en', false)).not.toContain('<a ');
    expect(html).toContain('<a ');
  });

  it('speaks Hindi when the person does: no English key or sentence is left in it', () => {
    const html = view(items({ session: { done: true, count: 1 }, subjects: { count: 2, without: 1 } }), 'hi');
    const words = text(html);
    expect(words).toContain('9 में से 1 कदम पूरे');
    expect(words).toContain('चालू शैक्षणिक सत्र');
    expect(words).not.toMatch(/setup\.check|No session|steps done/);
    expect(html).toContain('lang="hi"');
  });

  it('draws the founder’s copy of a school’s checklist without links, or says it could not be counted', () => {
    const copy = renderToStaticMarkup(h(SchoolChecklistPanel, { items: items({ logo: { done: true, count: 1 } }), lang: 'en' }));
    expect(copy).toContain('data-school-checklist');
    expect(text(copy)).toContain('Setup progress');
    expect(text(copy)).toContain('Counted from this school’s own records.');
    expect(copy).not.toContain('<a ');
    const none = renderToStaticMarkup(h(SchoolChecklistPanel, { items: null, lang: 'en' }));
    expect(none).toContain('data-school-checklist="failed"');
    expect(text(none)).toBe('The checklist of this school could not be counted.');
  });
});

describe('what a new session is asked for', () => {
  it('takes a name and a first and last day that are real days, the last after the first', () => {
    expect(parseSessionInput({ label: '  2026-27 ', startDate: '2026-04-01', endDate: '2027-03-31' })).toEqual({ ok: true, value: { label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' } });
    expect(parseSessionInput({ label: 'Autumn   term', startDate: '2026-04-01', endDate: '2026-04-02' })).toMatchObject({ ok: true, value: { label: 'Autumn term' } });
    expect(parseSessionInput({ label: 'a'.repeat(MAX_SESSION_LABEL), startDate: '2026-04-01', endDate: '2027-03-31' }).ok).toBe(true);
    for (const [body, code] of [
      [{ label: '   ', startDate: '2026-04-01', endDate: '2027-03-31' }, 'session_label'],
      [{ label: 'a'.repeat(MAX_SESSION_LABEL + 1), startDate: '2026-04-01', endDate: '2027-03-31' }, 'session_label'],
      [{ label: 5, startDate: '2026-04-01', endDate: '2027-03-31' }, 'session_label'],
      [{ label: '2026-27', startDate: '2026-04-31', endDate: '2027-03-31' }, 'session_dates'],
      [{ label: '2026-27', startDate: '01-04-2026', endDate: '2027-03-31' }, 'session_dates'],
      [{ label: '2026-27', startDate: '2026-04-01' }, 'session_dates'],
      [{ label: '2026-27', startDate: '2026-04-01', endDate: '2026-04-01' }, 'session_order'],
      [{ label: '2026-27', startDate: '2027-03-31', endDate: '2026-04-01' }, 'session_order'],
      [null, 'session_label'],
    ] as const) expect(parseSessionInput(body), JSON.stringify(body)).toEqual({ ok: false, code });
    expect(isRealDate('2024-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
  });
});
