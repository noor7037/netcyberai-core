'use client';

import { useId, useState, type ReactNode } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Icon } from '@/components/visual/Icons';

// The words of a page banner (C235-C): the group, the title, ONE short line,
// and -- when the screen has more to say -- an ⓘ button that opens "About
// this page" under the line. The longer explanation is there for whoever
// wants it, not on screen for everyone, every visit. Text takes the
// banner's white; the panel is white with slate text.
export function BannerTitle({ eyebrow, title, subtitle, about }: { eyebrow?: string; title: string; subtitle?: string; about?: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="min-w-0 flex-1">
      {eyebrow && <p className="text-xs font-bold uppercase tracking-wider">{eyebrow}</p>}
      <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
      {(subtitle || about) && (
        <div className="mt-1 flex items-start gap-1">
          {subtitle && <p className="max-w-prose pt-0.5 text-sm font-medium md:text-base">{subtitle}</p>}
          {about && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              title={t('page.about')}
              data-page-about
              onClick={() => setOpen((o) => !o)}
              className="-my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-white/40 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Icon name="info" className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">{t('page.about')}</span>
            </button>
          )}
        </div>
      )}
      {about && (
        <div id={panelId} hidden={!open} className="mt-3 max-w-prose rounded-2xl bg-white p-4 text-sm leading-relaxed text-slate shadow-sm">
          {about}
        </div>
      )}
    </div>
  );
}
