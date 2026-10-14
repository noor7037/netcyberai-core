'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { teacherRegisterExample } from '@/demo-fixture/teacher-qualification-register-example';
import { forgetDeviceList, readDeviceList, writeDeviceList } from '@/lib/free-tools/device-list';
import { withSchool } from '@/lib/free-tools/report';
import { dateOf, type DayDate } from '@/lib/free-tools/student-data-check';
import {
  MAX_TEACHERS,
  REGISTER_SLUG,
  RULE_LABEL,
  STAGES,
  TEACHER_TEMPLATE_CSV,
  WINDOWS,
  blankTeacher,
  buildRegister,
  cleanTeacher,
  defaultRegisterSettings,
  readRegisterSettings,
  saveRegisterSettings,
  teachersFromCsv,
  teachersToCsv,
  type ExpiryWindow,
  type RegisterSettings,
  type RuleId,
  type StageId,
  type Teacher,
  type TetPaper,
  type TetType,
} from '@/lib/free-tools/teacher-register';
import { downloadBlob } from '@/lib/pdf/browser';
import { ReportActions, btnLine, btnQuiet, useToday } from './ReportActions';
import { ReportView } from './ReportView';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { useSchoolProfile } from './useSchoolProfile';

const RULES_UPDATED = '14 October 2026';
const SOURCE = '/free-tools/teacher-qualification-register';
const MAX_BYTES = 1024 * 1024;
const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const labelCls = 'text-sm font-medium text-slate';
const thCls = 'px-2 pb-1 text-left text-xs font-bold text-slate';
const legendCls = 'mb-1 text-base font-extrabold text-sapphire';
const removeCls =
  'inline-flex min-h-[44px] w-fit items-center justify-center gap-2 rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-red-800 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';
const RULE_COLUMNS: RuleId[] = ['degree', 'professional', 'tet', 'pg'];
const RULE_HEAD: Record<RuleId, string> = { degree: 'Degree', professional: 'Professional qualification', tet: 'TET', pg: 'Postgraduate degree' };

const csvBlob = (csv: string) => new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });

