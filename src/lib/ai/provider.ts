// AIProvider (docs/20 5h, C154): the one door to a language model. Business
// code depends on this interface only, as it does on FileStorage; which
// model answers is a deployment matter.
//
// What goes through the door is a DraftRequest and nothing else. It has no
// field that could hold a student, a guardian or a phone number: it carries
// the kind of draft, the class level, the subject and the syllabus topic.
// AI-drafted remarks about a student are not built (they wait for the
// consent-purpose decision, brief O6).

export const DRAFT_KINDS = ['lesson_plan', 'worksheet', 'pulse_message'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export type DraftRequest = {
  kind: DraftKind;
  classLevel: string; // the grade, e.g. "5": never the section's roll or any person
  subject: string;
  chapter: string;
  topic: string;
  minutes?: number; // lesson plan: how long the period is
  questions?: number; // worksheet: how many questions
};
export type DraftAnswer = { text: string; tokensIn: number; tokensOut: number };

export interface AIProvider {
  readonly name: string;
  draft(request: DraftRequest): Promise<DraftAnswer>;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// The stand-in: writes a plain, fixed-shape draft from the request alone.
// It lets the whole flow (draft, edit, approve, meter, limit) be built and
// tested before any key exists. It is never used in a production build.
export const standInProvider: AIProvider = {
  name: 'stand-in',
  async draft(r) {
    const head = `${r.subject}, class ${r.classLevel}: ${r.chapter === r.topic ? r.topic : `${r.chapter}: ${r.topic}`}`;
    const text =
      r.kind === 'lesson_plan'
        ? [`Lesson plan (${r.minutes ?? 40} minutes)`, head, '', `1. Recall (5 minutes): ask what the class remembers that leads to “${r.topic}”.`, `2. Teach: explain “${r.topic}” with one worked example on the board.`, '3. Practise: two questions in pairs; walk round and listen.', '4. Check: one question each on a slip of paper.', '5. Homework: one question that uses today’s idea.'].join('\n')
        : r.kind === 'worksheet'
          ? [`Worksheet: ${head}`, '', ...Array.from({ length: r.questions ?? 5 }, (_, i) => `${i + 1}. A question on “${r.topic}” (write the question here).`)].join('\n')
          : `Class ${r.classLevel}, ${r.subject}: today the class learned “${r.topic}”. Ask your child to tell you one thing about it.`;
    return { text, tokensIn: words(JSON.stringify(r)), tokensOut: words(text) };
  },
};

// Which provider answers. None is configured for production yet: the real
// one is added, behind this same interface, when the founder supplies a key.
// The stand-in answers only outside production builds, and only when asked for.
export function configuredProvider(env: Record<string, string | undefined> = process.env): AIProvider | null {
  if (env.NODE_ENV !== 'production' && env.AI_PROVIDER === 'stand-in') return standInProvider;
  return null;
}
