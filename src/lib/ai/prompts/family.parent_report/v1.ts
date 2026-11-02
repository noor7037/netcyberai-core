// Prompt v1 of the family.parent_report profile (W16-B3, the proposal's M9). Once a week, a parent reads four plain
// sentences about one child's week with the tutor. The model is given counts, chapter names and quiz scores only: never
// the child's words, never a name. It may say only what the counts say; the job checks every number it writes against
// the counts and writes the rules-only report instead when one is not there (src/lib/family/parent-report.ts).

export const PARENT_REPORT_PROMPT_VERSION = 'v1';

export type ParentReportAsk = {
  lang: 'en' | 'hi';
  sessions: number;
  questions: number;
  chapters: string[];
  quizzes: { chapter: string; percent: number }[];
  weak: string[];
  voiceMinutes: number;
  school: { presentDays: number; markedDays: number; results: { exam: string; percent: number | null }[] } | null;
};

export function parentReportSystem(lang: 'en' | 'hi'): string {
  return [
    'You write a short weekly note for a parent in India about their child’s week with a study tutor.',
    `Write exactly four plain sentences in ${lang === 'hi' ? 'simple Hindi (Devanagari script)' : 'simple English'}, as one paragraph: no lists, no headings, no JSON.`,
    'Use only the facts given: the counts, the chapter names and the quiz scores. Never add a fact, a number, a reason or a feeling that is not given.',
    'Sentence one: how much the child studied. Sentence two: the chapters. Sentence three: the quizzes, or the school when given. Sentence four: one thing the parent can do at home, from the chapters marked weak, or encouragement when none are.',
    'Say "your child", never a name. No comparison with other children, no rank, no blame, no medical or emotional words.',
    'Write each number with digits, exactly as given.',
  ].join('\n');
}

export function parentReportUser(a: ParentReportAsk): string {
  const lines = [
    `Study sessions: ${a.sessions}`,
    `Questions asked: ${a.questions}`,
    `Minutes of speaking to the tutor: ${a.voiceMinutes}`,
    `Chapters: ${a.chapters.length ? a.chapters.join('; ') : '(none)'}`,
    `Quizzes: ${a.quizzes.length ? a.quizzes.map((q) => `${q.chapter} ${q.percent}%`).join('; ') : '(none)'}`,
    `Weak chapters (a quiz score below 60 out of 100, or asked about three times or more): ${a.weak.length ? a.weak.join('; ') : '(none)'}`,
  ];
  if (a.school) {
    lines.push(`School attendance this week: present ${a.school.presentDays} of ${a.school.markedDays} days`);
    if (a.school.results.length) lines.push(`School results published this week: ${a.school.results.map((r) => (r.percent === null ? r.exam : `${r.exam} ${r.percent}%`)).join('; ')}`);
  }
  return lines.join('\n');
}
