'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import type { NavItem } from './TopNav';

type Props = {
  items: NavItem[];
  ariaLabel: string;
  /** Rendered under the logo, above the nav list -- e.g. a school switcher. Optional. */
  header?: React.ReactNode;
};

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NavList({ items, ariaLabel, onNavigate }: { items: NavItem[]; ariaLabel: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={ariaLabel} className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={`flex min-h-[44px] items-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

async function handleLogout(router: ReturnType<typeof useRouter>) {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  router.push('/login');
  router.refresh();
}

/**
 * Vertical left sidebar for Platform 2 (control) and the Office/Finance/
 * Academic Platform 3 shells -- replaces the horizontal TopNav these
 * surfaces used before, which wrapped and visually overlapped once a
 * shell's item count grew past what a single row could hold (confirmed
 * live: /control/schools/[id]'s 21-item nav and /control's own 13-item
 * nav, screenshotted by the founder). Teacher keeps BottomNav (phone-
 * first, 6 items, no desktop assumed) -- unaffected by this change.
 */
export function Sidebar({ items, ariaLabel, header }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      {/* Mobile top bar: hamburger only, sidebar itself becomes a slide-out drawer below md */}
      <div className="flex h-14 items-center justify-between border-b border-slate/10 bg-sapphire px-4 md:hidden">
        <span className="text-base font-bold text-white">NetCyberAI</span>
        <button
          ref={toggleRef}
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {open && (
        <div
          id={menuId}
          ref={panelRef}
          className="fixed inset-0 z-50 flex flex-col bg-sapphire md:hidden"
        >
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
            <span className="text-base font-bold text-white">NetCyberAI</span>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-white/10"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
          </div>
          {header && <div className="border-b border-white/10 px-4 py-3">{header}</div>}
          <NavList items={items} ariaLabel={ariaLabel} onNavigate={() => setOpen(false)} />
          <button
            type="button"
            onClick={() => handleLogout(router)}
            className="m-3 flex min-h-[44px] items-center rounded-md px-4 text-left text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
          >
            Log out
          </button>
        </div>
      )}

      {/* Desktop: fixed vertical sidebar, always visible at md+ */}
      <div className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sapphire md:flex">
        <div className="flex h-16 items-center px-6">
          <span className="text-lg font-bold text-white">NetCyberAI</span>
        </div>
        {header && <div className="border-b border-white/10 px-4 py-3">{header}</div>}
        <NavList items={items} ariaLabel={ariaLabel} />
        <button
          type="button"
          onClick={() => handleLogout(router)}
          className="m-3 flex min-h-[44px] items-center rounded-md px-4 text-left text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
        >
          Log out
        </button>
      </div>
    </>
  );
}
