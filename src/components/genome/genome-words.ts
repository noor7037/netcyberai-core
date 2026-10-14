import { numberWords } from '@/components/exams/exam-format';
import type { Finding } from '@/lib/genome/rules';
import { tCount, type Lang, type MessageKey } from '@/lib/i18n';

// How the Learning Genome says a finding, and the line it was held against (C217). The numbers are the server's
// (src/lib/genome); this file only puts them into words.

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

export function findingWords(t: T, lang: Lang, f: Finding): { text: string; line: string } {
  const pct = (n: number) => t('ex.result.percent', { percent: numberWords(n, lang) });
  const n = (v: number) => numberWords(v, lang);
  switch (f.rule) {
    case 'rising':
    case 'falling':
      return {
        text: tCount(lang, `gn.f.${f.rule}`, f.points, { count: n(f.points), subject: f.subjectName, before: pct(f.before.rounded), beforeExam: f.before.examName, after: pct(f.after.rounded), afterExam: f.after.examName }),
        line: t('gn.line.trend', { line: n(f.line) }),
      };
    case 'above_own':
    case 'below_own':
      return {
        text: tCount(lang, `gn.f.${f.rule}`, f.points, { count: n(f.points), subject: f.subjectName, exam: f.examName, percent: pct(f.rounded), overall: pct(f.overall) }),
        line: t('gn.line.spread', { line: n(f.line) }),
      };
    case 'understood':
    case 'needs_help':
      return {
        text: tCount(lang, `gn.f.${f.rule}`, f.count, { count: n(f.count), subject: f.subjectName, chapter: f.chapter, class: f.className }),
        line: t(f.rule === 'understood' ? 'gn.line.understood' : 'gn.line.needs_help', { line: n(f.line) }),
      };
    case 'homework':
      return {
        text: t('gn.f.homework', { subject: f.subjectName, done: n(f.done), checked: n(f.checked) }),
        line: t('gn.line.homework', { line: n(f.line), min: n(f.min) }),
      };
  }
}
