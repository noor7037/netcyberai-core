import { useId, type ReactNode } from 'react';
import type { ColorToken } from '@/lib/contracts/modules';
import { TOKEN_TONES } from './tones';

// The app's card (17 §4; visual reference: the showcase Principal
// dashboard): white surface, light border, an optional accent bar in the
// module group's tone, a title that says the one message, and actions.
export function AppCard({
  title,
  description,
  tone,
  actions,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  tone?: ColorToken;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`nca-lift relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-slate/10 bg-white p-4 ${className}`}>
      {tone && <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${TOKEN_TONES[tone].bar}`} />}
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-bold text-slate">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-slate/70">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
