import type { Lang, MessageKey } from '@/lib/i18n';
import type { Mark, PaperComponent } from '@/lib/exams/papers';
import type { Shown } from '@/lib/exams/results';

// How the exams screens say a day, a mark and a result (C214). The numbers come from the server's percent() and
// grade(); this file only puts them into words.

type T = (key: MessageKey, params?: Record<string, string | number>) => string;
const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');

// A calendar day (YYYY-MM-DD) as the school says it.
export const dayWords = (ymd: string, lang: Lang) => new Intl.DateTimeFormat(locale(lang), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${ymd}T00:00:00Z`));
// A moment, in India.
export const momentWords = (iso: string, lang: Lang) => new Intl.DateTimeFormat(locale(lang), { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const numberWords = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { maximumFractionDigits: 1 });

// One component's mark: "Theory 40 of 80", "Theory: absent", "Theory: exempt", "Theory: not entered".
export function markWords(t: T, lang: Lang, c: PaperComponent, m: Mark | undefined): string {
  if (!m) return t('ex.mark.none', { part: c.name });
  if (m.kind === 'absent') return t('ex.mark.absent', { part: c.name });
  if (m.kind === 'exempt') return t('ex.mark.exempt', { part: c.name });
  return t('ex.mark.score', { part: c.name, score: numberWords(m.score ?? 0, lang), max: numberWords(c.max, lang) });
}

// The percent, as rounded by the scheme in force, and the grade, or why there is none.
export function percentWords(t: T, lang: Lang, s: Shown): string {
  return s.rounded === null ? t('ex.result.noPercent') : t('ex.result.percent', { percent: numberWords(s.rounded, lang) });
}
export function gradeWords(t: T, s: Shown): string {
  if (s.grade.kind === 'grade') return s.grade.meaning ? t('ex.result.gradeMeaning', { grade: s.grade.grade, meaning: s.grade.meaning }) : t('ex.result.grade', { grade: s.grade.grade });
  return t(`ex.noGrade.${s.grade.reason}` as MessageKey);
}
