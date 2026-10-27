// A child's progress report (C230-AJ part 5): one child across a session's assessments, grouped by the school's exam
// types, from the marks of classes the school has PUBLISHED, each graded by the scheme kept with its publication. It
// compares the child with nobody: no rank, no position, no other child (C76). The staff screen, the printable report
// and the Family app all read these shapes.

export type ProgressSubject = { name: string; percent: number | null; grade: string | null };
export type ProgressExam = {
  examId: string;
  name: string;
  term: string | null;
  day: string | null; // when the exam was held (yyyy-mm-dd): its class's first paper, else the exam's day
  publishedOn: string; // yyyy-mm-dd, India
  subjects: ProgressSubject[];
  overall: { percent: number | null; grade: string | null };
};
// An exam type of the school (its key, English and Hindi names) with the child's exams of it, oldest first.
export type ProgressGroup = { type: string; name: { en: string; hi: string }; exams: ProgressExam[] };
export type ProgressSession = { sessionId: string | null; label: string | null };

// The result across the exam types the grading scheme counts (C230-AJ part 2 and 5): only when the scheme names the types
// that count and their weights. A counted type with nothing published yet leaves its percent null, and the counted
// result null ("not entered"), never a mean of some of the weights. Worked out by weightedChildResult (src/lib/exams/results.ts)
// from the child's published exams of the session.
export type ProgressWeighted = {
  weights: { type: string; name: { en: string; hi: string }; weight: number }[];
  // Each subject and the overall: the child's percent in each counted type (in the order of `weights`), and the counted result.
  subjects: { name: string; types: (number | null)[]; percent: number | null; grade: string | null }[];
  overall: { types: (number | null)[]; percent: number | null; grade: string | null };
};

// What the Family app shows of it: the session's label and the groups, read as the guardian.
export type SchoolProgress = { session: string | null; groups: ProgressGroup[]; weighted?: ProgressWeighted };
