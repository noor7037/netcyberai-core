import { AI_MARKING_PAGES_LIMIT, type MarkingPaper, type RosterChild } from '@/lib/contracts/marking';
import type { SchoolRole } from '@/lib/contracts/modules';
import { EXAM_READERS } from '@/lib/exams/exams';
import { ON_ROLL, ROLL_ORDER, type PaperComponent } from '@/lib/exams/papers';
import { classLabel } from '@/lib/frameworks/class-label';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import type { Sql } from '@/lib/jobs/types';

// What every part of AI marking reads first (C347): the paper as the person may see it, its class's candidates, the
// school's own lines, and whether the school may use AI marking at all. Everything runs in the caller's own tenant
// transaction (a teacher's, the office's, or the school's marking job as its office), so row level security holds
// the same rules as here.

export type Actor = { schoolId: string; userId: string; role: SchoolRole };

export async function markingPaper(db: Sql, actor: Actor, paperId: string): Promise<MarkingPaper | null> {
  if (!EXAM_READERS.includes(actor.role) || !isUuid(paperId)) return null;
  const r = (
    await db.query(
      `select p.paper_id, p.exam_id, e.name as exam_name, p.class_id, c.name as class_name, c.section, p.subject_id, sb.name as subject_name,
              p.paper_date::text as paper_date, p.components, public.exam_class_published(p.exam_id, p.class_id) as published,
              public.may_mark_paper(p.paper_id) as may_mark
         from exam_papers p
         join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
         join classes c on c.school_id = p.school_id and c.class_id = p.class_id
         join subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id
        where p.school_id = $1 and p.paper_id = $2`,
      [actor.schoolId, paperId]
    )
  ).rows[0];
  if (!r) return null;
  const units = (
    await db.query(`select unit_id, chapter, topic from syllabus_units where school_id = $1 and class_id = $2 and subject_id = $3 order by position, unit_id`, [actor.schoolId, r.class_id, r.subject_id])
  ).rows.map((u) => ({ unitId: u.unit_id as string, chapter: u.chapter as string, topic: u.topic as string }));
  return {
    paperId: r.paper_id,
    examId: r.exam_id,
    examName: r.exam_name,
    classId: r.class_id,
    className: classLabel(r.class_name, r.section) ?? '',
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    date: r.paper_date ?? null,
    components: (r.components as PaperComponent[]).map((c) => ({ key: c.key, name: c.name, max: Number(c.max) })),
    units,
    published: r.published === true,
    mayMark: r.may_mark === true,
  };
}

// The paper's candidates (C348): its class's roll, less the children withdrawn from its exam, in roll order, with
// their exam numbers when the exam uses them.
export async function paperRoster(db: Sql, schoolId: string, paper: Pick<MarkingPaper, 'examId' | 'classId'>): Promise<RosterChild[]> {
  const { rows } = await db.query(
    `select s.student_id, s.name, s.roll_no, case when e.numbering = 'seat' then x.seat_no end as seat_no
       from students s
       join exams e on e.school_id = s.school_id and e.exam_id = $2
       left join exam_seat_numbers x on x.school_id = s.school_id and x.exam_id = e.exam_id and x.student_id = s.student_id
      where s.school_id = $1 and s.class_id = $3 and ${ON_ROLL}
        and not exists (select 1 from exam_withdrawals w where w.school_id = s.school_id and w.exam_id = e.exam_id and w.student_id = s.student_id)
      order by ${ROLL_ORDER}`,
    [schoolId, paper.examId, paper.classId]
  );
  return rows.map((r) => ({ studentId: r.student_id, name: r.name, rollNo: r.roll_no ?? null, seatNo: r.seat_no ?? null }));
}

// ---- the school's own lines (Exams settings) ------------------------------------------------------------------------

export type MarkingSettings = {
  on: boolean; // the school's own switch
  reviewBelow: number; // 0 to 1: a question the AI was less sure of than this flags its script
  familiesSeeScripts: boolean; // the checked pages and question marks reach linked families and the report link
  childrenSeeResults: boolean; // the child's own view shows their published results
  supportBelow: number; // percent: "may need support" below this on a paper
};
export const DEFAULT_MARKING_SETTINGS: MarkingSettings = { on: true, reviewBelow: 0.75, familiesSeeScripts: true, childrenSeeResults: true, supportBelow: 40 };

export async function markingSettings(db: Sql, schoolId: string): Promise<MarkingSettings> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'exams');
  if (!schema) return DEFAULT_MARKING_SETTINGS;
  const v = (await readSettings(db, schoolId, schema)).effective;
  const bool = (k: string, d: boolean) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : d);
  const num = (k: string, d: number) => (typeof v[k] === 'number' && Number.isFinite(v[k]) ? (v[k] as number) : d);
  return {
    on: bool('ai_marking_on', DEFAULT_MARKING_SETTINGS.on),
    reviewBelow: Math.min(0.95, Math.max(0.5, num('review_below', DEFAULT_MARKING_SETTINGS.reviewBelow * 100) / 100)),
    familiesSeeScripts: bool('families_see_scripts', DEFAULT_MARKING_SETTINGS.familiesSeeScripts),
    childrenSeeResults: bool('children_see_results', DEFAULT_MARKING_SETTINGS.childrenSeeResults),
    supportBelow: Math.min(100, Math.max(0, num('support_below', DEFAULT_MARKING_SETTINGS.supportBelow))),
  };
}

// ---- may the school use AI marking now ---------------------------------------------------------------------------

export type AiMarkingState = { on: boolean; why: 'no_limit' | 'switched_off' | 'no_provider' | null; pagesThisMonth: number; limit: number | null };

// Pages kept for marking since the first of this month in India (a duplicate is not counted: it is never read).
export async function pagesThisMonth(db: Sql, schoolId: string): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from marking_pages
      where school_id = $1 and state <> 'duplicate'
        and created_at >= (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')`,
    [schoolId]
  );
  return Number(rows[0]?.n ?? 0);
}

// On only when all four hold: the school's plan gives a monthly page limit (Control), the exams module is on and the
// school may write, the school has not switched AI marking off, and Control has a provider and model chosen for both
// marking tasks and switched them on. Says which is missing otherwise.
export async function aiMarkingState(db: Sql, schoolId: string): Promise<AiMarkingState> {
  const used = await pagesThisMonth(db, schoolId);
  const entitlements = await loadEntitlements(db, schoolId);
  const module = entitlements.modules['exams'];
  const limit = module?.limits?.[AI_MARKING_PAGES_LIMIT];
  const writable = entitlements.accessMode === 'full' || entitlements.accessMode === 'grace';
  if (!module?.enabled || !writable || typeof limit !== 'number' || !(limit > 0)) return { on: false, why: 'no_limit', pagesThisMonth: used, limit: typeof limit === 'number' && limit > 0 ? limit : null };
  if (!(await markingSettings(db, schoolId)).on) return { on: false, why: 'switched_off', pagesThisMonth: used, limit };
  const { rows } = await db.query(
    `select count(*)::int as n from control.ai_profiles where profile_id in ('exams.read_pages', 'exams.mark') and enabled and provider_id is not null and model is not null`
  );
  if (Number(rows[0]?.n ?? 0) < 2) return { on: false, why: 'no_provider', pagesThisMonth: used, limit };
  return { on: true, why: null, pagesThisMonth: used, limit };
}
