import Link from 'next/link';
import { Picture } from '../Picture';
import { ENTER, PRESS } from './motion';

// A designed empty state (docs/family-app/09 §6; D1, C293): never a blank area. A picture, what is missing in plain
// words, and the one thing to do next.
export function EmptyState({ e, title, body, action, tone = 'bg-white' }: { e: string; title: string; body?: string; action?: { href: string; label: string }; tone?: string }) {
  return (
    <section data-empty-state className={`flex flex-col items-center gap-3 rounded-3xl p-6 text-center shadow-sm ring-1 ring-slate/10 ${tone} ${ENTER}`}>
      <Picture e={e} size={64} />
      <h2 className="text-lg font-extrabold text-slate">{title}</h2>
      {body && <p className="max-w-sm text-base text-slate/80">{body}</p>}
      {action && (
        <Link href={action.href} className={`mt-1 flex min-h-[44px] items-center justify-center rounded-2xl bg-royal px-5 text-base font-bold text-white hover:bg-royal-deep ${PRESS}`}>
          {action.label}
        </Link>
      )}
    </section>
  );
}
