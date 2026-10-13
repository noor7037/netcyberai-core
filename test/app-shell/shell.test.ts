import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/app/attendance', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AppShell } from '@/components/app-shell/AppShell';
import { comingState, moduleForSegment } from '@/components/app-shell/coming';
import { activeHref, toShellGroups, toShellItem } from '@/components/app-shell/shell-nav';
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
    expect(items.find((i) => i.href === '/app/admissions')).toMatchObject({ comingIn: 'P7' });
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
