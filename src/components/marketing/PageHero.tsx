import type { ReactNode } from 'react';
import { Container } from '@/components/ui/Container';
import { EyebrowOnDark } from '@/components/visual/Primitives';
import type { Tone } from '@/lib/semantic';

// Dark v4 hero shared by the website's flow pages (Contact, Start a
// Pilot, Support, Get Started, Book a Demo). The lead paragraph is the
// page's first <p>, which scripts/seo_audit.py requires to be 40-60
// words, so each page writes its own rather than a shared default.
export function PageHero({
  id,
  eyebrow,
  tone,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  tone: Tone;
  title: ReactNode;
  lead: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="relative overflow-hidden bg-midnight text-white print:hidden">
      <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
      <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
      <Container wide className="relative flex flex-col gap-5 py-16">
        <EyebrowOnDark tone={tone}>{eyebrow}</EyebrowOnDark>
        <h1 id={id} className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="max-w-3xl text-lg opacity-90">{lead}</p>
        {children}
      </Container>
    </section>
  );
}
