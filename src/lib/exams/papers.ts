import { placesOk, type GradingScheme } from './scheme';
import type { MarkPart } from './grading';

// An exam paper's parts (docs/27 row 9b, C214), shared by the server and the screens. A paper has the grading
// scheme's components, each with the maximum the office gives it on this paper and its share of the subject, as
// the scheme says; a scheme with no components gives a paper one component, "Marks". The database holds the same
// rules (exam_paper_components_problem, marks_rules in 20261121090100_p6_exams_marks.sql).

export type PaperComponent = { key: string; name: string; max: number; share: number | null };
export type MarkKind = 'score' | 'absent' | 'exempt';
export type Mark = { kind: MarkKind; score: number | null };

// The one component of a paper whose scheme has none, and of the marks recorded before P6.
export const SINGLE_KEY = 'marks';
export const MAX_LIMIT = 1000;

// The components a paper can have, from the scheme in force: their keys, names and shares, and no maximum yet.
export function schemeParts(scheme: Pick<GradingScheme, 'components'> | null): { key: string; name: string; share: number | null }[] {
  if (!scheme || !scheme.components.length) return [{ key: SINGLE_KEY, name: 'Marks', share: null }];
  return scheme.components.map((c) => ({ key: c.key, name: c.name, share: c.share }));
}

export const maxOk = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= MAX_LIMIT && placesOk(n, 1);

// A paper's components from the scheme and the maxima the office typed. A component with no maximum is not on
// this paper (an English paper with no practical); at least one is.
export function paperComponents(scheme: Pick<GradingScheme, 'components'> | null, maxima: unknown): { ok: true; components: PaperComponent[] } | { ok: false } {
  if (typeof maxima !== 'object' || maxima === null || Array.isArray(maxima)) return { ok: false };
  const given = maxima as Record<string, unknown>;
  const parts = schemeParts(scheme);
  if (Object.keys(given).some((k) => !parts.some((p) => p.key === k))) return { ok: false };
  const components: PaperComponent[] = [];
  for (const p of parts) {
    const m = given[p.key];
    if (m === null || m === undefined) continue;
    if (!maxOk(m)) return { ok: false };
    components.push({ ...p, max: m });
  }
  return components.length ? { ok: true, components } : { ok: false };
}

// A score as typed: a number from 0 to the maximum, to one decimal place.
export const scoreOk = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max && placesOk(n, 1);

// What percent() is given for one child on one paper: each component's mark, absent and exempt marked as such so
// they are left out, and the share when every component of the paper carries one. A component with no mark yet is
// left out too: it is not a mark.
export function markParts(components: readonly PaperComponent[], marks: Readonly<Record<string, Mark | undefined>>): MarkPart[] {
  const shared = components.every((c) => c.share !== null);
  const parts: MarkPart[] = [];
  for (const c of components) {
    const m = marks[c.key];
    if (!m) continue;
    parts.push({ score: m.kind === 'score' ? m.score : null, max: c.max, absent: m.kind === 'absent', exempt: m.kind === 'exempt', ...(shared ? { share: c.share as number } : {}) });
  }
  return parts;
}

// Roll order: the roll number as a number where it is one, then as written, then the name. Never by marks.
export const ROLL_ORDER = `case when s.roll_no ~ '^[0-9]{1,9}$' then s.roll_no::int end nulls last, s.roll_no nulls last, s.name, s.student_id`;
// The children on a class's roll.
export const ON_ROLL = `s.status in ('active', 'pending_consent')`;

// The papers that wait for marks from the person asking, in one place for My Day's "marks to enter" card and the
// exams screen: a paper of an open exam, dated today in India or before (or not dated), whose marks this person may
// enter (the database's may_enter_marks), with at least one child on the roll still without a mark, absent or
// exempt for every component (exam_paper_progress, counted over the whole roll). The one parameter is the school.
// Read under the person's own row level security: a teacher's papers are of their own classes.
export const TO_ENTER_SQL = `select p.paper_id, p.exam_id
   from exam_papers p
   join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
   cross join lateral public.exam_paper_progress(p.paper_id) g
  where p.school_id = $1 and e.status = 'open'
    and (p.paper_date is null or p.paper_date <= (now() at time zone 'Asia/Kolkata')::date)
    and public.may_enter_marks(p.class_id, p.subject_id)
    and g.entered < g.roll`;
