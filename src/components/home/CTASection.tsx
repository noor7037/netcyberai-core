import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Icon } from '@/components/visual/Icons';
import { companyName, whatsappLink } from '@/lib/site-config';

export function CTASection() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden bg-gradient-to-br from-sapphire via-violet to-grape text-white">
      <div aria-hidden="true" className="nca-mesh-warm absolute inset-0" />
      <Container wide className="relative grid grid-cols-1 items-center gap-10 py-14 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <h2 id="cta-title" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            See it running on your own school
          </h2>
          <p className="text-lg opacity-90">
            Book a walkthrough, start a pilot, or tell us about your school. A real person follows up, never an
            automated reply.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="/book-demo" variant="secondary">
              Book a demo
            </Button>
            <Button href="/start-pilot" variant="outlineLight">
              Start a pilot
            </Button>
            <Button href="/get-started" variant="outlineLight">
              Get started
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            <li>
              <Link href="/brochure" className="inline-flex min-h-[44px] items-center gap-1.5 underline-offset-4 hover:underline">
                <Icon name="download" className="h-4 w-4" /> Download brochure
              </Link>
            </li>
            <li>
              <Link href="/contact#callback" className="inline-flex min-h-[44px] items-center gap-1.5 underline-offset-4 hover:underline">
                <Icon name="phone" className="h-4 w-4" /> Request a callback
              </Link>
            </li>
            <li>
              <a
                href={whatsappLink(`Hi, I would like to know more about ${companyName}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <Icon name="chat" className="h-4 w-4" /> Message us on WhatsApp
              </a>
            </li>
          </ul>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-2xl">
          <Image
            src="/brand/ecosystem-art.webp"
            alt="NetCyberAI illustration: a student, a teacher, a family and a school connected by one colourful ribbon"
            width={880}
            height={716}
            sizes="(min-width: 1024px) 480px, 90vw"
            className="h-auto w-full"
          />
          <p className="mt-3 text-center text-lg font-bold text-slate">Smarter Schools. Brighter Futures.</p>
        </div>
      </Container>
    </section>
  );
}
