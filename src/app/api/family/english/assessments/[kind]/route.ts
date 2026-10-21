import { NextRequest, NextResponse } from 'next/server';
import { forChild, scoreItems, type AssessmentKind } from '@/lib/family/english/course';
import { assessmentOpen, assessmentTotal, placedUnitFor, speakingScore, type SkillScores } from '@/lib/family/english/progress';
import { englishError, withEnglish } from '@/lib/family/english/request';
import { assessmentBody, doneSet, lessonsDone, updateEnrolment, writeAssessment } from '@/lib/family/english/store';
import { jsonBody } from '@/lib/family/request';

// The day-0, day-45 and day-90 checks (docs/family-app/12 §3, §8, C274). GET: the items without answers and the
// speaking tasks. POST { answers, speaking: { [taskKey]: [0–2 per criterion] } }: scored here per skill; day 0 places
// tracks B–D at unit 1, 4 or 7 when no lesson is done yet.

const KINDS: readonly AssessmentKind[] = ['day0', 'day45', 'day90'];
const isKind = (v: string): v is AssessmentKind => (KINDS as readonly string[]).includes(v);

export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  const kind = params.kind;
  if (!isKind(kind)) return englishError('bad_request', 400);
  return withEnglish(req, async ({ db, child, track, versionId }) => {
    if (!assessmentOpen(track, kind, doneSet(await lessonsDone(db, child.childId, track)))) return englishError('locked', 403);
    const a = await assessmentBody(db, versionId, kind);
    if (!a) return englishError('not_found', 404);
    return NextResponse.json({
      track,
      kind,
      sections: a.sections.map((s) => ({ skill: s.skill, items: s.items.map(forChild) })),
      speaking: a.speaking,
    });
  });
}

export async function POST(req: NextRequest, { params }: { params: { kind: string } }) {
  const kind = params.kind;
  if (!isKind(kind)) return englishError('bad_request', 400);
  const body = await jsonBody(req);
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? (body.answers as Record<string, unknown>) : {};
  const ratings = body.speaking && typeof body.speaking === 'object' && !Array.isArray(body.speaking) ? (body.speaking as Record<string, unknown>) : {};
  return withEnglish(req, async ({ db, accountId, child, track, versionId, today }) => {
    const finished = doneSet(await lessonsDone(db, child.childId, track));
    if (!assessmentOpen(track, kind, finished)) return englishError('locked', 403);
    const a = await assessmentBody(db, versionId, kind);
    if (!a) return englishError('not_found', 404);
    const scores: SkillScores = { listening: null, words: null, grammar: null, reading: null, speaking: null };
    const results = a.sections.map((s) => {
      const r = scoreItems(s.items, answers);
      scores[s.skill] = r.score;
      return { skill: s.skill, score: r.score, results: r.results };
    });
    const criteria = a.speaking.reduce((n, t) => n + t.criteria.length, 0);
    const given = a.speaking.flatMap((t) => {
      const v = ratings[t.key];
      return Array.isArray(v) ? t.criteria.map((_, i) => Number(v[i])) : t.criteria.map(() => 0);
    });
    scores.speaking = speakingScore(given, criteria);
    const total = assessmentTotal(scores);
    await writeAssessment(db, accountId, child.childId, { kind, takenOn: today, ...scores, total });
    let placedUnit: number | null = null;
    if (kind === 'day0' && finished.size === 0) {
      placedUnit = placedUnitFor(track, total);
      await updateEnrolment(db, child.childId, { placedUnit });
    }
    return NextResponse.json({ kind, scores, total, sections: results, placedUnit });
  });
}
