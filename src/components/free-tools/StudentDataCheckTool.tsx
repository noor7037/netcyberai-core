'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { STUDENT_DATA_CHECK_EXAMPLE_CSV } from '@/demo-fixture/student-data-check-example';
import { hasProfile } from '@/lib/free-tools/school-profile';
import { withSchool } from '@/lib/free-tools/report';
import {
  AADHAAR_NOTICE,
  MAX_STUDENTS,
  SDC_COLUMNS,
  SDC_TEMPLATE_CSV,
  checkStudents,
  dataCheckReport,
  lettersFor,
  mismatchClasses,
  mismatchesCsv,
  parseStudentList,
  studentsToCsv,
  studentsWithMismatch,
  type CorrectionLetter,
  type ParsedList,
} from '@/lib/free-tools/student-data-check';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import { usePrint } from './PrintPortal';
import { ReportActions, btnLine, btnQuiet, btnSolid, useToday } from './ReportActions';
import { ReportView } from './ReportView';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { StudentDataCheckLetter } from './StudentDataCheckLetter';
import { useSchoolProfile } from './useSchoolProfile';

const RULES_UPDATED = '14 October 2026';
const SOURCE = '/free-tools/student-data-check';
const MAX_BYTES = 1024 * 1024;
// A letters PDF is one 300 DPI page per letter; past this, one class at a time.
const MAX_PDF_LETTERS = 100;
const MAX_LETTER_ROWS = 500;
const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';

const csvBlob = (csv: string) => new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });

