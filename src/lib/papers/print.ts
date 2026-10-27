import type { CardBlock } from '@/lib/exams/report-card-text';
import { t, type Lang } from '@/lib/i18n';
import type { PrintData, PrintQuestion } from './types';

// A kept paper as blocks to draw (C362): the question paper (the school's header, the exam, class and subject, the time
// and marks, general instructions, then each section with its internal choice, and every question with its marks and
// options) and its marking scheme for teachers (each question's answer, right option or number, and marking steps).
// The browser draws the blocks into a PDF (src/components/papers/paper-pdf.ts), as report cards are. Pure: the words are
// the messages (pp.print.*) in the paper's language.

const num = (n: number, lang: Lang) => n.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { maximumFractionDigits: 1 });
const day = (ymd: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${ymd}T00:00:00Z`));
const marksWords = (n: number, lang: Lang) => t(lang, n === 1 ? 'pp.print.oneMark' : 'pp.print.marks', { n: num(n, lang) });

// The paper's language for its words: Hindi for a Hindi paper, else the reader's.
export const printLang = (data: Pick<PrintData, 'language'>, reader: Lang): Lang => (data.language === 'hi' ? 'hi' : data.language === 'en' ? 'en' : reader);

// The questions in runs of one section each, in print order (a question with no section makes a run of its own kind).
function runs(questions: readonly PrintQuestion[]): { section: string | null; questions: PrintQuestion[] }[] {
  const out: { section: string | null; questions: PrintQuestion[] }[] = [];
  for (const q of questions) {
    const last = out[out.length - 1];
    if (last && last.section === q.section) last.questions.push(q);
    else out.push({ section: q.section, questions: [q] });
  }
  return out;
}

function choiceLine(data: PrintData, group: string, lang: Lang): string | null {
  const n = data.choiceCounts[group];
  const of = data.questions.filter((q) => q.choiceGroup === group).length;
  return typeof n === 'number' && n < of ? t(lang, 'pp.print.choice', { n: num(n, lang), of: num(of, lang) }) : null;
}

export function questionPaperBlocks(data: PrintData, lang: Lang): CardBlock[] {
  const blocks: CardBlock[] = [];
  blocks.push({ kind: 'title', text: data.schoolName || data.examName });
  blocks.push({ kind: 'subtitle', text: `${data.examName} · ${data.className} · ${data.subjectName}` });
  const top = [data.minutes ? t(lang, 'pp.print.time', { n: num(data.minutes, lang) }) : null, t(lang, 'pp.print.max', { n: num(data.maxMarks, lang) })].filter(Boolean).join(' · ');
  blocks.push({ kind: 'line', text: top, strong: true });
  if (data.date) blocks.push({ kind: 'line', text: day(data.date, lang) });
  blocks.push({ kind: 'heading', text: t(lang, 'pp.print.instructions') });
  blocks.push({ kind: 'line', text: t(lang, 'pp.print.i1') });
  blocks.push({ kind: 'line', text: t(lang, 'pp.print.i2') });
  const groups = [...new Set(data.questions.map((q) => q.choiceGroup).filter((g): g is string => !!g))];
  for (const g of groups) {
    const line = choiceLine(data, g, lang);
    const where = data.questions.find((q) => q.choiceGroup === g)?.section;
    if (line) blocks.push({ kind: 'line', text: where ? `${t(lang, 'pp.section', { section: where })}: ${line}` : line });
  }
  for (const run of runs(data.questions)) {
    if (run.section) {
      const group = run.questions.find((q) => q.choiceGroup)?.choiceGroup ?? null;
      const choice = group ? choiceLine(data, group, lang) : null;
      blocks.push({ kind: 'heading', text: [t(lang, 'pp.section', { section: run.section }), choice].filter(Boolean).join(' · ') });
    }
    for (const q of run.questions) {
      blocks.push({ kind: 'line', text: `${q.label}. ${q.prompt}  (${marksWords(q.maxMarks, lang)})` });
      for (const o of q.options) blocks.push({ kind: 'note', text: `(${o.key}) ${o.text}` });
    }
  }
  return blocks;
}

export function markingSchemeBlocks(data: PrintData, lang: Lang): CardBlock[] {
  const blocks: CardBlock[] = [];
  blocks.push({ kind: 'title', text: data.schoolName || data.examName });
  blocks.push({ kind: 'subtitle', text: t(lang, 'pp.print.schemeTitle', { exam: data.examName, className: data.className, subject: data.subjectName }) });
  blocks.push({ kind: 'line', text: t(lang, 'pp.print.teachersOnly'), strong: true });
  for (const q of data.questions) {
    blocks.push({ kind: 'heading', text: `${q.label} · ${marksWords(q.maxMarks, lang)}${q.section ? ` · ${t(lang, 'pp.section', { section: q.section })}` : ''}` });
    if (q.correct && 'keys' in q.correct) blocks.push({ kind: 'line', text: t(lang, 'pp.print.rightOption', { keys: q.correct.keys.join(', ') }), strong: true });
    if (q.correct && 'value' in q.correct)
      blocks.push({ kind: 'line', text: q.correct.tolerance > 0 ? t(lang, 'pp.print.valueWithin', { value: num(q.correct.value, lang), within: num(q.correct.tolerance, lang) }) : t(lang, 'pp.print.value', { value: num(q.correct.value, lang) }), strong: true });
    if (q.answerKey.trim()) blocks.push({ kind: 'line', text: t(lang, 'pp.print.answer', { answer: q.answerKey.trim() }) });
    for (const s of q.steps) blocks.push({ kind: 'note', text: `• ${s.step} (${marksWords(s.marks, lang)})` });
  }
  return blocks;
}
