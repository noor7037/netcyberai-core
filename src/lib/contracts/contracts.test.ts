import { describe, expect, it } from 'vitest';
import { moduleStatus } from '@/content/module-status';
import * as fixtures from '@/demo-fixture/contracts';
import { schoolShellMenu } from '@/components/app-shell/shell-nav';
import { bottomNavItems, buildNavigation, chartAsTable, FREQUENT_TASKS, FREQUENT_WORK, isModuleEnabled, MODULE_GROUPS, MODULE_IDS, MODULE_REGISTRY, moduleById, PHASES, SCHOOL_ROLES, type ModuleGroupId, type ModuleId, type SchoolEntitlements, type SchoolRole } from './index';

// The registry against docs/17_MODULE_CATALOG.md (C110).

describe('module registry', () => {
  it('has the 34 navigation items, the demo’s ids, each once', () => {
    expect(MODULE_REGISTRY).toHaveLength(34);
    expect(new Set(MODULE_REGISTRY.map((m) => m.id)).size).toBe(34);
    expect(MODULE_REGISTRY.map((m) => m.id).sort()).toEqual([...MODULE_IDS].sort());
    expect([...MODULE_IDS].sort()).toEqual(['dashboard', ...Object.keys(moduleStatus)].sort());
  });

  it('puts every module in its 17 §2 group, groups in order', () => {
    const expected: Record<ModuleGroupId, ModuleId[]> = {
      home: ['dashboard'],
      'school-people': ['setup', 'admissions', 'students', 'parents', 'staff'],
      'teaching-learning': ['academics', 'attendance', 'timetable', 'proxy', 'homework', 'recovery', 'exams'],
      'parent-engagement': ['pulse', 'communication', 'ptm', 'events', 'complaints'],
      finance: ['fees', 'payroll'],
      'records-compliance': ['documents', 'compliance', 'reports'],
      'ai-intelligence': ['early-warning', 'learning-genome', 'curriculum-gap', 'teacher-copilot', 'parent-ai', 'school-auditor', 'career', 'twin', 'automation'],
      help: ['help-center', 'raise-ticket'],
    };
    for (const g of MODULE_GROUPS) expect(MODULE_REGISTRY.filter((m) => m.group === g.id).map((m) => m.id)).toEqual(expected[g.id]);
    expect(MODULE_GROUPS.map((g) => g.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('carries the 17 §3 status and phase', () => {
    expect(moduleById('students')).toMatchObject({ status: 'live', phase: 'P7' });
    expect(moduleById('fees')).toMatchObject({ status: 'partial', phase: 'P3' }); // heads and structures live (C157)
    expect(moduleById('payroll')).toMatchObject({ status: 'spec-v0', phase: 'P7' });
    // C102: Fees comes before WhatsApp, and both before Exams.
    const at = (id: ModuleId) => PHASES.indexOf(moduleById(id).phase);
    expect(at('fees')).toBeLessThan(at('communication'));
    expect(at('communication')).toBeLessThan(at('exams'));
    expect(moduleById('fees').phaseNote).toContain('WhatsApp from P4');
    expect(moduleById('raise-ticket')).toMatchObject({ status: 'live', phase: 'P1' });
    // Homework Recovery (C152, confirmed C153) and Teacher Copilot (C154) left this list when their v1 was built.
    expect(moduleById('teacher-copilot')).toMatchObject({ status: 'foundation', phase: 'P2' });
    expect(moduleById('recovery')).toMatchObject({ status: 'partial', phase: 'P2' });
    expect(MODULE_REGISTRY.filter((m) => m.status === 'spec-v0').map((m) => m.id).sort()).toEqual(
      ['automation', 'career', 'payroll', 'twin'].sort()
    );
    for (const m of MODULE_REGISTRY) expect(m.capabilities.length).toBeGreaterThan(0);
  });

  it('gives each role the 17 §5 groups', () => {
    const groupsOf = (role: SchoolRole) => new Set(MODULE_REGISTRY.filter((m) => m.roles.includes(role)).map((m) => m.group));
    const modulesOf = (role: SchoolRole) => MODULE_REGISTRY.filter((m) => m.roles.includes(role)).map((m) => m.id);
    expect(modulesOf('principal')).toHaveLength(34);
    expect(modulesOf('school_admin')).toHaveLength(34);
    expect([...groupsOf('teacher')].sort()).toEqual(['ai-intelligence', 'help', 'home', 'parent-engagement', 'teaching-learning']);
    expect(modulesOf('teacher').filter((id) => moduleById(id).group === 'ai-intelligence')).toEqual(['early-warning', 'learning-genome', 'curriculum-gap', 'teacher-copilot', 'parent-ai']);
    expect(moduleById('parent-ai').teacherScope).toBe('ownClassesOnly');
    expect(modulesOf('accountant').sort()).toEqual(['dashboard', 'fees', 'help-center', 'payroll', 'raise-ticket', 'reports']);
    const coordinator = modulesOf('academic_coordinator');
    expect(coordinator).toEqual(expect.arrayContaining(['exams', 'reports', 'early-warning', 'learning-genome', 'curriculum-gap', 'teacher-copilot']));
    expect(coordinator).not.toEqual(expect.arrayContaining(['fees']));
    expect(coordinator.some((id) => moduleById(id).group === 'parent-engagement' || moduleById(id).group === 'finance')).toBe(false);
  });

  it('tones come from the group and the logo palette', () => {
    for (const m of MODULE_REGISTRY) expect(m.tone).toEqual(MODULE_GROUPS.find((g) => g.id === m.group)!.tone);
    expect(moduleById('fees').tone[0]).toBe('tangerine');
    expect(moduleById('twin').tone[0]).toBe('grape');
  });
});

describe('navigation and entitlements', () => {
  const base: SchoolEntitlements = { schoolId: 's', plan: 'p', accessMode: 'full', modules: {} };
  const on = (...ids: ModuleId[]): SchoolEntitlements => ({ ...base, modules: Object.fromEntries(ids.map((id) => [id, { enabled: true, source: 'plan' }])) });

  it('shows only entitled modules the role may use, in group order, and no empty group', () => {
    const nav = buildNavigation('accountant', on('dashboard', 'fees', 'students', 'help-center'));
    expect(nav.groups.map((g) => [g.id, g.items.map((i) => i.moduleId)])).toEqual([
      ['home', ['dashboard']],
      ['finance', ['fees']],
      ['help', ['help-center', 'raise-ticket']],
    ]);
  });

  it('a module missing from the entitlements is off; a suspended school keeps only Help', () => {
    expect(isModuleEnabled(base, 'students')).toBe(false);
    const suspended = { ...on('students', 'help-center'), accessMode: 'suspended' as const };
    expect(isModuleEnabled(suspended, 'students')).toBe(false);
    expect(isModuleEnabled(suspended, 'help-center')).toBe(true);
  });

  it('Help Center and Raise Ticket are on in every access mode, whatever the entitlements', () => {
    const off = { ...base, modules: { 'help-center': { enabled: false, source: 'plan' as const } } };
    for (const accessMode of ['full', 'grace', 'read_only', 'suspended'] as const) {
      for (const e of [base, off]) {
        expect(isModuleEnabled({ ...e, accessMode }, 'help-center')).toBe(true);
        expect(isModuleEnabled({ ...e, accessMode }, 'raise-ticket')).toBe(true);
      }
      expect(buildNavigation('teacher', { ...base, accessMode }).groups.map((g) => g.id)).toEqual(['help']);
    }
  });

  it('every item carries its status and phase, so an unbuilt module links to a "coming" page', () => {
    const nav = buildNavigation('principal', on('admissions'));
    expect(nav.groups[0].items[0]).toMatchObject({ moduleId: 'admissions', href: '/app/admissions', status: 'partial', phase: 'P7' });
  });

  it('the phone bottom bar takes the prioritised modules the role has, in order (C121)', () => {
    const all = Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: true, source: 'plan' as const }]));
    expect(bottomNavItems(buildNavigation('teacher', { ...base, modules: all })).map((i) => i.moduleId)).toEqual(['dashboard', 'attendance', 'homework', 'pulse']);
    expect(bottomNavItems(buildNavigation('teacher', on('dashboard', 'pulse'))).map((i) => i.moduleId)).toEqual(['dashboard', 'pulse']);
    expect(bottomNavItems(buildNavigation('accountant', { ...base, modules: all })).map((i) => i.moduleId)).toEqual(['dashboard']);
  });

  it('badges are numbers from the server, never text', () => {
    const nav = buildNavigation('principal', on('complaints'), { complaints: { kind: 'count', value: 3, tone: 'alert' } });
    expect(nav.groups[0].items[0].badge).toEqual({ kind: 'count', value: 3, tone: 'alert' });
  });
});

