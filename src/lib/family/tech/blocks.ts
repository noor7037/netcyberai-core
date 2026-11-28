// Tech Lab steps as Study reader blocks, so narrationScript, WordTapLayer and the server voice can read them.
// Try / Karo is never a block: a question, an option, an answer or an explanation is not spoken before the child answers.

import type { Block, Explanation, KeyPoints } from '@/lib/family/blocks';
import { introLines, named, wrapLines, type TechPersonal } from './personal';
import { pick, type TechLang } from './text';
import type { TechLesson } from './types';

function sentencesJoin(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/[.!?।]$/.test(part) ? part : `${part}.`))
    .join(' ');
}

// With `personal` (the phone, which knows the child): an opening block (`<id>.intro`) and a closing summary
// (`<id>.wrap`) are added, and the lesson's own {{name}} tokens become the child's first name. Without it (the server
// voice): no opening or summary, and every token is stripped, so the server never holds a sentence with the name.
export const INTRO_BLOCK = '.intro';
export const WRAP_BLOCK = '.wrap';

export function techlabToBlocks(lesson: TechLesson, lang: TechLang, personal?: TechPersonal): Block[] {
  const blocks: Block[] = [];
  const name = personal?.name ?? '';
  const say = (value: unknown) => named(pick(lang, value), name);
  if (personal) {
    const intro: KeyPoints & { id: string } = { id: `${lesson.id}${INTRO_BLOCK}`, type: 'key_points', points: [introLines(lesson.id, lang, personal, lesson.hook).join(' ')] };
    blocks.push(intro);
  }
  (lesson.see ?? []).forEach((step, index) => {
    const text = sentencesJoin([say(step.narration) || say(step.caption)]);
    if (text) {
      const point: KeyPoints & { id: string } = { id: `${lesson.id}.see.${index + 1}`, type: 'key_points', points: [text] };
      blocks.push(point);
    }
    // C557: a step's beats, each its own block, so the picture can light the part each one explains.
    (step.beats ?? []).forEach((beat, b) => {
      const said = sentencesJoin([say(beat.narration)]);
      if (!said) return;
      const point: KeyPoints & { id: string } = { id: `${lesson.id}.see.${index + 1}.b${b + 1}`, type: 'key_points', points: [said] };
      blocks.push(point);
    });
  });
  const terms = (lesson.vocab ?? []).map((word) => ({ en: word.term, local: word.hinglish || word.hi || word.en || word.term }));
  (lesson.understand ?? []).forEach((card, index) => {
    const heading = say(card.heading);
    const analogy = say(card.analogy);
    const body = say(card.body);
    const example = say(card.realExample);
    if (!heading && !analogy && !body && !example) return;
    const idea = analogy || body;
    // C557: where the analogy stops being true, and the optional deeper note, are read too.
    const limit = say(card.limit);
    const advanced = say(card.advanced);
    const paragraphs = [...(analogy && body && analogy !== body ? [body] : []), ...(limit ? [limit] : []), ...(advanced ? [advanced] : [])];
    const block: Explanation & { id: string } = {
      id: `${lesson.id}.understand.${index + 1}`,
      type: 'explanation',
      title: heading || idea,
      idea: idea || heading,
      paragraphs,
      example,
      steps: [],
      terms: index === 0 ? terms : [],
    };
    blocks.push(block);
  });
  if (personal) {
    const wrap: KeyPoints & { id: string } = { id: `${lesson.id}${WRAP_BLOCK}`, type: 'key_points', points: [wrapLines(lesson.id, lang, personal, lesson.outcomes ?? []).join(' ')] };
    blocks.push(wrap);
  }
  return blocks;
}

// ---- the guided lesson (C557) -----------------------------------------------------------------------------------------
// The lesson as one ordered timeline for Guided Teacher Mode: the opening, each See step and its beats (with the part to
// light), the Understand cards, and the summary. Each segment is the same Reader blocks the Listen buttons read, so the
// voice, the captions and the server's copy stay one source. Questions are never in it.
export type GuideSegment = {
  blockId: string; // the raw block id (`<lesson>.see.2.b1`)
  phase: 'see' | 'understand';
  step: number; // See step index, or Understand card index
  beat: number | null; // beat index inside a See step
  focus?: string;
  values?: Record<string, string>;
};

export function guideTimeline(lesson: TechLesson, personal?: TechPersonal): GuideSegment[] {
  const out: GuideSegment[] = [];
  if (personal) out.push({ blockId: `${lesson.id}${INTRO_BLOCK}`, phase: 'see', step: 0, beat: null });
  (lesson.see ?? []).forEach((step, index) => {
    out.push({ blockId: `${lesson.id}.see.${index + 1}`, phase: 'see', step: index, beat: null });
    (step.beats ?? []).forEach((beat, b) => out.push({ blockId: `${lesson.id}.see.${index + 1}.b${b + 1}`, phase: 'see', step: index, beat: b, focus: beat.focus, values: beat.values }));
  });
  (lesson.understand ?? []).forEach((_, index) => out.push({ blockId: `${lesson.id}.understand.${index + 1}`, phase: 'understand', step: index, beat: null }));
  if (personal) out.push({ blockId: `${lesson.id}${WRAP_BLOCK}`, phase: 'understand', step: (lesson.understand ?? []).length, beat: null });
  return out;
}
