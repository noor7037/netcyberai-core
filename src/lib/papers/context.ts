import type { MarkingPaper } from '@/lib/contracts/marking';
import { examTypeLabel, examTypesOf } from '@/lib/exams/exam-types';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import type { Sql } from '@/lib/jobs/types';
import { markingPaper, type Actor } from '@/lib/marking/context';
import { indiaDate } from '@/lib/time/india';
import { blueprintCheck, blueprintOf, blueprintsFrom, withSections, type Blueprint, type BlueprintIssue } from './blueprint';
import { chooseScope, makePlan, type PaperPlan, type TaughtRow } from './scope';
import type { GenerationFailure, GenerationKind, GenerationState, GenerationView, MakeRefusal, PrintRefusal } from './types';

// What the paper maker reads first (C362), in the caller's own tenant transaction (a teacher's, the office's, or the
// school's papers.make job as its office), so row level security holds the same rules as for marking: the paper as
// the person may see it, its exam's type and blueprint, its class's taught log for the subject, the session's first
// day and the class's last paper of the same type. Then the plan, by rules only (./scope.ts).

export type PaperContext = {
  paper: MarkingPaper;
  examType: string;
  paperDate: string | null;
  sessionStart: string;
  unitIds: string[];
  grade: string;
  language: 'en' | 'hi';
  createdAt: string;
};

export async function paperContext(db: Sql, actor: Actor, paperId: string): Promise<PaperContext | null> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return null;
  const r = (
    await db.query(
      `select e.exam_type, p.paper_date::text as paper_date, p.unit_ids, p.created_at::text as created_at,
              coalesce(nullif(btrim(c.grade), ''), btrim(c.name)) as grade,
              coalesce((select s.start_date::text from academic_sessions s where s.school_id = e.school_id and s.session_id = e.session_id),
                       (select s.start_date::text from academic_sessions s where s.school_id = e.school_id and s.is_current order by s.start_date desc limit 1)) as session_start,
              (select m.language from marking_setups m where m.school_id = p.school_id and m.paper_id = p.paper_id) as language
         from exam_papers p
         join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
         join classes c on c.school_id = p.school_id and c.class_id = p.class_id
        where p.school_id = $1 and p.paper_id = $2`,
      [actor.schoolId, paperId]
    )
  ).rows[0];
  if (!r) return null;
  const to = (r.paper_date as string | null) ?? indiaDate();
  // No session on record: the year before the paper.
  const start = (r.session_start as string | null) ?? `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`;
  return {
    paper,
    examType: r.exam_type as string,
    paperDate: (r.paper_date as string | null) ?? null,
    sessionStart: start,
    unitIds: ((r.unit_ids ?? []) as string[]).map(String),
    grade: String(r.grade ?? '').slice(0, 40) || '-',
    language: r.language === 'hi' ? 'hi' : 'en',
    createdAt: r.created_at as string,
  };
}

export async function schoolBlueprints(db: Sql, schoolId: string): Promise<Blueprint[]> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'exams');
  if (!schema) return [];
  const v = (await readSettings(db, schoolId, schema)).effective;
  return blueprintsFrom(v.paper_blueprints, v.paper_sections);
}

// The scope's window: after the class's last paper of the same type in the subject (dated before this one), else from
// the session's first day; up to the paper's day, or today when it has none.
async function previousOfType(db: Sql, schoolId: string, ctx: PaperContext): Promise<string | null> {
  const to = ctx.paperDate ?? indiaDate();
  const r = (
    await db.query(
      `select max(p.paper_date)::text as d
         from exam_papers p join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
        where p.school_id = $1 and p.class_id = $2 and p.subject_id = $3 and p.paper_id <> $4 and e.exam_type = $5
          and p.paper_date is not null and p.paper_date < $6::date and p.paper_date >= $7::date`,
      [schoolId, ctx.paper.classId, ctx.paper.subjectId, ctx.paper.paperId, ctx.examType, to, ctx.sessionStart]
    )
  ).rows[0];
  return (r?.d as string | null) ?? null;
}

async function taughtLog(db: Sql, schoolId: string, ctx: PaperContext): Promise<TaughtRow[]> {
  const { rows } = await db.query(
    `select unit_id, date::text as date from syllabus_progress
      where school_id = $1 and class_id = $2 and subject_id = $3 and date >= $4::date and date <= $5::date
      order by date, created_at`,
    [schoolId, ctx.paper.classId, ctx.paper.subjectId, ctx.sessionStart, ctx.paperDate ?? indiaDate()]
  );
  return rows.map((r) => ({ unitId: (r.unit_id as string | null) ?? null, date: r.date as string }));
}

// The plan for a paper: its type's blueprint (or the teacher's sections for this paper), the scope by the type's rule,
// the chapters' marks (or the teacher's own), and the slots.
export async function planFor(
  db: Sql,
  schoolId: string,
  ctx: PaperContext,
  opts: { sections?: unknown; chapterMarks?: unknown } = {}
): Promise<{ blueprint: Blueprint | null; issues: BlueprintIssue[]; plan: PaperPlan | null }> {
  const base = blueprintOf(await schoolBlueprints(db, schoolId), ctx.examType);
  if (!base) return { blueprint: null, issues: [], plan: null };
  let blueprint = base;
  let issues: BlueprintIssue[] = [];
  if (opts.sections !== undefined && opts.sections !== null) {
    const mine = withSections(base, opts.sections);
    issues = mine ? blueprintCheck(mine) : ['sections'];
    if (mine) blueprint = mine;
  }
  const after = blueprint.scope === 'since_last_of_type' ? await previousOfType(db, schoolId, ctx) : null;
  const window = { after, from: ctx.sessionStart, to: ctx.paperDate ?? indiaDate() };
  const units = ctx.paper.units.map((u, i) => ({ ...u, position: i + 1 }));
  const scope = chooseScope(blueprint.scope, units, await taughtLog(db, schoolId, ctx), window, ctx.unitIds);
  const plan = makePlan({ blueprint, parts: ctx.paper.components, scope, typed: opts.chapterMarks, blueprintOk: issues.length === 0 });
  return { blueprint: base, issues, plan };
}

