import type { ReactNode } from 'react';
import type { ColorToken } from '@/lib/contracts/modules';
import { TOKEN_TONES } from './tones';

// A screen's header: the module group (eyebrow, in the group's tone), the
// title, one line on what the screen is for, and its main actions.
export function PageHeader({
  title,
  description,
  eyebrow,
  tone = 'royal',
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  tone?: ColorToken;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className={`mb-1 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${TOKEN_TONES[tone].fg}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TOKEN_TONES[tone].bar}`} />
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-extrabold text-slate">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-slate/70">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