// Student Data Check for UDISE+ and APAAR (content: src/content/free-tools.ts,
// slug student-data-check). The list stays in this tab; nothing is saved
// or sent, and the Aadhaar number is never asked for.
export function StudentDataCheckTool() {
  const [text, setText] = useState('');
  const [isExample, setIsExample] = useState(false);
  const [parsed, setParsed] = useState<ParsedList | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [letterClass, setLetterClass] = useState('');
  const [letterMsg, setLetterMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const today = useToday();
  const { profile } = useSchoolProfile();
  const { print, portal } = usePrint();

  const checked = useMemo(() => (parsed && !parsed.missingColumns.length ? checkStudents(parsed.students) : []), [parsed]);
  const report = useMemo(() => withSchool(dataCheckReport(checked), profile), [checked, profile]);
  const mismatched = useMemo(() => studentsWithMismatch(checked), [checked]);
  const classes = useMemo(() => mismatchClasses(checked), [checked]);
  const letters = useMemo(() => lettersFor(checked, letterClass), [checked, letterClass]);
  const dateLine = [profile.place.trim(), today].filter(Boolean).join(', ');
  const signOff = useMemo(() => {
    const l = [profile.signName.trim(), profile.signTitle.trim()].filter(Boolean);
    return l.length ? l : [hasProfile(profile) ? `For ${profile.schoolName.trim()}` : 'For the school'];
  }, [profile]);

  function run(csv: string) {
    setError('');
    setMsg('');
    setLetterMsg('');
    setLetterClass('');
    if (!csv.trim()) {
      setParsed(null);
      setError('Paste a CSV or open a file first.');
      return;
    }
    const p = parseStudentList(csv);
    setParsed(p);
    if (!p.missingColumns.length && p.students.length === 0) setError('No student rows found. The file needs a header row and at least one student.');
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('That file is over 1 MB. Split it by class and check each file.');
      return;
    }
    file
      .text()
      .then((t) => {
        setText(t);
        setIsExample(false);
        run(t);
      })
      .catch(() => setError('That file could not be read. Save it as CSV (comma separated) and try again.'));
  }

  function loadExample() {
    setText(STUDENT_DATA_CHECK_EXAMPLE_CSV);
    setIsExample(true);
    run(STUDENT_DATA_CHECK_EXAMPLE_CSV);
  }

  function clearAll() {
    setText('');
    setIsExample(false);
    setParsed(null);
    setError('');
    setMsg('');
    setLetterMsg('');
  }

  function saveList() {
    const p = parseStudentList(text);
    if (!text.trim() || p.missingColumns.length || !p.students.length) {
      setMsg('There is no complete list to save yet. Check the columns first.');
      return;
    }
    downloadBlob(csvBlob(studentsToCsv(p.students)), 'student-data-check-list.csv');
    setMsg(p.droppedColumns.length ? 'Saved on your computer, without the column that looked like Aadhaar numbers.' : 'Saved on your computer.');
  }

  const letterNode = (l: CorrectionLetter, i: number) => <StudentDataCheckLetter key={l.row} letter={l} school={report.school} dateLine={dateLine} signOff={signOff} newPage={i > 0} />;

  async function lettersPdf() {
    if (letters.length > MAX_PDF_LETTERS) {
      setLetterMsg(`A PDF holds up to ${MAX_PDF_LETTERS} letters at a time. Choose one class above, or print the letters instead.`);
      return;
    }
    setBusy(true);
    setLetterMsg('');
    try {
      const { lettersPdf: make } = await import('@/lib/pdf/letter-canvas');
      const blob = await make(letters, { school: report.school, dateLine, signOff });
      downloadBlob(blob, safeFilename(`Correction letters ${letterClass}`, 'pdf'));
    } catch (e) {
      setLetterMsg((e as Error).message || 'The PDF could not be made in this browser. Print the letters instead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SchoolProfilePanel compact />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnQuiet} onClick={loadExample}>
          <Icon name="sparkle" className="h-4 w-4" /> Try an example
        </button>
        <button type="button" className={btnQuiet} onClick={clearAll}>
          Clear
        </button>
      </div>
      {isExample && <p className="rounded-xl border border-amber bg-white p-3 text-sm font-semibold text-amber-text">Example data: fictional students. Replace it with your own list.</p>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6">
          <label htmlFor="sdc-file" className="text-sm font-bold text-slate">
            Open a CSV file (up to 1 MB)
          </label>
          <input
            id="sdc-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
            className="text-sm text-slate file:mr-3 file:min-h-[44px] file:rounded-md file:border-0 file:bg-royal/10 file:px-4 file:font-semibold file:text-royal-deep"
          />
          <label htmlFor="sdc-paste" className="text-sm font-bold text-slate">
            Or paste it here
          </label>
          <textarea
            id="sdc-paste"
            rows={8}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setIsExample(false);
            }}
            placeholder={SDC_TEMPLATE_CSV}
            spellCheck={false}
            className="w-full rounded-xl border border-slate/20 bg-white px-4 py-3 font-mono text-sm text-slate placeholder:text-slate/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSolid} onClick={() => run(text)}>
              <Icon name="check" className="h-4 w-4" /> Check my list
            </button>
            <button type="button" className={btnLine} onClick={() => downloadBlob(csvBlob(SDC_TEMPLATE_CSV), 'student-data-check-template.csv')}>
              <Icon name="download" className="h-4 w-4" /> Download CSV template
            </button>
            <button type="button" className={btnQuiet} onClick={saveList}>
              <Icon name="download" className="h-4 w-4" /> Save list as CSV
            </button>
          </div>
          <p role="status" className="text-sm font-semibold text-emerald-text empty:hidden">
            {msg}
          </p>
          <p className="flex items-start gap-2 text-sm text-slate/70">
            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /> Read in your browser only. Nothing is sent to NetCyberAI, and closing the tab clears the list.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-3xl bg-off-white p-6">
          <p className="text-sm font-bold text-slate">Columns in the file</p>
          <ul className="flex flex-col gap-2">
            {SDC_COLUMNS.map((c) => (
              <li key={c.key} className="text-sm text-slate">
                <code className="rounded bg-white px-1.5 py-0.5 font-semibold">{c.key}</code>
                {c.required ? <span className="ml-1 font-semibold text-red-800">required</span> : <span className="ml-1 text-slate/70">optional</span>}
                <span className="block text-slate/70">{c.hint}</span>
              </li>
            ))}
          </ul>
          <p className="rounded-xl bg-white p-3 text-sm font-semibold text-slate">
            Never add the Aadhaar number. The check needs only the name, date of birth and gender as printed on Aadhaar.
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-6" aria-live="polite">
        {error && (
          <p role="alert" className="rounded-2xl border border-red-600 bg-white p-4 font-semibold text-red-800">
            {error}
          </p>
        )}
        {parsed && parsed.droppedColumns.length > 0 && (
          <p role="alert" className="rounded-2xl border border-amber bg-white p-4 text-sm font-semibold text-amber-text">
            {AADHAAR_NOTICE} {`Left out of this check: ${parsed.droppedColumns.join(', ')}.`}
          </p>
        )}
        {parsed && parsed.missingColumns.length > 0 && (
          <p role="alert" className="rounded-2xl border border-red-600 bg-white p-4 font-semibold text-red-800">
            {`Missing column: ${parsed.missingColumns.join(', ')}. Add it to the first row; the template has every column.`}
          </p>
        )}
        {parsed && parsed.unknownColumns.length > 0 && (
          <p className="rounded-2xl bg-gold/15 p-4 text-sm text-slate">{`These columns are not used and were ignored: ${parsed.unknownColumns.join(', ')}.`}</p>
        )}
        {parsed?.truncated && <p className="rounded-2xl bg-gold/15 p-4 text-sm text-slate">{`Only the first ${MAX_STUDENTS} students were checked. Split the list by class and check each part.`}</p>}

        {checked.length > 0 && (
          <>
            <ReportActions report={report} lang="en" fileBase="Student data check" rulesUpdated={RULES_UPDATED} sourcePath={SOURCE} />
            <ReportView report={report} meta={{ generatedOn: today, rulesUpdated: RULES_UPDATED, rulesLabel: 'Rules last updated', assumptionsLabel: 'Assumptions' }} />
            {mismatched.length > 0 && (
              <button type="button" className={`${btnQuiet} w-fit`} onClick={() => downloadBlob(csvBlob(mismatchesCsv(checked)), 'student-data-mismatches.csv')}>
                <Icon name="download" className="h-4 w-4" /> Download mismatches CSV
              </button>
            )}

            <section aria-labelledby="sdc-letters" className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5 sm:p-8">
              <h2 id="sdc-letters" className="text-2xl font-extrabold text-sapphire">
                Correction letters
              </h2>
              <p className="text-slate/70">One letter for each student with a difference. It shows both versions side by side, asks the family which is right, and leaves space to sign.</p>
              {!report.school && (
                <p className="rounded-xl bg-gold/15 p-3 text-sm text-slate">Add your school’s details at the top of this page to print your name, address, codes and logo on every letter.</p>
              )}
              {mismatched.length === 0 ? (
                <p className="font-semibold text-emerald-text">No letters are needed: every student’s details match.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
                      <label htmlFor="sdc-class" className="text-sm font-medium text-slate">
                        Letters for
                      </label>
                      <select id="sdc-class" className={inputCls} value={letterClass} onChange={(e) => (setLetterClass(e.target.value), setLetterMsg(''))}>
                        <option value="">{`Every class (${mismatched.length})`}</option>
                        {classes.map((c) => (
                          <option key={c} value={c}>{`Class ${c}`}</option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className={btnSolid} disabled={!letters.length} onClick={() => print(<div>{letters.map(letterNode)}</div>)}>
                      <Icon name="reports" className="h-4 w-4" /> Print all letters
                    </button>
                    <button type="button" className={btnLine} disabled={busy || !letters.length} onClick={lettersPdf}>
                      <Icon name="download" className="h-4 w-4" /> {busy ? 'Preparing PDF…' : 'Download letters PDF'}
                    </button>
                  </div>
                  <p role="status" className="text-sm font-semibold text-red-800 empty:hidden">
                    {letterMsg}
                  </p>
                  <div className="nca-scroll relative overflow-x-auto" role="region" aria-label="Correction letters" tabIndex={0}>
                    <table className="w-full min-w-[34rem] border-collapse text-sm">
                      <thead>
                        <tr className="bg-off-white">
                          <th scope="col" className="border-b border-slate/20 px-3 py-2 text-left font-bold text-slate">
                            Student
                          </th>
                          <th scope="col" className="border-b border-slate/20 px-3 py-2 text-left font-bold text-slate">
                            Class
                          </th>
                          <th scope="col" className="border-b border-slate/20 px-3 py-2 text-left font-bold text-slate">
                            What differs
                          </th>
                          <th scope="col" className="border-b border-slate/20 px-3 py-2 text-left font-bold text-slate">
                            <span className="sr-only">Letter</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {letters.slice(0, MAX_LETTER_ROWS).map((l) => (
                          <tr key={l.row} className="border-b border-slate/10 text-slate">
                            <td className="px-3 py-2">{l.student}</td>
                            <td className="px-3 py-2">{l.className || '—'}</td>
                            <td className="px-3 py-2">{l.fields.map((f) => `${f.label}: ${f.finding.toLowerCase()}`).join('; ')}</td>
                            <td className="px-3 py-1 text-right">
                              <button type="button" className={btnQuiet} aria-label={`Print letter for ${l.student}`} onClick={() => print(letterNode(l, 0))}>
                                Print letter
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {letters.length > MAX_LETTER_ROWS && (
                    <p className="text-sm text-slate/70">{`The first ${MAX_LETTER_ROWS} of ${letters.length} letters are listed here. Print all letters includes every one.`}</p>
                  )}
                  {letters[0] && (
                    <details className="flex flex-col gap-3">
                      <summary className={`${btnQuiet} w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>See the first letter</summary>
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate/20">{letterNode(letters[0], 0)}</div>
                    </details>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
      {portal}
    </div>
  );
}
