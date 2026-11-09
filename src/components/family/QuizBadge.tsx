import Link from 'next/link';

// The quiz badge on a subject chip in Study (W22-S1): a small quiz mark with the number of quizzes waiting in that subject
// (never taken, or a review due). It opens that subject's quizzes. Drawn on the server; shown only when one waits.
// The number is a count the server made from the child's own quizzes, never a made-up figure.
export function QuizBadge({ href, count, label, on }: { href: string; count: number; label: string; on: boolean }) {
  return (
    <Link href={href} aria-label={label} data-quiz-badge={count} className="fam-press flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl pl-1 pr-2">
      <span className={`inline-flex min-h-[28px] items-center gap-1 rounded-full px-2 text-sm font-extrabold ${on ? 'bg-white text-ink' : 'bg-ink text-white'}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7M12 17v.01" />
        </svg>
        {count}
      </span>
    </Link>
  );
}
