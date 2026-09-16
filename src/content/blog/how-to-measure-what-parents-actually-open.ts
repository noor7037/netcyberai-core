import type { BlogPost } from '../contract';

export const howToMeasureWhatParentsActuallyOpen: BlogPost = {
  slug: 'how-to-measure-what-parents-actually-open',
  title: 'WhatsApp vs Mobile App: How to Measure What Parents Actually Open',
  description:
    'A school should measure its own parent engagement rather than assume WhatsApp beats an app. Here is what to actually track, and how to read it responsibly.',
  publishedOn: '2026-09-16',
  answerFirst:
    'Rather than assume a WhatsApp message performs better than a dedicated app because WhatsApp usage is generally higher, a school should track its own actual numbers: message read rates versus app open rates, over the same period, for the same audience. The right metric is an aggregate, school-level rate — never a per-parent score used to judge individual families.',
  body: [
    {
      type: 'paragraph',
      text: 'It is easy to assert that a WhatsApp message reaches more parents than a school app does, because WhatsApp usage in general is extremely high. It is a different thing to actually verify that claim for a specific school’s specific parent community, and a claim worth acting on should be measured, not assumed — including when the claim is one we make ourselves.',
    },
    {
      type: 'heading',
      text: 'What to actually measure',
    },
    {
      type: 'list',
      items: [
        'Message read rate: for a WhatsApp Business message, whether it was delivered and read, tracked at the school level.',
        'App session rate: for a dedicated app, how many parents actually opened it in a given week, not how many installed it once at admission.',
        'Trend over time, not a single snapshot: whether engagement holds steady, rises, or decays over several weeks after a channel launches.',
      ],
    },
    {
      type: 'heading',
      text: 'Why this has to be an aggregate number, not a per-parent one',
    },
    {
      type: 'paragraph',
      text: 'It is tempting, once individual read receipts exist, to build a per-parent engagement score — and this is exactly the wrong move. A visible low score identifies the families most likely to already be under-served: night-shift workers, single parents, households sharing one phone, parents less comfortable with a particular language or app interface. Turning a useful aggregate signal into an individual scorecard converts those families from under-served to judged, which actively works against the reason the measurement exists in the first place — the same reasoning behind why [we never publish a per-teacher leaderboard either](/blog/teacher-impact-card-measuring-teaching-without-leaderboards).',
    },
    {
      type: 'heading',
      text: 'The metric that should actually matter',
    },
    {
      type: 'paragraph',
      text: 'A school-level engagement rate — what percentage of parents opened this week’s update, in aggregate — is a legitimate, useful thing to track and even to treat as a north star metric for whether a communication channel is working. That is different in kind from asking "which specific parents opened it," which is the question that leads toward per-parent judgment rather than a genuine product signal.',
    },
    {
      type: 'heading',
      text: 'What good and bad trends actually look like',
    },
    {
      type: 'paragraph',
      text: 'A healthy pattern looks like an initial spike when a channel launches, a dip as novelty wears off, and then a stable plateau that holds over subsequent weeks — that plateau, not the opening spike, is the number worth paying attention to. A concerning pattern looks like a spike followed by a steady decline with no floor, which suggests the content or cadence itself needs to change, not just the channel it is delivered on. Confusing the two is a common mistake: judging a channel’s health from its first, most enthusiastic week produces an overly optimistic picture that a few months of real use will not sustain.',
    },
    {
      type: 'heading',
      text: 'Comparing channels fairly',
    },
    {
      type: 'paragraph',
      text: 'If a school is genuinely comparing WhatsApp against an existing app, the fair comparison is over the same weeks, the same parent population, and the same kind of content — not a WhatsApp pilot’s first exciting week against an app’s numbers from six months after launch enthusiasm faded. [Why parents stop checking school apps](/blog/why-parents-dont-check-school-apps) covers the friction side of this comparison in more depth; this post is about measuring the outcome responsibly rather than assuming it.',
    },
    {
      type: 'heading',
      text: 'What we do not publish',
    },
    {
      type: 'paragraph',
      text: 'We do not publish a specific open-rate percentage on this site as a general claim about all schools, because we have no real, consented pilot data yet to responsibly generalise from. Once we do, any figure we publish will be labelled with which school, over what period, and under what consent basis it was measured — not presented as a universal number. See [our data ownership page](/security/data-ownership) for how we treat consent for this kind of measurement more broadly.',
    },
  ],
  faqs: [
    {
      question: 'Is WhatsApp always going to beat an app for parent engagement?',
      answer:
        'Probably in most semi-urban Indian school contexts, based on general WhatsApp usage patterns, but "probably" is not the same as "measured for your school" — track your own numbers rather than assume.',
    },
    {
      question: 'Should a principal be able to see which specific parents are not opening messages?',
      answer:
        'We deliberately design against this — a per-parent engagement view risks becoming a judgment of specific families, exactly the outcome this measurement approach is meant to avoid.',
    },
    {
      question: 'How long should a school measure before drawing a conclusion?',
      answer:
        'Long enough to see past initial-launch enthusiasm on either side — several weeks at minimum, tracking a trend rather than reacting to a single week’s number.',
    },
    {
      question: 'Does a low aggregate engagement rate mean the content is bad?',
      answer:
        'Not necessarily — it could also reflect timing, message frequency, or a channel parents have not yet adopted. An aggregate trend is a starting point for investigation, not a verdict on its own.',
    },
  ],
  sources: [],
  caseStudy: null,
};