describe('the menu: Home, Frequent work, then All modules (C235-B)', () => {
  const base: SchoolEntitlements = { schoolId: 's', plan: 'p', accessMode: 'full', modules: {} };
  const full: SchoolEntitlements = { ...base, modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: true, source: 'plan' as const }])) };
  const moduleOf = (w: (typeof FREQUENT_WORK)[SchoolRole][number]) => ('task' in w ? FREQUENT_TASKS[w.task].module : w.module);
  const office = (role: SchoolRole) => role === 'principal' || role === 'school_admin';

  it('every role has 4 to 6 frequent items, each a module the role already has, or a task inside one at its own address', () => {
    for (const role of SCHOOL_ROLES) {
      expect(FREQUENT_WORK[role].length, role).toBeGreaterThanOrEqual(4);
      expect(FREQUENT_WORK[role].length, role).toBeLessThanOrEqual(6);
      for (const w of FREQUENT_WORK[role]) expect(moduleById(moduleOf(w)).roles, `${role} ${moduleOf(w)}`).toContain(role);
      expect(buildNavigation(role, full).frequent, role).toHaveLength(FREQUENT_WORK[role].length);
    }
    for (const task of Object.values(FREQUENT_TASKS)) expect(task.href.startsWith(moduleById(task.module).href), task.href).toBe(true);
    // The founder's reference: the principal's frequent work.
    expect(buildNavigation('principal', full).frequent.map((i) => i.label)).toEqual(['Students', 'Staff', 'Attendance', 'Fees', 'Leave approval']);
    expect(buildNavigation('principal', full).frequent[4]).toMatchObject({ moduleId: 'staff', task: 'leave-approval', href: '/app/staff?show=leave-waiting' });
    expect(buildNavigation('teacher', full).frequent.map((i) => i.moduleId)).toEqual(['attendance', 'homework', 'pulse', 'timetable', 'exams']);
  });

  it('a module the school does not have is left out of Frequent work, as it is from the groups', () => {
    const someOff = { ...full, modules: { ...full.modules, staff: { enabled: false, source: 'founder_override' as const }, fees: { enabled: false, source: 'founder_override' as const } } };
    expect(buildNavigation('principal', someOff).frequent.map((i) => i.moduleId)).toEqual(['students', 'attendance']);
    expect(buildNavigation('accountant', { ...full, accessMode: 'suspended' }).frequent).toEqual([]);
  });

  it('no module was lost: each module is under its own group, for exactly the roles the registry gives it', () => {
    for (const role of SCHOOL_ROLES) {
      const nav = buildNavigation(role, full);
      const inGroups = nav.groups.flatMap((g) => g.items.map((i) => i.moduleId));
      expect([...inGroups].sort(), role).toEqual(MODULE_REGISTRY.filter((m) => m.roles.includes(role)).map((m) => m.id).sort());
      for (const g of nav.groups) for (const i of g.items) expect(moduleById(i.moduleId).group, i.moduleId).toBe(g.id);
      for (const f of nav.frequent) expect(inGroups, `${role} ${f.moduleId}`).toContain(f.moduleId);
    }
  });

  it('the shell’s menu reaches every module for exactly the roles that reached it before: the Dashboard for the office only, as before', () => {
    const reach = (role: SchoolRole) => {
      const menu = schoolShellMenu(buildNavigation(role, full), role);
      return new Set([...menu.home, ...menu.frequent, ...menu.groups.flatMap((g) => g.items)].map((i) => i.href));
    };
    const reached = Object.fromEntries(SCHOOL_ROLES.map((role) => [role, reach(role)])) as Record<SchoolRole, Set<string>>;
    for (const m of MODULE_REGISTRY) {
      const before = m.roles.filter((role) => m.id !== 'dashboard' || office(role));
      expect(SCHOOL_ROLES.filter((role) => reached[role].has(m.href)), m.id).toEqual(SCHOOL_ROLES.filter((role) => before.includes(role)));
    }
    // Nothing else is offered but My Day, the office's Settings and the tasks of Frequent work.
    const known = new Set([...MODULE_REGISTRY.map((m) => m.href), '/app/my-day', '/app/settings', ...Object.values(FREQUENT_TASKS).map((t) => t.href)]);
    for (const role of SCHOOL_ROLES) for (const href of reached[role]) expect(known.has(href), `${role} ${href}`).toBe(true);
    expect(SCHOOL_ROLES.filter((role) => reached[role].has('/app/settings'))).toEqual(['principal', 'school_admin']);
    for (const role of SCHOOL_ROLES) expect(schoolShellMenu(buildNavigation(role, full), role).home[0].href).toBe('/app/my-day');
    // All modules is the seven groups after Home, in order; the Home group's Dashboard sits with the Home items.
    expect(schoolShellMenu(buildNavigation('principal', full), 'principal').groups.map((g) => g.id)).toEqual(['school-people', 'teaching-learning', 'parent-engagement', 'finance', 'records-compliance', 'ai-intelligence', 'help']);
    // The teacher's phone bottom bar is unchanged: My Day and the day-to-day modules.
    expect(schoolShellMenu(buildNavigation('teacher', full), 'teacher').bottom?.map((i) => i.href)).toEqual(['/app/my-day', '/app/attendance', '/app/homework', '/app/pulse']);
    expect(schoolShellMenu(buildNavigation('principal', full), 'principal').bottom).toBeUndefined();
  });
});

