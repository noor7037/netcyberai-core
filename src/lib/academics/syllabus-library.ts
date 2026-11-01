import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { SUBJECT_IDS } from '@/lib/contracts/subjects';
import type { Actor } from './taught';

// "Use the NetCyberAI syllabus" (W14-I): a school with no syllabus map copies the library's chapters and topics
// (content.*, titles only) for a class and subject into its own syllabus_units, in order, marked source 'library'.
// Curriculum Gap, the Daily Pulse and "Taught today" all read syllabus_units, so they list the units with nothing else
// changed. The library is reached only through public.library_syllabus_lines (the school's role cannot read content.*).
// Who may run it is the syllabus map's own rule (canWriteSyllabus, checked by the route; row level security limits a
// teacher to their own classes).
//
// The pairs are the school's class and subject pairs that someone teaches (teacher_subjects), the same pairs "Taught
// today" lists. The board is the one the school has recorded (schools.board_id); the class level is the class's grade
// (or the leading number of its name); the subject is matched by name, case-insensitively, with the usual spellings.
// A class and subject that already has units is left alone. Nothing in the library for a pair: said, never invented.

export type LibraryStatus = 'available' | 'has_units' | 'no_match';
type Named = { classId: string; className: string; subjectId: string; subjectName: string };
export type LibraryPair = Named & { status: LibraryStatus; units: number };
export type LibraryPlan = { board: string | null; pairs: LibraryPair[] };
export type LibraryRun = {
  board: string;
  copied: (Named & { units: number })[];
  leftAlone: (Named & { units: number })[];
  noMatch: Named[];
  unitsCopied: number;
};
export type LibraryResult = { ok: true; run: LibraryRun } | { ok: false; reason: 'not_allowed' | 'no_board' };

// Spellings schools use for the library's subject ids; every id also matches its own name ("social science").
const ALIASES: Record<string, string[]> = {
  mathematics: ['maths', 'math'],
  evs: ['environmental studies', 'environmental science', 'environment studies'],
  social_science: ['sst', 'social studies', 'social sciences'],
  computer_science: ['computers', 'computer'],
  informatics_practices: ['ip'],
};
const squash = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const BY_NAME = new Map<string, string>();
for (const id of SUBJECT_IDS) {
  BY_NAME.set(squash(id.replace(/_/g, ' ')), id);
  for (const a of ALIASES[id] ?? []) BY_NAME.set(squash(a), id);
}
export const librarySubjectOf = (schoolSubjectName: string): string | null => BY_NAME.get(squash(schoolSubjectName)) ?? null;

