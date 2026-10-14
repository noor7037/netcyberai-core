import type { EntitlementsApi, EntitlementsData } from '@/components/control/SchoolEntitlementsPanel';
import type { AccessMode, EntitlementHistoryEntry, ModuleEntitlement } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY, type ModuleId } from '@/lib/contracts/modules';
import { entitlementsFixture } from './contracts';

// Illustrative, in-memory stand-in for the Control entitlements API, for
// the development preview only: changes update what the panel shows and add
// a history line, as the real API does through the audit log. The plan here
// is illustrative too: it is no row of the plans table, and no real plan's
// id or name is written in src (C204).

const working = MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial').map((m) => m.id);
const PLAN = entitlementsFixture.data.plan;

export function createEntitlementsPreviewApi(): EntitlementsApi {
  let n = 3;
  const state: EntitlementsData = {
    entitlements: { ...entitlementsFixture.data, modules: { ...entitlementsFixture.data.modules } },
    plans: [{ planId: PLAN, label: 'Illustrative plan', moduleIds: working }],
    history: [
      { id: '2', at: '2026-09-30T10:20:00Z', actorName: 'Illustrative Founder', kind: 'module_changed', moduleId: 'twin', enabled: { from: true, to: false }, reason: 'Not part of the pilot' },
      { id: '1', at: '2026-09-30T09:00:00Z', actorName: null, kind: 'plan_applied', plan: PLAN, moduleCount: working.length, reason: 'school created from application' },
    ],
  };
  const add = (e: Omit<EntitlementHistoryEntry, 'id' | 'at' | 'actorName'>) =>
    state.history.unshift({ ...e, id: String(n++), at: new Date().toISOString(), actorName: 'Illustrative Founder' });

  return {
    async load() {
      return { entitlements: { ...state.entitlements }, plans: state.plans, history: [...state.history] };
    },
    async change(body) {
      const reason = String(body.reason ?? '');
      const modules = { ...state.entitlements.modules } as Record<ModuleId, ModuleEntitlement>;
      if (typeof body.moduleId === 'string') {
        const id = body.moduleId as ModuleId;
        const from = modules[id]?.enabled ?? null;
        modules[id] = { enabled: body.enabled === true, source: 'founder_override' };
        add({ kind: 'module_changed', moduleId: id, enabled: { from, to: body.enabled === true }, reason });
      } else if (typeof body.applyPlan === 'string') {
        for (const id of working) if (modules[id]?.source !== 'founder_override') modules[id] = { enabled: true, source: 'plan' };
        add({ kind: 'plan_applied', plan: body.applyPlan, moduleCount: working.length, reason });
      } else {
        const to = body.accessMode as AccessMode;
        add({ kind: 'access_changed', accessMode: { from: state.entitlements.accessMode, to }, reason });
        state.entitlements = { ...state.entitlements, accessMode: to, graceEndsAt: to === 'grace' ? String(body.graceEndsAt) : undefined };
      }
      state.entitlements = { ...state.entitlements, modules };
    },
  };
}
