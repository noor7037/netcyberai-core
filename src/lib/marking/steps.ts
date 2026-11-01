import { streamText } from '@/lib/ai/platform';
import { stepsPrompt } from '@/lib/ai/prompts/exams.steps';
import { QUESTION_KINDS, type QuestionKind } from '@/lib/contracts/marking';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { aiMarkingState, markingPaper, type Actor } from './context';
import { jsonObjectIn } from './parse';

// W14-C: marking steps suggested by the AI for one question of the setup form, so part marks are fair. The teacher's
// own question goes out (the question, its key, kind and marks, the class level and subject), on the exams.mark
// profile with no picture and no child's words; the steps come back to the form only. Nothing is kept here: the
// teacher edits them and saves the questions as before (./setup.ts checks them again).

export const SUGGEST_STEPS_MAX = 6;
const STEP_MAX = 120;
const PROMPT_MAX = 4000;
const KEY_MAX = 8000;

export type SuggestedStep = { step: string; marks: number };
export type SuggestResult = { ok: true; steps: SuggestedStep[] } | { ok: false; reason: 'not_found' | 'not_allowed' | 'closed' | 'ai_off' | 'not_sent_properly' | 'no_answer' };

const oneDecimal = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(Math.round(n * 10) - n * 10) < 1e-6;

// The AI's answer as steps the form takes: each a line of words and marks above 0 to one decimal place, at most six,
// and never more marks in all than the question's (a step that would pass them is left out). Empty when nothing fits.
export function parseSuggestedSteps(text: string, maxMarks: number): SuggestedStep[] {
  const root = jsonObjectIn(text, 'steps');
  const given = root?.steps;
  if (!Array.isArray(given)) return [];
  const out: SuggestedStep[] = [];
  let total = 0;
  for (const s of given.slice(0, 40)) {
    if (out.length >= SUGGEST_STEPS_MAX) break;
    if (typeof s !== 'object' || s === null) continue;
    const { step, marks } = s as { step?: unknown; marks?: unknown };
    if (typeof step !== 'string' || !oneDecimal(marks) || marks <= 0) continue;
    const words = Array.from(step.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, STEP_MAX).join('').trim();
    if (!words) continue;
    const n = Math.round(marks * 10) / 10;
    if (total + n > maxMarks + 1e-9) continue;
    total = Math.round((total + n) * 10) / 10;
    out.push({ step: words, marks: n });
  }
  return out;
}

type Ask = { kind: QuestionKind; maxMarks: number; prompt: string; answerKey: string };
function readAsk(b: unknown): Ask | null {
  if (typeof b !== 'object' || b === null) return null;
  const { kind, maxMarks, prompt, answerKey } = b as Record<string, unknown>;
  if (!(QUESTION_KINDS as readonly unknown[]).includes(kind)) return null;
  if (!oneDecimal(maxMarks) || maxMarks <= 0 || maxMarks > 100) return null;
  if (typeof prompt !== 'string' || typeof answerKey !== 'string') return null;
  const p = prompt.trim();
  const k = answerKey.trim();
  if (p.length > PROMPT_MAX || k.length > KEY_MAX || (!p && !k)) return null;
  return { kind: kind as QuestionKind, maxMarks, prompt: p, answerKey: k };
}

export async function suggestSteps(db: Sql, actor: Actor, paperId: string, body: unknown, ask: typeof streamText = streamText): Promise<SuggestResult> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return { ok: false, reason: 'not_found' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (paper.published) return { ok: false, reason: 'closed' };
  const q = readAsk(body);
  if (!q) return { ok: false, reason: 'not_sent_properly' };
  if (!(await aiMarkingState(db, actor.schoolId)).on) return { ok: false, reason: 'ai_off' };
  const grade = (await db.query(`select grade from classes where school_id = $1 and class_id = $2`, [actor.schoolId, paper.classId])).rows[0]?.grade;
  const prompt = stepsPrompt();
  const a = { grade: typeof grade === 'string' ? grade.trim() : '', subject: paper.subjectName, ...q };
  const got = await ask(db, { accountId: actor.schoolId, childFirstNames: [], day: indiaDate() }, 'exams.mark', {
    system: prompt.system(a),
    messages: [{ role: 'user', content: prompt.user(a) }],
    responseFormat: 'json',
    maxTokens: 800,
    temperature: 0,
  });
  if (!got.ok) return { ok: false, reason: got.reason === 'failed' || got.reason === 'cap_reached' ? 'no_answer' : 'ai_off' };
  const steps = parseSuggestedSteps(got.text, q.maxMarks);
  return steps.length ? { ok: true, steps } : { ok: false, reason: 'no_answer' };
}
