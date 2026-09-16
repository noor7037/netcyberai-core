import type { BlogPost } from '../contract';

export const teacherImpactCardMeasuringTeachingWithoutLeaderboards: BlogPost = {
  slug: 'teacher-impact-card-measuring-teaching-without-leaderboards',
  title: 'Teacher Impact Card: Measuring Teaching Without Toxic Leaderboards',
  description:
    'A public teacher ranking rewards easy classes and punishes hard ones. Here is why a private, principal-and-self-only view measures teaching quality better.',
  publishedOn: '2026-09-16',
  answerFirst:
    'A public teacher leaderboard rewards whoever has the easiest class, not whoever is doing the hardest teaching well, and it invites gaming rather than genuine improvement. A private Teacher Impact Card, visible only to a teacher and their principal, can show the same underlying signals without turning colleagues into competitors or punishing anyone for taking on a difficult class.',
  body: [
    {
      type: 'paragraph',
      text: 'Ranking teachers publicly is an easy thing to build and a satisfying thing to look at as an administrator — a sorted list feels like accountability. It is also, on reflection, measuring the wrong thing. A teacher with a strong, motivated class will tend to show strong numbers regardless of how they teach; a teacher who took on a struggling or difficult class, and is doing real work moving it forward, will often show worse numbers than a teacher doing far less. A leaderboard cannot tell these two situations apart, and treating them the same is not a minor flaw — it is the whole design being wrong.',
    },
    {
      type: 'heading',
      text: 'What a leaderboard actually incentivizes',
    },
    {
      type: 'paragraph',
      text: 'Once teaching quality is reduced to a public number, the incentive shifts from teaching well to making the number look good — which are not always the same action. That can mean avoiding a difficult student rather than working with them, inflating attendance records, or simply teaching to whatever the measured proxy happens to be rather than to the actual class. None of this requires bad intent from any individual teacher; it is what any measured, ranked, visible system does to the people inside it over time.',
    },
    {
      type: 'heading',
      text: 'The alternative: private, not absent',
    },
    {
      type: 'paragraph',
      text: 'The answer is not to stop measuring anything — a principal genuinely benefits from a real signal on teaching quality, beyond exam results and hallway impression. The [Teacher Impact Card](/features/teacher-impact-card-principal-only) rolls up class attendance trend, syllabus completion, and parent feedback into one view per teacher, per month. What changes is who can see it: the teacher themselves, and their principal. No other teacher, ever — enforced by the database’s own access rules, not only hidden in the app’s screens, which could be bypassed by a bug elsewhere.',
    },
    {
      type: 'heading',
      text: 'A conversation starter, not a verdict',
    },
    {
      type: 'paragraph',
      text: 'The intended use of the card is to open an honest one-to-one conversation between a principal and a teacher — "your syllabus completion has slipped this month, what’s going on" is a very different, more useful exchange than a number on a wall. A private card supports that conversation; a public ranking replaces it with a number nobody discusses out loud. The same non-comparative instinct shapes [how we handle student recognition](/blog/personal-best-vs-top-3-recognition) too — a private signal that starts a conversation, not a public number that ends one.',
    },
    {
      type: 'list',
      items: [
        'Visible only to the teacher and their principal — never another teacher, under any role.',
        'No salary or payroll data anywhere near it — the schema has no salary column at all.',
        'No percentile, no rank, no schoolwide leaderboard derived from it.',
        'Meant to prompt a private conversation, not to stand alone as a judgment.',
      ],
    },
    {
      type: 'heading',
      text: 'Why "principal and self only" has to be enforced, not just designed',
    },
    {
      type: 'paragraph',
      text: 'A design intention is not the same as a guarantee. Restricting access "in the interface" — simply not showing a button to other teachers — is not the same as restricting it at the database layer, where a query for another teacher’s card simply returns nothing regardless of how it was made. The difference matters because an interface restriction can be bypassed by a bug somewhere else in the application; a database-level restriction holds even then. This is the same principle behind [keeping every school’s data isolated from every other school’s](/security/data-ownership) — the enforcement has to live where a mistake elsewhere cannot undo it.',
    },
    {
      type: 'heading',
      text: 'What this does not solve',
    },
    {
      type: 'paragraph',
      text: 'A private Impact Card does not remove the judgment involved in evaluating a teacher — it gives a principal a better starting signal for a conversation they still have to have well. It also does not replace classroom observation; a rolled-up number is a prompt to look closer, not a substitute for actually looking.',
    },
  ],
  faqs: [
    {
      question: 'Can a teacher see their own Impact Card?',
      answer:
        'Yes — the card is visible to the teacher themselves and to their principal or school admin. It is private from other teachers, not from the teacher it is about.',
    },
    {
      question: 'Does this ever get used to justify firing or disciplining a teacher?',
      answer:
        'The card is designed as a conversation tool, not an automated disciplinary trigger. Any consequence beyond a conversation is a school’s own human decision, not something the card itself determines.',
    },
    {
      question: 'What if a school genuinely wants a public leaderboard?',
      answer:
        'This is one of the things we refuse to build regardless of a school’s request, for the reasons in this post — it is a standing design principle, not a feature waiting to be toggled on.',
    },
    {
      question: 'Is class size or subject difficulty accounted for?',
      answer:
        'The card surfaces real signals — attendance trend, syllabus completion, parent feedback — rather than a single ranked score, which leaves room for a principal to weigh context a raw number would flatten away.',
    },
  ],
  sources: [],
  caseStudy: null,
};
