import { describe, expect, it } from 'vitest';
import { MODULE_GROUPS, MODULE_REGISTRY, SCHOOL_ROLES } from '@/lib/contracts/modules';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { TICKET_STATUSES } from '@/lib/contracts/tickets';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { HINDI_REVIEWED, isLang, isMessageKey, LANG_NAME, langCookieValue, readLangCookie, t, tCount, tOr } from '@/lib/i18n';
import { AppShell } from '@/components/app-shell/AppShell';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { controlShellGroups, toShellGroups } from '@/components/app-shell/shell-nav';
import { buildNavigation } from '@/lib/contracts/navigation';
import { controlNav } from '@/lib/nav/nav-items';
import { shellWords } from '@/components/app-shell/shell-words';

// The app's two languages (docs/19 rule 3, C134).

// A school with every module on, then the given changes.
const ents = (modules: Record<string, { enabled: boolean }> = {}, accessMode: SchoolEntitlements['accessMode'] = 'full'): SchoolEntitlements => ({
  schoolId: 's',
  plan: 'unassigned',
  accessMode,
  modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: modules[m.id]?.enabled ?? true, source: 'plan' as const }])),
});

describe('message files', () => {
  it('English and Hindi have exactly the same keys, none empty', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of [...Object.entries(en), ...Object.entries(hi)]) expect(v.trim(), k).not.toBe('');
  });

  it('a Hindi message uses the same {values} as the English one', () => {
    const values = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(values(hi[k]), k).toEqual(values(en[k]));
  });

  it('Hindi is written in Hindi: no message is left as its English, apart from product names', () => {
    // Board names (C263) are written the same in every language.
    const sameOnPurpose = new Set(['shell.brand.control', 'group.control', 'fam.lang.en', 'fam.lang.hi', 'fam.board.CBSE', 'fam.board.CISCE', 'fam.board.IB']);
    for (const k of Object.keys(hi) as (keyof typeof hi)[]) if (!sameOnPurpose.has(k)) expect(hi[k], k).not.toBe(en[k]);
  });

  it('every Hindi message that is not a product name has Devanagari', () => {
    // Board names (C263) are written the same in every language.
    const sameOnPurpose = new Set(['shell.brand.control', 'group.control', 'fam.lang.en', 'fam.lang.hi', 'fam.board.CBSE', 'fam.board.CISCE', 'fam.board.IB']);
    for (const k of Object.keys(hi) as (keyof typeof hi)[]) {
      if (!sameOnPurpose.has(k)) expect(/[ऀ-ॿ]/.test(hi[k]), `${k}: ${hi[k]}`).toBe(true);
    }
  });

  it('stays marked unreviewed until the founder approves the Hindi', () => {
    expect(HINDI_REVIEWED).toBe(false);
  });

  it('every module, group, role, ticket status and Control page has its words in both languages', () => {
    const need = [
      ...MODULE_REGISTRY.map((m) => `module.${m.id}`),
      ...MODULE_GROUPS.map((g) => `group.${g.id}`),
      ...SCHOOL_ROLES.map((r) => `role.${r}`),
      'role.super_admin',
      ...TICKET_STATUSES.map((s) => `search.ticket.status.${s}`),
      ...controlNav.map((n) => `control.nav.${n.href === '/control' ? 'dashboard' : n.href.replace('/control/', '')}`),
    ];
    for (const key of need) expect(isMessageKey(key), key).toBe(true);
  });

  it('the English module and group names are the registry’s own', () => {
    for (const m of MODULE_REGISTRY) expect(t('en', `module.${m.id}` as keyof typeof en)).toBe(m.label);
    for (const g of MODULE_GROUPS) expect(t('en', `group.${g.id}` as keyof typeof en)).toBe(g.label);
  });
});

describe('t()', () => {
  it('fills in values and leaves an unknown one visible', () => {
    expect(t('en', 'search.none', { query: 'Aarav' })).toContain('“Aarav”');
    expect(t('hi', 'search.student.class', { class: '5-A' })).toBe('कक्षा 5-A');
    expect(t('en', 'search.student.class', {})).toBe('Class {class}');
  });

  it('a value is put in as text, never read as a pattern', () => {
    expect(t('en', 'search.none', { query: '$1 {count}' })).toContain('“$1 {count}”');
  });

  it('counts in both languages', () => {
    expect(tCount('en', 'search.count', 1)).toBe('1 result');
    expect(tCount('en', 'search.count', 4)).toBe('4 results');
    expect(tCount('hi', 'search.count', 1)).toBe('1 नतीजा');
    expect(tCount('hi', 'search.count', 4)).toBe('4 नतीजे');
  });

  it('an id the files do not know falls back to the given words', () => {
    expect(tOr('hi', 'module.not-a-module', 'New Module')).toBe('New Module');
    expect(tOr('hi', 'constructor', 'x')).toBe('x');
  });

  it('knows its two languages, each named in its own', () => {
    expect(isLang('hi')).toBe(true);
    expect(isLang('fr')).toBe(false);
    expect(isLang(undefined)).toBe(false);
    expect(LANG_NAME).toEqual({ en: 'English', hi: 'हिन्दी' });
  });
});

