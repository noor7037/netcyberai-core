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
    const intro: KeyPoints & { id: string } = { id: `${lesson.id}${INTRO_BLOCK}`, type: 'key_points', points: [introLines(lesson.id, lang, personal).join(' ')] };
    blocks.push(intro);
  }
  (lesson.see ?? []).forEach((step, index) => {
    const text = sentencesJoin([say(step.narration) || say(step.caption)]);
    if (!text) return;
    const point: KeyPoints & { id: string } = { id: `${lesson.id}.see.${index + 1}`, type: 'key_points', points: [text] };
    blocks.push(point);
  });
  const terms = (lesson.vocab ?? []).map((word) => ({ en: word.term, local: word.hinglish || word.hi || word.en || word.term }));
  (lesson.understand ?? []).forEach((card, index) => {
    const heading = say(card.heading);
    const analogy = say(card.analogy);
    const body = say(card.body);
    const example = say(card.realExample);
    if (!heading && !analogy && !body && !example) return;
    const idea = analogy || body;
    const paragraphs = analogy && body && analogy !== body ? [body] : [];
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