describe('charts', () => {
  it('every chart kind has a table view', () => {
    expect(chartAsTable(fixtures.attendanceTrendFixture.data)).toEqual({
      columns: ['Date', 'Whole school'],
      rows: [
        ['2026-09-21', 92.5],
        ['2026-09-22', 93.8],
        ['2026-09-23', null],
        ['2026-09-24', 94.1],
      ],
    });
    expect(chartAsTable(fixtures.classCoverageFixture.data).rows).toEqual([
      ['Class 6', 48],
      ['Class 8', 52],
      ['Class 10', null],
    ]);
    expect(chartAsTable(fixtures.feeShareFixture.data).columns).toEqual(['', 'Value']);
  });
});

describe('fixtures', () => {
  it('every fixture is marked non-real and carries the notice', () => {
    const all = Object.values(fixtures);
    expect(all.length).toBeGreaterThanOrEqual(15);
    for (const f of all) {
      expect(f.nonReal).toBe(true);
      expect(f.notice).toMatch(/Not a real school/);
    }
  });

  it('fixture navigation follows the rules (teacher: no Finance, no School & People)', () => {
    const groups = fixtures.teacherNavigationFixture.data.groups.map((g) => g.id);
    expect(groups).not.toContain('finance');
    expect(groups).not.toContain('school-people');
    expect(fixtures.principalNavigationFixture.data.groups.flatMap((g) => g.items.map((i) => i.moduleId))).not.toContain('payroll');
  });
});
