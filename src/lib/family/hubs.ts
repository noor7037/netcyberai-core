import { INDIAN_STATES } from '@/lib/contracts/indian-states';
import { FAMILY_MODULES } from '@/lib/contracts/family-modules';
import type { MessageKey } from '@/lib/i18n';

// The three public hubs of the Future tab (H1; docs/37 §3 decision 8): Career Hub, Exam Portal, Schemes & Scholarships.
// Each is a module of the registry (src/lib/contracts/family-modules.ts), so Control switches it and the Future page lists
// only the hubs that are built and on. This file holds only how a hub is shown. The entries are verified items from
// official sources, added later: until then every section says so honestly, and nothing is invented here.

export type HubEntry = { id: string; title: string; stateCode: string | null };
export type HubPresentation = { module: string; path: string; title: MessageKey; withState: boolean };

// By module id: where the hub lives and its name. A module of the Future tab without a line here is simply not listed.
export const HUB_PRESENTATION: Record<string, HubPresentation> = {
  careers: { module: 'careers', path: '/family/future/career', title: 'fam.hub.career', withState: false },
  exams_portal: { module: 'exams_portal', path: '/family/future/exams', title: 'fam.hub.exams', withState: true },
  opportunities: { module: 'opportunities', path: '/family/future/schemes', title: 'fam.hub.schemes', withState: true },
};

// The hubs the registry declares on the Future tab, built, in the registry's order.
export function futureHubs(): HubPresentation[] {
  return FAMILY_MODULES.filter((m) => m.tab === 'future' && m.built && !m.addOn)
    .map((m) => HUB_PRESENTATION[m.id])
    .filter((h): h is HubPresentation => Boolean(h));
}

// The entries of a hub. None are published yet; this is the one place content is read from once it is.
export async function loadHubEntries(module: string): Promise<HubEntry[]> {
  void module;
  return [];
}

export type HubSections = { national: HubEntry[]; state: { code: string; name: string; entries: HubEntry[] } | null };

// National entries are for every child. A state's entries are for the children of that state only: a hub with a state
// part shows the child's own state and no other.
export function hubSections(entries: readonly HubEntry[], stateCode: string | null | undefined, withState: boolean): HubSections {
  const known = INDIAN_STATES.find((s) => s.code === stateCode);
  return {
    national: entries.filter((e) => e.stateCode === null),
    state: withState && known ? { code: known.code, name: known.name, entries: entries.filter((e) => e.stateCode === known.code) } : null,
  };
}
