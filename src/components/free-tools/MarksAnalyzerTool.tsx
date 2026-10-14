'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { parseCsv } from '@/lib/import/csv';
import { UI, type Lang } from '@/lib/free-tools/engine';
import { analyseMarks, type MarksInput, type StudentMarks, type Subject } from '@/lib/free-tools/marks';
import { withSchool } from '@/lib/free-tools/report';
import { LangToggle } from './ToolShell';
import { ReportActions, btnQuiet, useToday } from './ReportActions';
import { ReportView } from './ReportView';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { useSchoolProfile } from './useSchoolProfile';

const RULES_UPDATED = '27 September 2026';
const KEY = 'nca-free-tool:exam-marks-analyzer';
const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';

const BLANK: MarksInput = {
  exam: '',
  subjects: [{ name: '', max: '100', pass: '33' }],
  students: [{ name: '', roll: '', marks: {}, previous: '' }],
  grades: 'A1:91, A2:81, B1:71, B2:61, C1:51, C2:41, D:33, E:0',
  atRiskBelow: '40',
};

const T = {
  exam: { en: 'Exam name', hi: 'Exam ka naam' },
  subjects: { en: 'Subjects', hi: 'Subjects' },
  subject: { en: 'Subject', hi: 'Subject' },
  max: { en: 'Maximum marks', hi: 'Maximum marks' },
  pass: { en: 'Pass marks', hi: 'Pass marks' },
  addSubject: { en: 'Add subject', hi: 'Subject jodein' },
  students: { en: 'Marks', hi: 'Marks' },
  student: { en: 'Student', hi: 'Student' },
  roll: { en: 'Roll', hi: 'Roll' },
  previous: { en: 'Previous %', hi: 'Pichhla %' },
  addStudent: { en: 'Add student', hi: 'Student jodein' },
  grades: { en: 'Grade scale (grade:lowest percentage)', hi: 'Grade scale (grade:sabse kam percentage)' },
  gradesHelp: {
    en: 'Change this to your board’s or school’s scale. Example shown is the common eight-band scale.',
    hi: 'Apne board ya school ka scale likhein. Dikhaya gaya aam aath-band scale hai.',
  },
  risk: { en: 'At-risk below (overall %)', hi: 'At-risk seema (kul %)' },
  csvHelp: {
    en: 'CSV columns: Student, Roll, one column per subject (same names as above), Previous %. Write AB for absent.',
    hi: 'CSV columns: Student, Roll, har subject ka ek column (upar wale naam), Previous %. Absent ke liye AB likhein.',
  },
};

