import { fill, classText } from '@/lib/family/fill';
import { familyStates } from '@/lib/family/states';
import { sameInkOnBothSides } from '@/lib/family/day-text';
import { groupCards, inProgress, matchesSearch, TYPE_OF, type Bilingual, type FutureCard, type GroupId, type TypeId } from '@/lib/family/future-listings';
import type { KeyDate } from '@/lib/family/future-status';
import { t, type MessageKey } from '@/lib/i18n';

// The Future tab's body for one hub (founder, 15 Nov 2026): the child's class and state decide what is here; two levels of
// grouping (who runs it, then the type); status chips; a "Plan ahead" row; a "Your exams" part for forms already closed;
// search. Server-rendered with no script: a card opens and closes with the browser's own details control, and the
// documents list is plain tick boxes that keep nothing. Apply opens an official site in a new tab (src/lib/family/future-domains.ts).

type Lang = 'en' | 'hi';
const pick = (lang: Lang, en: string | null, hi: string | null): { text: string; lang: Lang } => (lang === 'hi' && hi ? { text: hi, lang: 'hi' } : { text: en ?? '', lang: 'en' });
const dayText = (lang: Lang, iso: string) => sameInkOnBothSides(new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));
const key = (k: string) => k as MessageKey;

// One colour per type, from the lesson tints: the badge, the chip and the card's left edge match.
const TINT: Record<TypeId, { badge: string; edge: string }> = {
  scholarship: { badge: 'bg-lesson-mint text-lesson-mint-deep', edge: 'border-l-lesson-mint-deep' },
  admission_exam: { badge: 'bg-lesson-sky text-lesson-sky-deep', edge: 'border-l-lesson-sky-deep' },
  olympiad: { badge: 'bg-lesson-lilac text-lesson-lilac-deep', edge: 'border-l-lesson-lilac-deep' },
  scheme: { badge: 'bg-lesson-butter text-lesson-butter-deep', edge: 'border-l-lesson-butter-deep' },
  career: { badge: 'bg-lesson-blush text-lesson-blush-deep', edge: 'border-l-lesson-blush-deep' },
};
const STATUS_CHIP: Record<string, string> = {
  open: 'bg-lesson-mint text-lesson-mint-deep ring-1 ring-lesson-mint-deep',
  closing_soon: 'bg-lesson-blush text-lesson-blush-deep ring-1 ring-lesson-blush-deep',
  upcoming: 'bg-lesson-sky text-lesson-sky-deep ring-1 ring-lesson-sky-deep',
  expected: 'bg-paper text-ink ring-1 ring-slate/30',
  in_progress: 'bg-lesson-butter text-lesson-butter-deep ring-1 ring-lesson-butter-deep',
};

const dateKind = (k: string) => (k.startsWith('exam') ? 'exam' : ['form_open', 'last_date', 'late_fee_last_date', 'correction', 'admit_card', 'result', 'notification'].includes(k) ? k : 'other');
const eventKind = (k: string) => (k.startsWith('exam') ? 'exam' : ['result', 'admit_card', 'correction'].includes(k) ? k : 'other');

function Deadline({ c, lang }: { c: FutureCard; lang: Lang }) {
  if (c.shown === 'expected') return <span data-future-note className="text-xs font-semibold text-ink">{t(lang, 'fam.future.expectedNote')}</span>;
  if (c.shown === 'upcoming') {
    const open = c.keyDates.find((d) => d.kind === 'form_open');
    return open ? <span data-future-note className="text-xs font-semibold text-ink">{fill(t(lang, 'fam.future.formOpens'), { date: dayText(lang, open.date) })}</span> : null;
  }
  if (c.shown === 'in_progress' && c.next) {
    const when = dayText(lang, c.next.date);
    return <span data-future-next className="text-xs font-semibold text-ink">{fill(t(lang, key(`fam.future.ev.${eventKind(c.next.kind)}`)), { date: c.next.approx ? fill(t(lang, 'fam.future.approx'), { date: when }) : when })}</span>;
  }
  if (c.daysLeft === null) return null;
  const text = c.daysLeft === 0 ? t(lang, 'fam.future.days.today') : c.daysLeft === 1 ? t(lang, 'fam.future.days.one') : fill(t(lang, 'fam.future.days.left'), { n: c.daysLeft });
  return (
    <span data-future-days={c.daysLeft} className={`fam-pill ${c.daysLeft <= 7 ? 'bg-lesson-blush text-lesson-blush-deep' : 'bg-card text-ink ring-1 ring-slate/20'}`}>
      {text}
    </span>
  );
}

