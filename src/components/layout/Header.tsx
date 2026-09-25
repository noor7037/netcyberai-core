'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { companyName } from '@/lib/site-config';

const navLinks = [
  { href: '/products', label: 'Products' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/resources', label: 'Resources' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
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
  const pathname = usePathname();
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

  // Found by this prompt's own Playwright verification, not assumed:
  // the root layout renders Header/Footer on every route, including
  // /control/* and /app/*, which put the public marketing nav ("Book a
  // demo," feature links) above every internal admin/school-workspace
  // shell. Prompt D's own TopNav/BottomNav are that surface's real
  // navigation; the marketing chrome doesn't belong there. Splitting
  // into separate root layouts per top-level route group (Next.js's
  // supported "multiple root layouts" pattern) would be the more
  // structurally clean fix, but it means moving every existing
  // marketing route's files -- out of proportion to what this bug
  // needs. Suppressing here is the targeted fix; the pathname check
  // stays in exactly one place (mirrored in Footer.tsx).
  if (pathname.startsWith('/control') || pathname.startsWith('/app')) {
    return null;
  }

  return (
    <header className="relative border-b border-slate/10 bg-off-white">
      <Container className="flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex min-h-[44px] shrink-0 items-center">
          <Image
            src="/brand/logo.svg"
            alt={companyName}
            width={180}
            height={48}
            priority
            className="h-8 w-auto"
          />
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
          <Link
            href="/login"
            className="hidden min-h-[44px] items-center px-2 text-sm font-medium text-slate hover:text-sapphire md:flex"
          >
            Login
          </Link>
          <Button href="/get-started" className="hidden md:inline-flex">
            Get started
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
            <Link
              href="/book-demo"
              className="flex min-h-[44px] items-center border-t border-slate/10 px-4 text-base font-medium text-slate hover:bg-slate/5"
              onClick={() => setOpen(false)}
            >
              Book a demo
            </Link>
            <Link
              href="/login"
              className="flex min-h-[44px] items-center border-t border-slate/10 px-4 text-base font-medium text-slate hover:bg-slate/5"
              onClick={() => setOpen(false)}
            >
              Login
            </Link>
            <Link
              href="/get-started"
              className="flex min-h-[44px] items-center border-t border-slate/10 px-4 text-base font-semibold text-sapphire hover:bg-slate/5"
              onClick={() => setOpen(false)}
            >
              Get started
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
