import type { RosterChild } from '@/lib/contracts/marking';
import { classLabel } from '@/lib/frameworks/class-label';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { classCandidates } from './candidates';
import type { Actor } from './context';

// One class's exam numbers, ready to print (C348): the exam, the class, and each child on the roll in roll order with
// their number (when the exam uses numbers) and whether the office withdrew them from this exam. The same people see
// it as read the exam; a teacher only their own classes (the database's rows, through classCandidates).

export type ClassNumbers = {
  examId: string;
  examName: string;
  term: string | null;
  numbering: 'roll' | 'seat';
  seatPrefix: string;
  classId: string;
  className: string;
  children: (RosterChild & { withdrawn: boolean })[];
};

export async function classNumbers(db: Sql, actor: Actor, examId: string, classId: string): Promise<ClassNumbers | null> {
  if (!isUuid(examId) || !isUuid(classId)) return null;
  const children = await classCandidates(db, actor, examId, classId);
  if (!children) return null;
  const exam = (await db.query(`select name, term, numbering, seat_prefix from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0];
  const klass = (await db.query(`select name, section from classes where school_id = $1 and class_id = $2`, [actor.schoolId, classId])).rows[0];
  if (!exam || !klass) return null;
  return {
    examId,
    examName: exam.name,
    term: exam.term ?? null,
    numbering: exam.numbering,
    seatPrefix: exam.seat_prefix,
    classId,
    className: classLabel(klass.name, klass.section) ?? '',
    children,
  };
}
