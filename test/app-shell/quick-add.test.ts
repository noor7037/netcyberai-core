import { describe, expect, it } from 'vitest';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { buildQuickAdd, QUICK_ADD_ACTIONS } from '@/lib/contracts/quick-add';
import { GLOBAL_SEARCH_KINDS } from '@/lib/contracts/global-search';
import { isMessageKey } from '@/lib/i18n';

// The "+ New" button (docs/19 rules 4 and 7, C135): computed from the
// registry, the role and the school's entitlements.

// A school with every module on, then the given changes.
const ents = (modules: Record<string, { enabled: boolean }> = {}, accessMode: SchoolEntitlements['accessMode'] = 'full'): SchoolEntitlements => ({
  schoolId: 's',
  plan: 'unassigned',
  accessMode,
  modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: modules[m.id]?.enabled ?? true, source: 'plan' as const }])),
});

describe('words for search and "+ New" exist in both languages', () => {
  it('every action and every kind of result has its message keys', () => {
    for (const key of [...QUICK_ADD_ACTIONS.flatMap((a) => [`new.${a.id}`, `new.${a.id}.hint`]), ...GLOBAL_SEARCH_KINDS.map((k) => `search.group.${k}`)]) expect(isMessageKey(key), key).toBe(true);
  });
});

describe('"+ New" follows the role and the school’s modules (docs/19 rules 4 and 7)', () => {
  const ids = (role: Parameters<typeof buildQuickAdd>[0], e = ents()) => buildQuickAdd(role, e).map((i) => i.id);

  it('the office adds a student, marks attendance and raises a ticket', () => {
    expect(ids('principal')).toEqual(['add-student', 'mark-attendance', 'raise-ticket']);
    expect(ids('school_admin')).toEqual(['add-student', 'mark-attendance', 'raise-ticket']);
  });

  it('a teacher marks attendance and raises a ticket, and cannot add a student', () => {
    expect(ids('teacher')).toEqual(['mark-attendance', 'raise-ticket']);
  });

  it('an accountant only raises a ticket', () => {
    expect(ids('accountant')).toEqual(['raise-ticket']);
  });

  it('a module switched off takes its action away', () => {
    expect(ids('principal', ents({ students: { enabled: false } }))).toEqual(['mark-attendance', 'raise-ticket']);
    expect(ids('principal', ents({ attendance: { enabled: false } }))).toEqual(['add-student', 'raise-ticket']);
    expect(ids('teacher', ents({ attendance: { enabled: false } }))).toEqual(['raise-ticket']);
  });

  it('a read-only school can still raise a ticket, and nothing else', () => {
    expect(ids('principal', ents({}, 'read_only'))).toEqual(['raise-ticket']);
  });

  it('a suspended school can still raise a ticket, and nothing else', () => {
    expect(ids('principal', ents({}, 'suspended'))).toEqual(['raise-ticket']);
  });

  it('the academic coordinator marks attendance and raises a ticket', () => {
    expect(ids('academic_coordinator')).toEqual(['mark-attendance', 'raise-ticket']);
  });

  it('every action leads into the school app', () => {
    for (const a of QUICK_ADD_ACTIONS) expect(a.href.startsWith('/app/')).toBe(true);
  });
});
