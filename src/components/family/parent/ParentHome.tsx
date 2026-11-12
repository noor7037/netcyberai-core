import type { ReactNode } from 'react';
import { sameInkOnBothSides } from '@/lib/family/day-text';
import { classText, fill, type Words } from '@/lib/family/fill';
import type { ParentWeek } from '@/lib/family/learning';
import type { Lang } from '@/lib/i18n';
import { DayRow, Icon, ProgressRing, StatChip, type IconName } from './parts';

// The parent's Home (C506, design A "Today"): what needs the parent, then one card per child. Every figure is read
// from what the app records: days with checked answers, answers right, topics practised and mastered. The app does
// not record minutes, so none are shown.

export type HomeNeed = { key: string; icon: IconName; tone: 'action' | 'trust' | 'product'; text: string; onOpen: () => void };
export type HomeChild = { childId: string; firstName: string; classLevel: number; week: ParentWeek | null; calm: { right: number; topics: number; mastered: number } | null; goalDays: number | null };

const TONE = { action: 'bg-tangerine text-slate', trust: 'bg-emerald text-white', product: 'bg-grape text-white' } as const;

// Short day names in the parent's language (the days are India dates, read as plain calendar days).
export function dayNames(days: { day: string }[], lang: Lang): string[] {
  const name = (d: string) => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)));
  return days.map((d) => name(d.day));
}

export function ParentHome({ w, lang, needs, kids, onSeeChild, onAddChild, noNeeds, extra }: { w: Words; lang: Lang; needs: HomeNeed[]; kids: HomeChild[]; onSeeChild: (childId: string) => void; onAddChild: () => void; noNeeds: string; extra?: ReactNode }) {
  return (
    <>
      <section aria-label={w['fam.parent.needs.title']}>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate">
          {w['fam.parent.needs.title']}
          {needs.length > 0 && ` · ${needs.length}`}
        </h2>
        {needs.length === 0 ? (
          <p data-parent-needs-none className="rounded-2xl bg-white p-3 text-base text-slate ring-1 ring-slate/10">
            {noNeeds}
          </p>
        ) : (
          <ul data-parent-needs className="flex flex-col gap-2">
            {needs.map((n) => (
              <li key={n.key} data-parent-need={n.key} className="flex items-center gap-3 fam-card p-3">
                <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE[n.tone]}`}>
                  <Icon name={n.icon} />
                </span>
                <span className="min-w-0 flex-1 break-words text-sm font-bold text-slate">{n.text}</span>
                <button type="button" onClick={n.onOpen} className="fam-press min-h-[44px] shrink-0 rounded-full px-3 text-sm font-bold text-emerald">
                  {w['fam.parent.needs.open']}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={w['fam.parent.app.kids']} className="flex flex-col gap-4">
        {kids.length === 0 ? (
          <div data-parent-empty className="flex flex-col items-start gap-3 fam-card p-4">
            <p className="text-base font-semibold text-slate">{w['fam.parent.app.noKids']}</p>
            <button type="button" onClick={onAddChild} className="fam-press inline-flex min-h-[44px] items-center gap-1 rounded-full bg-emerald px-5 text-sm font-bold text-white">
              <Icon name="plus" size={18} />
              {w['fam.child.add']}
            </button>
          </div>
        ) : (
          kids.map((k) => <ChildCard key={k.childId} w={w} lang={lang} kid={k} onSee={() => onSeeChild(k.childId)} />)
        )}
      </section>
      {extra}
    </>
  );
}

function ChildCard({ w, lang, kid, onSee }: { w: Words; lang: Lang; kid: HomeChild; onSee: () => void }) {
  const days = kid.week?.days ?? [];
  const total = days.reduce((a, d) => a + d.answers, 0);
  const active = days.filter((d) => d.answers > 0).length;
  // The goal is the parent's own weekly goal when the habit module is on (at most seven); otherwise the seven days.
  const goal = Math.min(7, Math.max(1, kid.goalDays ?? 7));
  const names = dayNames(days, lang);
  return (
    <article data-child-card={kid.childId} className="fam-card p-4">
      <div className="flex items-center gap-4">
        <ProgressRing value={active} goal={goal} centre={String(active)} sub={fill(w['fam.parent.app.ringOf'], { goal })} label={fill(w['fam.parent.app.ringLabel'], { n: active, goal })} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-bold text-slate">{kid.firstName}</h3>
          <p className="text-sm text-slate">{classText((k) => w[k], kid.classLevel)}</p>
        </div>
      </div>
      {total === 0 ? (
        <p data-child-empty className="mt-4 text-sm text-slate">
          {fill(w['fam.parent.app.nothingYet'], { name: kid.firstName })}
        </p>
      ) : (
        <>
          <div className="mt-4">
            <DayRow label={w['fam.parent.app.last7']} onText={w['fam.parent.app.dayOn']} offText={w['fam.parent.app.dayOff']} days={days.map((d, i) => ({ on: d.answers > 0, label: names[i] }))} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatChip value={kid.calm?.right ?? 0} label={w['fam.parent.app.chipRight']} tone="mint" />
            <StatChip value={kid.calm?.topics ?? 0} label={w['fam.parent.app.chipTopics']} tone="lilac" />
            <StatChip value={kid.calm?.mastered ?? 0} label={w['fam.parent.app.chipMastered']} tone="sky" />
          </div>
        </>
      )}
      <button type="button" onClick={onSee} className="fam-press mt-4 flex min-h-[48px] w-full items-center justify-center gap-1 rounded-full bg-emerald px-3 text-base font-bold text-white">
        {fill(w['fam.parent.app.seeWeek'], { name: kid.firstName })}
        <Icon name="chevron" size={18} />
      </button>
    </article>
  );
}
