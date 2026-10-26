'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { dayWords, numberWords } from '@/components/exams/exam-format';
import { SECTION, TAP } from '@/components/exams/SchemeParts';
import { tCount, type MessageKey } from '@/lib/i18n';
import type { PaperInsights } from '@/lib/marking/insights';

// A paper's class view (C352), as the server worked it out from the class's approved answer sheets: question by
// question (average marks out of the most, how many attempted, the most common kind of mistake), topic by topic (the
// class's marks out of the marks possible, with the questions it comes from), and the children who may need support
// by the school's own line. Questions are in the paper's order, topics in the syllabus map's order and children in
// roll order. Nothing is sorted by marks and no child is ranked or compared with another (docs/27 section 3 rule 2).

const LINK = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sapphire underline';
const CARD = 'rounded-lg border border-slate/10 bg-white p-3';

export function PaperInsightsView({ paperId }: { paperId: string }) {
  const { t } = useT();
  const [data, setData] = useState<PaperInsights | null>(null);
  const [problem, setProblem] = useState<'failed' | 'not_found' | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/app/exams/papers/${paperId}/insights`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as PaperInsights | null) : null;
    setProblem(got ? null : res?.status === 404 ? 'not_found' : 'failed');
    if (got) setData(got);
  }, [paperId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (problem === 'not_found') return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ins.paper.notFound')}</p>;
  if (problem === 'failed') return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ins.paper.failed')}</p>;
  if (!data) return null;
  return <PaperInsightsBody data={data} />;
}

// The class view as the server worked it out (the fetcher above, and the tests, give it the data).
export function PaperInsightsBody({ data }: { data: PaperInsights }) {
  const { t, lang } = useT();
  const n = (v: number) => numberWords(v, lang);
  const pct = (v: number) => t('ex.result.percent', { percent: n(v) });
  const p = data.paper;
  const who = (c: PaperInsights['support'][number]) => (c.rollNo ? t('ex.entry.child', { roll: c.rollNo, name: c.name }) : c.name);

  return (
    <div lang={lang} data-paper-insights={p.paperId} className="flex flex-col gap-4 text-sm text-slate">
      <section className={SECTION}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{p.date ? t('ins.paper.headDate', { exam: p.examName, subject: p.subjectName, class: p.className, date: dayWords(p.date, lang) }) : t('ins.paper.head', { exam: p.examName, subject: p.subjectName, class: p.className })}</h2>
          <InfoTip>{t('ins.paper.how')}</InfoTip>
        </div>
        <p data-insights-published={p.published}>{t(p.published ? 'ins.paper.published' : 'ins.paper.notPublished')}</p>
        <p data-insights-scripts={data.scripts.approved}>{tCount(lang, 'ins.paper.scripts', data.scripts.approved, { candidates: n(data.candidates) })}</p>
        {data.scripts.notCounted > 0 && <p data-insights-not-counted={data.scripts.notCounted}>{tCount(lang, 'ins.paper.notCounted', data.scripts.notCounted)}</p>}
        <div className="flex flex-wrap gap-2">
          <a href={`/app/exams/papers/${p.paperId}`} className={TAP}>{t('ins.paper.open')}</a>
          <a href="/app/exams" className={TAP}>{t('ex.allExams')}</a>
        </div>
      </section>

      {data.scripts.approved === 0 && (
        <section className={`${SECTION} border-dashed`} data-insights-empty>
          <h2 className="text-base font-bold">{t('ins.paper.none.title')}</h2>
          <p className="max-w-prose">{t('ins.paper.none.text')}</p>
        </section>
      )}

      {data.scripts.approved > 0 && (
        <>
          <section className={SECTION} data-insights-questions>
            <div className="flex flex-wrap items-center gap-x-1">
              <h2 className="text-base font-bold">{t('ins.questions.title')}</h2>
              <InfoTip tone="white">{t('ins.questions.how')}</InfoTip>
            </div>
            {!data.questions.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ins.questions.none')}</p>}
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.questions.map((q) => (
                <li key={q.questionId} id={`q-${q.questionId}`} data-insight-question={q.label} className={CARD}>
                  <p className="font-bold">{t('ins.question.head', { label: q.label, max: n(q.maxMarks) })}</p>
                  <p className="text-slate/70">{q.chapter && q.topic ? t('ins.question.topic', { chapter: q.chapter, topic: q.topic }) : t('ins.question.noTopic')}</p>
                  {q.counted > 0 && q.average !== null ? (
                    <>
                      <p data-insight-average>{t('ins.question.average', { average: n(q.average), max: n(q.maxMarks) })}</p>
                      <p data-insight-attempted>{t('ins.question.attempted', { attempted: n(q.attempted), counted: n(q.counted) })}</p>
                      <p data-insight-mistake={q.mistake?.kind ?? 'none'}>
                        {q.mistake ? t('ins.question.mistake', { kind: t(`ins.error.${q.mistake.kind}` as MessageKey), count: n(q.mistake.count) }) : t('ins.question.noMistake')}
                      </p>
                    </>
                  ) : (
                    <p data-insight-uncounted>{t('ins.question.uncounted')}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className={SECTION} data-insights-topics>
            <h2 className="text-base font-bold">{t('ins.ptopics.title')}</h2>
            {!data.topics.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ins.ptopics.none')}</p>}
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.topics.map((x) => (
                <li key={x.unitId ?? 'none'} data-insight-topic={x.unitId ?? 'none'} className={CARD}>
                  <p className="font-bold">{x.chapter && x.topic ? t('ins.question.topic', { chapter: x.chapter, topic: x.topic }) : t('ins.question.noTopic')}</p>
                  <p data-insight-topic-marks>{t('ins.ptopic.marks', { marks: n(x.marks), max: n(x.max), percent: pct(x.rounded) })}</p>
                  <p className="text-slate/70">{t('ins.ptopic.answers', { count: n(x.answers) })}</p>
                  <ul className="flex flex-wrap gap-x-1">
                    {x.questions.map((q) => (
                      <li key={q.questionId}>
                        <a href={`#q-${q.questionId}`} className={LINK} aria-label={t('ins.ptopic.goto', { label: q.label })}>
                          {q.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <section className={SECTION} data-insights-support={data.support.length}>
            <div className="flex flex-wrap items-center gap-x-1">
              <h2 className="text-base font-bold">{t('ins.support.title')}</h2>
              <InfoTip tone="white">{t('ins.support.how')}</InfoTip>
            </div>
            <p data-insights-support-line={data.supportBelow}>{t('ins.support.line', { line: n(data.supportBelow) })}</p>
            {!data.support.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ins.support.none')}</p>}
            <ul className="flex flex-col gap-2">
              {data.support.map((c) => (
                <li key={c.studentId} data-insight-support-child={c.studentId} className="rounded-md bg-off-white px-3 py-2">
                  <span className="font-semibold">{who(c)}</span> · {t('ins.support.marks', { marks: n(c.marks), max: n(c.max) })}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
