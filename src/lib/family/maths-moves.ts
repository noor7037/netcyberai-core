// Maths tutoring, the teacher's moves (18 Nov 2026). A maths class on Mathwise ("Mathy", 26 saved-class screens read for this
// change) never drops the sum: when a child says "mujhe nhi pata" the teacher is warm first and then makes the step smaller,
// when the child asks for the whole method it is given numbered with the answers boxed, when it is still unclear the sum is
// told again from zero as a story, and a "what if" changes one number and keeps the rest. This file reads which move a child's
// words ask for and writes the one line each move adds to the system prompt. Deterministic: no model, no network. The
// founder's copy for Control is docs/family-app/prompts/MATHS_SOLVE_ADDENDUM.md.

import { WORKED_MARK } from './tutor-shape';

export type TeachingMove = 'dontknow' | 'full' | 'restart' | 'whatif';
type Memory = { summary?: string | null; turns: readonly { role: 'child' | 'tutor'; text: string }[] } | null | undefined;

// Still unclear after a full method: the story again from the start.
const RESTART =
  /\b(abhi\s+bhi|phir\s+bhi|fir\s+bhi|still)\b.*\b(samajh|samjh|understand|clear|pata)|\bstill\s+(not\s+clear|confus)|\bkuch\s+samajh\s+nahi\s+aaya\b|अभी\s+भी.*(समझ|पता)|फिर\s+भी.*समझ|कहानी|from\s+(the\s+)?(start|beginning|scratch)|shuru\s+se/i;
// Asks for the whole method.
const FULL =
  /\b(pura|poora|puri|poori)\s+(samjh|samajh|solution|method|batao|dikha)|\b(explain|show|solve|do)\s+(it\s+)?(all|fully|completely|the\s+whole|the\s+full|step\s+by\s+step)\b|\b(full|complete|whole)\s+(solution|method|answer|explanation)\b|\bek\s+baar\s+pura\b|पूरा\s+(समझ|हल|तरीका|बता)|पूरा\s*समझा|स्टेप\s*बाय\s*स्टेप/i;
// A change to the sum just solved: the numbers stay, one thing moves.
const WHATIF =
  /\b(what\s+if|what\s+happens\s+if|suppose|instead|agar|yadi|maan\s+lo|man\s+lo)\b.*[0-9०-९]|\b(but\s+if|if\s+the)\b.*\b(later|earlier|before|after|instead|more|less|faster|slower|baad|pehle)\b|अगर.*[0-9०-९]|मान\s*लो.*[0-9०-९]|\bnow\s+(if|suppose)\b/i;
// "I don't know" / "I don't understand".
const DONTKNOW =
  /\b(mujhe|muje|mjhe|mereko|mujko)\s+(nahi|nhi|nai|nh)\s+(pata|samajh|samjh|aata|aati)|\b(nahi|nhi)\s+(pata|samajh|samjh)|samajh\s+(nahi|nhi)\s+aa|\bnhi\s+samajh|\b(i\s+)?(don'?t|do\s+not|dont)\s+(know|understand|get)\b|\bno\s+idea\b|\bnot\s+sure\b|\bconfus|\bhelp\b|मुझे\s+नहीं\s+(पता|समझ)|समझ\s+नहीं\s+आ|नहीं\s+पता|पता\s+नहीं|\bnot\s+clear\b|\bunclear\b/i;

// What a child's words ask for, given what the chat remembers. `null`: nothing special, the question is taken as asked.
// The moves belong to a chat that already has turns (a lone "I don't know" with nothing before it is a new question).
export function teachingMove(text: string, memory: Memory): TeachingMove | null {
  const t = text.trim().slice(0, 600);
  if (!t || !memory || memory.turns.length === 0) return null;
  // A long text is a new question or a pasted sum, not a reply.
  if (t.length > 160) return null;
  if (RESTART.test(t)) return 'restart';
  if (FULL.test(t)) return 'full';
  if (WHATIF.test(t) && hasSolvedSum(memory)) return 'whatif';
  if (DONTKNOW.test(t)) return 'dontknow';
  return null;
}

// Whether the chat holds a solved sum (its working was remembered whole, tutor-shape.ts workedText).
export const hasSolvedSum = (memory: Memory): boolean => !!memory && memory.turns.some((m) => m.role === 'tutor' && m.text.startsWith(WORKED_MARK));

// The moves that need the solution block again (a numbered walkthrough, a changed sum re-solved).
export const movesSolve = (m: TeachingMove | null): boolean => m === 'full' || m === 'whatif';

const WARM = 'Open with ONE short warm line in the child\'s own language ("Koi baat nahi, main hoon na"), never a scolding and never the word "wrong". ';
const SAME = 'Stay on the SAME sum the chat is working on: use its numbers, units, names and the answers already found (the turns above, and the line that starts "' + WORKED_MARK.trim() + '" holds its working). Never start a new story, an unrelated concept or a different problem. ';
const SHAPE = 'Write the explanation block as 3 to 6 SHORT paragraphs, one idea each, in the child\'s language (Hinglish when they write Hinglish). Use no elaboration block, no hint, no "show the answer", no simulation and no video in this reply. ';

export const MOVE_LINES: Record<TeachingMove, string> = {
  dontknow:
    'THE CHILD SAYS THEY DO NOT KNOW OR DO NOT UNDERSTAND. ' + WARM + SAME +
    'Then make the step SMALLER, do not repeat it: take the step they were on and give ONE everyday example that uses a quantity already in this sum ' +
    '(for 80 − x, an 80 cm ribbon with 20 cm cut off), or a fill-in-the-blank with the numbers already found, or one clue. ' +
    'Show the example worked, then ask them to do the very next small line of THIS sum in their own copy, and end with ONE short question. ' + SHAPE,
  full:
    'THE CHILD ASKS FOR THE WHOLE METHOD. ' + SAME +
    'Write the worked_example solution line (given, to find, numbered steps each with its reason, the answer to every part with units, a check), using the numbers already found, ' +
    'then ONE explanation paragraph that ends exactly with a question like "Ek baar pura solution dekh lo. Kya koi aisa step hai jo clear nahi hua?" in the child\'s language. ' +
    'No elaboration block, no hint, no "show the answer", no simulation and no video in this reply.',
  restart:
    'THE CHILD STILL DOES NOT UNDERSTAND AFTER THE FULL METHOD. ' + WARM + SAME +
    'Start again FROM ZERO as a short story of the SAME situation in the simplest words a child of this class uses (for a pole sum: you stand on a road, a pole on each side, you look up at the top), ' +
    'tell only the FIRST idea, then ask "Kya itni baat samajh aayi?" in the child\'s language. Do not give the formulas or the answer yet. ' + SHAPE,
  whatif:
    'THE CHILD CHANGES THE SUM JUST SOLVED. ' + SAME +
    'Say in one short paragraph what STAYS THE SAME (speeds, distances, the answers already found that still hold) and what CHANGES (the one number the child changed). ' +
    'Then write the worked_example solution line for the NEW version, step by step with a check, reusing the earlier numbers. No elaboration block, no new story, no simulation and no video in this reply.',
};

export function withTeachingMove(system: string, move: TeachingMove | null): string {
  if (!move) return system;
  const at = system.indexOf('\nRules: ');
  const line = `\n${MOVE_LINES[move]}`;
  return at < 0 ? `${system}${line}` : `${system.slice(0, at)}${line}${system.slice(at)}`;
}
