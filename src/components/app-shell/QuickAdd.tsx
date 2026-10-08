'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import type { QuickAddItem } from '@/lib/contracts/quick-add';
import { useT } from './LangContext';

// The "+ New" button (docs/19 rule 4, C135): the day's common additions,
// one tap from any screen. The items are computed by the server from the
// registry, the role and the school's modules (buildQuickAdd); with none,
// the button is not drawn. A menu button: Enter or Space opens, arrows
// move, Escape closes and returns to the button.
export function QuickAdd({ items }: { items: readonly QuickAddItem[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  if (items.length === 0) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    if (!open) return setOpen(true); // the first item takes focus when the menu opens
    const links = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = links.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[next]?.focus();
  }

  return (
    <div
      ref={wrap}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // Tabbing away closes the menu.
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-sapphire px-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          +
        </span>
        {t('new.button')}
      </button>
      {open && (
        <ul id={menuId} role="menu" aria-label={t('new.menu')} className="absolute left-0 z-40 mt-1 w-72 md:left-auto md:right-0 max-w-[calc(100vw-2rem)] rounded-lg border border-slate/10 bg-white p-1 shadow-lg">
          {items.map((i) => (
            <li key={i.id} role="none">
              <Link role="menuitem" href={i.href} onClick={() => setOpen(false)} className="flex min-h-[56px] items-center gap-3 rounded-md px-2 text-left hover:bg-slate/5 focus-visible:bg-slate/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                <ModuleIcon name={i.icon} tone={i.tone} size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate">{t(`new.${i.id}`)}</span>
                  <span className="block text-xs text-slate/70">{t(`new.${i.id}.hint`)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
