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

// What the Family app shows of it: the session's label and the groups, read as the guardian.
export type SchoolProgress = { session: string | null; groups: ProgressGroup[] };
