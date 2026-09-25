'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { companyAddress, companyName, contactEmail } from '@/lib/site-config';

const LINK_GROUPS = [
  {
    title: 'Product',
    links: [
      { href: '/products', label: 'All products' },
      { href: '/features/whatsapp-fee-recovery-upi', label: 'Fee Recovery' },
      { href: '/features/daily-learning-pulse-hinglish', label: 'Daily Pulse' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/demo', label: 'Concept demo' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { href: '/solutions', label: 'By role & school type' },
      { href: '/get-started', label: 'Get started' },
      { href: '/book-demo', label: 'Book a demo' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/resources', label: 'All resources' },
      { href: '/blog', label: 'Blog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/security/data-ownership', label: 'Data ownership' },
    ],
  },
] as const;

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
      <Container className="py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- see Header.tsx: next/image
                  400s on SVG sources without dangerouslyAllowSVG. */}
              <img src="/brand/logo-mark.svg" alt="" width={28} height={28} className="h-7 w-7" />
              <p className="font-semibold text-slate">{companyName}</p>
            </div>
            <p className="text-sm text-slate/70">{companyAddress}</p>
            <a href={`mailto:${contactEmail}`} className="min-h-[44px] inline-flex items-center text-sm underline">
              {contactEmail}
            </a>
          </div>

          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-slate">{group.title}</p>
              {group.links.map((link) => (
                <Link key={link.href} href={link.href} className="min-h-[44px] flex items-center text-sm text-slate/70 hover:text-sapphire sm:min-h-0">
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-slate/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-4 text-sm" aria-label="Legal">
            <Link href="/privacy" className="min-h-[44px] flex items-center underline">
              Privacy
            </Link>
            <Link href="/terms" className="min-h-[44px] flex items-center underline">
              Terms
            </Link>
          </nav>
          <p className="text-xs text-slate/70">
            &copy; {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
