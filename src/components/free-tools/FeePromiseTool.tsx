'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { UI } from '@/lib/free-tools/engine';
import { feePromiseExample } from '@/demo-fixture/fee-promise-tracker-example';
import { isoToday } from '@/lib/free-tools/admissions-tracker';
import { MAX_DEVICE_ROWS, forgetDeviceList, readDeviceList, writeDeviceList } from '@/lib/free-tools/device-list';
import {
  askForHelp,
  blankPromise,
  cleanPromise,
  feeReport,
  feeTotals,
  hasContent,
  promiseLists,
  promiseTemplateCsv,
  promisesFromCsv,
  promisesToCsv,
  recordPayment,
  renewPromise,
  viewPromise,
  type FeePromise,
  type PromiseView,
} from '@/lib/free-tools/fee-promise';
import { money, withSchool } from '@/lib/free-tools/report';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import { FeePromiseCard, inputCls } from './FeePromiseCard';
import { ReportActions, btnQuiet, btnSolid, useToday } from './ReportActions';
import { ReportView } from './ReportView';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { useSchoolProfile } from './useSchoolProfile';

const SLUG = 'fee-promise-tracker';
const RULES_UPDATED = '14 October 2026';
const MAX_BYTES = 1024 * 1024;

type Filter = 'all' | 'follow' | 'done' | 'help' | 'incomplete';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All promises' },
  { value: 'follow', label: 'Still to follow up' },
  { value: 'done', label: 'Kept or paid' },
  { value: 'help', label: 'Families needing help' },
  { value: 'incomplete', label: 'Details missing' },
];
const FILTER_STATUSES: Record<Exclude<Filter, 'all'>, PromiseView['status'][]> = {
  follow: ['due-today', 'broken', 'partly-kept', 'upcoming'],
  done: ['kept', 'paid-late'],
  help: ['needs-help'],
  incomplete: ['incomplete'],
};

const csvBlob = (csv: string) => new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });

