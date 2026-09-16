'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { companyName, whatsappLink } from '@/lib/site-config';

const navLinks = [
  { href: '/features/whatsapp-fee-recovery-upi', label: 'Fee Recovery' },
  { href: '/features/daily-learning-pulse-hinglish', label: 'Daily Pulse' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/demo', label: 'Demo' },
];

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M3 12h18M3 18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function getFocusable(): HTMLElement[] {
      const toggle = toggleRef.current;
      const panel = panelRef.current;
      if (!toggle || !panel) return [];
      const panelLinks = Array.from(panel.querySelectorAll<HTMLElement>('a[href]'));
      return [toggle, ...panelLinks];
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    // Focus moves into the revealed panel, matching standard disclosure behaviour.
    panelRef.current?.querySelector<HTMLElement>('a[href]')?.focus();

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className="relative border-b border-slate/10 bg-off-white">
      <Container className="flex h-16 items-center justify-between gap-2">
        <Link
          href="/"
          className="min-h-[44px] shrink-0 items-center flex text-lg font-bold text-sapphire"
        >
          {companyName}
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate hover:text-sapphire"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Button href={whatsappLink(`Hi, I would like to book a demo of ${companyName}.`)}>
            Book a demo
          </Button>

          <button
            ref={toggleRef}
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate hover:bg-slate/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </Container>

      {open && (
        <div
          id={menuId}
          ref={panelRef}
          className="absolute inset-x-0 top-16 z-50 border-b border-slate/10 bg-off-white shadow-md md:hidden"
        >
          <nav aria-label="Primary" className="flex flex-col">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-[44px] items-center border-t border-slate/10 px-4 text-base font-medium text-slate first:border-t-0 hover:bg-slate/5"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
