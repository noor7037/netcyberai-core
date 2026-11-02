import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChapterTestView } from '@/components/family/blocks/ChapterTestView';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { classText } from '@/lib/family/fill';
import { loadQuiz } from '@/lib/family/quiz';
import { publicQuiz } from '@/lib/family/quiz-play';
import { QUIZ_PAGE_KEYS } from '@/lib/family/quiz-words';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// A Quick quiz (W16-B1): the five questions made from a tutor session, played by the chapter test's own player and scored
// by its own scorer. The phone gets the questions and sealed tokens only. A wrong answer links back to the explanation: the
// chapter's own page when the session had a chapter, else the subject's Study feed where the conversation is.
export const dynamic = 'force-dynamic';

export default async function FamilyQuizPage({ params }: { params: { quizId: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const who = { accountId: page.session.accountId, childId: child.childId };
  const quiz = await familyPageRead(page, (db) => loadQuiz(db, who, params.quizId));
  const kicker = classText((k) => t(lang, k), child.classLevel);
  if (!quiz) {
    return (
      <div lang={lang} className="flex min-h-screen flex-col">
        <SubPageHeader back="/family/study" backLabel={t(lang, 'fam.study.title')} kicker={kicker} title={t(lang, 'fam.quiz.page')} tone="ink" />
        <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
          <p data-quiz-missing className="fam-card bg-white p-5 text-base text-slate">
            {t(lang, 'fam.quiz.missing')}
          </p>
          <Link href="/family/study" className="fam-press inline-flex min-h-[44px] items-center self-start font-bold text-ink underline underline-offset-4">
            {t(lang, 'fam.study.title')}
          </Link>
        </main>
      </div>
    );
  }
  const explainHref = quiz.chapterKey ? `/family/understand?kind=chapter&key=${encodeURIComponent(quiz.chapterKey)}` : `/family/study?subject=${encodeURIComponent(quiz.subject)}`;
  return (
    <div lang={quiz.lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={`/family/study?subject=${encodeURIComponent(quiz.subject)}`} backLabel={t(lang, `fam.subject.${quiz.subject}` as MessageKey)} kicker={kicker} title={t(lang, 'fam.quiz.page')} subject={quiz.subject} />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-24">
        <ChapterTestView
          b={publicQuiz(quiz, who)}
          blockId={quiz.quizId}
          chapterKey={quiz.chapterKey ?? ''}
          subject={quiz.subject}
          w={familyWords(quiz.lang, QUIZ_PAGE_KEYS)}
          tone={quiz.subject}
          quiz={{ quizId: quiz.quizId, explainHref }}
        />
      </main>
    </div>
  );
}
