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

export function Header() {
  return (
    <header className="border-b border-slate/10 bg-off-white">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="min-h-[44px] items-center flex text-lg font-bold text-sapphire">
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
        <Button href={whatsappLink(`Hi, I would like to book a demo of ${companyName}.`)}>
          Book a demo
        </Button>
      </Container>
    </header>
  );
}