// Teacher Qualification and TET Register (content: src/content/free-tools.ts,
// slug teacher-qualification-register). The rules for each stage are
// remembered in this browser. The teacher list stays in this tab unless the
// school ticks "Keep on this device" (device-list.ts); loading the example
// pauses that, so example teachers never replace a kept list.
export function TeacherRegisterTool() {
  const [settings, setSettings] = useState<RegisterSettings>(defaultRegisterSettings);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [keep, setKeep] = useState(false);
  const [isExample, setIsExample] = useState(false);
  const [msg, setMsg] = useState('');
  const [todayD, setTodayD] = useState<DayDate | null>(null);
  const touched = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = useToday();
  const { profile } = useSchoolProfile();

  useEffect(() => {
    setTodayD(dateOf(new Date()));
    setSettings(readRegisterSettings());
    const kept = readDeviceList(REGISTER_SLUG, cleanTeacher);
    if (kept) {
      setTeachers(kept);
      setKeep(true);
    }
  }, []);

  useEffect(() => {
    if (touched.current) saveRegisterSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (keep) writeDeviceList(REGISTER_SLUG, teachers);
  }, [keep, teachers]);

  const editSettings = (next: RegisterSettings) => {
    touched.current = true;
    setSettings(next);
  };
  const setRule = (stage: StageId, rule: RuleId, on: boolean) => editSettings({ ...settings, rules: { ...settings.rules, [stage]: { ...settings.rules[stage], [rule]: on } } });
  const editTeachers = (next: Teacher[]) => {
    setIsExample(false);
    setTeachers(next);
  };
  const setTeacher = (i: number, patch: Partial<Teacher>) => editTeachers(teachers.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  function onKeep(on: boolean) {
    if (on) {
      if (!writeDeviceList(REGISTER_SLUG, teachers)) return setMsg('This browser does not allow saving. Save the list as a CSV file instead.');
      setKeep(true);
      setMsg('The list is kept on this device and updates as you type.');
    } else {
      setKeep(false);
      forgetDeviceList(REGISTER_SLUG);
      setMsg('The list was removed from this device. It stays on this page until you close the tab.');
    }
  }

  function loadExample() {
    setTeachers(teacherRegisterExample());
    setIsExample(true);
    if (keep) {
      // Pause keeping (the kept list is not touched) so example teachers are never written over it.
      setKeep(false);
      setMsg('Keep on this device is paused while the example is shown. Your kept list is unchanged and comes back when you reload the page.');
    } else setMsg('');
  }

  async function openCsv(file: File) {
    if (file.size > MAX_BYTES) return setMsg('That file is over 1 MB.');
    let r;
    try {
      r = teachersFromCsv(await file.text());
    } catch {
      return setMsg('That file could not be read. Save it as CSV (comma separated) and try again.');
    }
    if (r.error) return setMsg(r.error);
    editTeachers(r.teachers);
    const notes = [`Opened ${r.teachers.length} ${r.teachers.length === 1 ? 'teacher' : 'teachers'}.`];
    if (r.unknownStages) notes.push(`${r.unknownStages} ${r.unknownStages === 1 ? 'stage was' : 'stages were'} not recognised; choose ${r.unknownStages === 1 ? 'it' : 'them'} below.`);
    if (r.unreadableDates) notes.push(`${r.unreadableDates} ${r.unreadableDates === 1 ? 'date' : 'dates'} could not be read and ${r.unreadableDates === 1 ? 'was' : 'were'} left blank.`);
    setMsg(notes.join(' '));
  }

  const result = useMemo(() => (todayD ? buildRegister(teachers, settings, todayD) : null), [teachers, settings, todayD]);
  const report = useMemo(() => (result?.report ? withSchool(result.report, profile) : null), [result, profile]);

  return (
    <div className="flex flex-col gap-8">
      <SchoolProfilePanel compact />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnQuiet} onClick={loadExample}>
          <Icon name="sparkle" className="h-4 w-4" /> Try an example
        </button>
        <button type="button" className={btnQuiet} onClick={() => (editTeachers([]), setMsg(''))}>
          Clear list
        </button>
      </div>
      {isExample && <p className="rounded-xl border border-amber bg-white p-3 text-sm font-semibold text-amber-text">Example data: fictional teachers. Replace them with your own.</p>}

      <form className="flex flex-col gap-8 rounded-3xl border border-slate/10 bg-white p-5" onSubmit={(e) => e.preventDefault()} noValidate>
        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className={legendCls}>What each stage needs</legend>
          <p className="rounded-xl bg-off-white p-3 text-sm text-slate">
            TET starts marked as needed for classes I to VIII, as the NCTE requires under the RTE Act. Check your board’s and state’s rules.
          </p>
          <div className="nca-scroll relative overflow-x-auto" role="region" aria-label="What each stage needs" tabIndex={0}>
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="align-bottom">
                  <th scope="col" className={thCls}>
                    Stage
                  </th>
                  {RULE_COLUMNS.map((k) => (
                    <th key={k} scope="col" className={`${thCls} text-center`}>
                      {RULE_HEAD[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAGES.map((st) => (
                  <tr key={st.id} className="border-t border-slate/10">
                    <th scope="row" className="px-2 py-1 text-left font-semibold text-slate">
                      {st.label}
                    </th>
                    {RULE_COLUMNS.map((k) => (
                      <td key={k} className="p-1 text-center">
                        <label className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md hover:bg-off-white">
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-sapphire"
                            aria-label={`${RULE_LABEL[k]} needed for ${st.label}`}
                            checked={settings.rules[st.id][k]}
                            onChange={(e) => setRule(st.id, k, e.target.checked)}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate/70">Professional qualification means a B.Ed, D.El.Ed or other teacher training. These rules are remembered in this browser.</p>
          <div className="flex max-w-xs flex-col gap-1.5">
            <label htmlFor="tr-window" className={labelCls}>
              List certificates and approvals ending within
            </label>
            <select id="tr-window" className={inputCls} value={settings.window} onChange={(e) => editSettings({ ...settings, window: Number(e.target.value) as ExpiryWindow })}>
              {WINDOWS.map((w) => (
                <option key={w} value={w}>{`${w} days`}</option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className={legendCls}>Teachers</legend>
          <div className="flex flex-col gap-1 rounded-xl border border-slate/10 p-3">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold text-slate">
              <input type="checkbox" className="h-5 w-5 accent-sapphire" checked={keep} aria-describedby="tr-keep-help" onChange={(e) => onKeep(e.target.checked)} />
              Keep on this device
            </label>
            <p id="tr-keep-help" className="text-sm text-slate/70">
              Tick this only on a computer used by school staff. The list stays on this device and is never sent to NetCyberAI.
            </p>
          </div>
          <datalist id="tr-professional-options">
            <option value="B.Ed" />
            <option value="D.El.Ed" />
          </datalist>
          {teachers.map((t, i) => (
            <TeacherCard key={i} index={i} t={t} onChange={(patch) => setTeacher(i, patch)} onRemove={() => editTeachers(teachers.filter((_, j) => j !== i))} />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnQuiet} disabled={teachers.length >= MAX_TEACHERS} onClick={() => editTeachers([...teachers, blankTeacher()])}>
              + Add a teacher
            </button>
            <button type="button" className={btnQuiet} onClick={() => fileRef.current?.click()}>
              <Icon name="download" className="h-4 w-4 rotate-180" /> Open CSV
            </button>
            <button type="button" className={btnQuiet} disabled={!teachers.length} onClick={() => downloadBlob(csvBlob(teachersToCsv(teachers)), 'teacher-register.csv')}>
              <Icon name="download" className="h-4 w-4" /> Save list as CSV
            </button>
            <button type="button" className={btnLine} onClick={() => downloadBlob(csvBlob(TEACHER_TEMPLATE_CSV), 'teacher-register-template.csv')}>
              <Icon name="download" className="h-4 w-4" /> Download CSV template
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
                if (f) void openCsv(f);
                e.target.value = '';
              }}
            />
          </div>
          <p role="status" className="text-sm font-semibold text-emerald-text empty:hidden">
            {msg}
          </p>
        </fieldset>
      </form>
      <p className="flex items-start gap-2 text-sm text-slate/70">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /> Runs in your browser. Nothing you type is sent to NetCyberAI.
      </p>

      <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
        {result && result.errors.length > 0 ? (
          <div role="alert" className="rounded-3xl border-2 border-red-600 bg-white p-6">
            <p className="font-bold text-red-800">Please fix these first:</p>
            <ul className="mt-2 list-disc pl-5 text-red-800">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : report ? (
          <>
            <ReportActions report={report} lang="en" fileBase="Teacher qualification register" rulesUpdated={RULES_UPDATED} sourcePath={SOURCE} />
            <ReportView report={report} meta={{ generatedOn: today, rulesUpdated: RULES_UPDATED, rulesLabel: 'Rules last updated', assumptionsLabel: 'Assumptions' }} />
          </>
        ) : (
          <p className="rounded-2xl bg-off-white p-4 text-slate">Add your teachers, or open a CSV, to see the register.</p>
        )}
      </div>
    </div>
  );
}

function TeacherCard({ index, t, onChange, onRemove }: { index: number; t: Teacher; onChange: (patch: Partial<Teacher>) => void; onRemove: () => void }) {
  const id = (f: string) => `tr-${index}-${f}`;
  const who = t.name.trim() || `teacher ${index + 1}`;
  const text = (f: 'name' | 'subjects' | 'degree' | 'pg' | 'professional' | 'other', label: string, max = 80, list?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id(f)} className={labelCls}>
        {label}
      </label>
      <input id={id(f)} className={inputCls} maxLength={max} list={list} value={t[f]} onChange={(e) => onChange({ [f]: e.target.value })} />
    </div>
  );
  const date = (f: 'tetDate' | 'tetValidUntil' | 'otherValidUntil', label: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id(f)} className={labelCls}>
        {label}
      </label>
      <input id={id(f)} type="date" className={inputCls} value={t[f]} onChange={(e) => onChange({ [f]: e.target.value })} />
    </div>
  );
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate/10 p-4">
      <legend className="px-1 text-sm font-bold text-slate">{t.name.trim() || `Teacher ${index + 1}`}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {text('name', 'Name')}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('stage')} className={labelCls}>
            Stage
          </label>
          <select id={id('stage')} className={inputCls} value={t.stage} onChange={(e) => onChange({ stage: e.target.value as StageId | '' })}>
            <option value="">Choose a stage</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {text('subjects', 'Subjects')}
        {text('degree', 'Degree', 60)}
        {text('pg', 'Postgraduate degree', 60)}
        {text('professional', 'Professional qualification', 60, 'tr-professional-options')}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('tetType')} className={labelCls}>
            TET
          </label>
          <select id={id('tetType')} className={inputCls} value={t.tetType} onChange={(e) => onChange({ tetType: e.target.value as TetType })}>
            <option value="">None</option>
            <option value="CTET">CTET</option>
            <option value="State TET">State TET</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('tetPaper')} className={labelCls}>
            TET paper
          </label>
          <select id={id('tetPaper')} className={inputCls} value={t.tetPaper} onChange={(e) => onChange({ tetPaper: e.target.value as TetPaper })}>
            <option value="">Not recorded</option>
            <option value="I">Paper I</option>
            <option value="II">Paper II</option>
            <option value="both">Both papers</option>
          </select>
        </div>
        {date('tetDate', 'TET certificate date')}
        {date('tetValidUntil', 'TET valid until (optional)')}
        {text('other', 'Other approval')}
        {date('otherValidUntil', 'Approval valid until (optional)')}
      </div>
      <button type="button" className={removeCls} aria-label={`Remove ${who}`} onClick={onRemove}>
        ✕ Remove
      </button>
    </fieldset>
  );
}