export function MarksAnalyzerTool({ example }: { example: MarksInput }) {
  const [lang, setLang] = useState<Lang>('en');
  const [data, setData] = useState<MarksInput>(example);
  const [isExample, setIsExample] = useState(true);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const today = useToday();
  const L = (k: keyof typeof T) => T[k][lang];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        setData({ ...BLANK, ...(JSON.parse(raw) as MarksInput) });
        setIsExample(false);
      }
    } catch {
      /* nothing saved */
    }
  }, []);

  const update = (next: MarksInput) => {
    setData(next);
    setIsExample(false);
  };
  const setSubject = (i: number, patch: Partial<Subject>) => {
    const old = data.subjects[i].name;
    const subjects = data.subjects.map((s, j) => (j === i ? { ...s, ...patch } : s));
    // Renaming a subject carries its marks over to the new name.
    const students =
      patch.name !== undefined && patch.name !== old
        ? data.students.map((st) => {
            const marks = { ...st.marks, [patch.name as string]: st.marks[old] ?? '' };
            delete marks[old];
            return { ...st, marks };
          })
        : data.students;
    update({ ...data, subjects, students });
  };
  const setStudent = (i: number, patch: Partial<StudentMarks>) => update({ ...data, students: data.students.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const result = useMemo(() => analyseMarks(data, lang), [data, lang]);
  const { profile } = useSchoolProfile();
  const report = useMemo(() => withSchool(result.report, profile), [result.report, profile]);
  const names = data.subjects.map((s) => s.name).filter(Boolean);

  async function importCsv(file: File) {
    if (file.size > 2_000_000) return setMsg(lang === 'en' ? 'That file is over 2 MB.' : 'File 2 MB se badi hai.');
    const table = parseCsv(await file.text());
    if (table.length < 2) return setMsg(lang === 'en' ? 'The file has no data rows.' : 'File mein data rows nahi.');
    const head = table[0].map((h) => h.trim());
    const find = (...keys: string[]) => head.findIndex((h) => keys.includes(h.toLowerCase()));
    const iName = find('student', 'name', 'student name');
    const iRoll = find('roll', 'roll no', 'roll number');
    const iPrev = find('previous %', 'previous', 'previous percentage');
    const subjectCols = head.map((h, i) => ({ h, i })).filter(({ i }) => ![iName, iRoll, iPrev].includes(i) && head[i]);
    if (iName < 0 || subjectCols.length === 0) return setMsg(lang === 'en' ? 'Need a Student column and at least one subject column.' : 'Student column aur kam se kam ek subject column chahiye.');
    const existing = new Map(data.subjects.map((s) => [s.name.toLowerCase(), s]));
    const subjects = subjectCols.map(({ h }) => existing.get(h.toLowerCase()) ?? { name: h, max: '100', pass: '33' });
    const students = table.slice(1, 301).map((r) => ({
      name: (r[iName] ?? '').trim(),
      roll: iRoll >= 0 ? (r[iRoll] ?? '').trim() : '',
      previous: iPrev >= 0 ? (r[iPrev] ?? '').trim() : '',
      marks: Object.fromEntries(subjectCols.map(({ h, i }) => [h, (r[i] ?? '').trim()])),
    }));
    update({ ...data, subjects, students });
    setMsg(lang === 'en' ? `Imported ${students.length} students and ${subjects.length} subjects. Check maximum and pass marks.` : `${students.length} students aur ${subjects.length} subjects import hue. Maximum aur pass marks jaanchein.`);
  }

  function exportTemplate() {
    const head = ['Student', 'Roll', ...names, 'Previous %'];
    const lines = [head, ...data.students.map((s) => [s.name, s.roll, ...names.map((n) => s.marks[n] ?? ''), s.previous])];
    const csv = lines.map((l) => l.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marks.csv';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-col gap-8">
      <SchoolProfilePanel compact />
      <div className="flex flex-wrap items-center gap-2">
        <LangToggle lang={lang} setLang={setLang} />
        <button type="button" className={btnQuiet} onClick={() => (setData(example), setIsExample(true))}>
          <Icon name="sparkle" className="h-4 w-4" /> {UI.example[lang]}
        </button>
        <button type="button" className={btnQuiet} onClick={() => (setData(BLANK), setIsExample(false))}>
          {UI.reset[lang]}
        </button>
        <button
          type="button"
          className={btnQuiet}
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, JSON.stringify(data));
              setMsg(UI.saved[lang]);
            } catch {
              setMsg(lang === 'en' ? 'This browser does not allow saving.' : 'Ye browser save nahi karne deta.');
            }
          }}
        >
          <Icon name="check" className="h-4 w-4" /> {UI.save[lang]}
        </button>
        <button
          type="button"
          className={btnQuiet}
          onClick={() => {
            try {
              window.localStorage.removeItem(KEY);
            } catch {
              /* nothing saved */
            }
            setMsg('');
          }}
        >
          {UI.clearSaved[lang]}
        </button>
      </div>
      {isExample && <p className="rounded-xl border border-amber bg-white p-3 text-sm font-semibold text-amber-text">{UI.exampleBanner[lang]}</p>}

      <form className="grid grid-cols-1 gap-6 rounded-3xl border border-slate/10 bg-white p-5 lg:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mk-exam" className="text-sm font-medium text-slate">
              {L('exam')}
            </label>
            <input id="mk-exam" className={inputCls} maxLength={60} value={data.exam} onChange={(e) => update({ ...data, exam: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mk-grades" className="text-sm font-medium text-slate">
              {L('grades')}
            </label>
            <input id="mk-grades" aria-describedby="mk-grades-help" className={inputCls} value={data.grades} onChange={(e) => update({ ...data, grades: e.target.value })} />
            <p id="mk-grades-help" className="text-xs text-slate/70">
              {L('gradesHelp')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mk-risk" className="text-sm font-medium text-slate">
              {L('risk')}
            </label>
            <input id="mk-risk" type="number" inputMode="decimal" min={0} max={100} className={inputCls} value={data.atRiskBelow} onChange={(e) => update({ ...data, atRiskBelow: e.target.value })} />
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-extrabold text-sapphire">{L('subjects')}</legend>
          {data.subjects.map((s, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_44px] items-end gap-2">
              <input aria-label={`${L('subject')} ${i + 1}`} placeholder={L('subject')} className={inputCls} maxLength={30} value={s.name} onChange={(e) => setSubject(i, { name: e.target.value })} />
              <input aria-label={`${L('max')}, ${s.name || i + 1}`} title={L('max')} type="number" inputMode="decimal" min={1} className={inputCls} value={s.max} onChange={(e) => setSubject(i, { max: e.target.value })} />
              <input aria-label={`${L('pass')}, ${s.name || i + 1}`} title={L('pass')} type="number" inputMode="decimal" min={0} className={inputCls} value={s.pass} onChange={(e) => setSubject(i, { pass: e.target.value })} />
              <button
                type="button"
                aria-label={`${UI.remove[lang]} ${s.name || i + 1}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md text-red-800 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                onClick={() => update({ ...data, subjects: data.subjects.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <p className="text-xs text-slate/70">
            {L('subject')} · {L('max')} · {L('pass')}
          </p>
          <button type="button" className={`${btnQuiet} w-fit`} disabled={data.subjects.length >= 15} onClick={() => update({ ...data, subjects: [...data.subjects, { name: '', max: '100', pass: '33' }] })}>
            + {L('addSubject')}
          </button>
        </fieldset>

        <fieldset className="flex flex-col gap-2 lg:col-span-2">
          <legend className="mb-1 text-base font-extrabold text-sapphire">{L('students')}</legend>
          <p className="text-sm text-slate/70">{L('csvHelp')}</p>
          <div className="nca-scroll relative overflow-x-auto" role="region" aria-label={L('students')} tabIndex={0}>
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="px-1 text-left text-xs font-bold text-slate">
                    {L('roll')}
                  </th>
                  <th scope="col" className="px-1 text-left text-xs font-bold text-slate">
                    {L('student')}
                  </th>
                  {names.map((nm) => (
                    <th key={nm} scope="col" className="px-1 text-left text-xs font-bold text-slate">
                      {nm}
                    </th>
                  ))}
                  <th scope="col" className="px-1 text-left text-xs font-bold text-slate">
                    {L('previous')}
                  </th>
                  <th scope="col">
                    <span className="sr-only">{UI.remove[lang]}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, i) => (
                  <tr key={i}>
                    <td className="p-1">
                      <input aria-label={`${L('roll')}, row ${i + 1}`} className={`${inputCls} w-16`} maxLength={10} value={s.roll} onChange={(e) => setStudent(i, { roll: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <input aria-label={`${L('student')}, row ${i + 1}`} className={`${inputCls} min-w-[9rem]`} maxLength={60} value={s.name} onChange={(e) => setStudent(i, { name: e.target.value })} />
                    </td>
                    {names.map((nm) => (
                      <td key={nm} className="p-1">
                        <input
                          aria-label={`${nm}, ${s.name || `row ${i + 1}`}`}
                          className={`${inputCls} w-20`}
                          inputMode="decimal"
                          maxLength={6}
                          value={s.marks[nm] ?? ''}
                          onChange={(e) => setStudent(i, { marks: { ...s.marks, [nm]: e.target.value } })}
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <input aria-label={`${L('previous')}, ${s.name || `row ${i + 1}`}`} className={`${inputCls} w-20`} inputMode="decimal" maxLength={6} value={s.previous} onChange={(e) => setStudent(i, { previous: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <button
                        type="button"
                        aria-label={`${UI.remove[lang]} ${s.name || `row ${i + 1}`}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-red-800 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                        onClick={() => update({ ...data, students: data.students.filter((_, j) => j !== i) })}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnQuiet} disabled={data.students.length >= 300} onClick={() => update({ ...data, students: [...data.students, { name: '', roll: '', marks: {}, previous: '' }] })}>
              + {L('addStudent')}
            </button>
            <button type="button" className={btnQuiet} onClick={() => fileRef.current?.click()}>
              <Icon name="download" className="h-4 w-4 rotate-180" /> {UI.importCsv[lang]}
            </button>
            <button type="button" className={btnQuiet} onClick={exportTemplate}>
              <Icon name="download" className="h-4 w-4" /> CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
                e.target.value = '';
              }}
            />
            <span role="status" className="text-sm font-semibold text-emerald-text">
              {msg}
            </span>
          </div>
        </fieldset>
      </form>
      <p className="flex items-start gap-2 text-sm text-slate/70">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /> {UI.privacy[lang]}
      </p>

      <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
        {result.errors.length > 0 ? (
          <div role="alert" className="rounded-3xl border-2 border-red-600 bg-white p-6">
            <p className="font-bold text-red-800">{UI.fixFirst[lang]}</p>
            <ul className="mt-2 list-disc pl-5 text-red-800">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <ReportActions report={report} lang={lang} fileBase={`Marks analysis ${data.exam}`} rulesUpdated={RULES_UPDATED} sourcePath="/free-tools/exam-marks-analyzer" />
            <ReportView report={report} meta={{ generatedOn: today, rulesUpdated: RULES_UPDATED, rulesLabel: UI.lastUpdated[lang], assumptionsLabel: UI.assumptions[lang] }} />
          </>
        )}
      </div>
    </div>
  );
}
