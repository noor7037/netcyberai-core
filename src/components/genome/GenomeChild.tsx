'use client';

import { useT } from '@/components/app-shell/LangContext';
import { dayWords, gradeWords, markWords, numberWords, percentWords } from '@/components/exams/exam-format';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { SECTION } from '@/components/exams/SchemeParts';
import { Badge } from '@/components/ui/Badge';
import type { Finding, Genome } from '@/lib/genome/rules';
import { tCount } from '@/lib/i18n';
import { findingWords } from './genome-words';
import { GenomeTopics } from './GenomeTopics';

// One child's Learning Genome (C217), as the server worked it out: strengths and gaps first, each with the line it
// was held against; then each subject's exams (percent and grade, and the marks they come from) and homework; then
// each chapter's Daily Pulse replies and the lessons they answer. Every number says where it comes from. The child
// is compared only with themselves.

export function GenomeChild({ genome }: { genome: Genome }) {
  const { t, lang } = useT();
  const day = (ymd: string) => dayWords(ymd, lang);
  const g = genome;
  const placed = g.child.className
    ? g.child.rollNo
      ? t('gn.child.class', { class: g.child.className, roll: g.child.rollNo })
      : t('gn.child.classNoRoll', { class: g.child.className })
    : t('gn.child.noClass');

  return (
    <div className="flex flex-col gap-4" data-genome={g.child.studentId}>
      <section className={SECTION}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{g.child.name}</h2>
          <InfoTip label={t('gn.child.source')}>
            <p data-genome-period>{t('gn.child.period', { from: day(g.window.from), to: day(g.window.to) })}</p>
            <p className="mt-2">{g.scheme ? t('gn.child.scheme', { version: g.scheme.version }) : t('gn.child.noScheme')}</p>
          </InfoTip>
        </div>
        <p>{placed}</p>
        {g.latestOverall && (
          <p data-genome-overall>{t('gn.child.overall', { exam: g.latestOverall.examName, percent: percentWords(t, lang, g.latestOverall.shown) })}</p>
        )}
      </section>

      <FindingList kind="strengths" list={g.strengths} />
      <FindingList kind="gaps" list={g.gaps} />

      <section className={SECTION} data-genome-subjects>
        <h2 className="text-base font-bold">{t('gn.subjects.title')}</h2>
        {!g.subjects.length && <p className="rounded-md bg-off-white px-3 py-2">{t('gn.subjects.none')}</p>}
        <ul className="flex flex-col gap-3">
          {g.subjects.map((s) => (
            <li key={s.subjectId} data-genome-subject={s.subjectId} className="rounded-lg border border-slate/10 bg-white p-3">
              <h3 className="font-bold">{s.subjectName}</h3>
              {!s.exams.length && <p className="text-slate/70">{t('gn.subject.noExams')}</p>}
              <ol className="mt-2 flex flex-col gap-2">
                {s.exams.map((e) => (
                  <li key={e.paperId} data-genome-exam={e.paperId}>
                    <p className="font-semibold">{e.date ? t('gn.exam.headDate', { exam: e.examName, date: day(e.date), class: e.className }) : t('gn.exam.head', { exam: e.examName, class: e.className })}</p>
                    <p data-genome-percent>{percentWords(t, lang, e.shown)} · {gradeWords(t, e.shown)}</p>
                    <p className="text-slate/70">{t('gn.exam.from', { marks: e.components.map((c) => markWords(t, lang, c, e.marks[c.key])).join(' · ') })}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-2 border-t border-slate/10 pt-2" data-genome-homework>
                {s.homework.checked && s.homework.firstDue && s.homework.lastDue
                  ? t('gn.homework.count', { done: numberWords(s.homework.done, lang), checked: numberWords(s.homework.checked, lang), from: day(s.homework.firstDue), to: day(s.homework.lastDue) })
                  : t('gn.homework.none')}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className={SECTION} data-genome-chapters>
        <h2 className="text-base font-bold">{t('gn.chapters.title')}</h2>
        {!g.chapters.length && <p className="rounded-md bg-off-white px-3 py-2">{t('gn.chapters.none')}</p>}
        <ul className="flex flex-col gap-3">
          {g.chapters.map((c) => (
            <li key={`${c.classId}|${c.subjectId}|${c.chapter}`} data-genome-chapter={c.chapter} className="rounded-lg border border-slate/10 bg-white p-3">
              <p className="font-semibold">{t('gn.chapter.head', { subject: c.subjectName, chapter: c.chapter, class: c.className })}</p>
              <p data-genome-replies>{t('gn.chapter.counts', { needsHelp: numberWords(c.needsHelp, lang), understood: numberWords(c.understood, lang) })}</p>
              <p className="text-slate/70">{tCount(lang, 'gn.chapter.from', c.lessons, { count: numberWords(c.lessons, lang), first: day(c.firstTaught), last: day(c.lastTaught) })}</p>
            </li>
          ))}
        </ul>
      </section>

      <GenomeTopics genome={g} />
    </div>
  );
}

function FindingList({ kind, list }: { kind: 'strengths' | 'gaps'; list: readonly Finding[] }) {
  const { t, lang } = useT();
  return (
    <section className={SECTION} data-genome-findings={kind}>
      <h2 className="flex items-center gap-2 text-base font-bold">
        {t(kind === 'strengths' ? 'gn.strengths.title' : 'gn.gaps.title')}
        <Badge variant={kind === 'strengths' ? 'success' : 'warning'}>{numberWords(list.length, lang)}</Badge>
      </h2>
      {!list.length && <p className="text-slate/70">{t(kind === 'strengths' ? 'gn.strengths.none' : 'gn.gaps.none')}</p>}
      <ul className="flex flex-col gap-2">
        {list.map((f, i) => {
          const words = findingWords(t, lang, f);
          return (
            <li key={`${f.rule}|${f.subjectId}|${i}`} data-genome-finding={f.rule} className="rounded-md bg-off-white px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-1">
                <p className="min-w-0 flex-1 basis-48">{words.text}</p>
                <InfoTip label={t('gn.line.why')} tone="white">{words.line}</InfoTip>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
