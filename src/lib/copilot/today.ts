import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';

// The teacher's hour (W20-C, docs/42 H3). What the teacher taught today is
// where Copilot starts: one tap on a lesson picks the class, the subject and
// the topic. A teacher sees only the lessons of their own class and subject
// pairs (teacher_subjects); the office sees every lesson recorded today. RLS
// on syllabus_progress holds the same rule.

type Actor = { schoolId: string; userId: string; role: StaffRole };
export type TaughtLesson = { class_id: string; class_name: string; subject_id: string; subject_name: string; unit_id: string; chapter: string; topic: string };

// Only lessons recorded against a topic of the syllabus map can be drafted from: a typed topic is never sent.
export async function taughtToday(db: PoolClient, actor: Actor, date: string): Promise<TaughtLesson[]> {
  return (await db.query(
    `select p.class_id, c.name as class_name, p.subject_id, s.name as subject_name, u.unit_id, u.chapter, u.topic
       from syllabus_progress p
       join syllabus_units u on u.school_id = p.school_id and u.unit_id = p.unit_id and u.class_id = p.class_id and u.subject_id = p.subject_id
       join classes c on c.school_id = p.school_id and c.class_id = p.class_id
       join subjects s on s.school_id = p.school_id and s.subject_id = p.subject_id
      where p.school_id = $1 and p.date = $2::date and p.status in ('taught', 'partial')
        and ($3::text <> 'teacher' or exists (
          select 1 from teacher_subjects ts join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
           where ts.school_id = p.school_id and ts.class_id = p.class_id and ts.subject_id = p.subject_id and t.user_id = $4::uuid))
      order by c.name, s.name`,
    [actor.schoolId, date, actor.role, actor.userId]
  )).rows;
}
