import type { ReactNode } from 'react';

export function AnswerFirst({ children }: { children: ReactNode }) {
  return <p className="text-lg leading-relaxed text-slate sm:text-xl">{children}</p>;
}
