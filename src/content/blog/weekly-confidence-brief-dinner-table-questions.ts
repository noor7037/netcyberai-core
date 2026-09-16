import type { BlogPost } from '../contract';

export const weeklyConfidenceBriefDinnerTableQuestions: BlogPost = {
  slug: 'weekly-confidence-brief-dinner-table-questions',
  title: 'Weekly Confidence Brief: 3 Dinner-Table Questions Based on Today’s Learning',
  description:
    'Why three simple weekly questions, sent on WhatsApp, do more for a parent-child conversation about school than a report card or a daily flood of updates.',
  publishedOn: '2026-09-16',
  answerFirst:
    'A parent who wants to ask their child about school often does not know what to ask beyond "how was school today" — a question almost any child answers with "fine." The Weekly Confidence Brief turns a week of lessons into three specific questions a parent can ask instead, based on what was genuinely covered that week.',
  body: [
    {
      type: 'paragraph',
      text: '"How was school today" is one of the most commonly asked, least useful questions in a parent-child relationship — not because parents do not care, but because the question gives a child nothing specific to respond to. A specific question about an actual lesson invites a real answer in a way a generic one cannot.',
    },
    {
      type: 'heading',
      text: 'Turning a week of lessons into three questions',
    },
    {
      type: 'paragraph',
      text: 'Every subject’s syllabus progress for the week already exists as data, from daily teacher entries. The [Weekly Confidence Brief](/features/parent-weekly-confidence-brief) rolls that up into three questions — typically one per major subject area — phrased the way an actual parent would ask them at dinner, not the way a syllabus document would phrase them.',
    },
    {
      type: 'heading',
      text: 'What this looks like in practice',
    },
    {
      type: 'paragraph',
      text: 'Instead of a syllabus line reading "Chapter 4: Photosynthesis, Chapter 7: Fractions, Unit 3: Narrative Composition," a parent receives something closer to three plain questions: what did you learn about how plants make their own food this week, can you show me how to split something into quarters, and what was your favourite part of the story you read in Hindi class. The underlying facts are identical to what a teacher logged; only the phrasing changes, from a curriculum document’s language to a parent’s.',
    },
    {
      type: 'heading',
      text: 'Why weekly, not daily',
    },
    {
      type: 'paragraph',
      text: 'A daily update, like [the Daily Learning Pulse](/features/daily-learning-pulse-hinglish), is useful in the moment but easy to lose track of across a busy week — five separate messages do not naturally add up to a coherent picture in a parent’s head. A weekly brief solves a different problem: it steps back and gives a parent one message that represents the whole week, at a cadence that does not compete with daily life for attention.',
    },
    {
      type: 'heading',
      text: 'Why the questions have to be genuinely answerable',
    },
    {
      type: 'paragraph',
      text: 'A question a child cannot actually answer from what was taught defeats the purpose and can even feel like a trap. This is why the questions are generated from what a teacher actually recorded as covered that week — not a generic template disconnected from the real classroom, and never a question about a topic that was delayed or not taught, which would set a child up to fail at answering something they were never taught in the first place.',
    },
    {
      type: 'heading',
      text: 'Delivered in the language a parent actually reads',
    },
    {
      type: 'paragraph',
      text: 'Like the Daily Learning Pulse, the brief defaults to Hinglish — Hindi written in Roman script — rather than assuming a parent is comfortable reading English or has a Devanagari keyboard installed. This is not a translation layer bolted onto an English-first product; it is the default output, because it is how the intended audience already reads everyday WhatsApp messages from friends and family.',
    },
    {
      type: 'heading',
      text: 'What this is not',
    },
    {
      type: 'paragraph',
      text: 'The brief is not a substitute for a report card or a parent-teacher meeting, and it does not score or grade anything. It also is not a tool for catching a child out — there is no consequence tied to whether a child can answer the question well, and a parent’s engagement with the brief has no bearing on anything the child receives. This mirrors the same principle in [how we handle recognition without ranking students](/blog/personal-best-vs-top-3-recognition): a useful signal should never quietly turn into a judgment of the person it is meant to help.',
    },
    {
      type: 'heading',
      text: 'Delivered where a parent already is',
    },
    {
      type: 'paragraph',
      text: 'Like every other parent-facing message in the product, the brief arrives on WhatsApp rather than requiring a separate app login — a busy parent is far more likely to actually read a message that arrives where they already are, at a time they are already checking their phone, than one waiting in an app they have to remember to open.',
    },
  ],
  faqs: [
    {
      question: 'Is the brief sent to every parent automatically?',
      answer:
        'It is one of several separately consentable communication types, defaulting to off until a parent has specifically agreed to it — like every other message category in the product.',
    },
    {
      question: 'What happens if a subject had no lessons recorded that week?',
      answer:
        'A question is only generated from a subject that actually had recorded progress that week — the brief does not invent a question about a subject with nothing to report.',
    },
    {
      question: 'Can a parent reply to the brief?',
      answer:
        'The brief itself is informational and does not require a reply to be useful. A separate, optional comprehension-check mechanism exists elsewhere in the product design, kept distinct from this weekly summary.',
    },
    {
      question: 'Why three questions specifically, not one or five?',
      answer:
        'Three is enough to cover the major subject areas without becoming a checklist a parent skims past — the goal is a real conversation starter, not a comprehensive weekly report.',
    },
  ],
  sources: [],
  caseStudy: null,
};
