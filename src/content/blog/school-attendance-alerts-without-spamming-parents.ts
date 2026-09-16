import type { BlogPost } from '../contract';

export const schoolAttendanceAlertsWithoutSpammingParents: BlogPost = {
  slug: 'school-attendance-alerts-without-spamming-parents',
  title: 'School Attendance Alerts Without Spamming Parents',
  description:
    'How to flag falling attendance to staff and parents without daily nag messages, comparisons to other students, or language that implies blame.',
  publishedOn: '2026-09-16',
  answerFirst:
    'An attendance alert system should tell a principal an aggregate number, tell a teacher a specific student and a suggested next step, and tell a parent something supportive about their own child only — never a daily message, never a comparison to another student or a class average, and never language that implies fault.',
  body: [
    {
      type: 'paragraph',
      text: 'Attendance is one of the easiest things for a school system to alert on, and one of the easiest to get wrong by over-alerting. A daily "your child was absent" message for every absence quickly becomes background noise a parent stops reading, and a message that compares one child’s attendance to a class average risks reading as an accusation rather than information. The right design is not "alert more" — it is alerting the right person, at the right level of detail, in the right tone.',
    },
    {
      type: 'heading',
      text: 'One fact, three different messages',
    },
    {
      type: 'paragraph',
      text: 'The same underlying signal — a student’s attendance has fallen below a threshold over a rolling window — should reach three different audiences in three different ways.',
    },
    {
      type: 'list',
      items: [
        'Principal: an aggregate view — "6 students across Class 8 crossed the attendance threshold this week" — to allocate attention, not 40 individual pings.',
        'Teacher: a specific student and one concrete suggested next step, readable on a phone in a few seconds.',
        'Parent: a supportive, specific message about their own child only — no class average, no rank, no comparison to any other student.',
      ],
    },
    {
      type: 'heading',
      text: 'Why the parent message is the one that needs the most care',
    },
    {
      type: 'paragraph',
      text: 'An attendance alert is, underneath the framing, a form of monitoring a child’s behaviour. Sent supportively — "we noticed a few missed days this month, is there anything the school can help with" — it opens a door. Sent in a risk-flavoured tone, it produces defensiveness, and in the worst case, a child being punished at home for what was meant to be a helpful notice. That outcome runs directly against the point of sending it at all.',
    },
    {
      type: 'heading',
      text: 'Why this should not go straight to parents by default',
    },
    {
      type: 'paragraph',
      text: 'Because attendance-based flagging is a form of behavioural monitoring of a child, and monitoring a child’s behaviour touches specific obligations around consent under India’s data protection law, the sensible sequencing is to let staff see and act on the signal first — where there is a clear educational purpose — and keep automatic parent-facing dispatch behind a setting that stays off until the consent basis for it is specifically confirmed. This mirrors the same sequencing used for [the Haryana Form 6 fee advisory](/features/haryana-form-6-fee-advisory): staff-facing insight can move faster than anything reaching a parent automatically.',
    },
    {
      type: 'heading',
      text: 'The threshold itself should be a setting, not a constant',
    },
    {
      type: 'paragraph',
      text: 'A single hardcoded attendance percentage baked into the code assumes every school’s context is identical, which it is not — a school in an area with frequent transport disruption may reasonably want a different threshold than one without that issue. Treating the trigger — the attendance percentage, the window it is measured over — as a per-school configurable value, with a sensible default, avoids forcing every school into the same assumption and avoids a future change requiring a code deployment rather than a settings change.',
    },
    {
      type: 'heading',
      text: 'Guarding against false positives',
    },
    {
      type: 'paragraph',
      text: 'A threshold applied blindly will catch students whose real story is not attendance at all — a student with very few graded assessments in a window, for instance, can produce a misleading signal. A sensible design excludes students with too little data to say anything meaningful, rather than flagging them anyway with false confidence.',
    },
    {
      type: 'heading',
      text: 'What this connects to',
    },
    {
      type: 'paragraph',
      text: 'The same non-comparative, supportive tone rule applies to how we handle [student recognition](/blog/personal-best-vs-top-3-recognition) — a parent-facing message about their own child, positive or concerning, should never lean on a comparison to someone else’s child to make its point. And the same "aggregate for principals, specific-but-careful for the person closest to it" pattern shows up again in [how we handle the Daily Learning Pulse](/features/daily-learning-pulse-hinglish), where honesty about what actually happened in class matters more than volume of messaging.',
    },
  ],
  faqs: [
    {
      question: 'Does a parent get an alert every time their child is absent?',
      answer:
        'No. The design is a threshold crossed over a rolling window, not a message for every single absence — a single missed day is normal and does not need a notice.',
    },
    {
      question: 'Can a parent-facing attendance alert mention other students or a class average?',
      answer:
        'No, as a hard rule. A parent message covers their own child only, with no ranking, no comparison, and no language implying fault or negligence.',
    },
    {
      question: 'Why would a school want this off for parents by default?',
      answer:
        'Because it is a form of monitoring a child’s behaviour, and the appropriate consent basis for that should be confirmed before it reaches parents automatically — staff, who have a direct educational role, can see and act on it in the meantime.',
    },
    {
      question: 'What happens with a student who has very low attendance but almost no test scores recorded?',
      answer:
        'That combination is treated as insufficient data to flag confidently, rather than being flagged anyway — a low-confidence signal presented as a firm alert is worse than no alert at all.',
    },
  ],
  sources: [],
  caseStudy: null,
};
