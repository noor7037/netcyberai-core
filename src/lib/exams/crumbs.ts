import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { classLabel } from '@/lib/frameworks/class-label';
import type { Crumb } from '@/lib/nav/breadcrumbs';

// The names an exam page shows in its trail (W14-E): the exam, the class, the paper's subject. One read, under the
// person's own school and role (the same row level security as every other read), and no more than names. A page whose
// names cannot be read shows its trail without them: the module, then the page.
export type PaperNames = { examName: string; classId: string; classLabel: string; subjectName: string };
export type ClassNames = { examName: string; classLabel: string };

export async function paperNames(session: SessionClaims, paperId: string): Promise<PaperNames | null> {
  try {
    return await withTenantContext(session, async (db) => {
      const { rows } = await db.query(
        `select e.name as exam_name, p.class_id, c.name as class_name, c.section, sb.name as subject_name
           from exam_papers p
           join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
           join classes c on c.school_id = p.school_id and c.class_id = p.class_id
           join subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id
          where p.school_id = $1 and p.paper_id = $2`,
        [session.schoolId, paperId]
      );
      const r = rows[0];
      return r ? { examName: r.exam_name as string, classId: r.class_id as string, classLabel: classLabel(r.class_name, r.section) ?? '', subjectName: r.subject_name as string } : null;
    });
  } catch {
    return null;
  }
}

export async function classNames(session: SessionClaims, examId: string, classId: string): Promise<ClassNames | null> {
  try {
    return await withTenantContext(session, async (db) => {
      const { rows } = await db.query(
        `select e.name as exam_name, c.name as class_name, c.section
           from exams e join classes c on c.school_id = e.school_id
          where e.school_id = $1 and e.exam_id = $2 and c.class_id = $3`,
        [session.schoolId, examId, classId]
      );
      const r = rows[0];
      return r ? { examName: r.exam_name as string, classLabel: classLabel(r.class_name, r.section) ?? '' } : null;
    });
  } catch {
    return null;
  }
}

const EXAMS = '/app/exams';

// "Exams › AI Marking Retest › 6-A English": the exam (its papers are listed on the Exams page) and the paper, which
// is a link when `link` is set (a page below it) and the page itself when not. `tail`: levels below the paper.
export function paperCrumbs(n: PaperNames | null, paperId: string, link: boolean, tail: Crumb[] = []): Crumb[] | undefined {
  if (!n) return undefined;
  const paper = [n.classLabel, n.subjectName].filter(Boolean).join(' ');
  return [{ label: n.examName, href: EXAMS }, link ? { label: paper, href: `${EXAMS}/papers/${paperId}` } : { label: paper }, ...tail];
}

// A class's pages: the exam, then the class, which is a link when a page below it shows (numbers, report cards).
export function classCrumbs(n: ClassNames | null, examId: string, classId: string, link: boolean): Crumb[] | undefined {
  if (!n) return undefined;
  return [{ label: n.examName, href: EXAMS }, link ? { label: n.classLabel, href: `${EXAMS}/${examId}/classes/${classId}` } : { label: n.classLabel }];
}
