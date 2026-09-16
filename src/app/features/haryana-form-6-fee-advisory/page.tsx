import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnswerFirst } from '@/components/content/AnswerFirst';
import { FaqBlock } from '@/components/content/FaqBlock';
import { SourceLink } from '@/components/content/SourceLink';
import { whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.form6);

const faqs = [
  {
    question: 'Is this a legal compliance guarantee?',
    answer:
      'No. This is an advisory position computed against a published formula, never a legal determination. It never states that a fee structure is "legal" or "illegal" — confirm any real compliance question with your own legal counsel or the Director of Education.',
  },
  {
    question: 'Does the system ever block a school from raising fees?',
    answer:
      'No. NetCyberAI is not the regulator and has no standing to gate a school’s fee decision. The advisory can be muted by a principal, and doing so is itself recorded — quietly turning off a warning is not the same as it never having existed.',
  },
  {
    question: 'Why does the CPI field say "not configured" instead of a number?',
    answer:
      'The current-year CPI figure changes annually and by official notification. Rather than guess or hardcode a number that could be wrong or stale, the advisory shows "not configured" until a school admin enters the current figure with its official source — recorded, not assumed.',
  },
  {
    question: 'Is there only one formula for the fee cap?',
    answer:
      'Reporting on the rule describes a fee increase tied to the per-capita rise in teaching staff salary, subject to a ceiling of the latest Consumer Price Index increase plus five percent — not two fully independent formulas a school can freely pick between. Confirm the exact current wording against the Department’s own notification.',
  },
  {
    question: 'What happens if our school does not file Form 6 on time?',
    answer:
      'Reported coverage of the rule states that schools which have not submitted Form 6 are not permitted to raise fees for that academic session. The standard filing deadline is 1 February each year, though Haryana has granted extensions in past years — confirm the current year’s actual cutoff with the Department rather than assuming last year’s date still applies.',
  },
];

export default function HaryanaForm6AdvisoryPage() {
  return (
    <Container className="flex flex-col gap-12 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">
          Haryana Form 6 Fee Advisory: The CPI + 5% Cap, Explained
        </h1>
        <AnswerFirst>
          Haryana requires recognised private schools to file Form 6 annually and caps most fee
          increases at the latest Consumer Price Index rise plus five percent. Schools that miss
          the filing are barred from raising fees that session. This page explains the rule and
          shows an advisory-only check — never a legal opinion, never a block on your decision.
        </AnswerFirst>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">What the rule actually says</h2>
        <p className="mt-4 text-sm text-slate">
          Under the Haryana School Education Rules, a recognised private school may raise its fee
          in line with the per-capita rise in teaching staff salary from the previous year, but
          that increase may not exceed the latest available yearly Consumer Price Index rise plus
          five percent. In effect, CPI + 5% acts as the ceiling on the calculation, not a separate
          formula a school can choose instead of the salary-based one.
        </p>
        <p className="mt-3 text-xs text-slate/70">
          Source:{' '}
          <SourceLink href="https://exam.buddy4study.com/haryana-government-sets-mandatory-cap-on-school-fee-hike">
            Haryana Government Sets Mandatory Cap on School Fee Hike
          </SourceLink>
          , quoting the rule text directly. Verified 16 September 2026. We deliberately do not
          show a worked numeric example here — the current-year CPI figure is not yet published
          by an official source we can cite; see the advisory example below.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Form 6: what it requires</h2>
        <p className="mt-4 text-sm text-slate">
          Form 6 must be filed online to the Director of Education and covers student and staff
          strength, staff salary, the prior year&rsquo;s and current fee structure, the proposed
          hike, and the facilities provided. It must also be displayed publicly on the school&rsquo;s
          notice board and website. A school cannot charge any mandatory fee component beyond what
          it declared in its own filed Form 6, and a school that has not filed is not permitted to
          raise fees for that academic session.
        </p>
        <p className="mt-3 text-xs text-slate/70">
          Sources:{' '}
          <SourceLink href="https://www.tribuneindia.com/news/haryana/private-schools-violating-form-6-rules-allege-parents-612662">
            The Tribune — Form 6 public-display and fee-restriction rules
          </SourceLink>{' '}
          and{' '}
          <SourceLink href="https://www.tribuneindia.com/news/haryana/only-56-private-schools-in-haryana-apply-for-hiking-fee-383422">
            The Tribune — filing compliance rate
          </SourceLink>
          . Verified 16 September 2026. The standard filing deadline in rule is 1 February each
          year; Haryana has extended this deadline in practice in multiple past years, so confirm
          the current year&rsquo;s actual cutoff with the Department rather than assuming a fixed
          date.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Why compliance is genuinely hard right now</h2>
        <p className="mt-4 text-sm text-slate">
          Even after the Department extended one recent year&rsquo;s deadline multiple times, only
          around 56% of the more than 10,000 schools required to file had actually submitted Form
          6 — schools cited the form&rsquo;s complexity and the difficulty of comparing last
          year&rsquo;s and this year&rsquo;s staff salaries. That is the actual, verifiable gap this
          advisory exists to help close.
        </p>
        <p className="mt-3 text-xs text-slate/70">
          Source: see the filing compliance rate link above. Verified 16 September 2026.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">The advisory, as it appears to a principal</h2>
        <Card className="mt-4 border-amber/40 bg-amber/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            Advisory example — CPI not configured
          </p>
          <p className="mt-2 text-sm text-slate">
            &ldquo;This year&rsquo;s CPI figure has not been entered yet, so we cannot show a fee
            hike position. Enter the current CPI and its official source to see whether your
            proposed increase sits within the advisory range. This is an advisory only, not a
            legal determination, and never blocks you from proceeding.&rdquo;
          </p>
        </Card>
        <p className="mt-3 text-sm text-slate">
          This is the honest default state, not a placeholder we plan to quietly replace with an
          invented number. Once a school admin enters the year&rsquo;s CPI figure with its source,
          the same card shows whether the proposed increase is within or above the advisory range
          — and a principal can mute the advisory at any time, with that action itself recorded.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">What it does not do</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate">
          <li>It does not tell you a fee structure is legal or illegal — it shows a computed position against a published formula only.</li>
          <li>It does not block a fee decision. NetCyberAI is not the regulator and has no standing to gate it.</li>
          <li>It does not invent or hardcode a current-year CPI figure — the field stays empty, clearly marked, until an admin enters a sourced number.</li>
          <li>It does not silently disable itself — muting the advisory is a recorded, auditable action.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">Ask us about your school&rsquo;s Form 6 filing</h2>
        <p className="mt-2 text-off-white/90">
          Message us on WhatsApp — we are not a law firm, but we can walk through how the
          advisory works.
        </p>
        <div className="mt-4">
          <Button
            href={whatsappLink('Hi, I would like to know more about the Haryana Form 6 fee advisory.')}
            variant="secondary"
          >
            Book a demo
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.form6)) }}
      />
    </Container>
  );
}
