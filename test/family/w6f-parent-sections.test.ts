import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ParentArea, TABS } from '@/components/family/ParentArea';
import { familyWords } from '@/lib/family/words';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }), usePathname: () => '/family/parent' }));

// W6-F (docs/38 §6): the parent area is six sections in the tabs pattern. Every consent switch stays on the Privacy tab.
const words = familyWords('en', Object.keys(en).filter((k) => k.startsWith('fam.')) as never[]);
const child = { childId: 'c1', firstName: 'Asha', classLevel: 9, board: 'cbse', language: 'en' as const, style: 'en' as const, stateCode: '', freeSubject: null, subjects: [] };
const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(ParentArea, { w: words, lang: 'en', children: [child], states: [], studyCore: true, calm: [], photo: { granted: false, renew: true }, voice: { granted: false }, offers: { granted: false }, ...over } as never));

describe('the parent area sections', () => {
  it('has the six tabs in order, Overview open, each tab naming its panel', () => {
    const html = render();
    expect(TABS).toEqual(['overview', 'children', 'school', 'learning', 'privacy', 'account']);
    expect(html).toContain('role="tablist"');
    const tabs = [...html.matchAll(/role="tab"[^>]*data-parent-tab="(\w+)"/g)].map((m) => m[1]);
    expect(tabs).toEqual([...TABS]);
    expect(html).toMatch(/aria-selected="true"[^>]*tabindex="0"[^>]*data-parent-tab="overview"/);
    for (const id of TABS) {
      expect(html).toContain(`aria-controls="fam-parent-panel-${id}"`);
      expect(html).toMatch(new RegExp(`role="tabpanel" id="fam-parent-panel-${id}" aria-labelledby="fam-parent-tab-${id}"`));
    }
    // Only Overview shows on the first paint; the others are hidden, not dropped.
    expect(html.match(/data-parent-panel="\w+" hidden=""/g)?.length).toBe(5);
  });

  it('keeps every consent switch on the Privacy panel', () => {
    const html = render();
    const privacy = html.slice(html.indexOf('data-parent-panel="privacy"'), html.indexOf('data-parent-panel="account"'));
    expect(privacy.match(/role="switch"/g)?.length).toBe(4);
    expect(privacy).toContain('data-consent="photo_input"');
    expect(privacy).toContain('data-consent-changed="photo_input"');
    expect(privacy).toContain('data-consent-voice');
    expect(privacy).toContain('data-consent="offers"');
    expect(html.match(/role="switch"/g)?.length).toBe(4);
  });

  it('puts the account actions on the Account panel', () => {
    const html = render();
    const account = html.slice(html.indexOf('data-parent-panel="account"'));
    expect(account).toContain(words['fam.parent.signOutAll']);
    expect(account).toContain(words['fam.parent.deleteAccountYes']);
  });

  it('lists what needs the parent with one action each, or says nothing does', () => {
    expect(render()).toContain('data-parent-needs-none');
    const html = render({ needs: [{ kind: 'renew' }, { kind: 'requests_declined', n: 2 }, { kind: 'meeting', name: 'Asha' }] });
    const list = html.slice(html.indexOf('data-parent-needs'), html.indexOf('data-calm-card') > 0 ? html.indexOf('data-calm-card') : undefined);
    expect(list.match(new RegExp(`>${words['fam.parent.needs.open']}<`, 'g'))?.length).toBe(3);
    expect(html).toContain(words['fam.parent.needs.renew']);
    expect(html).toContain('Chapter requests that could not be made: 2.');
  });

  it('shows one sentence and one action when Learning has nothing', () => {
    const html = render({ slots: {} });
    expect(html).toContain('data-parent-empty');
    expect(html).toContain(words['fam.parent.learningEmpty']);
    expect(render({ slots: { learning: h('p', { 'data-learning-body': true }, 'x') } })).not.toContain('data-parent-empty');
  });

  it('has every new word in English and Hindi', () => {
    const keys = Object.keys(en).filter((k) => /^fam\.parent\.(tab|needs)\.|^fam\.parent\.(tabs|learningEmpty|goChildren)$/.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(17);
    for (const k of keys) expect((hi as Record<string, string>)[k], k).toBeTruthy();
  });
});
