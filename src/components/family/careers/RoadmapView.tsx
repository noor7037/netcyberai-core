import { t, type Lang } from '@/lib/i18n';
import { COST_KEY, EFFORT_KEY, hostOf, LANE_KEY, LEVEL_KEY, TYPE_KEY } from '@/lib/family/careers/labels';
import type { LaneId, Roadmap } from '@/lib/family/careers/types';

const text = (lang: Lang, en: string, hi: string) => (lang === 'hi' ? hi : en);

export function RoadmapView({ roadmap, lang, openLane }: { roadmap: Roadmap; lang: Lang; openLane: LaneId }) {
  const { career, lanes, crosses } = roadmap;
  const title = text(lang, career.title.en, career.title.hi);
  return (
    <article data-roadmap={career.slug} className="flex flex-col gap-4">
      <header className="fam-card bg-white p-4">
        <p className="text-xs font-extrabold uppercase tracking-wide text-saffron-deep">{t(lang, LEVEL_KEY[career.level])}</p>
        <h2 lang={lang} className="fam-h2 text-ink">{title}</h2>
        <p lang={lang} className="text-sm text-slate">{text(lang, career.summary.en, career.summary.hi)}</p>
        <p className="text-sm font-semibold text-ink">{t(lang, 'fam.career.typical')}</p>
        {career.horizon && <p lang={lang} className="text-sm text-slate">{text(lang, career.horizon.en, career.horizon.hi)}</p>}
        <p data-guidance className="text-xs font-semibold text-slate">{t(lang, 'fam.career.guidanceNote')}</p>
        <p className="text-xs font-semibold text-ink">{t(lang, 'fam.career.source')}: {hostOf(career.officialUrl) || t(lang, 'fam.career.noSource')}</p>
        {(career.isco || career.onet || career.nco) && (
          <p className="text-xs text-slate">{t(lang, 'fam.career.codes')}: {[career.isco && `ISCO-${career.isco}`, career.onet && `ONET-${career.onet}`, career.nco && `NCO-${career.nco}`].filter(Boolean).join(' · ')}</p>
        )}
      </header>
      <div data-stepper className="flex flex-col gap-2 md:hidden">
        {lanes.map((lane, i) => (
          <details key={lane.id} data-lane={lane.id} open={lane.id === openLane} className="fam-card bg-white">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-extrabold text-ink">{i + 1}. {t(lang, LANE_KEY[lane.id])}</summary>
            <LaneBody lane={lane} lang={lang} />
          </details>
        ))}
      </div>
      <div data-mindmap className="relative hidden md:block">
        <div className="grid grid-cols-7 gap-2">
          {lanes.map((lane) => (
            <section key={lane.id} data-lane={lane.id} className="fam-card min-h-[8rem] bg-white p-2">
              <h3 className="text-xs font-extrabold text-ink">{t(lang, LANE_KEY[lane.id])}</h3>
              <LaneBody lane={lane} lang={lang} />
            </section>
          ))}
        </div>
        <svg data-connectors viewBox="0 0 700 80" className="pointer-events-none absolute left-0 top-8 h-12 w-full" aria-hidden="true">
          <path d="M40 20 H660" fill="none" stroke="currentColor" strokeWidth="2" />
          {crosses.length > 0 && <path data-cross d="M80 50 H520" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />}
        </svg>
      </div>
      {crosses.length > 0 && (
        <section data-cross-list className="flex flex-col gap-2">
          <h3 className="text-sm font-extrabold text-ink">{t(lang, 'fam.career.crossTitle')}</h3>
          {crosses.map((c) => (
            <div key={c.key} data-cross className="rounded-xl border border-dashed border-slate px-3 py-3 text-sm text-slate">
              <p lang={lang} className="font-extrabold text-ink">{t(lang, 'fam.career.crossVia')}: {text(lang, c.via.en, c.via.hi)}</p>
              <p lang={lang}>{text(lang, c.conditions.en, c.conditions.hi)}</p>
              <p className="text-xs font-semibold">{t(lang, 'fam.career.source')}: {hostOf(c.officialUrl) || t(lang, 'fam.career.noSource')}</p>
            </div>
          ))}
        </section>
      )}
      <section data-compete className="fam-card bg-white p-4">
        <h3 className="text-sm font-extrabold text-ink">{t(lang, 'fam.career.competeTitle')}</h3>
        <p lang={lang} className="text-sm text-slate">{text(lang, career.compete.en, career.compete.hi)}</p>
      </section>
    </article>
  );
}

function LaneBody({ lane, lang }: { lane: Roadmap['lanes'][number]; lang: Lang }) {
  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {lane.steps.map((s) => (
        <div key={s.key} className="text-sm text-slate">
          <p className="text-xs font-extrabold text-ink">{t(lang, 'fam.career.requirement')}</p>
          <p lang={lang}>{text(lang, s.requirement.en, s.requirement.hi)}</p>
          {s.examName && <p lang={lang} className="font-semibold text-ink">{t(lang, 'fam.career.exam')}: {text(lang, s.examName.en, s.examName.hi)}{s.futureSeriesKey ? ` (${s.futureSeriesKey})` : ''}</p>}
        </div>
      ))}
      {lane.actions.map((a) => (
        <div key={a.key} data-action={a.type} className="rounded-lg bg-off-white px-2 py-2 text-sm text-slate">
          <p lang={lang} className="font-extrabold text-ink">{text(lang, a.title.en, a.title.hi)}</p>
          <p lang={lang}>{text(lang, a.detail.en, a.detail.hi)}</p>
          <p className="text-xs font-semibold">{t(lang, TYPE_KEY[a.type])} · {t(lang, EFFORT_KEY[a.effort])} · {t(lang, COST_KEY[a.cost])}</p>
          <p className="text-xs">{t(lang, 'fam.career.guidanceNote')}</p>
        </div>
      ))}
      {lane.laterals.map((r) => (
        <div key={r.key} data-lateral className="rounded-lg border border-dashed border-slate px-2 py-2 text-sm text-slate">
          <p lang={lang}>{text(lang, r.example.en, r.example.hi)}</p>
        </div>
      ))}
    </div>
  );
}