describe('the menu in the person’s language', () => {
  it('school menu: groups and modules in Hindi, same links', () => {
    const nav = buildNavigation('principal', ents());
    const enMenu = toShellGroups(nav, 'en');
    const hiMenu = toShellGroups(nav, 'hi');
    expect(hiMenu.map((g) => g.items.map((i) => i.href))).toEqual(enMenu.map((g) => g.items.map((i) => i.href)));
    expect(hiMenu.find((g) => g.id === 'school-people')!.label).toBe('स्कूल और लोग');
    expect(hiMenu.flatMap((g) => g.items).find((i) => i.href === '/app/students')!.label).toBe('विद्यार्थी');
    expect(enMenu.flatMap((g) => g.items).find((i) => i.href === '/app/students')!.label).toBe('Students');
  });

  it('Control menu in Hindi', () => {
    const items = controlShellGroups(controlNav, undefined, 'hi')[0].items;
    expect(items.find((i) => i.href === '/control/schools')!.label).toBe('स्कूल');
    expect(items.find((i) => i.href === '/control')!.label).toBe('डैशबोर्ड');
  });
});

describe('the language belongs to the person, not the browser', () => {
  const A = '00000000-0000-4000-8000-00000000a001';
  const B = '00000000-0000-4000-8000-00000000a002';

  it('a cookie written for this person is read', () => {
    expect(readLangCookie(langCookieValue(A, 'hi'), A)).toBe('hi');
    expect(readLangCookie(langCookieValue(A, 'en'), A)).toBe('en');
  });

  it('a cookie the last person left on a shared computer is ignored', () => {
    expect(readLangCookie(langCookieValue(A, 'hi'), B)).toBeNull();
  });

  it('a cookie that is missing, bare or made up is ignored', () => {
    expect(readLangCookie(undefined, A)).toBeNull();
    expect(readLangCookie('', A)).toBeNull();
    expect(readLangCookie('hi', A)).toBeNull(); // the bare language, as an older build might have written
    expect(readLangCookie(`${A}.fr`, A)).toBeNull();
    expect(readLangCookie(`${A}.`, A)).toBeNull();
    expect(readLangCookie(`.hi`, '')).toBeNull();
    expect(readLangCookie(`${A}x.hi`, A)).toBeNull();
  });
});

vi.mock('next/navigation', () => ({ usePathname: () => '/app/students', useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

describe('the shell in Hindi', () => {
  const nav = buildNavigation('principal', ents());
  const render = (lang: 'en' | 'hi') =>
    renderToStaticMarkup(
      h(AppShell, { ...shellWords(lang), groups: toShellGroups(nav, lang), brand: 'Illustrative School', roleLabel: t(lang, 'role.principal'), navLabel: t(lang, 'shell.nav.school'), accountHref: '/app/account', lang, children: h('p', { id: 'page-body' }, 'A screen still in English') })
    );

  it('its own words are Hindi: menu, account, sign out, and the switch names each language in its own', () => {
    const html = render('hi');
    for (const words of ['विद्यार्थी', 'स्कूल और लोग', 'मेरा खाता', 'साइन आउट', 'प्रधानाचार्य', 'English', 'हिन्दी']) expect(html).toContain(words);
    for (const words of ['My account', 'Sign out', '>Students<']) expect(html).not.toContain(words);
    expect(html).toMatch(/<button[^>]*lang="hi"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/<button[^>]*lang="en"[^>]*aria-pressed="false"/);
  });

  it('marks its own parts as Hindi and leaves the page inside unmarked, so English is read as English', () => {
    const html = render('hi');
    expect(html).toMatch(/<aside[^>]*lang="hi"/);
    expect(html).toMatch(/<header[^>]*lang="hi"/);
    // Nothing that contains the page body carries lang="hi".
    const before = html.slice(0, html.indexOf('id="page-body"'));
    const main = before.slice(before.lastIndexOf('<main'));
    expect(main).not.toMatch(/<main[^>]*lang=/);
    // The shell's first part is its branded bar (C235-B): the wrapper around everything carries no language.
    expect(html.slice(0, html.indexOf('<header'))).not.toContain('lang="hi"');
  });

  it('in English nothing is marked Hindi except the switch’s own Hindi name', () => {
    const html = render('en');
    expect(html.match(/lang="hi"/g)).toHaveLength(1);
    expect(html).toContain('My account');
  });
});
