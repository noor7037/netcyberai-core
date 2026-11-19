import { t, type Lang } from '@/lib/i18n';
import { COST_KEY, EFFORT_KEY, hostOf, LANE_KEY, LEVEL_KEY, TYPE_KEY } from '@/lib/family/careers/labels';
import type { LaneId, Roadmap } from '@/lib/family/careers/types';

const text = (lang: Lang, en: string, hi: string) => (lang === 'hi' ? hi : en);
const TINT = ['bg-lesson-butter', 'bg-lesson-mint', 'bg-lesson-sky', 'bg-lesson-lilac', 'bg-lesson-blush', 'bg-lesson-butter', 'bg-lesson-mint'];
const DEEP = ['bg-lesson-butter-deep', 'bg-lesson-mint-deep', 'bg-lesson-sky-deep', 'bg-lesson-lilac-deep', 'bg-lesson-blush-deep', 'bg-lesson-butter-deep', 'bg-lesson-mint-deep'];
// The stage number is white on its lane's accent: 5.4:1 (sky) to 7.1:1 (lilac), all above the 4.5:1 floor
// (test/careers/career-hub.test.ts proves it). The pair is kept together because the accent is chosen at run time.
const BADGE = DEEP.map((bg) => `${bg} text-white`);

function StageBadge({ n, deep }: { n: number; deep: string }) {
  return (
    <span className={`inline-flex h-8 w-8 min-h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${deep}`}>{n}</span>
  );
}

