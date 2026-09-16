import type { BlogPost } from '../contract';

export const personalBestVsTop3Recognition: BlogPost = {
  slug: 'personal-best-vs-top-3-recognition',
  title: 'Personal Best vs Top 3: A Recognition System That Doesn’t Demotivate Most Students',
  description:
    'Why ranking students top-3-per-class demotivates most of a class, and how a Personal Best plus banded Most Improved design gets most parents good news instead.',
  publishedOn: '2026-09-16',
  answerFirst:
    'A class ranking that recognises only the top 3 students tells everyone else they did not make the cut, fortnight after fortnight. A Personal Best system — recognising any student who beats their own prior result — can reach most of a class, because most students improve at something most fortnights, and improvement is not zero-sum the way ranking is.',
  body: [
    {
      type: 'paragraph',
      text: 'Recognition systems in schools tend to default to a ranking: top 3 in the class, a topper’s list, a leaderboard on the wall. Ranking is easy to compute and easy to explain, which is probably why it is the default. It is also, by construction, something that can only ever make a small number of students feel seen while telling everyone else they came up short — not because they did not improve, but because someone else improved more, or started from a stronger position.',
    },
    {
      type: 'heading',
      text: 'The problem with a single improvement formula',
    },
    {
      type: 'paragraph',
      text: 'A common approach to a fairer alternative is a formula that measures improvement relative to how much room a student had to improve — the idea being that a student near the top has less headroom, so a small gain should count for more. In practice this formula rewards the wrong direction: take a student moving from 85 to 90, and one moving from 40 to 55. Under a headroom-normalized formula, the first scores roughly 33 percent and the second roughly 25 percent — the smaller, easier gain outscores the much larger turnaround. As a baseline approaches 100, the formula gets more unstable, not more conservative, which is the opposite of what a recognition system for "most improved" should do.',
    },
    {
      type: 'heading',
      text: 'Two separate mechanisms instead of one formula',
    },
    {
      type: 'paragraph',
      text: 'The fix is not a better single formula — it is recognising that "did this student do well" and "who improved the most" are two different questions that need two different answers.',
    },
    {
      type: 'list',
      items: [
        'Personal Best — non-competitive. Any student who improves beyond a small noise floor on any tracked measure, against their own prior result, gets recognised. No ranking, no comparison to classmates.',
        'Most Improved — competitive and opt-in, using a symmetric measure (a logit-based delta) that does not favour either high or low starting points, and comparing students only against peers who started at a similar baseline.',
        'Class Shine — an opt-in, off-by-default top-3 acknowledgment for schools that still want one, framed as "students who shone this fortnight" rather than a numbered ranking.',
        'Consistency Badge — a quiet, portal-only acknowledgment with no WhatsApp broadcast, for steady performance rather than a sudden jump.',
      ],
    },
    {
      type: 'heading',
      text: 'Why banding by baseline actually matters',
    },
    {
      type: 'paragraph',
      text: 'Even the competitive Most Improved tier only compares a student against others who started in a similar range — a student who began around 40 percent is judged against peers who also began near 40 percent, not against the class topper. Without this, "most improved" quietly turns back into "who is closest to the top," which defeats the purpose of having a separate tier at all.',
    },
    {
      type: 'heading',
      text: 'Why this is not just a nicer way to talk about the same ranking',
    },
    {
      type: 'paragraph',
      text: 'Personal Best is designed to be the primary, most frequently triggered tier specifically because most students improve at something — marks in one subject, attendance, homework completion — in most fortnights. A ranking can never deliver that outcome for a majority of a class, because ranking is zero-sum by definition: someone’s rank going up requires someone else’s going down. This same anti-ranking principle is why we [never publish a public teacher leaderboard](/features/teacher-impact-card-principal-only) either — comparing people publicly produces defensiveness and gaming, not improvement, whether the people being compared are students or staff.',
    },
    {
      type: 'heading',
      text: 'What is deliberately excluded',
    },
    {
      type: 'paragraph',
      text: 'A student with too few graded assessments in a window, or attendance low enough that a "delta" is really just an absence artefact rather than a genuine change, is excluded from the competitive tiers rather than counted with an unreliable number. Recognition messages also never compare a student to a class average or another student by name — a home message says what a specific child achieved, not where they rank.',
    },
    {
      type: 'heading',
      text: 'How this connects to keeping parents engaged',
    },
    {
      type: 'paragraph',
      text: 'A recognition message that most parents can plausibly receive some fortnight is part of the same design goal as [the Daily Learning Pulse](/features/daily-learning-pulse-hinglish) and the Weekly Confidence Brief: give a parent a reason to actually open the message, rather than something that only ever has good news for the same handful of families every time. See our related guide on [why parents stop checking school apps](/blog/why-parents-dont-check-school-apps) for the channel side of the same problem.',
    },
  ],
  faqs: [
    {
      question: 'Does Personal Best mean every student gets a message every fortnight?',
      answer:
        'No — only students who actually clear the improvement threshold on some tracked measure get one. The point is that most students clear it on something most fortnights, not that everyone gets one regardless.',
    },
    {
      question: 'Can a school still see who the top performers are overall?',
      answer:
        'Yes, for internal school reporting — this is about what gets broadcast to students and parents as recognition, not about hiding academic data from the school itself.',
    },
    {
      question: 'Is Class Shine (the top-3 tier) on by default?',
      answer:
        'No. It is opt-in and off by default — a principal has to actively turn it on rather than discover later that it was running.',
    },
    {
      question: 'Why exclude students with low attendance from Most Improved?',
      answer:
        'Because a large score change for a student who was barely present is more likely to reflect a measurement artefact — too few data points — than a genuine academic turnaround, and recognising it as one would be misleading.',
    },
  ],
  sources: [],
  caseStudy: null,
};
