import Link from 'next/link';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { listCareerQueue } from '@/lib/content/career-review';
import { buildBundle, SEED_BATCH } from '@/lib/family/careers/catalog';
import { LEVEL_KEY } from '@/lib/family/careers/labels';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { indiaDate } from '@/lib/time/india';

export const dynamic = 'force-dynamic';

const STATES = ['pending', 'approved', 'rejected', 'due', 'all'] as const;

export default async function CareersControlPage({ searchParams }: { searchParams: { state?: string; field?: string; level?: string; notice?: string } }) {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const state = STATES.includes(searchParams.state as (typeof STATES)[number]) ? searchParams.state! : 'pending';
  const rows = session
    ? await withTenantContext(session, (db) => listCareerQueue(db, {
        state: state === 'all' || state === 'due' ? undefined : state,
        field: searchParams.field,
        level: searchParams.level,
        due: state === 'due',
      }, indiaDate()))
    : [];
  const seedCount = buildBundle().careers.length;
  const word = (k: Parameters<typeof t>[1]) => t(lang, k);
  return (
    <ModulePage title={word('control.careers.title')} purpose={word('control.careers.purpose')} about={word('control.careers.about')} icon="academics" tone="royal" eyebrow={word('control.content.title')} headerLang={lang}
      more={<Link href="/control/content" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">{word('control.content.title')}</Link>}
    >
      <WordsProvider words={pageWords(lang, '/control/content/careers')}>
        {searchParams.notice === 'saved' && <p className="mb-3 text-sm font-semibold text-ink">{word('control.careers.saved')}</p>}
        <p className="text-sm text-slate">{word('control.careers.count').replace('{n}', String(seedCount))} · {word('control.careers.batch').replace('{batch}', SEED_BATCH)} · {word('control.careers.basis')}</p>
        <form method="get" className="mt-3 flex flex-wrap gap-2">
          <label className="text-xs font-extrabold text-ink">{word('control.careers.state')}
            <select name="state" defaultValue={state} className="ml-2 min-h-[44px] rounded-lg border border-slate/30 bg-white px-2 text-sm">
              {STATES.map((id) => <option key={id} value={id}>{word(`control.careers.${id}` as 'control.careers.all')}</option>)}
            </select>
          </label>
          <label className="text-xs font-extrabold text-ink">{word('control.careers.field')}
            <input name="field" defaultValue={searchParams.field ?? ''} className="ml-2 min-h-[44px] rounded-lg border border-slate/30 px-2 text-sm" />
          </label>
          <label className="text-xs font-extrabold text-ink">{word('control.careers.level')}
            <input name="level" defaultValue={searchParams.level ?? ''} className="ml-2 min-h-[44px] rounded-lg border border-slate/30 px-2 text-sm" />
          </label>
          <button type="submit" className="min-h-[44px] rounded-lg bg-ink px-3 text-sm font-extrabold text-white">{word('fam.career.searchGo')}</button>
        </form>
        <form method="post" action="/api/control/content/careers" className="mt-4 rounded-xl bg-off-white p-3">
          <h2 className="text-sm font-extrabold text-ink">{word('control.careers.importer')}</h2>
          <p className="text-sm text-slate">{word('control.careers.importHelp')}</p>
          <input type="hidden" name="action" value="import" />
          <input type="hidden" name="confirm" value="load-pending-seed" />
          <button type="submit" className="mt-2 min-h-[44px] rounded-lg bg-ink px-3 text-sm font-extrabold text-white">{word('control.careers.importRun')}</button>
        </form>
        {rows.length === 0 ? <p className="mt-4 text-sm font-semibold text-slate">{word('control.careers.empty')}</p> : (
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.slug} data-career-row={r.slug} className="rounded-xl bg-white p-3 ring-1 ring-slate/15">
                <p className="text-xs font-extrabold text-slate">{r.fieldId} · {word(LEVEL_KEY[r.level])} · {word(`control.careers.${r.reviewState}` as 'control.careers.pending')} · {word('control.careers.reviewDue')} {r.reviewDue}</p>
                <p lang="en" className="font-extrabold text-ink">{r.titleEn}</p>
                <p lang="hi" className="text-sm text-slate">{r.titleHi}</p>
                <form method="post" action="/api/control/content/careers" className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="action" value="edit" />
                  <input type="hidden" name="slug" value={r.slug} />
                  <label className="text-xs font-extrabold text-ink">{word('control.careers.titleEn')}<input name="titleEn" defaultValue={r.titleEn} className="mt-1 block w-full min-h-[44px] rounded-lg border border-slate/30 px-2 text-sm" /></label>
                  <label className="text-xs font-extrabold text-ink">{word('control.careers.titleHi')}<input name="titleHi" defaultValue={r.titleHi} className="mt-1 block w-full min-h-[44px] rounded-lg border border-slate/30 px-2 text-sm" /></label>
                  <label className="text-xs font-extrabold text-ink">{word('control.careers.summaryEn')}<textarea name="summaryEn" defaultValue={r.summaryEn} className="mt-1 block w-full rounded-lg border border-slate/30 px-2 py-2 text-sm" /></label>
                  <label className="text-xs font-extrabold text-ink">{word('control.careers.summaryHi')}<textarea name="summaryHi" defaultValue={r.summaryHi} className="mt-1 block w-full rounded-lg border border-slate/30 px-2 py-2 text-sm" /></label>
                  <label className="text-xs font-extrabold text-ink">{word('control.careers.url')}<input name="officialUrl" defaultValue={r.officialUrl ?? ''} className="mt-1 block w-full min-h-[44px] rounded-lg border border-slate/30 px-2 text-sm" /></label>
                  <label className="text-xs font-extrabold text-ink">{word('control.careers.reviewDue')}<input name="reviewDue" defaultValue={r.reviewDue} className="mt-1 block w-full min-h-[44px] rounded-lg border border-slate/30 px-2 text-sm" /></label>
                  <button type="submit" className="min-h-[44px] rounded-lg bg-ink px-3 text-sm font-extrabold text-white">{word('control.careers.save')}</button>
                </form>
                <div className="mt-2 flex flex-wrap gap-2">
                  <form method="post" action="/api/control/content/careers">
                    <input type="hidden" name="action" value="approve" />
                    <input type="hidden" name="slug" value={r.slug} />
                    <button type="submit" className="min-h-[44px] rounded-lg bg-ink px-3 text-sm font-extrabold text-white">{word('control.careers.approve')}</button>
                  </form>
                  <form method="post" action="/api/control/content/careers" className="flex flex-wrap gap-2">
                    <input type="hidden" name="action" value="reject" />
                    <input type="hidden" name="slug" value={r.slug} />
                    <label className="sr-only" htmlFor={`reason-${r.slug}`}>{word('control.careers.reason')}</label>
                    <input id={`reason-${r.slug}`} name="reason" placeholder={word('control.careers.reason')} className="min-h-[44px] rounded-lg border border-slate/30 px-2 text-sm" />
                    <button type="submit" className="min-h-[44px] rounded-lg bg-white px-3 text-sm font-extrabold text-ink ring-1 ring-slate/30">{word('control.careers.reject')}</button>
                  </form>
                </div>
                {r.rejectReason && <p className="mt-1 text-xs text-slate">{r.rejectReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </WordsProvider>
    </ModulePage>
  );
}
