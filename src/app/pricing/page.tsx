import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FaqBlock } from '@/components/content/FaqBlock';
import { whatsappLink } from '@/lib/site-config';
import {
  breadcrumbListJsonLd,
  buildMetadata,
  pageMeta,
  pricingTiers,
  serializeJsonLd,
  softwareApplicationJsonLd,
} from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.pricing);

const faqs = [
  {
    question: 'How is NetCyberAI pricing structured?',
    answer:
      'NetCyberAI offers three tiers per school — Starter, Growth, and Campus — each adding more of the product on top of the last. There is no published flat rate; a rupee figure is confirmed directly with each school based on its size, since a single number would not fit every school.',
  },
  {
    question: 'What drives WhatsApp messaging cost?',
    answer:
      'WhatsApp Business messaging is billed by Meta per message sent, separately from NetCyberAI’s own pricing, and the rate depends on message category and changes on Meta’s own schedule — it was restructured in July 2025 and again with a new rate card effective July 2026. See Meta’s live WhatsApp Business Platform pricing page for the current rate card rather than relying on a fixed figure, which could already be out of date.',
  },
  {
    question: 'Is there a pilot for new schools?',
    answer:
      'Yes. Every new school starts in pilot mode with outbound WhatsApp messaging switched off by default, so nothing reaches a real parent until the school explicitly turns outbound messaging on.',
  },
  {
    question: 'What happens if a school exceeds its monthly messaging budget?',
    answer:
      'This is a Phase 1 design commitment, not a live feature today: a principal is meant to be alerted before a school’s monthly WhatsApp budget cap is reached, not after. Transactional messages such as receipts and certificate delivery are designed to keep sending even past the cap, while broadcast-style updates like the Daily Pulse are designed to degrade to portal-only until the next cycle.',
  },
  {
    question: 'Can a school change tiers later?',
    answer:
      'Yes — a school can move between Starter, Growth, and Campus as its needs change. Tier choice is not treated as a one-time lock-in decision, and the exact terms for moving between tiers are worked out directly with each school rather than through self-serve billing, which does not exist yet.',
  },
];

export default function PricingPage() {
  return (
    <Container className="flex flex-col gap-12 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">Pricing</h1>
        <p className="max-w-2xl text-lg text-slate">
          NetCyberAI&rsquo;s pricing is not a single published number — it is structured as
          three tiers, Starter, Growth, and Campus, each scoped to a school&rsquo;s actual size
          and needs, with the exact rupee figure confirmed directly during a WhatsApp
          conversation rather than published as one rate that would not fit every school.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {pricingTiers.map((tier) => (
          <Card key={tier.name} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-sapphire">{tier.name}</h2>
            <p className="text-sm text-slate">{tier.description}</p>
            <p className="self-start rounded bg-emerald/15 px-2 py-0.5 text-slate text-sm font-semibold">Contact for pricing</p>
            <Button
              href={whatsappLink(`Hi, I would like pricing for the ${tier.name} plan.`)}
              variant="outline"
            >
              Ask about {tier.name}
            </Button>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">Multi-campus groups</h2>
        <p className="text-sm text-slate">
          For a group running several schools or campuses on one account, we scope a custom plan
          rather than fit it into a single-school tier. Contact us to talk through your setup.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">How pilot mode works</h2>
        <p className="text-sm text-slate">
          Every new school starts in pilot mode with outbound WhatsApp messaging switched off by
          default. Nothing is sent to a real parent until the school explicitly turns outbound
          messaging on. This lets a school, its staff, and us confirm the data and the message
          content look right before a single real message goes out — and it means a pilot never
          accidentally messages a parent before anyone intended it to.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">Talk to us about your school</h2>
        <p className="mt-2 text-off-white/90">
          Message us on WhatsApp and we&rsquo;ll quote a plan based on your school&rsquo;s actual
          size and needs.
        </p>
        <div className="mt-4">
          <Button
            href={whatsappLink('Hi, I would like to know more about NetCyberAI pricing.')}
            variant="secondary"
          >
            Ask about pricing
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.pricing)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationJsonLd()) }}
      />
    </Container>
  );
}
