'use client';

import { useId, useState, type ReactNode } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Icon } from '@/components/visual/Icons';

// The ⓘ beside a heading, a row or a field (C235-C): the explanation a
// reader needs once, not on every visit, one tap away instead of on the
// screen. Every fact stays; it is only folded. A 44px button (its words for
// screen readers, and as its tooltip) and the panel it opens. Returned as
// two siblings: put it in a `flex flex-wrap` row and the panel takes the
// full width under that row (basis-full). The panel is in the page from
// the start (hidden), so search engines, tests and "find in page" after
// opening all see the same words.
export function InfoTip({ children, label, tone = 'light', className = '' }: { children: ReactNode; label?: string; tone?: 'light' | 'white'; className?: string }) {
  const { t } = useWords();
  const [open, setOpen] = useState(false);
  const id = useId();
  const name = label ?? t('info.more');
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        title={name}
        data-info-tip
        onClick={() => setOpen((o) => !o)}
        className={`-my-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate/70 hover:bg-slate/5 hover:text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal ${open ? 'bg-slate/5 text-slate' : ''} ${className}`}
      >
        <Icon name="info" className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">{name}</span>
      </button>
      <div id={id} hidden={!open} data-info-panel className={`basis-full rounded-xl p-3 text-sm leading-relaxed text-slate ${tone === 'white' ? 'bg-white' : 'bg-off-white'}`}>
        {children}
      </div>
    </>
  );
}
