import { planHasFeature } from '@/lib/frameworks/plans';
import type { Sql } from '@/lib/jobs/types';
import type { Actor } from './exams';
import { publicationInForce } from './publish';

// Personal Best and Most Improved on the class result, for the teacher (W21-M4, docs/27 row 9c and section 5, C215):
// what the publication in force kept for each child, the same lines their report card prints. Each child is compared
// only with their own earlier published exams (own-progress.ts); nothing here sets one child against another. The
// children come in roll order, as the class result lists them, never sorted by any number, and a child with no line has
// none here. Only while the school's plan has the feature, and only once the class is published (null otherwise).

export type ClassRecognitionChild = {
  studentId: string;
  first: boolean; // their first published exam: nothing of their own to compare with yet
  personalBest: { subject: string; now: number; best: number }[];
  mostImproved: { subject: string; before: number; now: number } | null;
};
export type ClassRecognition = { children: ClassRecognitionChild[] };

export async function classRecognition(db: Sql, actor: Actor, examId: string, classId: string, rollOrder: readonly string[]): Promise<ClassRecognition | null> {
  const kept = await publicationInForce(db, actor.schoolId, examId, classId);
  if (!kept) return null;
  if (!(await planHasFeature(db, actor.schoolId, 'personal-best'))) return null;
  const names = new Map(
    (await db.query(`select p.subject_id, sb.name from exam_papers p join subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id where p.school_id = $1 and p.exam_id = $2 and p.class_id = $3`, [actor.schoolId, examId, classId])).rows.map((r) => [r.subject_id as string, r.name as string])
  );
  const children: ClassRecognitionChild[] = [];
  for (const studentId of rollOrder) {
    const r = kept.recognition[studentId];
    if (!r) continue;
    if (r.first) {
      children.push({ studentId, first: true, personalBest: [], mostImproved: null });
      continue;
    }
    const personalBest = r.personalBest.filter((b) => names.has(b.subjectId)).map((b) => ({ subject: names.get(b.subjectId) as string, now: b.now, best: b.best }));
    const mostImproved = r.mostImproved && names.has(r.mostImproved.subjectId) ? { subject: names.get(r.mostImproved.subjectId) as string, before: r.mostImproved.before, now: r.mostImproved.now } : null;
    if (personalBest.length || mostImproved) children.push({ studentId, first: false, personalBest, mostImproved });
  }
  return { children };
}
