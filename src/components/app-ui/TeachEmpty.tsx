'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/components/app-shell/LangContext';
import { isMessageKey, type MessageKey } from '@/lib/i18n';

// An empty list that teaches (docs/19 rule 8, C139): what is missing, one
// plain sentence on what to do next, and the button that does it. The words
// are in the message files (`empty.<id>.title`, `.do`, `.action`), in the
// person's language. Where this person's role cannot do the next step, the
// sentence says who can, and there is no button (the `-view` ids). A list
// that could not be loaded is not an empty list: it says `not-loaded`.

export const EMPTY_IDS = [
  'students', 'students-none-waiting', 'students-no-match', 'classes', 'guardians', 'guardians-view', 'family-guardians', 'siblings', 'siblings-view',
  'data-requests', 'data-requests-view', 'attendance-roster', 'attendance-roster-view', 'staff-search', 'taught-today-teacher', 'taught-today-office', 'timetable-teacher', 'timetable-no-classes', 'timetable-empty-view', 'needs-help', 'homework', 'homework-no-classes', 'pulse-drafts', 'recovery',
  'support-access', 'not-loaded',
] as const;
export type EmptyId = (typeof EMPTY_IDS)[number];

const BUTTON = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';

export function TeachEmpty({ id, onAction, href, compact = false }: { id: EmptyId; onAction?: () => void; href?: string; compact?: boolean }) {
  const { lang, t } = useT();
  const actionKey = `empty.${id}.action`;
  const label = isMessageKey(actionKey) ? t(actionKey) : null;
  let action: ReactNode = null;
  if (label && href) {
    action = (
      <Link href={href} className={BUTTON}>
        {label}
      </Link>
    );
  } else if (label && onAction) {
    action = (
      <button type="button" onClick={onAction} className={BUTTON}>
        {label}
      </button>
    );
  }
  return (
    <div lang={lang} data-empty={id} className={`flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white ${compact ? 'p-3' : 'p-5'}`}>
      <p className="text-base font-bold text-slate">{t(`empty.${id}.title` as MessageKey)}</p>
      <p className="max-w-prose text-sm text-slate">{t(`empty.${id}.do` as MessageKey)}</p>
      {action}
    </div>
  );
}
