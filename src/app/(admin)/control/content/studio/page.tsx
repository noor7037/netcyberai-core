import Link from 'next/link';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ChapterStudioView } from '@/components/control/content/ChapterStudioView';
import { ChapterReader } from '@/components/family/reader/ChapterReader';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { previewOf, readVersion, studioOverview } from '@/lib/content/chapter-studio';
import { previewBlocks } from '@/lib/family/chapter-test-shape';
import { chapterView } from '@/lib/family/chapters';
import { READER_KEYS } from '@/lib/family/reader-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import '@/app/(family)/family/family.css';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → Content → Studio (S3, C376): the missing-chapter queue and the chapter editor. NetCyberAI staff with the
// authenticator (the layout refuses anyone else; the aal2 step is checked here, as the studio routes check it). The
// preview below the editor is the family's own ChapterReader on the same checked blocks, in the language chosen, with its
// place-keeping off: what a reviewer sees is what the child gets.
export const dynamic = 'force-dynamic';

export default async function StudioPage({ searchParams }: { searchParams: { key?: string; version?: string; lang?: string } }) {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const strong = session?.aal === 'aal2';
  const version = Number(searchParams.version);
  const data =
    session && strong
      ? await withTenantContext(session, async (db) => ({
          overview: await studioOverview(db),
          selected: searchParams.key && Number.isInteger(version) ? await readVersion(db, searchParams.key, version) : null,
        }))
      : null;
  const shown = searchParams.lang === 'hi' ? 'hi' : 'en';
  const checked = data?.selected ? previewOf(data.selected) : null;
  const view = checked?.ok ? chapterView(checked.chapter, shown) : null;
  const w = familyWords(shown, [...UNDERSTAND_KEYS, ...READER_KEYS]);
  const base = data?.selected ? `/control/content/studio?key=${encodeURIComponent(data.selected.chapterKey)}&version=${data.selected.versionNo}` : '';
  return (
    <ModulePage
      title={t(lang, 'control.studio.title')}
      purpose={t(lang, 'control.studio.purpose')}
      about={t(lang, 'control.studio.about')}
      icon="academics"
      tone="royal"
      eyebrow={t(lang, 'group.control')}
      headerLang={lang}
      more={
        <Link href="/control/content" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
          {t(lang, 'control.studio.back')}
        </Link>
      }
      notice={!strong ? <p data-studio-need-aal2 className="rounded-md border border-slate/20 bg-off-white px-3 py-2 text-sm font-semibold text-slate">{t(lang, 'control.studio.needAal2')}</p> : undefined}
    >
      <WordsProvider words={pageWords(lang, '/control/content/studio')}>
      {data && <ChapterStudioView key={data.selected ? `${data.selected.chapterKey}@${data.selected.versionNo}:${data.selected.updatedAt}` : 'none'} initial={data.overview} selected={data.selected} />}
      {data?.selected && (
        <section aria-labelledby="studio-preview" data-studio-preview className="mt-4 flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="studio-preview" className="text-lg font-bold text-slate">
              {t(lang, 'control.studio.preview')}
            </h2>
            <Link href={`${base}&lang=en`} aria-current={shown === 'en' ? 'true' : undefined} className={`inline-flex min-h-[44px] items-center rounded-md px-3 text-sm font-semibold ${shown === 'en' ? 'bg-sapphire text-white' : 'border border-slate/20 text-slate'}`}>
              {t(lang, 'control.studio.previewEn')}
            </Link>
            <Link href={`${base}&lang=hi`} aria-current={shown === 'hi' ? 'true' : undefined} className={`inline-flex min-h-[44px] items-center rounded-md px-3 text-sm font-semibold ${shown === 'hi' ? 'bg-sapphire text-white' : 'border border-slate/20 text-slate'}`}>
              {t(lang, 'control.studio.previewHi')}
            </Link>
          </div>
          <p className="text-sm text-slate">{t(lang, 'control.studio.previewHow')}</p>
          {view && checked?.ok ? (
            <div className="fam-canvas rounded-md bg-off-white p-3 text-slate">
              <div lang={view.lang} data-chapter-reader={view.key} className="mx-auto flex w-full max-w-xl flex-col gap-4">
                <h3 className="text-xl font-extrabold">{view.title}</h3>
                <ChapterReader chapterKey={view.key} lang={view.lang} blocks={previewBlocks(view.blocks)} ids={view.ids} script={view.script} start={0} resumed={false} w={w} tone={view.subject} preview />
              </div>
            </div>
          ) : (
            <p data-studio-preview-blocked className="rounded-md bg-amber/10 p-3 text-sm font-semibold text-slate">
              {t(lang, 'control.studio.previewBlocked')} {checked && !checked.ok ? `(${checked.problem})` : ''}
            </p>
          )}
        </section>
      )}
      </WordsProvider>
    </ModulePage>
  );
}
