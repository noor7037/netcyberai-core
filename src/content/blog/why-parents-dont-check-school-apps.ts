import type { BlogPost } from '../contract';

export const whyParentsDontCheckSchoolApps: BlogPost = {
  slug: 'why-parents-dont-check-school-apps',
  title: 'Why Parents Don’t Check School Apps — and How Daily Learning Pulse Fixes It',
  description:
    'Most dedicated school apps go unopened after the first week. Here is why, and how sending updates through WhatsApp instead changes the outcome.',
  publishedOn: '2026-09-16',
  answerFirst:
    'Parents don’t check school apps mainly because installing and opening a separate app is friction most parents never repeat after the first week, especially on a shared phone. WhatsApp is already open every day, so the Daily Learning Pulse sends the update there instead of asking a parent to remember another app.',
  body: [
    {
      type: 'paragraph',
      text: 'Most schools that adopt a dedicated parent app go through the same cycle: an enthusiastic launch, a burst of installs during admission season, and then a steady drop-off in actual opens within a few weeks. This is not a failure of any particular app — it is what happens to almost any single-purpose app that is not the reason someone picks up their phone in the first place. A parent already checks WhatsApp multiple times a day for reasons that have nothing to do with school. A school app is checked for exactly one reason, which makes it easy to forget entirely.',
    },
    {
      type: 'heading',
      text: 'The friction is real, even when the app is good',
    },
    {
      type: 'paragraph',
      text: 'Installing an app requires storage space on a budget phone that may already be nearly full, a data connection to download it, and then remembering a login — usually a password shared across a family that did not choose it. Each of those steps loses some fraction of parents, and the ones most likely to be lost are exactly the ones a school most needs to reach: a parent working irregular hours, a parent who shares one phone with the rest of the household, or a parent less comfortable with English-language app interfaces.',
    },
    {
      type: 'heading',
      text: 'What changes when the channel is WhatsApp instead',
    },
    {
      type: 'paragraph',
      text: 'The [Daily Learning Pulse](/features/daily-learning-pulse-hinglish) sends a short update to a number the parent already has saved and already opens daily, in Hinglish rather than assuming comfortable English reading. There is no install step and no separate login to forget. That does not make every parent read every message — nothing does — but it removes the single biggest reason a channel goes unused: having to remember it exists.',
    },
    {
      type: 'heading',
      text: 'Honesty matters as much as the channel',
    },
    {
      type: 'paragraph',
      text: 'A daily update only stays useful if it is accurate. If a lesson was delayed, partial, or did not happen at all, the message says so — it never claims a topic was taught when it was not. A parent who catches even one message describing a lesson that did not happen stops trusting every message after it, which defeats the entire point of a daily update regardless of which app or channel delivers it.',
    },
    {
      type: 'heading',
      text: 'A weekly view, not just a daily one',
    },
    {
      type: 'paragraph',
      text: 'A single daily message is useful in the moment but easy to lose track of across a busy week. That is a separate problem from app fatigue, and it is why we also send a [Weekly Confidence Brief](/features/parent-weekly-confidence-brief) that rolls five days of updates into three simple questions a parent can ask over dinner — a different cadence solving a different problem, on the same channel.',
    },
    {
      type: 'heading',
      text: 'How to actually measure whether parents are engaging',
    },
    {
      type: 'paragraph',
      text: 'It is tempting to assume a WhatsApp message performs better than an app simply because WhatsApp has higher general usage — but a school should actually measure this for itself rather than accept a general claim, including ours. See [how to measure what parents actually open](/blog/how-to-measure-what-parents-actually-open) for what to track and how to avoid turning that measurement into a per-parent judgment, the same principle behind how we handle [recognition without ranking students against each other](/blog/personal-best-vs-top-3-recognition).',
    },
    {
      type: 'heading',
      text: 'What this does not solve',
    },
    {
      type: 'paragraph',
      text: 'Moving the channel to WhatsApp does not by itself make parents more engaged — it removes one specific barrier. A parent still has to find the message worth reading, which is why content honesty and a sensible cadence matter as much as the channel choice itself.',
    },
  ],
  faqs: [
    {
      question: 'Is this saying school apps are always a bad idea?',
      answer:
        'No — a portal has a place as a companion for anyone who wants to log in and look something up. The point is that it should not be the primary channel parents are expected to check daily.',
    },
    {
      question: 'What if a parent does not have WhatsApp?',
      answer:
        'WhatsApp is the primary channel because of how widely it is already used in this context, but it is not the only conceivable one — a school can still reach a parent through other means where WhatsApp genuinely is not an option.',
    },
    {
      question: 'Does sending more messages mean better engagement?',
      answer:
        'No. A flood of messages produces the same fatigue an unused app does, just on a different channel. A fixed, honest, low-frequency cadence — one Daily Pulse, one Weekly Brief — is the design goal, not maximum message volume.',
    },
    {
      question: 'Why does the message need to be in Hinglish specifically?',
      answer:
        'Hinglish — Hindi written in Roman script — reads naturally to many parents in semi-urban schools without requiring a Devanagari keyboard or font, and matches how they already read everyday WhatsApp messages.',
    },
  ],
  sources: [],
  caseStudy: null,
};
