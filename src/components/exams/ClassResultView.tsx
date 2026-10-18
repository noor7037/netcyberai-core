'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import type { ClassResult } from '@/lib/exams/results';
import { gradeWords, markWords, percentWords as percentOf } from './exam-format';
import { SECTION, TAP } from './SchemeParts';

// The class result of an exam (docs/27 row 9b, C214): each child of the class in roll order, with their marks in
// every paper, and each subject's percent and grade and their overall, by the grading scheme in force. Worked out on
// the server by percent() and grade(); absent and exempt are left out, never counted as zero. Never sorted by marks,
// and no rank or position is shown (docs/27 section 3 rule 2). A phone shows one card a child; a wide screen a table.

export function ClassResultView({ examId, classId }: { examId: string; classId: string }) {
  const { t, lang } = useT();
  const [data, setData] = useState<ClassResult | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/app/exams/${examId}/classes/${classId}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as ClassResult | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, [examId, classId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ex.result.failed')}</p>;
  if (!data) return null;
  const percentWords: typeof percentOf = (tt, lg, s) => (s.rounded === null ? '—' : percentOf(tt, lg, s));
  const who = (c: ClassResult['children'][number]) => (c.rollNo ? t('ex.entry.child', { roll: c.rollNo, name: c.name }) : c.name);

  return (
    <div lang={lang} data-class-result-view className="flex flex-col gap-4 text-sm text-slate">
      <section className={SECTION}>
        <h2 className="text-base font-bold">{data.exam.name} · {data.className}</h2>
        <div className="flex flex-wrap items-center gap-x-1">
          {data.publication && data.scheme ? (
            <p data-result-published={data.publication.version}>{t('rc.result.published', { version: data.publication.version, scheme: data.scheme.version })}</p>
          ) : (
            <p data-result-scheme>{data.scheme ? t('ex.result.scheme', { version: data.scheme.version }) : t('ex.result.noScheme')}</p>
          )}
          <InfoTip>{t('ex.result.order')}</InfoTip>
        </div>
        {data.notShown > 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.entry.notShown', { n: data.notShown })}</p>}
        <div className="flex flex-wrap gap-2">
          {data.scheme === null && <a href="/app/exams/scheme" className={TAP}>{t('ex.make.openScheme')}</a>}
          <a href={`/app/exams/${examId}/classes/${classId}/report-cards`} data-result-report-cards className={TAP}>{t('rc.result.open')}</a>
          <a href="/app/exams" className={TAP}>{t('ex.allExams')}</a>
        </div>
      </section>

      {!data.children.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.entry.noChildren')}</p>}

      {/* A phone: one card a child, in roll order. */}
      <ol className="flex flex-col gap-3 md:hidden" data-result-cards>
        {data.children.map((c) => (
          <li key={c.studentId} data-result-child={c.studentId} className="rounded-lg border border-slate/10 bg-white p-3">
            <p className="font-bold">{who(c)}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {data.papers.map((p, i) => (
                <li key={p.paperId}>
                  <p className="font-semibold">{p.subjectName}</p>
                  <p className="text-slate/70">{p.components.map((comp) => markWords(t, lang, comp, c.papers[i].marks[comp.key])).join(' · ')}</p>
                  <p>{percentWords(t, lang, c.papers[i])} · {gradeWords(t, c.papers[i])}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-slate/10 pt-2 font-semibold">{t('ex.result.overall')}: {percentWords(t, lang, c.overall)} · {gradeWords(t, c.overall)}</p>
          </li>
        ))}
      </ol>

      {/* A wide screen: one table, in roll order. */}
      <div className="hidden rounded-lg border border-slate/10 bg-white md:block">
        <table className="w-full text-left" data-result-table>
          <caption className="sr-only">{data.exam.name} · {data.className}</caption>
          <thead>
            <tr className="border-b border-slate/10">
              <th scope="col" className="p-3">{t('ex.result.child')}</th>
              {data.papers.map((p) => (
                <th key={p.paperId} scope="col" className="p-3">{p.subjectName}</th>
              ))}
              <th scope="col" className="p-3">{t('ex.result.overall')}</th>
            </tr>
          </thead>
          <tbody>
            {data.children.map((c) => (
              <tr key={c.studentId} data-result-row={c.studentId} className="border-b border-slate/10 align-top">
                <th scope="row" className="p-3 font-semibold">{who(c)}</th>
                {data.papers.map((p, i) => (
                  <td key={p.paperId} className="p-3">
                    <p className="text-slate/70">{p.components.map((comp) => markWords(t, lang, comp, c.papers[i].marks[comp.key])).join(' · ')}</p>
                    <p data-result-cell>{percentWords(t, lang, c.papers[i])} · {gradeWords(t, c.papers[i])}</p>
                  </td>
                ))}
                <td className="p-3 font-semibold">{percentWords(t, lang, c.overall)} · {gradeWords(t, c.overall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
