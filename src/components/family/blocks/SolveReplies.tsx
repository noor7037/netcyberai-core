'use client';

import { fill, type Words } from '@/lib/family/fill';
import { SOLVE_REPLIES, replyProblem } from '@/lib/family/maths-solve';

// §8 maths (18 Nov 2026): under a sum's solution, "Did you understand?" and four quick replies. Each sends its plain
// follow-up question, with the sum, into the same chat (`onAsk`); without a way to ask (a kept answer in the history),
// the row is not drawn, so no chip is ever dead.
export function SolveReplies({ w, problem, onAsk }: { w: Words; problem: string; onAsk?: (text: string) => void }) {
  if (!onAsk) return null;
  const sum = replyProblem(problem);
  return (
    <nav aria-label={w['fam.solve.understood']} data-solve-replies className="flex flex-col gap-2">
      <p className="text-base font-bold text-slate">{w['fam.solve.understood']}</p>
      <div className="grid grid-cols-2 gap-2">
        {SOLVE_REPLIES.map((r) => (
          <button
            key={r}
            type="button"
            data-solve-reply={r}
            onClick={() => onAsk(fill(w[`fam.solve.ask.${r}`], { problem: sum }))}
            className="fam-press fam-lesson-chip min-h-[48px] rounded-2xl bg-white px-3 py-2 text-sm font-bold text-ink"
          >
            {w[`fam.solve.reply.${r}`]}
          </button>
        ))}
      </div>
    </nav>
  );
}
