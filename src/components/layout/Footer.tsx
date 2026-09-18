'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { companyAddress, companyName, contactEmail } from '@/lib/site-config';

// See Header.tsx's comment: the public marketing footer doesn't belong
// on the internal /control or /app shells either -- same targeted fix,
// same one place the pathname check lives (mirrored, not shared,
// since Header and Footer have no common parent to hoist it into
// without restructuring the root layout, which is the larger, out-of-
// proportion fix this prompt didn't take).
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith('/control') || pathname.startsWith('/app')) {
    return null;
  }
  return (
    <footer className="border-t border-slate/10 bg-off-white">
      <Container className="flex flex-col gap-4 py-10 text-sm text-slate">
        <p className="font-semibold">{companyName}</p>
        <p className="flex flex-wrap items-center gap-x-1">
          <span>{companyAddress} ·</span>
          <a
            href={`mailto:${contactEmail}`}
            className="min-h-[44px] inline-flex items-center underline"
          >
            {contactEmail}
          </a>
        </p>
        <nav className="flex flex-wrap gap-4" aria-label="Legal">
          <Link href="/privacy" className="min-h-[44px] flex items-center underline">
            Privacy
          </Link>
          <Link href="/terms" className="min-h-[44px] flex items-center underline">
            Terms
          </Link>
          <Link href="/security/data-ownership" className="min-h-[44px] flex items-center underline">
            Data Ownership
          </Link>
        </nav>
        <p className="text-xs text-slate/70">
          &copy; {new Date().getFullYear()} {companyName}. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
