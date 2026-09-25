import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { Button } from '@/components/ui/Button';
import { pricingTiers } from '@/lib/seo';

export function PricingPreview() {
  return (
    <section className="bg-off-white">
      <Container className="py-16">
        <Reveal>
          <h2 className="max-w-2xl text-2xl font-bold text-slate sm:text-3xl">Pricing, scoped to your school</h2>
          <p className="mt-3 max-w-2xl text-slate/70">
            No published flat rate — three tiers, each scoped to a school&apos;s actual size and needs.
          </p>
        </Reveal>
        <Reveal className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {pricingTiers.map((tier) => (
              <div key={tier.name} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate">{tier.name}</h3>
                <p className="flex-1 text-sm text-slate/70">{tier.description}</p>
                <p className="rounded bg-emerald/15 px-2 py-1 text-center text-sm font-semibold text-slate">
                  Contact for pricing
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Button href="/pricing" variant="outline">
              See full pricing details
            </Button>
            <Link href="/contact" className="ml-4 text-sm font-semibold text-sapphire underline">
              Contact sales →
            </Link>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
