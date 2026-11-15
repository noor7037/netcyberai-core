import Link from 'next/link';
import { FutureHub } from '@/components/family/FutureHub';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { classText, fill } from '@/lib/family/fill';
import { loadHubEntries, HUB_PRESENTATION } from '@/lib/family/hubs';
import { loadFutureCards } from '@/lib/family/future-listings';
import { familyPageRead } from '@/lib/family/server';
import { hostOf, LEVEL_KEY, STREAM_KEY } from '@/lib/family/careers/labels';
import { openCareer } from '@/lib/family/careers/gate';
import { loadCareerHome, loadStreamCrosses } from '@/lib/family/careers/load';
import { opensNow } from '@/lib/family/careers/opens-now';
import { STREAMS, type StreamSlug } from '@/lib/family/careers/types';
import { t } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';
import type { MessageKey } from '@/lib/i18n';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v ?? '').slice(0, 80);
const keep = (q: string, s: string, field: string, level: string) => {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (s) p.set('s', s);
  if (field) p.set('field', field);
  if (level) p.set('level', level);
  const x = p.toString();
  return x ? `?${x}` : '';
};

export async function CareerHome({ search, stream }: { search: { q?: string | string[]; s?: string | string[]; field?: string | string[]; level?: string | string[] }; stream?: StreamSlug }) {
  const page = await openCareer();
  const child = page.child!;
  const lang = page.childLang;
  const q = one(search.q);
  const s = one(search.s);
  const field = stream ? '' : one(search.field);
  const level = one(search.level);
  const today = indiaDate();
  const hub = HUB_PRESENTATION.careers;
  const [home, future, entries, crosses] = await familyPageRead(page, async (db) => {
    const loaded = await loadCareerHome(db, { q: s, field: field || undefined, level: level || undefined, stream }, today);
    const exams = await loadFutureCards(db, 'careers', child.classLevel, child.stateCode ?? null, today);
    const old = await loadHubEntries(db, 'careers', child.classLevel, null);
    const cross = stream ? await loadStreamCrosses(db, stream, today) : [];
    return [loaded, exams, old, cross] as const;
  });
  const now = opensNow(child.classLevel, child.stream ?? null);
  const word = (k: MessageKey) => t(lang, k);
  const back = stream ? '/family/future/career' : '/family/future';
  const backLabel = stream ? t(lang, 'fam.hub.career') : t(lang, 'fam.tab.future');
  const title = stream ? t(lang, STREAM_KEY[stream]) : t(lang, 'fam.hub.career');
  return (
    <div lang={lang} data-career-home className="flex min-h-screen flex-col">
      <SubPageHeader back={back} backLabel={backLabel} title={title} />
      <main className="fam-page flex flex-col gap-4">
        <section data-opens-now className="rounded-2xl bg-lesson-butter p-4">
          <h2 className="fam-h2 text-ink">{t(lang, 'fam.career.opensNowTitle')}</h2>
          <p className="text-sm font-semibold text-slate">{fill(t(lang, 'fam.career.opensNowChild'), { name: child.firstName, className: classText(word, child.classLevel) })}</p>
          <p className="text-sm text-slate">{t(lang, now.kind === 'plan_ahead' ? 'fam.career.opensAhead' : now.kind === 'stream_choice' ? 'fam.career.opensStream' : 'fam.career.opensEntrance')}</p>
          <p data-guidance className="text-xs font-semibold text-slate">{t(lang, 'fam.career.guidanceNote')}</p>
        </section>
        <section id="streams">
          <h2 className="mb-2 text-sm font-extrabold text-ink">{t(lang, 'fam.career.chooseStream')}</h2>
          <div className="flex flex-wrap gap-2">
            {STREAMS.map((id, i) => (
              <Link key={id} href={`/family/future/career/stream/${id}`} className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-extrabold text-ink ${['bg-lesson-butter', 'bg-lesson-mint', 'bg-lesson-sky', 'bg-lesson-lilac', 'bg-lesson-blush'][i]}`}>{t(lang, STREAM_KEY[id])}</Link>
            ))}
          </div>
        </section>
        <form method="get" action={stream ? `/family/future/career/stream/${stream}` : '/family/future/career'} role="search" className="flex gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          <label className="sr-only" htmlFor="career-s">{t(lang, 'fam.career.searchLabel')}</label>
          <input id="career-s" name="s" defaultValue={s} placeholder={t(lang, 'fam.career.searchPlaceholder')} className="min-h-[44px] flex-1 rounded-xl border border-slate/30 bg-white px-3 text-sm" />
          <button type="submit" className="min-h-[44px] rounded-xl bg-ink px-4 text-sm font-extrabold text-white">{t(lang, 'fam.career.searchGo')}</button>
        </form>
        {!stream && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-extrabold text-slate">{t(lang, 'fam.career.fields')}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/family/future/career${keep(q, s, '', level)}`} className="inline-flex min-h-[44px] items-center rounded-full bg-off-white px-3 text-sm font-bold text-ink">{t(lang, 'fam.career.allFields')}</Link>
              {home.fields.map((f) => (
                <Link key={f.id} href={`/family/future/career${keep(q, s, f.id, level)}`} className="inline-flex min-h-[44px] items-center rounded-full bg-lesson-sky px-3 text-sm font-bold text-ink">{lang === 'hi' ? f.name.hi : f.name.en}</Link>
              ))}
            </div>
            <p className="text-xs font-extrabold text-slate">{t(lang, 'fam.career.levels')}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/family/future/career${keep(q, s, field, '')}`} className="inline-flex min-h-[44px] items-center rounded-full bg-off-white px-3 text-sm font-bold text-ink">{t(lang, 'fam.career.allLevels')}</Link>
              {(Object.keys(LEVEL_KEY) as (keyof typeof LEVEL_KEY)[]).map((id) => (
                <Link key={id} href={`/family/future/career${keep(q, s, field, id)}`} className="inline-flex min-h-[44px] items-center rounded-full bg-white px-3 text-sm font-bold text-ink ring-1 ring-slate/15">{t(lang, LEVEL_KEY[id])}</Link>
              ))}
            </div>
          </div>
        )}
        {stream && <h2 className="text-sm font-extrabold text-ink">{t(lang, 'fam.career.streamLead')}</h2>}
        {home.cards.length === 0 ? <p className="fam-row bg-off-white text-sm font-semibold text-slate">{t(lang, 'fam.career.empty')}</p> : (
          <ul className="flex flex-col gap-2">
            {home.cards.map((c) => (
              <li key={c.slug}>
                <Link href={`/family/future/career/${c.slug}`} className="flex min-h-[44px] flex-col justify-center rounded-xl bg-paper px-3 py-3 ring-1 ring-lesson-lilac-deep/20">
                  <span lang={lang} className="text-base font-extrabold text-ink">{lang === 'hi' ? c.title.hi : c.title.en}</span>
                  <span className="mt-1 inline-flex w-fit whitespace-nowrap rounded-full bg-lesson-lilac px-2 py-1 text-xs font-extrabold text-ink">{t(lang, LEVEL_KEY[c.level])}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {crosses.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-extrabold text-ink">{t(lang, 'fam.career.switchFrom')}</h2>
            {crosses.map((c) => (
              <div key={c.key} data-cross className="mb-2 rounded-xl border-2 border-dashed border-lesson-lilac-deep bg-lesson-lilac px-3 py-3 text-sm text-ink">
                <p lang={lang} className="font-extrabold text-ink">{lang === 'hi' ? c.via.hi : c.via.en}</p>
                <p lang={lang}>{lang === 'hi' ? c.conditions.hi : c.conditions.en}</p>
              </div>
            ))}
          </section>
        )}
        {(q || future.main.length > 0 || future.planAhead.length > 0) && (
          <section data-exams-strip>
            <h2 className="mb-2 text-sm font-extrabold text-ink">{t(lang, 'fam.career.examsStrip')}</h2>
            <FutureHub cards={future.main} planAhead={future.planAhead} lang={lang} classLevel={child.classLevel} stateCode={child.stateCode ?? null} q={q} path={hub.path} />
          </section>
        )}
        {entries.length > 0 && (
          <section data-hub-entries={hub.path}>
            <h2 className="mb-2 text-sm font-extrabold text-ink">{t(lang, 'fam.hub.national')}</h2>
            <ul className="flex flex-col gap-2">
              {entries.map((e) => (
                <li key={e.id} className="rounded-xl bg-off-white px-3 py-3 text-sm text-slate">
                  <h3 lang={lang} className="font-extrabold text-ink">{lang === 'hi' && e.titleHi ? e.titleHi : e.titleEn}</h3>
                  <p>{lang === 'hi' && e.bodyHi ? e.bodyHi : e.bodyEn}</p>
                  <p className="text-xs font-semibold">{t(lang, 'fam.hub.source')}: {hostOf(e.sourceUrl)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
