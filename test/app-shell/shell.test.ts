import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/app/attendance', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AppShell } from '@/components/app-shell/AppShell';
import { comingState, moduleForSegment } from '@/components/app-shell/coming';
import { activeHref, schoolShellMenu, toShellGroups, toShellItem } from '@/components/app-shell/shell-nav';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { bottomNavItems, buildNavigation } from '@/lib/contracts/navigation';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';

const all = Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: true, source: 'plan' as const }]));
const ent: SchoolEntitlements = { schoolId: 's', plan: 'standard', accessMode: 'full', modules: all };

describe('shell navigation', () => {
  it('maps the 8 groups from the registry and marks unbuilt modules with their phase only', () => {
    const groups = toShellGroups(buildNavigation('principal', ent));
    expect(groups.map((g) => g.label)).toEqual(['Home', 'School & People', 'Teaching & Learning', 'Parent Engagement', 'Finance', 'Records & Compliance', 'AI Intelligence', 'Help']);
    const items = groups.flatMap((g) => g.items);
    expect(items).toHaveLength(MODULE_REGISTRY.length);
    // Admissions is built (C221); a module still to come is marked with its phase.
    expect(items.find((i) => i.href === '/app/admissions')!.comingIn).toBeUndefined();
    expect(toShellItem({ ...buildNavigation('principal', ent).groups.flatMap((g) => g.items).find((i) => i.href === '/app/admissions')!, status: 'planned' })).toMatchObject({ comingIn: 'P7' });
    expect(items.find((i) => i.href === '/app/students')!.comingIn).toBeUndefined();
  });

  it('marks the closest route as active', () => {
    const groups = toShellGroups(buildNavigation('principal', ent));
    expect(activeHref(groups, '/app/help/ticket')).toBe('/app/help/ticket');
    expect(activeHref(groups, '/app/students/abc/id-card')).toBe('/app/students');
    expect(activeHref(groups, '/app/nowhere')).toBeNull();
  });

  it('an unbuilt route shows its Coming page, or why the person cannot use it', () => {
    expect(comingState('principal', ent, 'admissions')).toBe('coming');
    expect(comingState('accountant', ent, 'admissions')).toBe('role');
    expect(comingState('principal', { ...ent, modules: {} }, 'admissions')).toBe('module');
    expect(comingState('teacher', { ...ent, modules: {}, accessMode: 'suspended' }, 'raise-ticket')).toBe('coming'); // help is always on
    expect(moduleForSegment('admissions')?.id).toBe('admissions');
    expect(moduleForSegment('documents')).toBeNull(); // its route is /app/documents-id-cards
    expect(moduleForSegment('class-notices')).toBeNull(); // the old stub is gone (C200): notices live in Communication, and this address is a 404
    expect(moduleForSegment('settings')).toBeNull(); // not a module route: 404 from the dynamic page
  });
});

describe('app shell render', () => {
  const render = (role: 'principal' | 'teacher') => {
    const nav = buildNavigation(role, ent);
    return renderToStaticMarkup(
      h(AppShell, {
        groups: toShellGroups(nav),
        bottomItems: role === 'teacher' ? bottomNavItems(nav).map((i) => toShellItem(i)) : undefined,
        brand: 'Illustrative School',
        roleLabel: role,
        navLabel: 'School navigation',
        accountHref: '/app/account',
        action: role === 'teacher' ? h('button', null, 'Scan') : undefined,
        children: h('p', null, 'page'),
      })
    );
  };

  it('opens the page’s group, marks the page, and offers account and sign out', () => {
    const html = render('principal');
    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/aria-expanded="true"[^>]*>.*?Teaching &amp; Learning/);
    expect(html).toContain('My account');
    expect(html).toContain('Sign out');
    expect(html).not.toContain('Quick navigation');
  });

  it('the teacher shell has the phone bottom bar with its priority modules, More, and the scan action', () => {
    const html = render('teacher');
    expect(html).toContain('aria-label="Quick menu"');
    for (const label of ['Dashboard', 'Attendance', 'Homework', 'Daily Pulse', 'More', 'Scan']) expect(html).toContain(label);
    expect(html).not.toContain('Payroll'); // not a teacher module
  });
});

describe('the branded bar and the menu (C235-B)', () => {
  const shell = (role: 'principal' | 'teacher', extra: Record<string, unknown> = {}) => {
    const menu = schoolShellMenu(buildNavigation(role, ent), role);
    return renderToStaticMarkup(
      h(AppShell, {
        groups: menu.groups,
        home: menu.home,
        frequent: menu.frequent,
        bottomItems: menu.bottom,
        brand: 'Made-up Public School',
        person: { name: 'Asha Example', role: role === 'principal' ? 'Principal' : 'Teacher' },
        roleLabel: role,
        navLabel: 'School menu',
        accountHref: '/app/account',
        children: h('p', null, 'page'),
        ...extra,
      })
    );
  };

  it('shows the school’s logo and name, and the person’s name and role, on every screen', () => {
    const html = shell('principal', { logoSrc: '/api/branding/logo?school=s&v=1700000000000' });
    expect(html).toContain('src="/api/branding/logo?school=s&amp;v=1700000000000"');
    expect(html).toMatch(/data-shell-school[^>]*>Made-up Public School</);
    expect(html).toContain('Asha Example · Principal'); // the phone's second line
    expect(html).toMatch(/data-shell-person[^>]*aria-label="My account: Asha Example, Principal"/);
    // The bar is not printed; the person's link goes to their account.
    expect(html).toMatch(/data-shell-header[^>]*print:hidden/);
    expect(/<a[^>]*data-shell-person[^>]*>/.exec(html)?.[0]).toContain('href="/app/account"');
  });

  it('a school with no logo is shown by its initials; with no name known, the role alone', () => {
    const html = shell('principal', { person: null, roleLabel: 'Principal' });
    expect(html).toContain('data-school-logo="initials"');
    expect(html).toMatch(/data-school-logo="initials"[^>]*>MP</);
    expect(html).not.toContain('<img');
    expect(html).toMatch(/data-shell-person-line[^>]*>Principal</);
  });

  it('the menu: Home items, then Frequent work, then All modules with only the page’s group open', () => {
    const html = shell('principal');
    const at = (s: string) => html.indexOf(s);
    expect(at('data-nav-part="home"')).toBeGreaterThan(-1);
    expect(at('data-nav-part="home"')).toBeLessThan(at('Frequent work'));
    expect(at('Frequent work')).toBeLessThan(at('All modules'));
    for (const label of ['My Day', 'Dashboard', 'Settings', 'Leave approval']) expect(html, label).toContain(label);
    // The page is /app/attendance: Teaching & Learning is open, the other groups are closed.
    expect(html).toMatch(/aria-expanded="true"[^>]*>.*?Teaching &amp; Learning/);
    expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('the teacher keeps the phone bottom bar and has no Settings or Dashboard in the menu', () => {
    const html = shell('teacher');
    expect(html).toContain('aria-label="Quick menu"');
    expect(html).not.toContain('href="/app/settings"');
    expect(html).not.toContain('href="/app/dashboard"');
  });
});

