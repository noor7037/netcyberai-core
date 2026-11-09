import { notFound, redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { bookChapter, bookFor, readerSrc } from '@/lib/family/books';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { t } from '@/lib/i18n';

// A chapter of the child's book in the NetCyberAI chapter reader (founder, 9 Nov 2026): topic by topic, with its
// diagrams, the labs inside the lessons, the topic checks and the chapter test, in the child's language (the reader's
// own switch changes it). The reader is served to signed-in families only (/family/learn/...) and framed here, under
// the Family header, so Back returns to Study; the tab dock steps aside (FamilyTabs) so the reader has the screen.
// Only a chapter of the book for this child's board, class and subject.
export const dynamic = 'force-dynamic';

export default async function BookChapterPage({ params }: { params: { key: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  if (isPrePrimary(child.classLevel)) redirect('/family/study');
  const found = bookChapter(decodeURIComponent(params.key));
  if (!found) notFound();
  const mine = bookFor({ board: syllabusBoardOf(child), classLevel: child.classLevel, subject: found.book.subject });
  if (!mine || mine.id !== found.book.id) notFound();
  const lang = page.childLang;
  const title = found.chapter.title[lang === 'hi' ? 'hi' : 'en'];
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={`/family/study?subject=${found.book.subject}`} backLabel={t(lang, 'fam.study.title')} kicker={t(lang, 'fam.reader.kicker')} title={title} subject={found.book.subject} />
      <main data-book-chapter={found.chapter.key} className="relative mx-auto -mt-8 flex w-full max-w-3xl flex-1 flex-col px-2 pb-3">
        <iframe title={title} src={readerSrc(found.book, found.chapter, lang)} className="fam-card h-[calc(100dvh-9rem)] min-h-[480px] w-full border-0 bg-white" allow="fullscreen" />
      </main>
    </div>
  );
}