const GRADE: Record<string, number> = { nursery: -2, lkg: -1, ukg: 0 };
// The library's class level of a class: its grade ("6", "LKG"), else the leading number of its name ("6-A").
export function classLevelOf(grade: string | null, name: string): number | null {
  const g = (grade ?? '').trim().toLowerCase();
  if (g in GRADE) return GRADE[g];
  const n = /^\d{1,2}$/.test(g) ? Number(g) : Number(/^\d{1,2}/.exec(name.trim())?.[0] ?? NaN);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

type Line = { class_level: number; subject: string; place: number; chapter: string; topic: string };
type Base = Named & { level: number | null; units: number };

async function load(db: PoolClient, actor: Actor, only: { classId: string; subjectId: string } | null) {
  const board = ((await db.query(`select board_id from schools where school_id = $1`, [actor.schoolId])).rows[0]?.board_id as string | null) ?? null;
  const pairs = (
    await db.query(
      `select p.class_id, c.name as class_name, c.grade, p.subject_id, s.name as subject_name,
              (select count(*) from syllabus_units u where u.school_id = $1 and u.class_id = p.class_id and u.subject_id = p.subject_id)::int as units
         from (select distinct ts.class_id, ts.subject_id from teacher_subjects ts where ts.school_id = $1) p
         join classes c on c.school_id = $1 and c.class_id = p.class_id
         join subjects s on s.school_id = $1 and s.subject_id = p.subject_id and s.retired_at is null
        where ($2::text <> 'teacher' or p.class_id = any (public.teacher_own_class_ids()))
          and ($3::uuid is null or (p.class_id = $3::uuid and p.subject_id = $4::uuid))
        order by c.name, s.name`,
      [actor.schoolId, actor.role, only?.classId ?? null, only?.subjectId ?? null]
    )
  ).rows.map((r): Base => ({ classId: r.class_id, className: r.class_name, level: classLevelOf(r.grade, r.class_name), subjectId: r.subject_id, subjectName: r.subject_name, units: r.units }));
  const levels = [...new Set(pairs.map((p) => p.level).filter((n): n is number => n !== null))];
  const lines: Line[] =
    board && levels.length ? (await db.query(`select class_level, subject, place, chapter, topic from public.library_syllabus_lines($1, $2::smallint[])`, [board, levels])).rows : [];
  const linesOf = (p: Base): Line[] => {
    const id = librarySubjectOf(p.subjectName);
    return id && p.level !== null ? lines.filter((l) => l.class_level === p.level && l.subject === id) : [];
  };
  return { board, pairs, linesOf };
}

const named = (p: Base): Named => ({ classId: p.classId, className: p.className, subjectId: p.subjectId, subjectName: p.subjectName });

// What the screen shows: every class and subject the person may map, and whether the library has it.
export async function libraryPlan(db: PoolClient, actor: Actor): Promise<LibraryPlan> {
  const { board, pairs, linesOf } = await load(db, actor, null);
  return { board, pairs: pairs.map((p) => ({ ...named(p), units: p.units, status: p.units > 0 ? 'has_units' : linesOf(p).length > 0 ? 'available' : 'no_match' })) };
}

// Copies the library's units into every class and subject with none (or into the one named). Writes one audit row with
// the counts, whatever was copied. A teacher is limited to their own classes by the same rule the syllabus map has.
export async function copyFromLibrary(db: PoolClient, actor: Actor, only: { classId: string; subjectId: string } | null): Promise<LibraryResult> {
  const { board, pairs, linesOf } = await load(db, actor, only);
  // A named class and subject the person may not map (not theirs, or not a pair at all) is refused.
  if (only && pairs.length === 0) return { ok: false, reason: 'not_allowed' };
  if (!board) return { ok: false, reason: 'no_board' };
  const run: LibraryRun = { board, copied: [], leftAlone: [], noMatch: [], unitsCopied: 0 };
  const cls: string[] = [], sub: string[] = [], pos: number[] = [], chap: string[] = [], top: string[] = [];
  for (const p of pairs) {
    if (p.units > 0) {
      run.leftAlone.push({ ...named(p), units: p.units });
      continue;
    }
    const lines = linesOf(p);
    if (lines.length === 0) {
      run.noMatch.push(named(p));
      continue;
    }
    lines.forEach((l, i) => {
      cls.push(p.classId);
      sub.push(p.subjectId);
      pos.push(i + 1);
      chap.push(l.chapter);
      top.push(l.topic);
    });
    run.copied.push({ ...named(p), units: lines.length });
  }
  if (cls.length) {
    const { rows } = await db.query(
      `insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic, created_by, source)
       select $1, n.class_id, n.subject_id, n.position, n.chapter, n.topic, $2, 'library'
         from unnest($3::uuid[], $4::uuid[], $5::int[], $6::text[], $7::text[]) as n(class_id, subject_id, position, chapter, topic)
        where not exists (select 1 from syllabus_units u where u.school_id = $1 and u.class_id = n.class_id and u.subject_id = n.subject_id)
       returning class_id, subject_id`,
      [actor.schoolId, actor.userId, cls, sub, pos, chap, top]
    );
    // A pair another person filled a moment ago keeps theirs; only what this run wrote is counted.
    const wrote = new Set(rows.map((r) => `${r.class_id}:${r.subject_id}`));
    run.copied = run.copied.filter((c) => wrote.has(`${c.classId}:${c.subjectId}`));
    run.unitsCopied = rows.length;
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'syllabus.copied_from_library',
    targetType: 'syllabus_units',
    afterState: { board_id: board, scope: only ? 'one' : 'all', class_subjects_copied: run.copied.length, units_copied: run.unitsCopied, left_alone: run.leftAlone.length, no_match: run.noMatch.length },
  });
  return { ok: true, run };
}
