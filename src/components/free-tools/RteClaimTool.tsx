'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { RTE_EXAMPLE_CHILDREN, RTE_EXAMPLE_SETTINGS } from '@/demo-fixture/rte-claim-sheet-builder-example';
import { withSchool } from '@/lib/free-tools/report';
import {
  MAX_AGEING,
  MAX_CHILDREN,
  MAX_CLASS_FEES,
  MAX_DOCUMENTS,
  blankChild,
  blankSettings,
  buildClaim,
  childrenFromCsv,
  childrenToCsv,
  forgetRteSettings,
  readRteSettings,
  rteTemplateCsv,
  saveRteSettings,
  type AgeingRow,
  type ClassFee,
  type RteChild,
  type RteSettings,
} from '@/lib/free-tools/rte-claim';
import { dateOf, type DayDate } from '@/lib/free-tools/student-data-check';
import { downloadBlob } from '@/lib/pdf/browser';
import { ReportActions, btnLine, btnQuiet, useToday } from './ReportActions';
import { ReportView } from './ReportView';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { useSchoolProfile } from './useSchoolProfile';

const RULES_UPDATED = '14 October 2026';
const SOURCE = '/free-tools/rte-claim-sheet-builder';
const MAX_BYTES = 1024 * 1024;
const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const removeCls =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-red-800 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal';
const thCls = 'px-1 pb-1 text-left text-xs font-bold text-slate';
const legendCls = 'mb-1 text-base font-extrabold text-sapphire';

const csvBlob = (csv: string) => new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });

