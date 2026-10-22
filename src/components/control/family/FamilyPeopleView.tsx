import Link from 'next/link';
import { AppCard } from '@/components/app-ui/Card';
import { ReasonButton } from '@/components/control/apps/AppsPanels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PEOPLE_PAGE_SIZE, type FamilyPeople, type FamilyPerson, type PeopleQuery } from '@/lib/control/family-people';
import { t, type Lang, type MessageKey } from '@/lib/i18n';

// Control → Family → People (C230-V): one card per family, drawn on the server from loadFamilyPeople. What a person
// needs to serve and contact the family, and nothing more: the parent's email and dates, the children's first names and
// classes, consents as words, recent activity, and the staff-preview switch. "Offers: yes" is the only list to contact
// about offers; the search, the filter and the pages are plain links, so the page works without JavaScript.

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
const date = (lang: Lang, iso: string) => new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
const NOTE = 'max-w-prose text-sm text-slate/70';
// The consents shown, in the order a parent meets them; offers last, since it decides who may be contacted about offers.
const SHOWN_CONSENTS = ['study_core', 'english_programme', 'photo_input', 'voice_practice', 'offers'] as const;

function classWords(lang: Lang, n: number): string {
  if (n === -2) return t(lang, 'fam.class.nursery');
  if (n === -1) return t(lang, 'fam.class.lkg');
  if (n === 0) return t(lang, 'fam.class.ukg');
  return t(lang, 'control.people.class', { n });
}

function href(q: PeopleQuery, page: number): string {
  const p = new URLSearchParams();
  if (q.query) p.set('q', q.query);
  if (q.offersOnly) p.set('offers', '1');
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return `/control/family/people${s ? `?${s}` : ''}`;
}

function Person({ lang, p }: { lang: Lang; p: FamilyPerson }) {
  return (
    <li data-family-person={p.accountId} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-all text-base font-bold text-slate" data-person-email>
            {p.email}
          </p>
          <p className="text-sm text-slate/70">
            {t(lang, 'control.people.joined', { when: date(lang, p.joinedAt) })} ·{' '}
            {p.lastSignInAt ? t(lang, 'control.people.lastSignIn', { when: date(lang, p.lastSignInAt) }) : t(lang, 'control.people.neverSignedIn')} ·{' '}
            {t(lang, p.language === 'hi' ? 'control.people.lang.hi' : 'control.people.lang.en')}
          </p>
        </div>
        {p.preview && <Badge variant="success">{t(lang, 'control.people.onPreview')}</Badge>}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-slate">{t(lang, 'control.people.children')}</p>
        {p.children.length === 0 ? (
          <p className={NOTE}>{t(lang, 'control.people.noChildren')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {p.children.map((c, i) => (
              <li key={`${c.firstName}-${i}`} className="rounded-full bg-off-white px-3 py-1 text-sm text-slate ring-1 ring-slate/10">
                {c.firstName} · {classWords(lang, c.classLevel)}
                {c.board ? ` · ${c.board}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-sm text-slate">
        {t(lang, 'control.people.activity', { n: p.answers7d })} ·{' '}
        {p.lastAnsweredOn ? t(lang, 'control.people.lastAnswer', { when: date(lang, `${p.lastAnsweredOn}T12:00:00+05:30`) }) : t(lang, 'control.people.noAnswers')}
      </p>

      <ul className="flex flex-wrap gap-2" aria-label={t(lang, 'control.people.consents')}>
        {SHOWN_CONSENTS.map((c) => {
          const given = p.consents[c] === true;
          return (
            <li key={c} data-person-consent={c} data-given={given ? 'yes' : 'no'}>
              <Badge variant={given ? 'success' : 'neutral'}>
                {t(lang, `control.people.consent.${c}` as MessageKey)}: {given ? t(lang, 'control.people.yes') : t(lang, 'control.people.no')}
              </Badge>
            </li>
          );
        })}
      </ul>

      {/* Folded, so a page of 50 families reads as contacts first; the reason box opens with the switch. */}
      <details data-preview-switch>
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-royal underline">
          {t(lang, p.preview ? 'control.people.previewRemove' : 'control.people.previewAdd')}
        </summary>
        <div className="pt-2">
          {p.preview ? (
            <ReasonButton url="/api/control/apps/preview/remove" field="accountId" id={p.accountId} label={t(lang, 'control.people.previewRemove')} />
          ) : (
            <ReasonButton url="/api/control/apps/preview/add" field="accountId" id={p.accountId} label={t(lang, 'control.people.previewAdd')} />
          )}
        </div>
      </details>
    </li>
  );
}

export function FamilyPeopleView({ lang, people, q }: { lang: Lang; people: FamilyPeople; q: PeopleQuery }) {
  const pages = Math.max(1, Math.ceil(people.total / PEOPLE_PAGE_SIZE));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="max-w-prose rounded-md border border-slate/20 bg-off-white px-3 py-2 text-sm text-slate">{t(lang, 'control.people.recorded')}</p>
      <AppCard title={t(lang, 'control.people.searchHeading')}>
        <form method="get" action="/control/family/people" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input id="people-q" name="q" label={t(lang, 'control.people.search')} defaultValue={q.query} maxLength={100} helperText={t(lang, 'control.people.searchHelp')} />
          </div>
          <label htmlFor="people-offers" className="flex min-h-[44px] items-center gap-2 text-sm text-slate">
            <input id="people-offers" type="checkbox" name="offers" value="1" defaultChecked={q.offersOnly} className="h-5 w-5" />
            {t(lang, 'control.people.offersOnly')}
          </label>
          <Button type="submit">{t(lang, 'control.people.searchButton')}</Button>
        </form>
      </AppCard>

      <p className="text-sm font-semibold text-slate" data-people-total={people.total}>
        {t(lang, 'control.people.total', { n: people.total })}
        {pages > 1 && ` · ${t(lang, 'control.people.pageOf', { page: q.page, pages })}`}
      </p>

      {people.rows.length === 0 && people.total > 0 ? (
        <p className={NOTE} data-people-past-end>
          {t(lang, 'control.people.pastEnd')}{' '}
          <Link href={href(q, 1)} className="font-semibold text-royal underline">
            {t(lang, 'control.people.first')}
          </Link>
        </p>
      ) : people.rows.length === 0 ? (
        <p className={NOTE}>{q.query || q.offersOnly ? t(lang, 'control.people.noneFound') : t(lang, 'control.people.none')}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {people.rows.map((p) => (
            <Person key={p.accountId} lang={lang} p={p} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label={t(lang, 'control.people.pages')} className="flex flex-wrap gap-3">
          {q.page > 1 && (
            <Link href={href(q, q.page - 1)} className="inline-flex min-h-[44px] items-center font-semibold text-royal underline">
              {t(lang, 'control.people.previous')}
            </Link>
          )}
          {q.page < pages && (
            <Link href={href(q, q.page + 1)} className="inline-flex min-h-[44px] items-center font-semibold text-royal underline">
              {t(lang, 'control.people.next')}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
