'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { UI } from '@/lib/free-tools/engine';
import { admissionsExample } from '@/demo-fixture/admissions-enquiry-tracker-example';
import {
  QUIET_DAYS_DEFAULT,
  STAGES,
  admissionsReport,
  blankEnquiry,
  cleanEnquiry,
  enquiriesFromCsv,
  enquiriesToCsv,
  enquiryTemplateCsv,
  followUps,
  hasContent,
  isOpen,
  isoToday,
  recordOutcome,
  type Enquiry,
  type Outcome,
} from '@/lib/free-tools/admissions-tracker';
import { MAX_DEVICE_ROWS, forgetDeviceList, readDeviceList, writeDeviceList } from '@/lib/free-tools/device-list';
import { withSchool } from '@/lib/free-tools/report';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import { AdmissionsTrackerCard, inputCls, type CardHint } from './AdmissionsTrackerCard';
import { ReportActions, btnQuiet, btnSolid, useToday } from './ReportActions';
import { ReportView } from './ReportView';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { useSchoolProfile } from './useSchoolProfile';

const SLUG = 'admissions-enquiry-tracker';
const RULES_UPDATED = '14 October 2026';
const MAX_BYTES = 1024 * 1024;

type Filter = 'all' | 'open' | (typeof STAGES)[number];

const csvBlob = (csv: string) => new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

