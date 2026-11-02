import { Button } from '@/components/family/ui/Button';
import { sameInkOnBothSides } from '@/lib/family/day-text';
import { SubjectGlyph } from '@/components/family/ui/SubjectGlyph';
import type { QuizCard } from '@/lib/family/quiz';
import { subjectTheme } from '@/lib/family/subject-theme';
import { t, type Lang, type MessageKey } from '@/lib/i18n';

// The Quick quiz cards (W16-B1): on the Study feed and the child's home, a card for a quiz made from a tutor session that
// ended ("5 questions from today's Science"), for a review due today ("Review: 5 questions"), and for a taken quiz with
// its score. Each opens the chapter test player at /family/study/quiz/<id>. Drawn on the server: no script, the words
// from the message files in the child's language. The score is only what the server computed from the sealed answers.

const date = (lang: Lang, day: string) =>
  sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`)));

export function QuizCards({ cards, lang, today }: { cards: QuizCard[]; lang: Lang; today: string }) {
  if (cards.length === 0) return null;
  return (
    <section data-quiz-cards aria-label={t(lang, 'fam.quiz.cardTitle')} className="flex flex-col gap-3">
      {cards.map((c) => {
        const theme = subjectTheme(c.subject);
        const subject = t(lang, `fam.subject.${c.subject}` as MessageKey);
        const line =
          c.state === 'review'
            ? t(lang, 'fam.quiz.review', { n: c.questions })
            : c.state === 'ready'
              ? t(lang, c.day === today ? 'fam.quiz.ready' : 'fam.quiz.readyEarlier', { n: c.questions, subject })
              : c.score
                ? t(lang, 'fam.quiz.scored', { n: c.score.correct, d: c.score.total })
                : t(lang, 'fam.quiz.readyEarlier', { n: c.questions, subject });
        return (
          <article key={c.quizId} data-quiz-card={c.state} className="fam-card fam-section fam-rise bg-white">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className={`fam-chip-icon ${theme.soft} ${theme.ink}`}>
                <SubjectGlyph subject={c.subject} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-slate">{t(lang, 'fam.quiz.cardTitle')}</h2>
                <p className="text-sm font-semibold text-slate">{line}</p>
                {c.state === 'scored' && c.due && <p className="fam-note text-slate/80">{t(lang, 'fam.quiz.nextReview', { date: date(lang, c.due) })}</p>}
              </div>
            </div>
            <Button href={`/family/study/quiz/${encodeURIComponent(c.quizId)}`} variant={c.state === 'scored' ? 'outline' : 'primary'} className="self-start" data-quiz-open>
              {c.state === 'review' ? t(lang, 'fam.quiz.startReview') : c.state === 'ready' ? t(lang, 'fam.quiz.start') : t(lang, 'fam.quiz.seeAgain')}
            </Button>
          </article>
        );
      })}
    </section>
  );
}
