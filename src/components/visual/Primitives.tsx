import type { ReactNode } from 'react';
import { tones, type Tone } from '@/lib/semantic';

export function Eyebrow({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${tones[tone].soft}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tones[tone].dot}`} />
      {children}
    </span>
  );
}

export function EyebrowOnDark({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${tones[tone].solid}`}>
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  tone,
  title,
  lead,
  dark = false,
  center = false,
  id,
}: {
  eyebrow: string;
  tone: Tone;
  title: ReactNode;
  lead?: ReactNode;
  dark?: boolean;
  center?: boolean;
  id?: string;
}) {
  const align = center ? 'items-center text-center mx-auto' : '';
  // Dark variant sets no text colour of its own: it inherits the verified
  // `text-white` of the dark section that hosts it (checker-visible there).
  if (dark) {
    return (
      <div className={`flex max-w-3xl flex-col gap-3 ${align}`}>
        <EyebrowOnDark tone={tone}>{eyebrow}</EyebrowOnDark>
        <h2 id={id} className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {title}
        </h2>
        {lead && <p className="text-lg opacity-80">{lead}</p>}
      </div>
    );
  }
  return (
    <div className={`flex max-w-3xl flex-col gap-3 ${align}`}>
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2 id={id} className="text-3xl font-extrabold tracking-tight text-slate sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="text-lg text-slate/70">{lead}</p>}
    </div>
  );
}