const Para = ({ label, value, lang, hi }: { label: string; value: string | null; lang: Lang; hi: string | null }) => {
  const p = pick(lang, value, hi);
  if (!p.text) return null;
  return (
    <div>
      <p className="text-xs font-extrabold text-saffron-deep">{label}</p>
      <p lang={p.lang} className="whitespace-pre-line text-sm text-ink">{p.text}</p>
    </div>
  );
};

function Listing({ items, label, lang, tick }: { items: Bilingual[]; label: string; lang: Lang; tick: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-extrabold text-saffron-deep">{label}</p>
      {tick && <p className="text-xs text-ink">{t(lang, 'fam.future.documentsHint')}</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((it, i) => {
          const p = pick(lang, it.en, it.hi);
          return (
            <li key={i} lang={p.lang} className="text-sm text-ink">
              {tick ? (
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="checkbox" className="h-5 w-5" />
                  <span>{p.text}</span>
                </label>
              ) : (
                <span>
                  {i + 1}. {p.text}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FutureCardView({ c, lang, classLevel, plan = false }: { c: FutureCard; lang: Lang; classLevel: number; plan?: boolean }) {
  const type = TYPE_OF[c.category] ?? 'scheme';
  const title = pick(lang, c.titleEn, c.titleHi);
  const summary = pick(lang, c.summaryEn, c.summaryHi);
  const word = (k: string) => t(lang, k as MessageKey);
  const ownClass = c.classes.includes(classLevel);
  const applyable = c.applyHost && c.applyUrl && (c.shown === 'open' || c.shown === 'closing_soon');
  const official = c.officialHost && c.applyUrl && c.shown !== 'expected' && !applyable;
  const english = (lang === 'hi' && (!c.titleHi || !c.eligibilityHi)) || false;
  return (
    <li data-future-card={c.id} data-status={c.shown} data-type={type} className={`rounded-2xl border-l-4 bg-card text-sm text-ink ring-1 ring-slate/10 ${TINT[type].edge} ${plan ? 'min-w-[17rem] snap-start' : ''}`}>
      <details>
        <summary className="flex min-h-[44px] cursor-pointer list-none flex-col gap-1.5 px-3 py-3">
          <span className="flex flex-wrap items-center gap-1.5">
            <span data-future-type-badge className={`fam-pill ${TINT[type].badge}`}>{t(lang, key(`fam.future.type.${type}`))}</span>
            <span data-future-status-chip className={`fam-pill ${STATUS_CHIP[c.shown]}`}>{t(lang, key(`fam.future.status.${c.shown}`))}</span>
            {ownClass && <span className="fam-pill bg-lesson-sky text-ink">{fill(t(lang, 'fam.future.forClass'), { class: classText(word, classLevel) })}</span>}
          </span>
          <span lang={title.lang} className="text-base font-extrabold">{title.text}</span>
          {summary.text && <span lang={summary.lang} className="text-sm">{summary.text}</span>}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Deadline c={c} lang={lang} />
            <span data-future-verified className="text-xs font-semibold">{fill(t(lang, 'fam.future.verified'), { date: dayText(lang, c.verifiedOn) })}</span>
          </span>
          <span className="text-xs font-bold text-ink underline">{t(lang, 'fam.future.details')}</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-slate/10 px-3 py-3">
          <Para label={t(lang, 'fam.future.eligibility')} value={c.eligibilityEn} hi={c.eligibilityHi} lang={lang} />
          <Para label={t(lang, 'fam.future.benefit')} value={c.benefitEn} hi={c.benefitHi} lang={lang} />
          <Para label={t(lang, 'fam.future.fee')} value={c.feeEn} hi={c.feeHi} lang={lang} />
          {c.keyDates.length > 0 && (
            <div>
              <p className="text-xs font-extrabold text-saffron-deep">{t(lang, 'fam.future.dates')}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {c.keyDates.map((d: KeyDate, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-semibold">{t(lang, key(`fam.future.dk.${dateKind(d.kind)}`))}:</span> {d.approx ? fill(t(lang, 'fam.future.approx'), { date: dayText(lang, d.date) }) : dayText(lang, d.date)}
                    {d.end && d.end > d.date ? ` – ${dayText(lang, d.end)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Listing items={c.documents} label={t(lang, 'fam.future.documents')} lang={lang} tick />
          <Listing items={c.prepareSteps} label={t(lang, 'fam.future.prepare')} lang={lang} tick={false} />
          {english && <p className="text-xs font-semibold text-ink">{t(lang, 'fam.future.englishOnly')}</p>}
          <p data-hub-source data-host className="text-xs font-semibold">
            {t(lang, 'fam.hub.source')}: {new URL(c.sourceUrl).hostname.replace(/^www\./, '')}
          </p>
        </div>
      </details>
      {(applyable || official) && (
        <div className="flex flex-col gap-1 px-3 pb-3">
          <a data-future-apply={applyable ? 'apply' : 'official'} href={c.applyUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-saffron px-4 text-sm font-extrabold text-ink">
            {applyable ? t(lang, 'fam.future.apply') : t(lang, 'fam.future.official')}
          </a>
          <span data-host className="text-xs font-semibold">{fill(t(lang, 'fam.future.opens'), { site: c.applyHost! })}</span>
          {applyable && <span className="text-xs">{t(lang, 'fam.future.askParent')}</span>}
        </div>
      )}
    </li>
  );
}

const GROUP_TITLE = (lang: Lang, id: GroupId, stateCode: string | null) => {
  if (id !== 'state') return t(lang, key(`fam.future.group.${id}`));
  const s = familyStates(lang).find((x) => x.code === stateCode);
  return fill(t(lang, 'fam.future.group.state'), { state: s?.name ?? '' });
};

export function FutureHub({ cards, planAhead, lang, classLevel, stateCode, q, path }: { cards: FutureCard[]; planAhead: FutureCard[]; lang: Lang; classLevel: number; stateCode: string | null; q: string; path: string }) {
  const shown = cards.filter((c) => matchesSearch(c, q));
  const plan = planAhead.filter((c) => matchesSearch(c, q));
  const groups = groupCards(shown);
  const exams = inProgress(shown);
  const none = groups.length === 0 && exams.length === 0 && plan.length === 0;
  const word = (k: string) => t(lang, k as MessageKey);
  return (
    <div className="fam-future flex flex-col gap-4" data-future-hub>
      <form method="get" action={path} role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="future-q">{t(lang, 'fam.future.search.label')}</label>
        <input id="future-q" name="q" type="search" defaultValue={q} placeholder={t(lang, 'fam.future.search.placeholder')} className="min-h-[44px] flex-1 rounded-2xl border border-slate/20 bg-card px-3 text-sm text-ink" />
        <button type="submit" className="min-h-[44px] rounded-2xl bg-saffron px-4 text-sm font-extrabold text-ink">{t(lang, 'fam.future.search.label')}</button>
        {q && <a href={path} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-ink underline">{t(lang, 'fam.future.search.clear')}</a>}
      </form>
      {none && (
        <p data-future-empty className="rounded-2xl bg-lesson-butter px-4 py-3 text-sm font-semibold text-ink">
          {q ? t(lang, 'fam.future.search.none') : fill(t(lang, 'fam.future.empty'), { class: classText((k) => word(k), classLevel) })}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.id} data-future-group={g.id} aria-labelledby={`fg-${g.id}`} className="fam-card fam-section">
          <h2 id={`fg-${g.id}`} className="fam-h2 text-ink">{GROUP_TITLE(lang, g.id, stateCode)}</h2>
          {g.types.map((ty) => (
            <div key={ty.id} data-future-type={ty.id} className="flex flex-col gap-2">
              <h3 className={`fam-pill self-start ${TINT[ty.id].badge}`}>{t(lang, key(`fam.future.type.${ty.id}`))}</h3>
              <ul className="flex flex-col gap-2">{ty.cards.map((c) => <FutureCardView key={c.id} c={c} lang={lang} classLevel={classLevel} />)}</ul>
            </div>
          ))}
        </section>
      ))}
      {exams.length > 0 && (
        <section data-future-exams aria-labelledby="fg-exams" className="fam-card fam-section">
          <h2 id="fg-exams" className="fam-h2 text-ink">{t(lang, 'fam.future.yourExams')}</h2>
          <p className="text-xs text-ink">{t(lang, 'fam.future.yourExamsHint')}</p>
          <ul className="flex flex-col gap-2">{exams.map((c) => <FutureCardView key={c.id} c={c} lang={lang} classLevel={classLevel} />)}</ul>
        </section>
      )}
      {plan.length > 0 && (
        <section data-future-plan aria-labelledby="fg-plan" className="fam-card fam-section">
          <h2 id="fg-plan" className="fam-h2 text-ink">{t(lang, 'fam.future.planAhead')}</h2>
          <p className="text-xs text-ink">{t(lang, 'fam.future.planAheadHint')}</p>
          <ul className="flex snap-x gap-3 overflow-x-auto pb-2">{plan.map((c) => <FutureCardView key={c.id} c={c} lang={lang} classLevel={classLevel} plan />)}</ul>
        </section>
      )}
    </div>
  );
}
