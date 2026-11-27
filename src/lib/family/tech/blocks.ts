// Tech Lab steps as Study reader blocks, so narrationScript, WordTapLayer and the server voice can read them.
// Try / Karo is never a block: a question, an option, an answer or an explanation is not spoken before the child answers.

import type { Block, Explanation, KeyPoints } from '@/lib/family/blocks';
import { pick, type TechLang } from './text';
import type { TechLesson } from './types';

function sentencesJoin(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/[.!?।]$/.test(part) ? part : `${part}.`))
    .join(' ');
}

export function techlabToBlocks(lesson: TechLesson, lang: TechLang): Block[] {
  const blocks: Block[] = [];
  (lesson.see ?? []).forEach((step, index) => {
    const text = sentencesJoin([pick(lang, step.narration) || pick(lang, step.caption)]);
    if (!text) return;
    const point: KeyPoints & { id: string } = { id: `${lesson.id}.see.${index + 1}`, type: 'key_points', points: [text] };
    blocks.push(point);
  });
  const terms = (lesson.vocab ?? []).map((word) => ({ en: word.term, local: word.hinglish || word.hi || word.en || word.term }));
  (lesson.understand ?? []).forEach((card, index) => {
    const heading = pick(lang, card.heading);
    const analogy = pick(lang, card.analogy);
    const body = pick(lang, card.body);
    const example = pick(lang, card.realExample);
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
  return blocks;
}
