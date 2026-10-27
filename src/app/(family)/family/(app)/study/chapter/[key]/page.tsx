import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { ChapterReader } from '@/components/family/reader/ChapterReader';
import { chapterView, resumeIndex, showcaseChapter, showcaseChapters } from '@/lib/family/chapters';
import { isPrePrimary } from '@/lib/family/children';
import { READER_KEYS } from '@/lib/family/reader-words';
import { readPlace } from '@/lib/family/reading';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// The chapter reader (S1, C374): a NetCyber-authored chapter in the child's language, read on the page and, when the
// child asks, read aloud by the phone's own voice from where this child last stopped. Server side: the chapter is
// checked (lib/family/chapters.ts), its narration script built (only teaching text; never a diagram, table or
// interactive), and the child's saved place read; the phone gets the blocks, the script and the place.
export const dynamic = 'force-dynamic';

export default async function ChapterPage({ params }: { params: { key: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const chapter = showcaseChapter(decodeURIComponent(params.key));
  if (!chapter) notFound();
  const child = page.child!;
  if (isPrePrimary(child.classLevel)) redirect('/family/study');
  const lang = page.childLang;
  const view = chapterView(chapter, lang);
  const saved = await familyPageRead(page, (db) => readPlace(db, page.session.accountId, child.childId, chapter.key));
  const start = resumeIndex(view.script, saved);
  const w = familyWords(lang, [...UNDERSTAND_KEYS, ...READER_KEYS]);
  const others = showcaseChapters().filter((c) => c.key !== chapter.key);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={`/family/study?subject=${chapter.subject}`} backLabel={t(lang, 'fam.study.title')} kicker={t(lang, 'fam.reader.kicker')} title={view.title} subject={chapter.subject} />
      <main data-chapter-reader={chapter.key} lang={view.lang} className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-28">
        <ChapterReader chapterKey={chapter.key} lang={view.lang} blocks={view.blocks} ids={view.ids} script={view.script} start={start} resumed={saved !== null && start > 0} w={w} tone={chapter.subject} />
        {others.length > 0 && (
          <nav aria-labelledby="fam-reader-more" className="flex flex-col gap-2">
            <h2 id="fam-reader-more" className="px-1 text-lg font-extrabold text-slate">
              {t(lang, 'fam.reader.more')}
            </h2>
            <ul className="flex flex-col gap-2">
              {others.map((c) => (
                <li key={c.key}>
                  <Link href={`/family/study/chapter/${encodeURIComponent(c.key)}`} className="fam-card fam-press flex min-h-[52px] items-center justify-between gap-3 bg-white px-4 text-base font-bold text-slate">
                    <span>{chapterView(c, lang).title}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
    </div>
  );
}
