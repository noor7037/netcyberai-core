// The stand-in's tutor answer (pilot rehearsal): the development stand-in has no model, but the tutor (profile
// family.resolver, src/lib/family/resolver.ts) reads its answer as a subject line and then one JSON block per line. This
// writes a minimal, valid answer of that shape from the request's own text, so the whole tutor path (subject check,
// block parsing, arithmetic check, library line, ledger) can be proven without a paid key. It is fixed text, says it is a
// stand-in, and only ever runs where standInAdapter does: never in production (standInAllowed(), ./index.ts).

const MARK = 'Stand-in answer for testing';

// The request is the tutor's when its instructions ask for the subject line first, as JSON lines.
export function isTutorRequest(system: string): boolean {
  return /Output ONLY JSON objects, one per line/.test(system) && /"type":"subject"/.test(system);
}

// The subject the question is in, from the question's own words; mathematics when nothing says otherwise.
export function tutorSubject(system: string, question: string): string {
  const open = /may be answered only in: ([^.]*)\./.exec(system)?.[1] ?? 'mathematics';
  const ids = open.split(/\s+or\s+|,\s*/).map((x) => x.trim()).filter(Boolean);
  const q = question.toLowerCase();
  const rules: [string, RegExp][] = [
    ['science', /\b(photosynthesis|cell|atom|molecule|force|motion|velocity|acid|base|salt|reaction|electric|current|magnet|light|reflection|organism|heredity|evolution)\b/],
    ['social_science', /\b(history|geography|democracy|constitution|revolution|resources|economy|nationalism)\b/],
  ];
  for (const [id, re] of rules) if (re.test(q) && ids.includes(id)) return id;
  return ids.includes('mathematics') ? 'mathematics' : (ids[0] ?? 'mathematics');
}

const quiz = (id: string) => ({
  id,
  question: `${MARK}: what is 2 + 3?`,
  options: ['4', '5', '6', '7'],
  answer: 1,
  hint: 'Count two, then three more.',
  why: '2 + 3 = 5.',
  wrong: ['Not 4: that is 2 + 2.', '', 'Not 6: that is 3 + 3.', 'Not 7: that is 3 + 4.'],
  expression: '2 + 3',
});

// The answer's lines, joined by newlines. `question` is the student's words (the user message).
export function tutorAnswer(system: string, question: string): string {
  const lines: unknown[] = [{ type: 'subject', subject: tutorSubject(system, question) }];
  // A sum is solved first when the prompt says so; the arithmetic is fixed and exactly right.
  if (/SOLVE IT FIRST/.test(system)) {
    lines.push({
      type: 'worked_example',
      problem: `${MARK}: add 2 and 3.`,
      given: ['The numbers 2 and 3'],
      find: ['Their sum'],
      steps: [{ text: 'Add the two numbers.', why: 'A sum is the numbers put together.', expression: '2 + 3', result: '5' }],
      answer: '2 + 3 = 5',
      check: { text: 'Take 3 away from 5 to get back to 2.', expression: '5 - 3', result: '2' },
    });
  }
  if (/THE NETCYBERAI ELABORATION FRAMEWORK/.test(system)) {
    lines.push({
      type: 'elaboration',
      term: 'Stand-in answer',
      icon: '🧪',
      definition: { text: `${MARK}: this is a fixed reply, not a lesson.`, q: 'stand in test' },
      levels: { basic: `${MARK}.`, intermediate: `${MARK}: the real tutor teaches here.`, advanced: `${MARK}: a real provider key gives the full lesson.`, q: 'stand in test' },
      real_life: { text: `${MARK}: a rehearsal before a real key.`, q: 'stand in test' },
      try_it: { question: 'What is 2 + 3?', right: '5', hint: 'Count on from 2.', q: 'stand in test' },
      future: { text: `${MARK}: the real answer comes with a provider key.`, q: 'stand in test' },
      checks: [
        { question: 'What is 2 + 3?', options: ['4', '5', '6'], answer: 1, right: 'Yes, 5.', hint: 'Count on from 2.' },
        { question: 'What is 3 + 3?', options: ['5', '6', '7'], answer: 1, right: 'Yes, 6.', hint: 'Double 3.' },
      ],
    });
  } else {
    lines.push({
      type: 'explanation',
      title: 'Stand-in answer for testing',
      idea: `${MARK}: this is a fixed reply, not a lesson.`,
      paragraphs: [`${MARK}. The real tutor writes the lesson once a provider key is set.`],
      example: 'Adding 2 and 3 gives 5.',
      steps: ['Start with 2.', 'Add 3 more.', 'The total is 5.'],
      terms: [{ en: 'sum', local: 'jod' }],
    });
    lines.push({ type: 'check', items: [quiz('c1'), quiz('c2'), quiz('c3')] });
    lines.push({ type: 'practice', items: [quiz('p1'), quiz('p2'), quiz('p3')] });
  }
  return lines.map((l) => JSON.stringify(l)).join('\n');
}