// ---- the paper's state ---------------------------------------------------------------------------------------------------

// A making stopped when its job ended without finishing it: working for longer than WORKING_MINUTES (a job's tries end
// well within it: three tries of at most four minutes and their waits), or waiting in the queue longer than
// WAITING_HOURS (the queue starts one long job a school a minute, so a whole exam's papers start within the hour). It
// is then closed as failed, so the paper can be made again.
export const WORKING_MINUTES = 30;
export const WAITING_HOURS = 12;
const STALE_SQL = `((state = 'working' and coalesce(started_at, created_at) < now() - make_interval(mins => ${WORKING_MINUTES}))
                   or (state = 'waiting' and created_at < now() - make_interval(hours => ${WAITING_HOURS})))`;

export async function closeStale(db: Sql, schoolId: string, paperId: string): Promise<void> {
  await db.query(`update paper_generations set state = 'failed', failure = 'stopped', finished_at = now() where school_id = $1 and paper_id = $2 and ${STALE_SQL}`, [schoolId, paperId]);
}

export async function latestGeneration(db: Sql, schoolId: string, paperId: string): Promise<GenerationView | null> {
  const r = (
    await db.query(
      `select generation_id, kind, state, failure, question_id, result, created_at, finished_at, ${STALE_SQL} as stale
         from paper_generations where school_id = $1 and paper_id = $2 order by created_at desc, generation_id limit 1`,
      [schoolId, paperId]
    )
  ).rows[0];
  if (!r) return null;
  const res = r.result as { bank?: number; ai?: number; empty?: number; aiOff?: boolean } | null;
  // A making that stopped reads as failed (the next "Make" closes it for good).
  const stale = r.stale === true;
  return {
    generationId: r.generation_id,
    kind: r.kind as GenerationKind,
    state: stale ? 'failed' : (r.state as GenerationState),
    failure: stale ? 'stopped' : ((r.failure as GenerationFailure | null) ?? null),
    questionId: r.question_id ?? null,
    result: res ? { bank: Number(res.bank ?? 0), ai: Number(res.ai ?? 0), empty: Number(res.empty ?? 0), aiOff: res.aiOff === true } : null,
    createdAt: new Date(r.created_at).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  };
}

export const running = (g: GenerationView | null) => !!g && (g.state === 'waiting' || g.state === 'working');

// Whether the AI may write questions now: the task switched on in Control, with a provider and a model. (The platform
// checks again, with the key, when it is asked.)
export async function aiWritingOn(db: Sql): Promise<boolean> {
  const r = (await db.query(`select enabled and provider_id is not null and model is not null as on from control.ai_profiles where profile_id = 'exams.write_questions'`)).rows[0];
  return r?.on === true;
}

// Why the paper cannot be made (or made again) now; null when it can.
export async function makeRefusal(db: Sql, schoolId: string, paper: MarkingPaper, opts: { again: boolean; generation: GenerationView | null; questions: number }): Promise<MakeRefusal | null> {
  if (paper.published) return 'closed';
  if (!paper.mayMark) return 'not_allowed';
  if ((await db.query(`select 1 from marking_sheets where school_id = $1 and paper_id = $2 and state = 'approved' limit 1`, [schoolId, paper.paperId])).rows.length) return 'locked';
  if (running(opts.generation)) return 'busy';
  if (opts.questions > 0 && !opts.again) return 'has_questions';
  return null;
}

// Whether the paper prints: kept, and nothing changed since (a question written, replaced or edited after the keep
// asks for it to be kept again), with no AI draft on it and nothing being made.
export async function printRefusal(db: Sql, schoolId: string, paperId: string, generation: GenerationView | null): Promise<{ why: PrintRefusal | null; kept: { at: string; by: string | null } | null }> {
  const r = (
    await db.query(
      `select s.kept_at, (select u.display_name from users u where u.school_id = s.school_id and u.user_id = s.kept_by) as kept_by,
              (select count(*)::int from marking_questions q where q.school_id = $1 and q.paper_id = $2) as questions,
              (select max(q.updated_at) from marking_questions q where q.school_id = $1 and q.paper_id = $2) as changed,
              (select count(*)::int from marking_questions q join question_bank b on b.school_id = q.school_id and b.bank_id = q.bank_id
                where q.school_id = $1 and q.paper_id = $2 and b.state = 'draft') as drafts
         from (select $1::uuid as school_id) x
         left join marking_setups s on s.school_id = x.school_id and s.paper_id = $2`,
      [schoolId, paperId]
    )
  ).rows[0];
  const kept = r?.kept_at ? { at: new Date(r.kept_at).toISOString(), by: (r.kept_by as string | null) ?? null } : null;
  if (!r || Number(r.questions) === 0) return { why: 'no_questions', kept };
  if (running(generation)) return { why: 'busy', kept };
  if (!r.kept_at) return { why: 'not_kept', kept };
  if (r.changed && new Date(r.changed).getTime() > new Date(r.kept_at).getTime()) return { why: 'changed', kept };
  if (Number(r.drafts) > 0) return { why: 'drafts', kept };
  return { why: null, kept };
}

export async function examTypeOf(db: Sql, schoolId: string, key: string) {
  return examTypeLabel(await examTypesOf(db, schoolId), key);
}
