import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { companyAddress, companyName, contactEmail } from '@/lib/site-config';

export function Footer() {
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
