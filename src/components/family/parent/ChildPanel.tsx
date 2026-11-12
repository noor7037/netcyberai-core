import { sameInkOnBothSides } from '@/lib/family/day-text';
import { classText, fill, type Words } from '@/lib/family/fill';
import type { ParentWeek } from '@/lib/family/learning';
import type { Lang } from '@/lib/i18n';
import { dayNames, type HomeChild } from './ParentHome';
import { Icon, Meter, Timeline, WeekBars, type MeterColor, type TimelineItem } from './parts';

// What opens for one child (C506, design B): the child switcher, the week as bars of answers checked each day, the
// share of answers right per subject, and the latest topics practised. Counts only: the app records no minutes.

const COLORS: MeterColor[] = ['royal', 'turquoise', 'grape', 'tangerine'];

export function ChildSwitcherBar({ w, kids, activeId, onSelect, onAdd }: { w: Words; kids: HomeChild[]; activeId: string | null; onSelect: (childId: string) => void; onAdd: () => void }) {
  // The bar bleeds to the screen edges inside the page's 16 px gutter; scroll-px keeps the first chip off the edge.
  return (
    <ul aria-label={w['fam.parent.app.chooseChild']} data-parent-switcher className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
      {kids.map((k) => {
        const on = k.childId === activeId;
        return (
          <li key={k.childId} className="shrink-0 snap-start">
            <button type="button" aria-pressed={on} data-parent-switch={k.childId} onClick={() => onSelect(k.childId)} className={`fam-press flex min-h-[56px] items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-4 ${on ? 'bg-royal text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}>
              <span aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold ${on ? 'bg-white text-royal-deep' : 'bg-lesson-lilac text-grape-deep'}`}>
                {k.firstName.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-left">
                <span className="block max-w-[10rem] truncate text-sm font-bold">{k.firstName}</span>
                <span className="block text-xs font-semibold">{classText((x) => w[x], k.classLevel)}</span>
              </span>
            </button>
          </li>
        );
      })}
      <li className="shrink-0 snap-start">
        <button type="button" onClick={onAdd} className="fam-press flex min-h-[56px] items-center gap-1 whitespace-nowrap rounded-full bg-white px-4 text-sm font-bold text-royal-deep ring-1 ring-slate/15">
          <Icon name="plus" size={18} />
          {w['fam.child.add']}
        </button>
      </li>
    </ul>
  );
}

const card = 'fam-card p-4';

export function ChildWeek({ w, lang, kid, week }: { w: Words; lang: Lang; kid: HomeChild; week: ParentWeek | null }) {
  const days = week?.days ?? [];
  const values = days.map((d) => d.answers);
  const total = values.reduce((a, b) => a + b, 0);
  const subjects = (week?.subjects ?? []).filter((s) => s.answered > 0);
  const dateOf = (d: string) => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)));
  const items: TimelineItem[] = (week?.latest ?? []).map((l) => ({
    icon: l.mastered ? 'star' : 'check',
    text: l.title,
    when: [l.mastered ? w['fam.parent.app.itemMastered'] : fill(w['fam.parent.app.meterDetail'], { right: l.correct, answers: l.answered }), l.lastOn ? dateOf(l.lastOn) : ''].filter(Boolean).join(' · '),
  }));
  return (
    <div data-child-week={kid.childId} className="flex flex-col gap-4">
      <section aria-label={w['fam.parent.app.thisWeek']} className={card}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-slate">{w['fam.parent.app.thisWeek']}</h2>
          <p className="text-sm font-semibold text-slate">
            <span className="text-xl font-bold text-royal-deep">{total}</span> {w['fam.parent.app.answersUnit']}
          </p>
        </div>
        <p className="mb-2 text-xs text-slate">{w['fam.parent.app.answersPerDay']}</p>
        {total === 0 ? (
          <p data-child-empty className="text-sm text-slate">
            {fill(w['fam.parent.app.nothingYet'], { name: kid.firstName })}
          </p>
        ) : (
          <WeekBars values={values} labels={dayNames(days, lang)} label={fill(w['fam.parent.app.weekAria'], { list: values.join(', '), n: total })} />
        )}
      </section>

      <section aria-label={w['fam.parent.app.subjects']} className={card}>
        <h2 className="text-lg font-bold text-slate">{w['fam.parent.app.subjects']}</h2>
        <p className="mb-3 text-xs text-slate">{w['fam.parent.app.subjectsLead']}</p>
        {subjects.length === 0 ? (
          <p className="text-sm text-slate">{w['fam.parent.app.subjectsNone']}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {subjects.map((s, i) => {
              const pct = Math.round((s.correct / s.answered) * 100);
              const name = w[`fam.subject.${s.subject}`] ?? s.subject;
              return (
                <li key={s.subject}>
                  <Meter name={name} pct={pct} color={COLORS[i % COLORS.length]} ariaLabel={fill(w['fam.parent.app.meterAria'], { subject: name, pct })} detail={fill(w['fam.parent.app.meterDetail'], { right: s.correct, answers: s.answered })} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={w['fam.parent.app.latest']} className={card}>
        <h2 className="mb-3 text-lg font-bold text-slate">{w['fam.parent.app.latest']}</h2>
        {items.length === 0 ? <p className="text-sm text-slate">{w['fam.parent.app.latestNone']}</p> : <Timeline items={items} />}
      </section>
    </div>
  );
}
