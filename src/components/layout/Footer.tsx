'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Icon } from '@/components/visual/Icons';
import { products, solutions } from '@/content/catalog';
import { resourceSections } from '@/content/resources';
import { companyAddress, companyName, contactEmail, whatsappLink } from '@/lib/site-config';

const COMPANY = [
  { href: '/about', label: 'About' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact sales' },
  { href: '/contact#callback', label: 'Request a callback' },
  { href: '/start-pilot', label: 'Start a pilot' },
  { href: '/brochure', label: 'Download brochure' },
  { href: '/support', label: 'Support' },
  { href: '/security/data-ownership', label: 'Data ownership' },
  { href: '/demo', label: 'Concept demo' },
];

// Mirrors Header.tsx: the marketing chrome doesn't belong on the internal
// /control or /app shells.
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith('/control') || pathname.startsWith('/app')) {
    return null;
  }

  const groups = [
    { title: 'Products', links: products.map((p) => ({ href: `/products/${p.slug}`, label: p.name })) },
    { title: 'Solutions', links: solutions.map((s) => ({ href: `/solutions/${s.slug}`, label: s.name })) },
    { title: 'Resources', links: [{ href: '/blog', label: 'Blog' }, ...resourceSections.map((r) => ({ href: `/resources/${r.slug}`, label: r.name }))] },
    { title: 'Company', links: COMPANY },
  ];

  return (
    <footer className="relative bg-midnight text-white print:hidden">
      <div aria-hidden="true" className="nca-spectrum-bar h-1" />
      <Container wide className="flex flex-col gap-12 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[18rem_1fr]">
          <div className="flex flex-col gap-4">
            <span className="w-fit rounded-xl bg-white px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size raster wordmark */}
              <img src="/brand/wordmark.webp" srcSet="/brand/wordmark.webp 1x, /brand/wordmark@2x.webp 2x" alt={companyName} width={168} height={32} className="h-8 w-auto" />
            </span>
            <p className="text-sm opacity-80">Smarter Schools. Brighter Futures. The connected school platform for India.</p>
            <ul className="flex flex-col gap-1 text-sm">
              <li>
                <a href={`mailto:${contactEmail}`} className="inline-flex min-h-[40px] items-center gap-2 underline-offset-4 hover:underline">
                  <Icon name="mail" className="h-4 w-4" /> {contactEmail}
                </a>
              </li>
              <li>
                <a href={whatsappLink(`Hi, I would like to know more about ${companyName}.`)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-2 underline-offset-4 hover:underline">
                  <Icon name="chat" className="h-4 w-4" /> WhatsApp us
                </a>
              </li>
              <li className="flex items-start gap-2 opacity-80">
                <Icon name="school" className="mt-0.5 h-4 w-4 shrink-0" /> {companyAddress}
              </li>
            </ul>
            <div className="nca-glass rounded-xl p-3 text-sm">
              <p className="font-bold">Newsletter</p>
              <p className="mt-1 opacity-80">
                Email updates are not available yet. New guides are published on the{' '}
                <Link href="/blog" className="font-semibold underline">
                  blog
                </Link>
                .
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {groups.map((g) => (
              <div key={g.title}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider opacity-80">{g.title}</p>
                <ul className="flex flex-col">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="inline-flex min-h-[36px] items-center text-sm opacity-90 hover:underline hover:opacity-100">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="underline-offset-4 hover:underline">
              Terms
            </Link>
            <Link href="/login" className="underline-offset-4 hover:underline">
              Login
            </Link>
          </div>
          <p className="opacity-80">{`© ${new Date().getFullYear()} ${companyName}. All rights reserved.`}</p>
        </div>
      </Container>
    </footer>
  );
}