export function RoadmapView({ roadmap, lang, openLane }: { roadmap: Roadmap; lang: Lang; openLane: LaneId }) {
  const { career, lanes, crosses } = roadmap;
  const title = text(lang, career.title.en, career.title.hi);
  return (
    <article data-roadmap={career.slug} className="flex flex-col gap-4">
      <header className="rounded-2xl bg-lesson-butter p-4">
        <p className="inline-block whitespace-nowrap rounded-full bg-lesson-lilac px-2 py-1 text-xs font-extrabold text-ink">{t(lang, LEVEL_KEY[career.level])}</p>
        <h2 lang={lang} className="fam-h2 text-ink">{title}</h2>
        <p lang={lang} className="text-sm text-ink">{text(lang, career.summary.en, career.summary.hi)}</p>
        <p className="text-sm font-semibold text-ink">{t(lang, 'fam.career.typical')}</p>
        {career.horizon && <p lang={lang} className="text-sm text-ink">{text(lang, career.horizon.en, career.horizon.hi)}</p>}
        <p data-guidance className="text-xs font-semibold text-ink">{t(lang, 'fam.career.guidanceNote')}</p>
        <p className="text-xs font-semibold text-ink">{t(lang, 'fam.career.source')}: {hostOf(career.officialUrl) || t(lang, 'fam.career.noSource')}</p>
        {(career.isco || career.onet || career.nco) && (
          <p className="text-xs text-ink">{t(lang, 'fam.career.codes')}: {[career.isco && `ISCO-${career.isco}`, career.onet && `ONET-${career.onet}`, career.nco && `NCO-${career.nco}`].filter(Boolean).join(' · ')}</p>
        )}
      </header>
      <div data-stepper className="flex flex-col gap-2 md:hidden">
        {lanes.map((lane, i) => (
          <details key={lane.id} data-lane={lane.id} open={lane.id === openLane} className={`rounded-2xl ${TINT[i]}`}>
            <summary className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 text-sm font-extrabold text-ink">
              <span aria-hidden="true" className={`h-8 w-1 shrink-0 rounded-full ${DEEP[i]}`} />
              <StageBadge n={i + 1} deep={BADGE[i]} />
              <span className="min-w-0">{t(lang, LANE_KEY[lane.id])}</span>
            </summary>
            <LaneBody lane={lane} lang={lang} />
          </details>
        ))}
      </div>
      <div data-mindmap className="hidden md:block">
        <div className="overflow-x-auto pb-4">
          <div className="flex w-max items-center gap-3 pb-2" data-connector aria-hidden="true">
            {lanes.map((lane, i) => (
              <div key={lane.id} className="flex w-64 shrink-0 items-center">
                <span className={`h-1 w-8 shrink-0 rounded-full ${DEEP[i]}`} />
                {i < lanes.length - 1 && <span className={`mx-2 h-1 flex-1 rounded ${DEEP[i]}`} />}
              </div>
            ))}
            {crosses.length > 0 && (
              <svg data-connectors viewBox="0 0 40 16" className="h-4 w-10 shrink-0 text-lesson-lilac-deep">
                <path data-cross d="M0 8 H40" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />
              </svg>
            )}
          </div>
          <div className="flex w-max items-start gap-3">
            {lanes.map((lane, i) => (
              <section key={lane.id} data-lane={lane.id} className={`w-64 shrink-0 rounded-2xl ${TINT[i]} p-3`}>
                <div className="flex items-center gap-3">
                  <StageBadge n={i + 1} deep={BADGE[i]} />
                  <h3 className="min-w-0 text-sm font-extrabold text-ink">{t(lang, LANE_KEY[lane.id])}</h3>
                </div>
                <LaneBody lane={lane} lang={lang} />
              </section>
            ))}
          </div>
          {crosses.length > 0 && (
            <div data-cross className="mt-3 flex w-max gap-3">
              {crosses.map((c) => (
                <article key={c.key} className="w-64 shrink-0 rounded-2xl border-2 border-dashed border-lesson-lilac-deep bg-lesson-lilac px-3 py-3 text-sm text-ink">
                  <p lang={lang} className="font-extrabold">{t(lang, 'fam.career.crossVia')}: {text(lang, c.via.en, c.via.hi)}</p>
                  <p lang={lang}>{text(lang, c.conditions.en, c.conditions.hi)}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {crosses.length > 0 && (
        <section data-cross-list className="flex flex-col gap-2 md:hidden">
          <h3 className="text-sm font-extrabold text-ink">{t(lang, 'fam.career.crossTitle')}</h3>
          {crosses.map((c) => (
            <div key={c.key} data-cross className="rounded-2xl border-2 border-dashed border-lesson-lilac-deep bg-lesson-lilac px-3 py-3 text-sm text-ink">
              <p lang={lang} className="font-extrabold">{t(lang, 'fam.career.crossVia')}: {text(lang, c.via.en, c.via.hi)}</p>
              <p lang={lang}>{text(lang, c.conditions.en, c.conditions.hi)}</p>
              <p className="text-xs font-semibold">{t(lang, 'fam.career.source')}: {hostOf(c.officialUrl) || t(lang, 'fam.career.noSource')}</p>
            </div>
          ))}
        </section>
      )}
      <section data-compete className="rounded-2xl bg-lesson-mint p-4">
        <h3 className="text-sm font-extrabold text-ink">{t(lang, 'fam.career.competeTitle')}</h3>
        <p lang={lang} className="text-sm text-ink">{text(lang, career.compete.en, career.compete.hi)}</p>
      </section>
    </article>
  );
}

function LaneBody({ lane, lang }: { lane: Roadmap['lanes'][number]; lang: Lang }) {
  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {lane.steps.map((s) => (
        <div key={s.key} className="rounded-xl bg-paper px-2 py-2 text-sm text-ink">
          <p className="text-xs font-extrabold">{t(lang, 'fam.career.requirement')}</p>
          <p lang={lang}>{text(lang, s.requirement.en, s.requirement.hi)}</p>
          {s.examName && <p lang={lang} className="font-semibold">{t(lang, 'fam.career.exam')}: {text(lang, s.examName.en, s.examName.hi)}{s.futureSeriesKey ? ` (${s.futureSeriesKey})` : ''}</p>}
        </div>
      ))}
      {lane.actions.map((a) => {
        const course = a.type === 'certification';
        return (
          <div key={a.key} data-action={a.type} className={`rounded-xl px-2 py-2 text-sm text-ink ${course ? 'bg-lesson-sky' : 'bg-paper'}`}>
            <p className="text-xs font-extrabold text-saffron-deep">{course ? t(lang, 'fam.career.courseBadge') : t(lang, TYPE_KEY[a.type])}</p>
            <p lang={lang} className="font-extrabold">{text(lang, a.title.en, a.title.hi)}</p>
            <p lang={lang}>{text(lang, a.detail.en, a.detail.hi)}</p>
            <p className="text-xs font-semibold">{t(lang, EFFORT_KEY[a.effort])} · {t(lang, COST_KEY[a.cost])}</p>
            {a.officialUrl && (
              <a className="text-sm font-extrabold text-saffron-deep underline" href={a.officialUrl}>
                {course ? t(lang, 'fam.career.openCourse') : t(lang, 'fam.career.source')}
              </a>
            )}
            <p className="text-xs">{t(lang, 'fam.career.guidanceNote')}</p>
          </div>
        );
      })}
      {lane.laterals.map((r) => (
        <div key={r.key} data-lateral className="rounded-xl border border-dashed border-lesson-lilac-deep bg-lesson-blush px-2 py-2 text-sm text-ink">
          <p lang={lang}>{text(lang, r.example.en, r.example.hi)}</p>
        </div>
      ))}
    </div>
  );
}