// RTE Reimbursement Claim Sheet Builder (content: src/content/free-tools.ts,
// slug rte-claim-sheet-builder). The year's figures, fees, document list and
// claim history are remembered in this browser; children's details stay in
// this tab only. Loading the example pauses remembering until "Start your
// own", so example figures never replace the school's saved ones.
export function RteClaimTool() {
  const [settings, setSettings] = useState<RteSettings>(blankSettings);
  const [children, setChildren] = useState<RteChild[]>([]);
  const [isExample, setIsExample] = useState(false);
  const [fromExample, setFromExample] = useState(false);
  const [canStore, setCanStore] = useState(true);
  const [msg, setMsg] = useState('');
  const [todayD, setTodayD] = useState<DayDate | null>(null);
  const touched = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = useToday();
  const { profile } = useSchoolProfile();

  useEffect(() => {
    setTodayD(dateOf(new Date()));
    const saved = readRteSettings();
    if (saved) setSettings(saved);
  }, []);

  // Remember the school's own settings after every change it makes.
  useEffect(() => {
    if (!touched.current || fromExample) return;
    setCanStore(saveRteSettings(settings));
  }, [settings, fromExample]);

  const docCount = settings.documents.length;
  const edit = (patch: Partial<RteSettings>) => {
    touched.current = true;
    setIsExample(false);
    setSettings((s) => ({ ...s, ...patch }));
  };
  const editChildren = (next: RteChild[]) => {
    setIsExample(false);
    setChildren(next);
  };
  const setChild = (i: number, patch: Partial<RteChild>) => editChildren(children.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setFee = (i: number, patch: Partial<ClassFee>) => edit({ classFees: settings.classFees.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const setAgeing = (i: number, patch: Partial<AgeingRow>) => edit({ ageing: settings.ageing.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const removeDocument = (i: number) => {
    edit({ documents: settings.documents.filter((_, j) => j !== i) });
    setChildren((list) => list.map((c) => ({ ...c, docs: c.docs.filter((_, j) => j !== i) })));
  };

  function loadExample() {
    setSettings({ ...RTE_EXAMPLE_SETTINGS, classFees: RTE_EXAMPLE_SETTINGS.classFees.map((f) => ({ ...f })), documents: [...RTE_EXAMPLE_SETTINGS.documents], ageing: RTE_EXAMPLE_SETTINGS.ageing.map((r) => ({ ...r })) });
    setChildren(RTE_EXAMPLE_CHILDREN.map((c) => ({ ...c, docs: [...c.docs] })));
    setIsExample(true);
    setFromExample(true);
    setMsg('');
  }

  function startOwn() {
    setSettings(readRteSettings() ?? blankSettings());
    setChildren([]);
    setIsExample(false);
    setFromExample(false);
    setMsg('');
  }

  function forgetSaved() {
    forgetRteSettings();
    touched.current = false;
    setSettings(blankSettings());
    setFromExample(false);
    setIsExample(false);
    setCanStore(true);
    setMsg('Saved settings removed from this browser.');
  }

  async function openCsv(file: File) {
    if (file.size > MAX_BYTES) return setMsg('That file is over 1 MB.');
    let r;
    try {
      r = childrenFromCsv(await file.text(), settings.documents);
    } catch {
      return setMsg('That file could not be read. Save it as CSV (comma separated) and try again.');
    }
    if (r.error) return setMsg(r.error);
    editChildren(r.children);
    const notes = [`Opened ${r.children.length} ${r.children.length === 1 ? 'child' : 'children'}.`];
    if (r.ignored.length) notes.push(`Ignored columns: ${r.ignored.join(', ')}. To use one as a document, add it to the document list and open the file again.`);
    if (r.unreadableDates) notes.push(`${r.unreadableDates} admission ${r.unreadableDates === 1 ? 'date' : 'dates'} could not be read and ${r.unreadableDates === 1 ? 'was' : 'were'} left blank.`);
    setMsg(notes.join(' '));
  }

  const result = useMemo(() => (todayD ? buildClaim(settings, children, todayD) : null), [settings, children, todayD]);
  const report = useMemo(() => (result?.report ? withSchool(result.report, profile) : null), [result, profile]);
  const exampleRate = fromExample && settings.rate === RTE_EXAMPLE_SETTINGS.rate;

  return (
    <div className="flex flex-col gap-8">
      <SchoolProfilePanel compact />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnQuiet} onClick={loadExample}>
          <Icon name="sparkle" className="h-4 w-4" /> Try an example
        </button>
        <button type="button" className={btnQuiet} onClick={startOwn}>
          Start your own
        </button>
        <button type="button" className={btnQuiet} onClick={forgetSaved}>
          Forget saved settings
        </button>
      </div>
      {isExample && (
        <p className="rounded-xl border border-amber bg-white p-3 text-sm font-semibold text-amber-text">
          Example data: fictional children, fees, state rate and claims. Your saved settings are not changed. Press Start your own to begin.
        </p>
      )}

      <form className="grid grid-cols-1 gap-8 rounded-3xl border border-slate/10 bg-white p-5 lg:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className={legendCls}>The year’s rates</legend>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rte-year" className="text-sm font-medium text-slate">
              Academic year
            </label>
            <input id="rte-year" className={inputCls} maxLength={20} placeholder="2026-27" value={settings.year} onChange={(e) => edit({ year: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rte-rate" className="text-sm font-medium text-slate">
              State’s per-child rate for the year <span className="text-red-800">*</span>
            </label>
            <input id="rte-rate" className={inputCls} inputMode="decimal" maxLength={14} aria-describedby="rte-rate-help" value={settings.rate} onChange={(e) => edit({ rate: e.target.value })} />
            <p id="rte-rate-help" className="text-xs text-slate/70">
              From your state’s RTE reimbursement notification for the year. Rates differ by state and change each year, so nothing is filled in for you.
            </p>
            {exampleRate && <p className="text-xs font-semibold text-amber-text">This rate is from the example. Enter your state’s rate before you use the sheet.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rte-fee" className="text-sm font-medium text-slate">
              School’s annual fee
            </label>
            <input id="rte-fee" className={inputCls} inputMode="decimal" maxLength={14} aria-describedby="rte-fee-help" value={settings.fee} onChange={(e) => edit({ fee: e.target.value })} />
            <p id="rte-fee-help" className="text-xs text-slate/70">
              The fee the school charges for a year. Set a different fee for a class below.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate">Fee by class (optional)</p>
            {settings.classFees.length > 0 && (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={thCls}>
                      Class
                    </th>
                    <th scope="col" className={thCls}>
                      Annual fee
                    </th>
                    <th scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {settings.classFees.map((f, i) => (
                    <tr key={i}>
                      <td className="p-1">
                        <input aria-label={`Class, fee row ${i + 1}`} className={inputCls} maxLength={30} value={f.cls} onChange={(e) => setFee(i, { cls: e.target.value })} />
                      </td>
                      <td className="p-1">
                        <input aria-label={`Annual fee for ${f.cls || `fee row ${i + 1}`}`} className={inputCls} inputMode="decimal" maxLength={14} value={f.fee} onChange={(e) => setFee(i, { fee: e.target.value })} />
                      </td>
                      <td className="w-[44px] p-1">
                        <button type="button" aria-label={`Remove the fee for ${f.cls || `row ${i + 1}`}`} className={removeCls} onClick={() => edit({ classFees: settings.classFees.filter((_, j) => j !== i) })}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button type="button" className={`${btnQuiet} w-fit`} disabled={settings.classFees.length >= MAX_CLASS_FEES} onClick={() => edit({ classFees: [...settings.classFees, { cls: '', fee: '' }] })}>
              + Add a class fee
            </button>
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className={legendCls}>Document checklist</legend>
          <p className="text-sm text-slate/70">The documents you hold for each child. Rename or add items to match your state’s portal.</p>
          <ol className="flex flex-col gap-2">
            {settings.documents.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <span aria-hidden="true" className="w-6 shrink-0 text-right text-sm text-slate/70">{`${i + 1}.`}</span>
                <input aria-label={`Document ${i + 1}`} className={inputCls} maxLength={80} value={d} onChange={(e) => edit({ documents: settings.documents.map((x, j) => (j === i ? e.target.value : x)) })} />
                <button type="button" aria-label={`Remove ${d || `document ${i + 1}`}`} className={removeCls} onClick={() => removeDocument(i)}>
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className={`${btnQuiet} w-fit`} disabled={docCount >= MAX_DOCUMENTS} onClick={() => edit({ documents: [...settings.documents, ''] })}>
            + Add a document
          </button>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2 lg:col-span-2">
          <legend className={legendCls}>Children admitted under section 12(1)(c)</legend>
          <p className="text-sm text-slate/70">Children’s details stay in this tab and are never saved. Save the list as a CSV file to continue later.</p>
          {children.length > 0 && (
            <div className="nca-scroll relative overflow-x-auto" role="region" aria-label="Children" tabIndex={0}>
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <thead>
                  <tr className="align-bottom">
                    <th scope="col" className={thCls}>
                      Name
                    </th>
                    <th scope="col" className={thCls}>
                      Class
                    </th>
                    <th scope="col" className={thCls}>
                      Admission date
                    </th>
                    {settings.documents.map((d, j) => (
                      <th key={j} scope="col" className={`${thCls} max-w-[7rem] text-center font-semibold`}>
                        {d || `Document ${j + 1}`}
                      </th>
                    ))}
                    <th scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((c, i) => {
                    const who = c.name || `row ${i + 1}`;
                    return (
                      <tr key={i}>
                        <td className="p-1">
                          <input aria-label={`Name, row ${i + 1}`} className={`${inputCls} min-w-[10rem]`} maxLength={80} value={c.name} onChange={(e) => setChild(i, { name: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input aria-label={`Class, ${who}`} className={`${inputCls} w-24`} maxLength={30} value={c.cls} onChange={(e) => setChild(i, { cls: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input aria-label={`Admission date, ${who}`} type="date" className={`${inputCls} w-40`} value={c.admitted} onChange={(e) => setChild(i, { admitted: e.target.value })} />
                        </td>
                        {settings.documents.map((d, j) => (
                          <td key={j} className="p-1 text-center">
                            <label className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md hover:bg-off-white">
                              <input
                                type="checkbox"
                                className="h-5 w-5 accent-sapphire"
                                aria-label={`${d || `Document ${j + 1}`}, ${who}`}
                                checked={Boolean(c.docs[j])}
                                onChange={(e) => {
                                  const docs = Array.from({ length: docCount }, (_, k) => Boolean(c.docs[k]));
                                  docs[j] = e.target.checked;
                                  setChild(i, { docs });
                                }}
                              />
                            </label>
                          </td>
                        ))}
                        <td className="p-1">
                          <button type="button" aria-label={`Remove ${who}`} className={removeCls} onClick={() => editChildren(children.filter((_, j) => j !== i))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnQuiet} disabled={children.length >= MAX_CHILDREN} onClick={() => editChildren([...children, blankChild(docCount)])}>
              + Add a child
            </button>
            <button type="button" className={btnQuiet} onClick={() => fileRef.current?.click()}>
              <Icon name="download" className="h-4 w-4 rotate-180" /> Open CSV
            </button>
            <button type="button" className={btnQuiet} disabled={!children.length} onClick={() => downloadBlob(csvBlob(childrenToCsv(children, settings.documents)), 'rte-children.csv')}>
              <Icon name="download" className="h-4 w-4" /> Save list as CSV
            </button>
            <button type="button" className={btnLine} onClick={() => downloadBlob(csvBlob(rteTemplateCsv(settings.documents)), 'rte-children-template.csv')}>
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

        <fieldset className="flex min-w-0 flex-col gap-2 lg:col-span-2">
          <legend className={legendCls}>Claims filed and payments received</legend>
          <p className="text-sm text-slate/70">One row for each academic year: what was claimed, the date it was filed and what has been received so far.</p>
          {settings.ageing.length > 0 && (
            <div className="nca-scroll relative overflow-x-auto" role="region" aria-label="Claims filed" tabIndex={0}>
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={thCls}>
                      Academic year
                    </th>
                    <th scope="col" className={thCls}>
                      Amount claimed
                    </th>
                    <th scope="col" className={thCls}>
                      Date filed
                    </th>
                    <th scope="col" className={thCls}>
                      Amount received
                    </th>
                    <th scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {settings.ageing.map((r, i) => {
                    const yr = r.year || `row ${i + 1}`;
                    return (
                      <tr key={i}>
                        <td className="p-1">
                          <input aria-label={`Academic year, claim row ${i + 1}`} className={inputCls} maxLength={20} value={r.year} onChange={(e) => setAgeing(i, { year: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input aria-label={`Amount claimed, ${yr}`} className={inputCls} inputMode="decimal" maxLength={16} value={r.claimed} onChange={(e) => setAgeing(i, { claimed: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input aria-label={`Date filed, ${yr}`} type="date" className={inputCls} value={r.filed} onChange={(e) => setAgeing(i, { filed: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input aria-label={`Amount received, ${yr}`} className={inputCls} inputMode="decimal" maxLength={16} value={r.received} onChange={(e) => setAgeing(i, { received: e.target.value })} />
                        </td>
                        <td className="w-[44px] p-1">
                          <button type="button" aria-label={`Remove the claim for ${yr}`} className={removeCls} onClick={() => edit({ ageing: settings.ageing.filter((_, j) => j !== i) })}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            className={`${btnQuiet} w-fit`}
            disabled={settings.ageing.length >= MAX_AGEING}
            onClick={() => edit({ ageing: [...settings.ageing, { year: '', claimed: '', filed: '', received: '' }] })}
          >
            + Add a year’s claim
          </button>
        </fieldset>
      </form>
      <p className="flex items-start gap-2 text-sm text-slate/70">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
        {!canStore
          ? 'This browser does not allow saving, so the rates and documents work on this page only. Nothing is sent to NetCyberAI.'
          : fromExample
            ? 'Example figures are not remembered. Nothing is sent to NetCyberAI.'
            : 'The year, rate, fees, document list and claims are remembered in this browser; children’s details are not. Nothing is sent to NetCyberAI.'}
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
            <ReportActions report={report} lang="en" fileBase={`RTE claim sheet ${settings.year}`} rulesUpdated={RULES_UPDATED} sourcePath={SOURCE} />
            <ReportView report={report} meta={{ generatedOn: today, rulesUpdated: RULES_UPDATED, rulesLabel: 'Rules last updated', assumptionsLabel: 'Assumptions' }} />
          </>
        ) : (
          <p className="rounded-2xl bg-off-white p-4 text-slate">Enter the state’s rate and add the children, or a year’s claim, to see the claim sheet.</p>
        )}
      </div>
    </div>
  );
}
