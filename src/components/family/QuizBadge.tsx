import Link from 'next/link';

// The Quiz button beside every subject in Study (W22-S1; W24, founder: say "Quiz" in words, in its own colour, on every
// subject). Plum (the app's colour for its own learning tools), never the subject's colour; the number of quizzes
// waiting (never taken, or a review due) when there are some. It opens that subject's quizzes and chapter tests.
export function QuizBadge({ href, count, label, word }: { href: string; count: number; label: string; word: string }) {
  return (
    <Link href={href} data-quiz-badge={count} className="fam-press flex min-h-[44px] items-center justify-center rounded-xl px-1">
      <span className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-grape-deep px-3 text-sm font-extrabold text-white">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7M12 17v.01" />
        </svg>
        {word}
        <span className="sr-only">: {label}</span>
        {count > 0 && <span aria-hidden="true" className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-white px-1.5 text-xs font-extrabold text-grape-deep">{count}</span>}
      </span>
    </Link>
  );
}
