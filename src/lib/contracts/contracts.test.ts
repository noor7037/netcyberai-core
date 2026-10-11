import { describe, expect, it } from 'vitest';
import { moduleStatus } from '@/content/module-status';
import * as fixtures from '@/demo-fixture/contracts';
import { bottomNavItems, buildNavigation, chartAsTable, isModuleEnabled, MODULE_GROUPS, MODULE_IDS, MODULE_REGISTRY, moduleById, PHASES, type ModuleGroupId, type ModuleId, type SchoolEntitlements, type SchoolRole } from './index';

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
      ['automation', 'career', 'complaints', 'curriculum-gap', 'learning-genome', 'parent-ai', 'payroll', 'school-auditor', 'twin'].sort()
    );
    for (const m of MODULE_REGISTRY) expect(m.capabilities.length).toBeGreaterThan(0);
  });

  it('gives each role the 17 §5 groups', () => {
    const groupsOf = (role: SchoolRole) => new Set(MODULE_REGISTRY.filter((m) => m.roles.includes(role)).map((m) => m.group));
    const modulesOf = (role: SchoolRole) => MODULE_REGISTRY.filter((m) => m.roles.includes(role)).map((m) => m.id);
    expect(modulesOf('principal')).toHaveLength(34);
    expect(modulesOf('school_admin')).toHaveLength(34);
    expect([...groupsOf('teacher')].sort()).toEqual(['ai-intelligence', 'help', 'home', 'parent-engagement', 'teaching-learning']);
    expect(modulesOf('teacher').filter((id) => moduleById(id).group === 'ai-intelligence')).toEqual(['teacher-copilot', 'parent-ai']);
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
    const nav = buildNavigation('principal', on('proxy'));
    expect(nav.groups[0].items[0]).toMatchObject({ moduleId: 'proxy', href: '/app/proxy', status: 'planned', phase: 'P5' });
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
