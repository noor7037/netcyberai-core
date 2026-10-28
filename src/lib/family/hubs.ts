import { INDIAN_STATES } from '@/lib/contracts/indian-states';
import { FAMILY_MODULES } from '@/lib/contracts/family-modules';
import type { PoolClient } from 'pg';
import type { MessageKey } from '@/lib/i18n';

// The three public hubs of the Future tab (H1; docs/37 §3 decision 8): Career Hub, Exam Portal, Schemes & Scholarships.
// Each is a module of the registry (src/lib/contracts/family-modules.ts), so Control switches it and the Future page lists
// only the hubs that are built and on. This file holds only how a hub is shown. The entries are verified items from
// official sources, added in Control → Content → Hubs: while a section has none it says so honestly, and nothing is
// invented here.

export type HubEntry = { id: string; titleEn: string; titleHi: string | null; bodyEn: string; bodyHi: string | null; stateCode: string | null; sourceUrl: string; verifiedOn: string };
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

// The entries of a hub for one child: published, before their review day (the table's own policy holds both for the
// family role, content.hub_entries), in the child's class band; the national ones and the child's own state's.
// Control → Content → Hubs adds them (W4-3, C387); a hub without any says so honestly.
export async function loadHubEntries(db: Pick<PoolClient, 'query'>, module: string, classLevel: number, stateCode: string | null): Promise<HubEntry[]> {
  const { rows } = await db.query(
    `select entry_id, title_en, title_hi, body_en, body_hi, state_code, source_url, to_char(verified_on, 'YYYY-MM-DD') as verified_on
       from content.hub_entries
      where hub = $1 and class_from <= $2 and class_to >= $2 and (scope = 'national' or state_code = $3::text)
      order by review_on, created_at`,
    [module, classLevel, stateCode]
  );
  return rows.map((r) => ({
    id: String(r.entry_id),
    titleEn: String(r.title_en),
    titleHi: r.title_hi ?? null,
    bodyEn: String(r.body_en),
    bodyHi: r.body_hi ?? null,
    stateCode: r.state_code ?? null,
    sourceUrl: String(r.source_url),
    verifiedOn: String(r.verified_on),
  }));
}

// The words in the child's language where they exist, otherwise the English; each carries the language it is written in.
export function hubText(e: HubEntry, lang: 'en' | 'hi'): { title: string; titleLang: 'en' | 'hi'; body: string; bodyLang: 'en' | 'hi' } {
  const hiTitle = lang === 'hi' && e.titleHi;
  const hiBody = lang === 'hi' && e.bodyHi;
  return { title: hiTitle ? e.titleHi! : e.titleEn, titleLang: hiTitle ? 'hi' : 'en', body: hiBody ? e.bodyHi! : e.bodyEn, bodyLang: hiBody ? 'hi' : 'en' };
}

export type HubSections<E extends { stateCode: string | null } = HubEntry> = { national: E[]; state: { code: string; name: string; entries: E[] } | null };

// National entries are for every child. A state's entries are for the children of that state only: a hub with a state
// part shows the child's own state and no other.
export function hubSections<E extends { stateCode: string | null }>(entries: readonly E[], stateCode: string | null | undefined, withState: boolean): HubSections<E> {
  const known = INDIAN_STATES.find((s) => s.code === stateCode);
  return {
    national: entries.filter((e) => e.stateCode === null),
    state: withState && known ? { code: known.code, name: known.name, entries: entries.filter((e) => e.stateCode === known.code) } : null,
  };
}
