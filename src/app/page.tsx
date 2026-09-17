import { Hero } from '@/components/home/Hero';
import { TrustGaps } from '@/components/home/TrustGaps';
import { HowItWorks } from '@/components/home/HowItWorks';
import { CTASection } from '@/components/home/CTASection';
import { Container } from '@/components/ui/Container';
import { FaqBlock } from '@/components/content/FaqBlock';
import { buildMetadata, pageMeta, serializeJsonLd, softwareApplicationJsonLd } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.home);

const faqs = [
  {
    question: `What is ${companyName}?`,
    answer:
      `${companyName} is a WhatsApp-native Student Learning Monitoring & Parent Engagement platform for Indian schools. It sends parents an honest daily update about what their child learned, automates fee reminders with a UPI payment link, and gives a principal a private, non-public signal on teaching quality.`,
  },
  {
    question: `Is ${companyName} a school ERP?`,
    answer:
      `No. It is not a full administrative ERP — it is a focused parent-engagement and fee-communication layer that sits alongside a school’s existing systems rather than replacing its accounting or administrative records.`,
  },
  {
    question: `Which schools is ${companyName} for?`,
    answer:
      'It is built for Indian K-12 private schools generally, with particular attention to schools where staff and parents mostly use budget Android phones, WhatsApp is already the default communication channel, and English literacy among parents is uneven — realities that show up across urban, semi-urban, and rural India alike, not in any one region.',
  },
  {
    question: 'Do parents need to install an app?',
    answer:
      'No. Every parent-facing update — the Daily Learning Pulse, Weekly Confidence Brief, fee reminders, and recognition messages — arrives on WhatsApp, which most parents already open daily. A companion web portal exists for anyone who wants to log in and look something up, but it is never required.',
  },
  {
    question: `What does ${companyName} cost?`,
    answer:
      'Pricing is not fixed yet. There are three tiers — Starter, Growth, and Campus — scoped to a school’s actual size and needs rather than one published number; see the pricing page for how the tiers differ.',
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustGaps />
      <HowItWorks />

      <section className="bg-off-white">
        <Container className="py-16">
          <h2 className="text-2xl font-bold text-slate">Frequently asked questions</h2>
          <div className="mt-8">
            <FaqBlock items={faqs} />
          </div>
        </Container>
      </section>

      <CTASection />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationJsonLd()) }}
      />
    </>
  );
}