export function AdmissionsTrackerTool() {
  const id = useId();
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [isExample, setIsExample] = useState(false);
  const [keep, setKeep] = useState(false);
  const [quietDays, setQuietDays] = useState(String(QUIET_DAYS_DEFAULT));
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [problems, setProblems] = useState<string[]>([]);
  const [today, setToday] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const todayLabel = useToday();
  const { profile } = useSchoolProfile();

  // Today's date and any list kept on this device, read after mount so the
  // server HTML (an empty tracker) and the first client render match.
  useEffect(() => {
    setToday(isoToday());
    const saved = readDeviceList(SLUG, cleanEnquiry);
    if (saved) {
      setRows(saved);
      setKeep(true);
    }
  }, []);

  // While Keep on this device is ticked, every change is written to this
  // device. Example data is never written.
  useEffect(() => {
    if (!keep || isExample) return;
    if (!writeDeviceList(SLUG, rows)) {
      setKeep(false);
      setMsg({ text: 'This browser does not allow saving, so the list stays on this screen only. Save it as a CSV to keep it.', bad: true });
    }
  }, [rows, keep, isExample]);

  const say = (text: string, bad = false) => setMsg({ text, bad });
  const filled = rows.filter(hasContent);
  const quietAfter = Math.min(365, Math.max(1, Math.round(Number(quietDays)) || QUIET_DAYS_DEFAULT));
  const lists = useMemo(() => followUps(rows, today, quietAfter), [rows, today, quietAfter]);
  const hints = useMemo(() => {
    const m = new Map<string, CardHint>();
    for (const d of lists.due) m.set(d.e.id, d.overdueDays ? { text: `Overdue by ${days(d.overdueDays)}`, tone: 'bad' } : { text: 'Due today', tone: 'warn' });
    for (const q of lists.quiet) m.set(q.e.id, { text: `Gone quiet: no update for ${days(q.quietDays)}`, tone: 'warn' });
    return m;
  }, [lists]);
  const report = useMemo(() => withSchool(admissionsReport(rows, today, quietAfter), profile), [rows, today, quietAfter, profile]);
  const shown = rows.filter((e) => e.id === editingId || filter === 'all' || (filter === 'open' ? isOpen(e) : e.stage === filter));

  const edit = (fn: (rs: Enquiry[]) => Enquiry[]) => {
    setRows(fn);
    setIsExample(false);
  };
  const patch = (rowId: string, p: Partial<Enquiry>) => edit((rs) => rs.map((r) => (r.id === rowId ? { ...r, ...p, updated: today || r.updated } : r)));
  const record = (e: Enquiry, o: Outcome) => {
    edit((rs) => rs.map((r) => (r.id === e.id ? recordOutcome(r, o, today) : r)));
    say(`Recorded for ${e.parentName.trim() || 'this enquiry'}.`);
  };
  const setDraft = (rowId: string, text: string | null) =>
    setDrafts((d) => {
      const next = { ...d };
      if (text === null) delete next[rowId];
      else next[rowId] = text;
      return next;
    });
  const replaceWith = (next: Enquiry[], example: boolean) => {
    setRows(next);
    setIsExample(example);
    setDrafts({});
    setEditingId(null);
  };
  const keepsOwnList = filled.length > 0 && !isExample;

  function addEnquiry() {
    const e = blankEnquiry(today || isoToday());
    edit((rs) => [e, ...rs]);
    setEditingId(e.id);
    say('New enquiry added at the top of the list. Fill in the details.');
  }

  function loadExample() {
    if (keepsOwnList && !window.confirm('Replace the list on screen with the example? Save your list as a CSV first if you need it.')) return;
    replaceWith(admissionsExample(today || isoToday()), true);
    setProblems([]);
    say('Example loaded.');
  }

  function clearList() {
    if (filled.length && !window.confirm(keep ? 'Clear the whole list from this screen and from this device?' : 'Clear the whole list from this screen?')) return;
    replaceWith([], false);
    setProblems([]);
    say('The list is empty.');
  }

  async function openCsv(file: File) {
    if (file.size > MAX_BYTES) return say('That file is over 1 MB. Split it into smaller files and open each one.', true);
    let text = '';
    try {
      text = await file.text();
    } catch {
      return say('That file could not be read. Save it as CSV (comma separated) and try again.', true);
    }
    const r = enquiriesFromCsv(text, today || isoToday());
    if (r.error) return say(r.error, true);
    if (keepsOwnList && !window.confirm(`Replace the ${filled.length} enquiries on screen with the ${r.rows.length} in this file?`)) return;
    replaceWith(r.rows, false);
    setProblems(r.problems);
    say(`Opened ${r.rows.length} ${r.rows.length === 1 ? 'enquiry' : 'enquiries'}.`);
  }

  function toggleKeep(on: boolean) {
    setKeep(on);
    if (on) say(isExample ? 'The example is not kept. Your own list will be kept on this device once you start editing.' : 'This list is now kept on this device.');
    else {
      forgetDeviceList(SLUG);
      say('The list is no longer kept on this device. It stays on this screen until you close the tab; save it as a CSV to keep it.');
    }
  }

  const card = (e: Enquiry, inFullList: boolean) => (
    <AdmissionsTrackerCard
      key={e.id}
      e={e}
      school={profile.schoolName}
      hint={hints.get(e.id)}
      draft={drafts[e.id]}
      onDraft={(t) => setDraft(e.id, t)}
      onRecord={(o) => record(e, o)}
      {...(inFullList
        ? {
            editing: editingId === e.id,
            onEditing: (open: boolean) => setEditingId(open ? e.id : null),
            onChange: (p: Partial<Enquiry>) => patch(e.id, p),
            onRemove: () => {
              if (hasContent(e) && !window.confirm(`Remove ${e.parentName.trim() || 'this enquiry'} from the list?`)) return;
              edit((rs) => rs.filter((r) => r.id !== e.id));
              say(`${e.parentName.trim() || 'The enquiry'} was removed.`);
            },
          }
        : {})}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <SchoolProfilePanel compact />

      <section aria-labelledby={`${id}-list-title`} className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5">
        <h2 id={`${id}-list-title`} className="text-lg font-extrabold text-sapphire">
          Your enquiry list
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnSolid} onClick={addEnquiry} disabled={rows.length >= MAX_DEVICE_ROWS}>
            <Icon name="plus" className="h-4 w-4" /> Add enquiry
          </button>
          <button type="button" className={btnQuiet} onClick={loadExample}>
            <Icon name="sparkle" className="h-4 w-4" /> Try an example
          </button>
          <button type="button" className={btnQuiet} onClick={() => fileRef.current?.click()}>
            <Icon name="download" className="h-4 w-4 rotate-180" /> Open CSV
          </button>
          <button type="button" className={btnQuiet} onClick={() => downloadBlob(csvBlob(enquiryTemplateCsv()), 'admission-enquiries-template.csv')}>
            <Icon name="download" className="h-4 w-4" /> Download CSV template
          </button>
          <button type="button" className={btnQuiet} disabled={!filled.length} onClick={() => downloadBlob(csvBlob(enquiriesToCsv(rows)), safeFilename(`Admission enquiries ${today}`, 'csv'))}>
            <Icon name="download" className="h-4 w-4" /> Save list as CSV
          </button>
          <button type="button" className={btnQuiet} disabled={!rows.length} onClick={clearList}>
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
        <p className="text-sm text-slate/70">CSV columns: Parent name, Phone, Child name, Class wanted, Source, Stage, Next step, Follow-up date, Notes, Not joining reason, Date added, Last updated. Dates as 2026-10-14 or 14/10/2026. Files up to 1 MB.</p>
        <div className="flex flex-col gap-1 rounded-2xl bg-off-white p-4">
          <label className="flex min-h-[44px] items-center gap-3 text-base font-semibold text-slate">
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-sapphire" checked={keep} onChange={(ev) => toggleKeep(ev.target.checked)} aria-describedby={`${id}-keep-note`} />
            Keep on this device
          </label>
          <p id={`${id}-keep-note`} className="text-sm text-slate/70">
            Tick this only on a computer used by school staff. The list stays on this device and is never sent to NetCyberAI.
          </p>
        </div>
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
          Example data: fictional families, with dates set around today. Edit anything to make it your own list, or press Clear list to start empty.
        </p>
      )}

      <section aria-labelledby={`${id}-today-title`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id={`${id}-today-title`} className="text-2xl font-extrabold text-sapphire">
              Today’s list
            </h2>
            <p className="text-sm text-slate/70" aria-live="polite">
              {todayLabel && `${todayLabel} · `}
              {lists.due.length} due or overdue · {lists.quiet.length} gone quiet
            </p>
          </div>
          <div className="flex w-full flex-col gap-1.5 sm:w-64">
            <label htmlFor={`${id}-quiet`} className="text-sm font-medium text-slate">
              Gone quiet after (days without an update)
            </label>
            <input id={`${id}-quiet`} type="number" inputMode="numeric" min={1} max={365} className={inputCls} value={quietDays} onChange={(ev) => setQuietDays(ev.target.value)} />
          </div>
        </div>
        {!filled.length ? (
          <p className="rounded-2xl border border-dashed border-slate/20 bg-white p-6 text-slate">No enquiries yet. Add one, open a CSV, or try an example to see how the tracker works.</p>
        ) : (
          <>
            <h3 className="text-lg font-extrabold text-slate">Due today and overdue ({lists.due.length})</h3>
            {lists.due.length ? <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{lists.due.map((d) => card(d.e, false))}</ul> : <p className="text-slate/70">Nothing is due today.</p>}
            <h3 className="text-lg font-extrabold text-slate">Gone quiet ({lists.quiet.length})</h3>
            {lists.quiet.length ? <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{lists.quiet.map((q) => card(q.e, false))}</ul> : <p className="text-slate/70">{`No open enquiry has gone ${days(quietAfter)} without an update.`}</p>}
          </>
        )}
      </section>

      {rows.length > 0 && (
        <section aria-labelledby={`${id}-all-title`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id={`${id}-all-title`} className="text-2xl font-extrabold text-sapphire">
              All enquiries ({filled.length})
            </h2>
            <div className="flex w-full flex-col gap-1.5 sm:w-64">
              <label htmlFor={`${id}-filter`} className="text-sm font-medium text-slate">
                Show
              </label>
              <select id={`${id}-filter`} className={inputCls} value={filter} onChange={(ev) => setFilter(ev.target.value as Filter)}>
                <option value="all">All enquiries</option>
                <option value="open">Open enquiries</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {shown.length ? <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{shown.map((e) => card(e, true))}</ul> : <p className="text-slate/70">No enquiries at this stage.</p>}
        </section>
      )}

      <p className="flex items-start gap-2 text-sm text-slate/70">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /> Runs in your browser. The list stays in this tab unless you tick Keep on this device. Nothing is sent to NetCyberAI, and WhatsApp messages are sent only by you.
      </p>

      {filled.length > 0 && today && (
        <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
          <ReportActions report={report} lang="en" fileBase={`Admissions enquiries ${today}`} rulesUpdated={RULES_UPDATED} sourcePath={`/free-tools/${SLUG}`} />
          <ReportView report={report} meta={{ generatedOn: todayLabel, rulesUpdated: RULES_UPDATED, rulesLabel: UI.lastUpdated.en, assumptionsLabel: UI.assumptions.en }} />
        </div>
      )}
    </div>
  );
}
