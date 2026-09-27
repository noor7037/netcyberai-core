import { describe, expect, it } from 'vitest';
import { ADD_FORMS, ADD_ROLES, ATT_CLASS, ATT_WEEKS, MODULES, NAV_GROUPS, VISUALS, attendanceBands, type ModuleId } from './principal-dashboard';
import { PARENT_MENU, PARENT_REPLIES, SEGMENTS } from './role-apps';
import { moduleStatus } from '@/content/module-status';

const moduleIds = Object.keys(MODULES) as ModuleId[];
const navIds = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));

describe('principal dashboard fixture (founder reference, reconciled)', () => {
  it('keeps all 33 reference modules, each in the navigation', () => {
    expect(moduleIds).toHaveLength(33);
    for (const id of moduleIds) expect(navIds, id).toContain(id);
    expect(navIds.filter((id) => id !== 'dashboard' && id !== 'logout').sort()).toEqual([...moduleIds].sort());
  });

  it('gives every module 4 KPIs, a feature map, records and a visual', () => {
    for (const id of moduleIds) {
      const m = MODULES[id];
      expect(m.kpis, id).toHaveLength(4);
      expect(m.features.length, id).toBeGreaterThanOrEqual(8);
      expect(m.rows.length, id).toBe(5);
      expect(VISUALS[id]?.blocks.length, id).toBeGreaterThan(0);
    }
  });

  it('has a real-product status for every module', () => {
    for (const id of moduleIds) expect(moduleStatus[id], id).toBeDefined();
  });

  it('keeps attendance internally consistent (1,180 of 1,240)', () => {
    expect(ATT_CLASS.reduce((a, c) => a + c.present, 0)).toBe(1180);
    expect(ATT_CLASS.reduce((a, c) => a + c.total, 0)).toBe(1240);
    for (const week of Object.values(ATT_WEEKS)) for (const d of week) expect(d.present + d.absent).toBe(1240);
    for (const b of attendanceBands()) expect(b.pct).toBeGreaterThan(80);
  });

  it('offers a full form for each of the six Add roles', () => {
    expect(ADD_ROLES.map((r) => r.id).sort()).toEqual(Object.keys(ADD_FORMS).sort());
    for (const r of ADD_ROLES) expect(ADD_FORMS[r.id].length, r.id).toBeGreaterThanOrEqual(9);
  });

  it('applies the recorded Constitution edits', () => {
    const text = JSON.stringify({ MODULES, NAV_GROUPS, VISUALS, ADD_FORMS, PARENT_REPLIES, SEGMENTS });
    for (const banned of ['Portal', 'portal', 'topper', 'Topper', 'CRDT', 'Firestore', 'Firebase', 'Cloud SQL', 'SLA', 'auth.school_id', 'S_4451', '98765 43']) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it('answers every parent menu item for every child', () => {
    for (const child of Object.values(PARENT_REPLIES)) for (const m of PARENT_MENU) expect(child[m.id], m.id).toBeDefined();
  });
});
