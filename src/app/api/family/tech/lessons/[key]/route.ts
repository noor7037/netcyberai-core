import { NextRequest, NextResponse } from 'next/server';
import { badgeName, freshBadges, MILESTONE_BADGES, unitBadges } from '@/lib/family/tech/badges';
import { lessonById, lessonForChild } from '@/lib/family/tech/catalog';
import { courseCatalog } from '@/lib/family/tech/catalog';
import { passPercent, readProgress, saveLab, savePass } from '@/lib/family/tech/progress';
import { techError, withTech } from '@/lib/family/tech/request';
import { flatLab, isRight, questionsOf, reveal, scoreAll, type LabEvent } from '@/lib/family/tech/score';
import { isTechLang, pick } from '@/lib/family/tech/text';
import type { TechQuestion } from '@/lib/family/tech/types';
import { jsonBody } from '@/lib/family/request';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

function eventsOf(value: unknown, lab: string | undefined): LabEvent[] {
  if (!Array.isArray(value)) return [];
  const out: LabEvent[] = [];
  for (const item of value.slice(0, 40)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    if (JSON.stringify(raw).length > 4000) continue;
    if (!(raw.type === 'nca-lab-event' || raw.type === 'techlab:lab-complete' || raw.source === 'nca-techlab' || raw.source === 'nca-labs')) continue;
    out.push(flatLab(raw, lab));
  }
  return out;
}

function answerOf(question: TechQuestion, value: unknown): unknown {
  if (question.type === 'lab-check') return null;
  if (question.type === 'short') return typeof value === 'string' ? value.slice(0, 200) : null;
  if (question.type === 'mcq') return Number.isInteger(value) ? value : null;
  if (question.type === 'multi' || question.type === 'order' || question.type === 'match') {
    if (!Array.isArray(value) || value.length > 24 || value.some((item) => !Number.isInteger(item) || (item as number) < -1 || (item as number) > 40)) return null;
    return value;
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  return withTech(req, async () => {
    const lesson = lessonForChild(params.key);
    if (!lesson) return techError('not_found', 404);
    return NextResponse.json({ lesson }, { headers: noStore });
  });
}

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  return withTech(req, async ({ db, accountId, child }) => {
    const lesson = lessonById(params.key);
    if (!lesson) return techError('not_found', 404);
    const body = await jsonBody(req);
    const lang = isTechLang(body.lang) ? body.lang : 'hinglish';
    const events = eventsOf(body.events, lesson.play?.lab);
    const questions = questionsOf(lesson);
    if (body.action === 'check') {
      const question = questions.find((item) => item.id === body.questionId);
      if (!question || typeof body.questionId !== 'string') return techError('bad_request', 400);
      const given = answerOf(question, body.answer);
      if (question.type !== 'lab-check' && (given == null || given === '')) return techError('bad_request', 400);
      const right = isRight(question, given, events);
      return NextResponse.json({ right, explain: pick(lang, question.explain), mark: right || question.type !== 'short' ? reveal(question) : null }, { headers: noStore });
    }
    // C557: the prediction before a lesson is never marked, but its answer still stays here until the child has chosen.
    if (body.action === 'predict') {
      const choice = body.choice;
      const options = lesson.predict?.options ?? [];
      if (!lesson.predict || !Number.isInteger(choice) || (choice as number) < 0 || (choice as number) >= options.length) return techError('bad_request', 400);
      return NextResponse.json({ right: choice === lesson.predict.answer, answer: lesson.predict.answer, explain: pick(lang, lesson.predict.explain) }, { headers: noStore });
    }
    if (body.action !== 'finish') return techError('bad_request', 400);
    const raw = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? (body.answers as Record<string, unknown>) : {};
    const answers: Record<string, unknown> = {};
    for (const question of questions) answers[question.id] = answerOf(question, raw[question.id]);
    const progress = await readProgress(db, child.childId);
    const prev = progress.done[lesson.id]?.xp ?? 0;
    const pass = await passPercent(db);
    const scored = scoreAll(lesson, answers, events, lang, prev, pass);
    let saved = false;
    let badgeIds: string[] = [];
    if (scored.passed) {
      const wrote = await savePass(db, accountId, child.childId, lesson.id, Math.round(scored.share * 100), scored.stars, scored.xp, scored.gain);
      saved = wrote.saved;
      badgeIds = wrote.badges;
      if (lesson.play?.lab && events.some((event) => event._done)) await saveLab(db, accountId, child.childId, lesson.play.lab);
    }
    const catalog = courseCatalog();
    const defs = [...MILESTONE_BADGES, ...unitBadges(catalog)];
    const badges = (saved ? badgeIds : freshBadges(catalog, { ...progress, xp: progress.xp + scored.gain, done: { ...progress.done, [lesson.id]: { stars: scored.stars, best: Math.round(scored.share * 100), xp: scored.xp } }, badges: progress.badges, labs: progress.labs }).map((badge) => badge.id))
      .map((id) => defs.find((badge) => badge.id === id))
      .filter((badge): badge is NonNullable<typeof badge> => !!badge)
      .map((badge) => ({ id: badge.id, emoji: badge.emoji, name: badgeName(badge, lang) }));
    // A short answer's accepted strings stay on the server. The mark for a short question is cleared.
    const shown = scored.questions.map((item) => (questions.find((question) => question.id === item.id)?.type === 'short' ? { ...item, mark: null } : item));
    return NextResponse.json({
      right: scored.right,
      total: scored.total,
      passed: scored.passed,
      stars: scored.stars,
      gain: scored.passed ? scored.gain : 0,
      xp: scored.passed ? scored.xp : 0,
      totalXp: progress.xp + (scored.passed ? scored.gain : 0),
      saved,
      questions: shown,
      badges,
    }, { headers: noStore });
  });
}
