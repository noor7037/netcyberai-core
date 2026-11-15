import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { familyModuleOn } from '@/lib/family/flags';
import { fill } from '@/lib/family/fill';
import { HUB_PRESENTATION, hubSections, hubText, loadHubEntries, type HubEntry } from '@/lib/family/hubs';
import { FutureHub } from '@/components/family/FutureHub';
import { loadFutureCards } from '@/lib/family/future-listings';
import { indiaDate } from '@/lib/time/india';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyStates } from '@/lib/family/states';
import { t } from '@/lib/i18n';

// The site a source is on ("india.gov.in"); named as words. Only the Future listings' Apply button links out, and only to
// official sites (src/lib/family/future-domains.ts, founder 15 Nov 2026); a hub entry's source stays words.
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
import { sameInkOnBothSides } from '@/lib/family/day-text';

// One hub of the Future tab (H1): its sections and the entries Control publishes (W4-3, C387). Server-rendered, no
// script, no image: the structure is the national part for every child and, where the hub has one, the child's own
// state. Each entry shows its source link and the day it was checked; an empty section says so honestly.
const glyph = {
  national: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c3 3 4.5 6.5 4.5 10S15 19 12 22c-3-3-4.5-6.5-4.5-10S9 5 12 2z',
  state: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
};

// The day it was checked, as the child reads dates (the stored day, not shifted by the phone's time zone).
const dayText = (lang: 'en' | 'hi', iso: string) => sameInkOnBothSides(new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));

function Section({ id, title, entries, empty, path, lang }: { id: 'national' | 'state'; title: string; entries: HubEntry[]; empty: string; path: string; lang: 'en' | 'hi' }) {
  return (
    <section data-hub-section={id} aria-labelledby={`hub-${id}`} className="fam-card fam-section fam-rise" style={{ ['--d' as string]: id === 'state' ? '80ms' : '0ms' } as React.CSSProperties}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="fam-chip-icon bg-saffron text-ink">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={glyph[id]} />
          </svg>
        </span>
        <h2 id={`hub-${id}`} className="fam-h2 text-ink">
          {title}
        </h2>
      </div>
      {entries.length === 0 ? (
        <p data-hub-empty className="rounded-2xl bg-lesson-butter px-4 py-3 text-sm font-semibold text-ink">
          {empty}
        </p>
      ) : (
        <ul data-hub-entries={path} className="flex flex-col gap-2">
          {entries.map((e) => {
            const x = hubText(e, lang);
            return (
              <li key={e.id} data-hub-entry={e.id} className="flex flex-col gap-2 rounded-2xl bg-paper px-3 py-3 text-sm text-ink">
                <h3 lang={x.titleLang} className="text-base font-extrabold">
                  {x.title}
                </h3>
                <p lang={x.bodyLang} className="whitespace-pre-line">
                  {x.body}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs font-semibold">
                  {/* Hub entries: the source's site is named as words (12 Nov rule). Apply links of Future listings: FutureHub. */}
                  <span data-hub-source data-host className="inline-flex min-h-[44px] items-center gap-1 text-ink">
                    {t(lang, 'fam.hub.source')}: {hostOf(e.sourceUrl)}
                  </span>
                  <span className="fam-pill bg-lesson-mint text-ink">{fill(t(lang, 'fam.hub.checked'), { date: dayText(lang, e.verifiedOn) })}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// The state's name in the child's language (src/lib/family/states.ts).
export const stateName = (lang: 'en' | 'hi', code: string, fallback: string) => familyStates(lang).find((s) => s.code === code)?.name ?? fallback;

export async function HubShell({ module, q = '' }: { module: 'careers' | 'exams_portal' | 'opportunities'; q?: string }) {
  const hub = HUB_PRESENTATION[module];
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  const on = await familyPageRead(page, (db) => familyModuleOn(db, hub.module, page.session.accountId));
  if (!on) redirect('/family/future');
  const child = page.child;
  // The approved Future listings for this child's class and state (the plan, step 1), and any older hub entries still published.
  const future = child ? await familyPageRead(page, (db) => loadFutureCards(db, hub.module, child.classLevel, child.stateCode ?? null, indiaDate())) : { main: [], planAhead: [] };
  const entries = child ? await familyPageRead(page, (db) => loadHubEntries(db, hub.module, child.classLevel, hub.withState ? (child.stateCode ?? null) : null)) : [];
  const sections = hubSections(entries, child?.stateCode, hub.withState);
  const hasEntries = sections.national.length > 0 || (sections.state?.entries.length ?? 0) > 0;
  return (
    <div lang={lang} data-hub={hub.module} className="fam-future flex min-h-screen flex-col">
      <SubPageHeader back="/family/future" backLabel={t(lang, 'fam.tab.future')} title={t(lang, hub.title)} />
      <main className="fam-page">
        {child && <FutureHub cards={future.main} planAhead={future.planAhead} lang={lang} classLevel={child.classLevel} stateCode={child.stateCode ?? null} q={q} path={hub.path} />}
        {hasEntries && <Section id="national" title={t(lang, 'fam.hub.national')} entries={sections.national} empty={t(lang, 'fam.hub.empty')} path={hub.path} lang={lang} />}
        {hasEntries && sections.state && <Section id="state" title={fill(t(lang, 'fam.hub.yourState'), { state: stateName(lang, sections.state.code, sections.state.name) })} entries={sections.state.entries} empty={t(lang, 'fam.hub.empty')} path={hub.path} lang={lang} />}
      </main>
    </div>
  );
}
