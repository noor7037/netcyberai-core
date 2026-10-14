'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { UI } from '@/lib/free-tools/engine';
import { REMARKS_EXAMPLE, REMARKS_EXAMPLE_CLASS } from '@/demo-fixture/report-card-remarks-builder-example';
import { MAX_STUDENTS, blankStudent, draftClass, remarksCsv, remarksReport, remarksText, studentTemplateCsv, studentsFromCsv, studentsToCsv, type RemarkStudent } from '@/lib/free-tools/remarks';
import { withSchool } from '@/lib/free-tools/report';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import { RemarksBuilderStudent, inputCls } from './RemarksBuilderStudent';
import { ReportActions, btnLine, btnQuiet, btnSolid, useToday } from './ReportActions';
import { ReportView } from './ReportView';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { useSchoolProfile } from './useSchoolProfile';

const SLUG = 'report-card-remarks-builder';
const RULES_UPDATED = '14 October 2026';
const MAX_BYTES = 1024 * 1024;

const csvBlob = (csv: string) => new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });

// The class stays in this tab's memory only: no "Keep on this device"
// for children's marks and remarks. A CSV file is how a teacher keeps it.
export function RemarksBuilderTool() {
  const id = useId();
  const [students, setStudents] = useState<RemarkStudent[]>([]);
  const [className, setClassName] = useState('');
  const [isExample, setIsExample] = useState(false);
  // "Draft again" pins a student to a later draft number; edits are the
  // teacher's own text, kept until Draft again.
  const [pinned, setPinned] = useState<Record<string, number>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [problems, setProblems] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const todayLabel = useToday();
  const { profile } = useSchoolProfile();

  const say = (text: string, bad = false) => setMsg({ text, bad });
  const drafts = useMemo(() => draftClass(students, pinned), [students, pinned]);
  const remarks = useMemo(() => Object.fromEntries(students.map((s) => [s.id, edits[s.id] ?? drafts.text[s.id] ?? ''])), [students, edits, drafts]);
  const named = students.filter((s) => s.name.trim());
  const report = useMemo(() => withSchool(remarksReport(students, remarks, className), profile), [students, remarks, className, profile]);

  const touched = () => setIsExample(false);
  const replaceWith = (next: RemarkStudent[], cls: string, example: boolean) => {
    setStudents(next);
    setClassName(cls);
    setIsExample(example);
    setPinned({});
    setEdits({});
    setFocusId(null);
  };
  const ownClass = named.length > 0 && !isExample;

  function addStudent() {
    const s = blankStudent();
    setStudents((list) => [...list, s]);
    setFocusId(s.id);
    touched();
  }

  function loadExample() {
    if (ownClass && !window.confirm('Replace the class on screen with the example? Save your list as a CSV first if you need it.')) return;
    replaceWith(
      REMARKS_EXAMPLE.map((s) => ({ ...s })),
      REMARKS_EXAMPLE_CLASS,
      true
    );
    setProblems([]);
    say('Example loaded.');
  }

  function clearList() {
    if (named.length && !window.confirm('Clear the whole class from this screen?')) return;
    replaceWith([], '', false);
    setProblems([]);
    say('The class list is empty.');
  }

  async function openCsv(file: File) {
    if (file.size > MAX_BYTES) return say('That file is over 1 MB. Split it into smaller files and open each one.', true);
    let text = '';
    try {
      text = await file.text();
    } catch {
      return say('That file could not be read. Save it as CSV (comma separated) and try again.', true);
    }
    const r = studentsFromCsv(text);
    if (r.error) return say(r.error, true);
    if (ownClass && !window.confirm(`Replace the ${named.length} students on screen with the ${r.rows.length} in this file?`)) return;
    replaceWith(r.rows, isExample ? '' : className, false);
    setProblems(r.problems);
    say(`Opened ${r.rows.length} ${r.rows.length === 1 ? 'student' : 'students'}.`);
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(remarksText(students, remarks));
      say(`Copied ${named.length} ${named.length === 1 ? 'remark' : 'remarks'}. Paste them into your report cards.`);
    } catch {
      say('Copying did not work in this browser. Use Download remarks (CSV) instead.', true);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SchoolProfilePanel compact />

      <section aria-labelledby={`${id}-class-title`} className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5">
        <h2 id={`${id}-class-title`} className="text-lg font-extrabold text-sapphire">
          Your class
        </h2>
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <label htmlFor={`${id}-class`} className="text-sm font-medium text-slate">
            Class (printed on the list)
          </label>
          <input id={`${id}-class`} className={inputCls} maxLength={40} value={className} onChange={(ev) => (setClassName(ev.target.value), touched())} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnSolid} onClick={addStudent} disabled={students.length >= MAX_STUDENTS}>
            <Icon name="plus" className="h-4 w-4" /> Add student
          </button>
          <button type="button" className={btnQuiet} onClick={loadExample}>
            <Icon name="sparkle" className="h-4 w-4" /> Try an example
          </button>
          <button type="button" className={btnQuiet} onClick={() => fileRef.current?.click()}>
            <Icon name="download" className="h-4 w-4 rotate-180" /> Open CSV
          </button>
          <button type="button" className={btnQuiet} onClick={() => downloadBlob(csvBlob(studentTemplateCsv()), 'remarks-class-template.csv')}>
            <Icon name="download" className="h-4 w-4" /> Download CSV template
          </button>
          <button type="button" className={btnQuiet} disabled={!named.length} onClick={() => downloadBlob(csvBlob(studentsToCsv(students)), safeFilename(`Class list ${className}`, 'csv'))}>
            <Icon name="download" className="h-4 w-4" /> Save list as CSV
          </button>
          <button type="button" className={btnQuiet} disabled={!students.length} onClick={clearList}>
            Clear list
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f) void openCsv(f);
              ev.target.value = '';
            }}
          />
        </div>
        <p className="text-sm text-slate/70">CSV columns: Student, Overall %, Attendance %, Strength, Next step. A strength or next step that is not in the lists is kept as your own words. Files up to 1 MB.</p>
        <p role="status" className={`text-sm font-semibold empty:hidden ${msg.bad ? 'text-red-800' : 'text-emerald-text'}`}>
          {msg.text}
        </p>
        {problems.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 rounded-2xl border border-amber bg-white p-4 pl-8 text-sm text-amber-text">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>

      {isExample && (
        <p className="rounded-xl border border-amber bg-white p-3 text-sm font-semibold text-amber-text">
          Example data: a fictional class. Two students have the same marks and choices, to show how the wording varies. Edit anything to make it your own, or press Clear list to start empty.
        </p>
      )}

      <section aria-labelledby={`${id}-students-title`} className="flex flex-col gap-4">
        <div>
          <h2 id={`${id}-students-title`} className="text-2xl font-extrabold text-sapphire">
            Students and draft remarks ({named.length})
          </h2>
          <p className="text-sm text-slate/70">Drafts come from a fixed bank of phrases, not AI. Read and edit each one so it sounds like you.</p>
        </div>
        {students.length ? (
          <ul className="flex flex-col gap-3">
            {students.map((s, i) => (
              <RemarksBuilderStudent
                key={s.id}
                s={s}
                index={i}
                remark={remarks[s.id] ?? ''}
                edited={edits[s.id] !== undefined}
                focusName={focusId === s.id}
                onChange={(patch) => {
                  setStudents((list) => list.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
                  touched();
                }}
                onEdit={(text) => {
                  setEdits((e) => ({ ...e, [s.id]: text }));
                  touched();
                }}
                onDraftAgain={() => {
                  setPinned((p) => ({ ...p, [s.id]: (drafts.variant[s.id] ?? i) + 1 }));
                  setEdits((e) => {
                    const next = { ...e };
                    delete next[s.id];
                    return next;
                  });
                  say(`New draft for ${s.name.trim()}.`);
                }}
                onRemove={() => {
                  if (s.name.trim() && !window.confirm(`Remove ${s.name.trim()} from the class?`)) return;
                  setStudents((list) => list.filter((x) => x.id !== s.id));
                  touched();
                  say(`${s.name.trim() || 'The student'} was removed.`);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate/20 bg-white p-6 text-slate">No students yet. Add one, open a CSV, or try an example to see how the builder works.</p>
        )}
      </section>

      <p className="flex items-start gap-2 text-sm text-slate/70">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /> Runs in your browser. The class stays in this tab and is cleared when you close it. Nothing is sent to NetCyberAI. Save the list as a CSV to keep it on your own computer.
      </p>

      {named.length > 0 && (
        <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSolid} onClick={copyAll}>
              <Icon name="check" className="h-4 w-4" /> Copy all
            </button>
            <button type="button" className={btnLine} onClick={() => downloadBlob(csvBlob(remarksCsv(students, remarks)), safeFilename(`Remarks ${className}`, 'csv'))}>
              <Icon name="download" className="h-4 w-4" /> Download remarks (CSV)
            </button>
          </div>
          <ReportActions report={report} lang="en" fileBase={`Report card remarks ${className}`} rulesUpdated={RULES_UPDATED} sourcePath={`/free-tools/${SLUG}`} />
          <ReportView report={report} meta={{ generatedOn: todayLabel, rulesUpdated: RULES_UPDATED, rulesLabel: UI.lastUpdated.en, assumptionsLabel: UI.assumptions.en }} />
        </div>
      )}
    </div>
  );
}