export function FeePromiseTool() {
  const id = useId();
  const [rows, setRows] = useState<FeePromise[]>([]);
  const [isExample, setIsExample] = useState(false);
  const [keep, setKeep] = useState(false);
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
    const saved = readDeviceList(SLUG, cleanPromise);
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
  const lists = useMemo(() => promiseLists(rows, today), [rows, today]);
  const totals = useMemo(() => feeTotals(lists.views), [lists]);
  const viewOf = useMemo(() => new Map(lists.views.map((v) => [v.p.id, v])), [lists]);
  const report = useMemo(() => withSchool(feeReport(rows, today), profile), [rows, today, profile]);
  const shown = rows
    .map((p) => viewOf.get(p.id) ?? viewPromise(p, today))
    .filter((v) => v.p.id === editingId || filter === 'all' || FILTER_STATUSES[filter].includes(v.status));

  const edit = (fn: (rs: FeePromise[]) => FeePromise[]) => {
    setRows(fn);
    setIsExample(false);
  };
  const change = (rowId: string, fn: (p: FeePromise) => FeePromise) => edit((rs) => rs.map((r) => (r.id === rowId ? fn(r) : r)));
  const setDraft = (rowId: string, text: string | null) =>
    setDrafts((d) => {
      const next = { ...d };
      if (text === null) delete next[rowId];
      else next[rowId] = text;
      return next;
    });
  const replaceWith = (next: FeePromise[], example: boolean) => {
    setRows(next);
    setIsExample(example);
    setDrafts({});
    setEditingId(null);
  };
  const keepsOwnList = filled.length > 0 && !isExample;
  const nameOf = (p: FeePromise) => p.student.trim() || 'this promise';

  function addPromise() {
    const p = blankPromise();
    edit((rs) => [p, ...rs]);
    setEditingId(p.id);
    setFilter('all');
    say('New promise added at the top of the list. Fill in the details.');
  }

  function loadExample() {
    if (keepsOwnList && !window.confirm('Replace the list on screen with the example? Save your list as a CSV first if you need it.')) return;
    replaceWith(feePromiseExample(today || isoToday()), true);
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
    const r = promisesFromCsv(text);
    if (r.error) return say(r.error, true);
    if (keepsOwnList && !window.confirm(`Replace the ${filled.length} promises on screen with the ${r.rows.length} in this file?`)) return;
    replaceWith(r.rows, false);
    setProblems(r.problems);
    say(`Opened ${r.rows.length} ${r.rows.length === 1 ? 'promise' : 'promises'}.`);
  }

  function toggleKeep(on: boolean) {
    setKeep(on);
    if (on) say(isExample ? 'The example is not kept. Your own list will be kept on this device once you start editing.' : 'This list is now kept on this device.');
    else {
      forgetDeviceList(SLUG);
      say('The list is no longer kept on this device. It stays on this screen until you close the tab; save it as a CSV to keep it.');
    }
  }

  const card = (v: PromiseView, inFullList: boolean) => (
    <FeePromiseCard
      key={v.p.id}
      v={v}
      today={today}
      school={profile.schoolName}
      draft={drafts[v.p.id]}
      onDraft={(t) => setDraft(v.p.id, t)}
      onPayment={(paid, on) => {
        change(v.p.id, (p) => recordPayment(p, paid, on));
        say(`Recorded ${money(paid)} for ${nameOf(v.p)}.`);
      }}
      onNewDate={(on, toPay) => {
        change(v.p.id, (p) => renewPromise(p, on, toPay, today));
        say(`New promised date set for ${nameOf(v.p)}.`);
      }}
      onHelp={(staff, note) => {
        change(v.p.id, (p) => askForHelp(p, staff, note));
        setDraft(v.p.id, null);
        say(`${nameOf(v.p)} moved to the help list, with ${staff.trim()} to speak to the family.`);
      }}
      {...(inFullList
        ? {
            editing: editingId === v.p.id,
            onEditing: (open: boolean) => setEditingId(open ? v.p.id : null),
            onChange: (patch: Partial<FeePromise>) => change(v.p.id, (p) => ({ ...p, ...patch })),
            onRemove: () => {
              if (hasContent(v.p) && !window.confirm(`Remove ${nameOf(v.p)} from the list?`)) return;
              edit((rs) => rs.filter((r) => r.id !== v.p.id));
              say(`${v.p.student.trim() || 'The promise'} was removed.`);
            },
          }
        : {})}
    />
  );
  const group = (title: string, items: PromiseView[], empty: string) => (
    <>
      <h3 className="text-lg font-extrabold text-slate">
        {title} ({items.length})
      </h3>
      {items.length ? <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{items.map((v) => card(v, false))}</ul> : <p className="text-slate/70">{empty}</p>}
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <SchoolProfilePanel compact />

      <section aria-labelledby={`${id}-list-title`} className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5">
        <h2 id={`${id}-list-title`} className="text-lg font-extrabold text-sapphire">
          Your promise list
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnSolid} onClick={addPromise} disabled={rows.length >= MAX_DEVICE_ROWS}>
            <Icon name="plus" className="h-4 w-4" /> Add promise
          </button>
          <button type="button" className={btnQuiet} onClick={loadExample}>
            <Icon name="sparkle" className="h-4 w-4" /> Try an example
          </button>
          <button type="button" className={btnQuiet} onClick={() => fileRef.current?.click()}>
            <Icon name="download" className="h-4 w-4 rotate-180" /> Open CSV
          </button>
          <button type="button" className={btnQuiet} onClick={() => downloadBlob(csvBlob(promiseTemplateCsv()), 'fee-promises-template.csv')}>
            <Icon name="download" className="h-4 w-4" /> Download CSV template
          </button>
          <button type="button" className={btnQuiet} disabled={!filled.length} onClick={() => downloadBlob(csvBlob(promisesToCsv(rows)), safeFilename(`Fee promises ${today}`, 'csv'))}>
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
        <p className="text-sm text-slate/70">
          CSV columns: Student, Class, Parent phone, Amount due, Amount promised, Promised date, Follow-up by, Amount received, Received date, Needs help (Yes or blank), Help staff member, Help note. Dates as 2026-10-14 or 14/10/2026. Files up to 1 MB.
        </p>
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
          Example data: fictional students and amounts, with dates set around today. Edit anything to make it your own list, or press Clear list to start empty.
        </p>
      )}

      <section aria-labelledby={`${id}-today-title`} className="flex flex-col gap-4">
        <div>
          <h2 id={`${id}-today-title`} className="text-2xl font-extrabold text-sapphire">
            Today’s list
          </h2>
          <p className="text-sm text-slate/70" aria-live="polite">
            {todayLabel && `${todayLabel} · `}
            {`${lists.dueToday.length} due today · ${lists.broken.length} broken or partly kept · ${money(totals.received)} received of ${money(totals.promised)} promised`}
          </p>
        </div>
        {!filled.length ? (
          <p className="rounded-2xl border border-dashed border-slate/20 bg-white p-6 text-slate">No promises yet. Add one, open a CSV, or try an example to see how the tracker works.</p>
        ) : (
          <>
            {group('Due today', lists.dueToday, 'No promise is due today.')}
            {group('Broken and partly kept', lists.broken, 'No promise has been broken.')}
            {group('Coming up', lists.upcoming, 'No promises are coming up.')}
          </>
        )}
      </section>

      {lists.help.length > 0 && (
        <section aria-labelledby={`${id}-help-title`} className="flex flex-col gap-4 rounded-3xl border border-royal/20 bg-white p-5">
          <div>
            <h2 id={`${id}-help-title`} className="text-2xl font-extrabold text-sapphire">
              Families needing help ({lists.help.length})
            </h2>
            <p className="text-sm text-slate">Kept apart from the reminder list and never sent a reminder. The named staff member speaks to each family.</p>
          </div>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{lists.help.map((v) => card(v, false))}</ul>
        </section>
      )}

      {rows.length > 0 && (
        <section aria-labelledby={`${id}-all-title`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id={`${id}-all-title`} className="text-2xl font-extrabold text-sapphire">
              All promises ({filled.length})
            </h2>
            <div className="flex w-full flex-col gap-1.5 sm:w-64">
              <label htmlFor={`${id}-filter`} className="text-sm font-medium text-slate">
                Show
              </label>
              <select id={`${id}-filter`} className={inputCls} value={filter} onChange={(ev) => setFilter(ev.target.value as Filter)}>
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {shown.length ? <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{shown.map((v) => card(v, true))}</ul> : <p className="text-slate/70">No promises in this group.</p>}
        </section>
      )}

      <p className="flex items-start gap-2 text-sm text-slate/70">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /> Runs in your browser. The list stays in this tab unless you tick Keep on this device. Nothing is sent to NetCyberAI, and WhatsApp reminders are sent only by you.
      </p>

      {filled.length > 0 && today && (
        <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
          <ReportActions report={report} lang="en" fileBase={`Fee promises ${today}`} rulesUpdated={RULES_UPDATED} sourcePath={`/free-tools/${SLUG}`} />
          <ReportView report={report} meta={{ generatedOn: todayLabel, rulesUpdated: RULES_UPDATED, rulesLabel: UI.lastUpdated.en, assumptionsLabel: UI.assumptions.en }} />
        </div>
      )}
    </div>
  );
}
