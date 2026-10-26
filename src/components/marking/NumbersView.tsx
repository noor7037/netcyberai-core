'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import type { ClassNumbers } from '@/lib/marking/numbers';
import { ask } from './parts';

// One class's exam numbers, in roll order, ready to print (C348): the number each candidate sits the exam under, beside
// their roll number and name. Children the office withdrew from this exam are left off the list and counted under it.
// A school that does not use exam numbers gets the roll list. Roll numbers are never changed by exam numbers.

export function NumbersView({ examId, classId }: { examId: string; classId: string }) {
  const { t, lang } = useT();
  const [data, setData] = useState<ClassNumbers | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void ask('GET', `/api/app/exams/${examId}/classes/${classId}/numbers`).then((r) => {
      setFailed(!r.ok);
      if (r.ok) setData(r.body as unknown as ClassNumbers);
    });
  }, [examId, classId]);

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('mk.numbers.failed')}</p>;
  if (!data) return null;
  const sitting = data.children.filter((c) => !c.withdrawn);
  const withdrawn = data.children.length - sitting.length;
  const seat = data.numbering === 'seat';

  return (
    <div lang={lang} data-numbers-list={classId} className="flex flex-col gap-4 text-sm text-slate">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{data.examName} · {data.className}</h2>
          {data.term && <p className="text-slate/70">{t('ex.exam.term', { term: data.term })}</p>}
          <p data-numbers-count className="text-slate/70">{t('mk.numbers.count', { n: sitting.length })}{withdrawn > 0 ? ` · ${t('mk.numbers.withdrawn', { n: withdrawn })}` : ''}</p>
          {!seat && <p data-numbers-off className="mt-1 rounded-md bg-off-white px-3 py-2 print:hidden">{t('mk.numbers.off')}</p>}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href="/app/exams" className={TAP}>{t('ex.allExams')}</a>
          <button type="button" data-print className={PRIMARY} onClick={() => window.print()}>{t('mk.numbers.print')}</button>
        </div>
      </div>

      {sitting.length === 0 ? (
        <p className="rounded-md bg-off-white px-3 py-2">{t('mk.numbers.none')}</p>
      ) : (
        <table data-numbers-table className="w-full border-collapse text-left text-base">
          <thead>
            <tr className="border-b-2 border-slate/40">
              {seat && <th scope="col" className="py-2 pr-4 font-bold">{t('mk.numbers.number')}</th>}
              <th scope="col" className="py-2 pr-4 font-bold">{t('mk.numbers.roll')}</th>
              <th scope="col" className="py-2 font-bold">{t('mk.numbers.name')}</th>
            </tr>
          </thead>
          <tbody>
            {sitting.map((c) => (
              <tr key={c.studentId} data-number-row={c.studentId} className="border-b border-slate/20">
                {seat && <td className="py-2 pr-4 font-bold tabular-nums">{c.seatNo ?? '—'}</td>}
                <td className="py-2 pr-4 tabular-nums">{c.rollNo ?? '—'}</td>
                <td className="py-2">{c.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-slate/70 print:hidden">{t('mk.numbers.note')}</p>
    </div>
  );
}
