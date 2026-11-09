import Link from 'next/link';
import { redirect } from 'next/navigation';
import { QuizCards } from '@/components/family/QuizCards';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { classSubjects } from '@/lib/family/catalog';
import { syllabusBoardOf } from '@/lib/family/children';
import { classText, fill } from '@/lib/family/fill';
import { quizCards } from '@/lib/family/quiz';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { indiaDate } from '@/lib/time/india';
import { t, type MessageKey } from '@/lib/i18n';

// A subject's quizzes (W22-S1): the page the quiz badge on a subject's chip in Study opens. The quiz cards are the same as
// before (start, review, score), the ones waiting first. The subject must be one of the child's own class.
export const dynamic = 'force-dynamic';

export default async function FamilyQuizzesPage({ searchParams }: { searchParams: { subject?: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const subjects = await familyPageRead(page, (db) => classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel, stream: child.stream }));
  const subject = subjects.find((s) => s === searchParams.subject);
  if (!subject) redirect('/family/study');
  const cards = await familyPageRead(page, (db) => quizCards(db, { accountId: page.session.accountId, childId: child.childId }, indiaDate(), { subject, all: true }));
  const name = t(lang, `fam.subject.${subject}` as MessageKey);
  const back = `/family/study?subject=${encodeURIComponent(subject)}`;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={back} backLabel={name} kicker={classText((k) => t(lang, k), child.classLevel)} title={t(lang, 'fam.quiz.listTitle')} subject={subject} />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <QuizCards cards={cards} lang={lang} today={indiaDate()} />
        {cards.length === 0 && (
          <p data-quizzes-empty className="fam-surface bg-white p-5 text-base text-slate">
            {fill(t(lang, 'fam.quiz.listEmpty'), { subject: name })}
          </p>
        )}
        <Link href={back} className="fam-press inline-flex min-h-[44px] items-center self-start font-bold text-ink underline underline-offset-4">
          {t(lang, 'fam.quiz.listBack')}
        </Link>
      </main>
    </div>
  );
}
