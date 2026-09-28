'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { CERT_EXAMPLES, CERT_SCHOOL_EXAMPLE } from '@/demo-fixture/certificate-examples';
import {
  CERT_DEFS,
  SCHOOL_FIELDS,
  TEMPLATE_NAMES,
  findCertDef,
  missingRequired,
  type CertDef,
  type CertDoc,
  type CertField,
  type CertImage,
  type CertRows,
  type CertType,
  type CertValues,
  type TemplateId,
} from '@/lib/certificates/definitions';
import { FONTS, renderCertificateSvg, type Measure } from '@/lib/certificates/render';
import { A4_300DPI } from '@/lib/pdf/jpeg-pdf';
import { canvasToJpeg, downloadBlob, pdfBlob, safeFilename, shareFile, svgToCanvas } from '@/lib/pdf/browser';
import { toCsv } from '@/lib/free-tools/report';
import { ImagePicker } from './ImagePicker';
import { usePrint } from './PrintPortal';
import { LockedFeatures } from './LockedFeatures';

// The free certificate studio. Every value typed and every image chosen
// lives only in this component's memory: no storage, no upload, no
// server rendering. Closing, refreshing or pressing "Clear everything"
// removes all of it. Free and unlimited, with no login (founder, C79).
// Bulk generation and auto-send are shown as NetCyberAI features.

const SCHOOL_IDS = new Set([...SCHOOL_FIELDS.map((f) => f.id), 'signName', 'signTitle']);
const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const btn =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:cursor-not-allowed disabled:opacity-50';
const solid = `${btn} bg-sapphire text-white hover:bg-sapphire/90`;
const action = `${btn} bg-tangerine text-slate hover:bg-tangerine/90`;
const quiet = `${btn} border border-slate/20 bg-white text-slate hover:bg-off-white`;

interface Issued {
  no: string;
  type: string;
  name: string;
  admissionNo: string;
  date: string;
}

// "SPS/TC/2026/041" -> "SPS/TC/2026/042", keeping leading zeros.
export function nextNumber(no: string): string {
  const m = no.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return no;
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0');
  return `${m[1]}${n}${m[3]}`;
}

function useMeasure(): Measure {
  const ctx = useRef<CanvasRenderingContext2D | null>(null);
  return useCallback((t, size, bold, serif) => {
    if (!ctx.current && typeof document !== 'undefined') ctx.current = document.createElement('canvas').getContext('2d');
    const c = ctx.current;
    if (!c) return t.length * size * 0.5;
    c.font = `${bold ? 700 : 400} 100px ${serif ? FONTS.SERIF : FONTS.SANS}`;
    return (c.measureText(t).width / 100) * size;
  }, []);
}

function blankRows(def: CertDef): CertRows {
  return Object.fromEntries((def.tables ?? []).map((t) => [t.id, [Object.fromEntries(t.columns.map((c) => [c.id, '']))]]));
}

function defaultsFor(def: CertDef): CertValues {
  const out: CertValues = {};
  for (const f of def.fields) if (f.kind === 'select' && f.options?.length) out[f.id] = f.options[0];
  return out;
}

function FieldInput({ f, value, onChange, idPrefix }: { f: CertField; value: string; onChange: (v: string) => void; idPrefix: string }) {
  const id = `${idPrefix}-${f.id}`;
  const helpId = f.help ? `${id}-help` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${f.kind === 'textarea' ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={id} className="text-sm font-medium text-slate">
        {f.label}
        {f.required && (
          <>
            <span aria-hidden="true" className="text-red-800">
              {' '}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {f.kind === 'select' ? (
        <select id={id} className={inputCls} value={value} aria-describedby={helpId} required={f.required} onChange={(e) => onChange(e.target.value)}>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o || '—'}
            </option>
          ))}
        </select>
      ) : f.kind === 'textarea' ? (
        <textarea id={id} className={`${inputCls} py-2`} rows={3} maxLength={f.max} value={value} aria-describedby={helpId} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={id}
          className={inputCls}
          type={f.kind === 'date' ? 'date' : f.kind === 'number' ? 'number' : 'text'}
          inputMode={f.kind === 'number' ? 'decimal' : undefined}
          maxLength={f.max}
          required={f.required}
          aria-describedby={helpId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {f.help && (
        <p id={helpId} className="text-xs text-slate/70">
          {f.help}
        </p>
      )}
    </div>
  );
}

export function CertificateStudio({ initialType }: { initialType: CertType }) {
  const [type, setType] = useState<CertType>(initialType);
  const def = findCertDef(type) as CertDef;
  const [template, setTemplate] = useState<TemplateId>(def.templates[0]);
  const [school, setSchool] = useState<CertValues>({});
  const [values, setValues] = useState<CertValues>(() => defaultsFor(def));
  const [rows, setRows] = useState<CertRows>(() => blankRows(def));
  const [images, setImages] = useState<CertDoc['images']>({});
  const [options, setOptions] = useState({ stampBox: true, qr: false });
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const measure = useMeasure();
  const { print, portal } = usePrint();
  const profileRef = useRef<HTMLInputElement>(null);


  const doc: CertDoc = useMemo(() => ({ def, template, values: { ...values, ...school }, rows, images, options }), [def, template, values, school, rows, images, options]);
  const deferred = useDeferredValue(doc);
  // The preview is laid out with the browser's own font measurements, so
  // it is only drawn after mount; the server has no fonts to measure with.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const svg = useMemo(() => (mounted ? renderCertificateSvg(deferred, measure) : ''), [mounted, deferred, measure]);
  const person = (doc.values[def.personField] ?? '').trim();
  const number = (doc.values[def.numberField] ?? '').trim();
  const key = `${type}|${number}|${person}`;
  const generated = generatedKey === key;

  const say = (m: string) => setStatus(m);

  function switchType(next: CertType) {
    const d = findCertDef(next) as CertDef;
    setType(next);
    setTemplate(d.templates[0]);
    setValues(defaultsFor(d));
    setRows(blankRows(d));
    setGeneratedKey(null);
    setProblems([]);
    say('');
  }

  function setField(id: string, v: string) {
    if (SCHOOL_IDS.has(id)) setSchool((s) => ({ ...s, [id]: v }));
    else setValues((s) => ({ ...s, [id]: v }));
  }

  function loadExample() {
    const ex = CERT_EXAMPLES[type];
    setSchool({ ...CERT_SCHOOL_EXAMPLE, ...Object.fromEntries(Object.entries(ex.values).filter(([k]) => SCHOOL_IDS.has(k))) });
    setValues({ ...defaultsFor(def), ...Object.fromEntries(Object.entries(ex.values).filter(([k]) => !SCHOOL_IDS.has(k))) });
    setRows(ex.rows ? JSON.parse(JSON.stringify(ex.rows)) : blankRows(def));
    setGeneratedKey(null);
    setProblems([]);
    say('Example values from a fictional school are filled in.');
  }

  function clearAll() {
    setSchool({});
    setValues(defaultsFor(def));
    setRows(blankRows(def));
    setImages({});
    setOptions({ stampBox: true, qr: false });
    setGeneratedKey(null);
    setIssued([]);
    setProblems([]);
    say('Everything is cleared from this page.');
  }

  function startNew() {
    // Keeps school details, logo and signature; clears the student and
    // moves the certificate number on by one.
    const next = defaultsFor(def);
    if (number && def.numberField !== 'rollNo') next[def.numberField] = nextNumber(number);
    if (values.issueDate) next.issueDate = values.issueDate;
    setValues(next);
    setRows(blankRows(def));
    setGeneratedKey(null);
    setProblems([]);
    say('Ready for the next certificate. School details are kept; the number has moved on by one.');
    document.getElementById('cert-doc-fields')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function generate() {
    const missing = missingRequired(doc);
    if (missing.length) {
      setProblems(missing);
      say('');
      document.getElementById('cert-problems')?.focus();
      return;
    }
    const clash = issued.find((i) => i.no && i.no === number && i.name !== person);
    if (clash) {
      setProblems([`Number ${number} was already issued in this session to ${clash.name}. Use a different number.`]);
      return;
    }
    setProblems([]);
    {
      setGeneratedKey(key);
      setIssued((l) => [...l.filter((i) => !(i.no === number && i.name === person)), { no: number, type: def.docTitle, name: person, admissionNo: doc.values.admissionNo ?? '', date: doc.values.issueDate || doc.values.paymentDate || '' }]);
      say('Certificate generated. Download the PDF or print it.');
    }
  }

  async function exportSvgs(svgs: string[], filename: string, title: string) {
    setBusy(true);
    try {
      const pages = [];
      for (const s of svgs) {
        const sized = s.replace('width="210mm" height="297mm"', `width="${A4_300DPI.w}" height="${A4_300DPI.h}"`);
        const canvas = await svgToCanvas(sized);
        pages.push(await canvasToJpeg(canvas, 0.93));
        canvas.width = canvas.height = 0; // release the page's memory
      }
      const blob = pdfBlob(pages, title);
      const shared = window.matchMedia('(pointer: coarse)').matches && (await shareFile(blob, filename, title));
      if (!shared) downloadBlob(blob, filename);
      say(`PDF ready: ${svgs.length} page${svgs.length > 1 ? 's' : ''}, A4 at 300 DPI.`);
    } catch (e) {
      say((e as Error).message || 'The PDF could not be made in this browser. Try Print and choose “Save as PDF”.');
    } finally {
      setBusy(false);
    }
  }

  const fileBase = `${def.docTitle} ${number}`.trim();

  // ---- school profile file (saved by the visitor, never by us) -------------
  function saveProfile() {
    const data = { kind: 'netcyberai-school-profile', version: 1, school, logo: images.logo, signature: images.signature, stamp: images.stamp };
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), safeFilename(`${school.schoolName || 'school'} profile`, 'json'));
    say('School profile saved as a file on your device. Load it next time to skip typing.');
  }

  async function loadProfile(file: File) {
    if (file.size > 8 * 1024 * 1024) return say('That profile file is too large.');
    try {
      const data = JSON.parse(await file.text());
      if (data?.kind !== 'netcyberai-school-profile') throw new Error('bad');
      const clean: CertValues = {};
      for (const id of SCHOOL_IDS) if (typeof data.school?.[id] === 'string') clean[id] = data.school[id].slice(0, 140);
      const img = (x: unknown): CertImage | undefined =>
        x && typeof x === 'object' && typeof (x as CertImage).src === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test((x as CertImage).src) && Number((x as CertImage).aspect) > 0
          ? { src: (x as CertImage).src, aspect: Number((x as CertImage).aspect) }
          : undefined;
      setSchool(clean);
      setImages({ logo: img(data.logo), signature: img(data.signature), stamp: img(data.stamp) });
      say('School profile loaded.');
    } catch {
      say('That is not a school profile file made by this tool.');
    }
  }

  function registerCsv() {
    const out = [['Certificate', 'Number', 'Name', 'Admission No.', 'Date'], ...issued.map((i) => [i.type, i.no, i.name, i.admissionNo, i.date])];
    downloadBlob(new Blob(['﻿' + toCsv(out)], { type: 'text/csv;charset=utf-8' }), 'issue-register.csv');
  }

  const schoolFields = [...SCHOOL_FIELDS];
  const docFields = def.fields.filter((f) => !SCHOOL_IDS.has(f.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 rounded-2xl border-2 border-emerald bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
        <Icon name="lock" className="h-6 w-6 shrink-0 text-emerald-text" />
        <p className="text-sm text-slate">
          <strong>Nothing is uploaded or saved.</strong> Your form, logo and certificate stay in this browser tab and are never sent to NetCyberAI. Close or refresh the
          tab, or press “Clear everything”, and they are gone. The PDF is made on your device.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <form className="flex min-w-0 flex-col gap-6" onSubmit={(e) => (e.preventDefault(), generate())} noValidate aria-label="Certificate details">
          <section className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5" aria-labelledby="cert-step-1">
            <h2 id="cert-step-1" className="text-lg font-extrabold text-sapphire">
              1. Document and design
            </h2>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cert-type" className="text-sm font-medium text-slate">
                Document
              </label>
              <select id="cert-type" className={inputCls} value={type} onChange={(e) => switchType(e.target.value as CertType)}>
                {CERT_DEFS.map((d) => (
                  <option key={d.type} value={d.type}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate">Template</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {def.templates.map((t) => (
                  <label key={t} className={`flex cursor-pointer flex-col rounded-xl border-2 p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-royal ${template === t ? 'border-royal bg-royal/5' : 'border-slate/15 bg-white'}`}>
                    <input type="radio" name="cert-template" value={t} checked={template === t} onChange={() => setTemplate(t)} className="sr-only" />
                    <span className="text-sm font-bold text-slate">{TEMPLATE_NAMES[t].name}</span>
                    <span className="text-xs text-slate/70">{TEMPLATE_NAMES[t].note}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={quiet} onClick={loadExample}>
                <Icon name="sparkle" className="h-4 w-4" /> Try with example values
              </button>
              <button type="button" className={quiet} onClick={clearAll}>
                Clear everything
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5" aria-labelledby="cert-step-2">
            <h2 id="cert-step-2" className="text-lg font-extrabold text-sapphire">
              2. School details
            </h2>
            <ImagePicker
              label="School logo"
              help="From your gallery or files. It is fitted to each template automatically."
              value={images.logo}
              onChange={(img) => setImages((s) => ({ ...s, logo: img }))}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {schoolFields.map((f) => (
                <FieldInput key={f.id} f={f} idPrefix="cs" value={school[f.id] ?? ''} onChange={(v) => setField(f.id, v)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={quiet} onClick={saveProfile}>
                <Icon name="download" className="h-4 w-4" /> Save school profile file
              </button>
              <button type="button" className={quiet} onClick={() => profileRef.current?.click()}>
                Load school profile file
              </button>
              <input
                ref={profileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadProfile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="text-xs text-slate/70">The profile file is saved on your device by you. We keep no copy.</p>
          </section>

          <section id="cert-doc-fields" className="flex scroll-mt-24 flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5" aria-labelledby="cert-step-3">
            <h2 id="cert-step-3" className="text-lg font-extrabold text-sapphire">
              3. {def.name} details
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {docFields.map((f) => (
                <FieldInput key={`${type}-${f.id}`} f={f} idPrefix="cd" value={values[f.id] ?? ''} onChange={(v) => setField(f.id, v)} />
              ))}
            </div>
            {(def.tables ?? []).map((t) => (
              <fieldset key={t.id} className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-bold text-slate">
                  {t.label}
                  <span aria-hidden="true" className="text-red-800">
                    {' '}
                    *
                  </span>
                </legend>
                <div className="nca-scroll relative overflow-x-auto" role="region" aria-label={t.label} tabIndex={0}>
                  <table className="w-full min-w-[28rem] border-collapse text-sm">
                    <thead>
                      <tr>
                        {t.columns.map((c) => (
                          <th key={c.id} scope="col" className="px-1 text-left text-xs font-bold text-slate">
                            {c.label}
                          </th>
                        ))}
                        <th scope="col">
                          <span className="sr-only">Remove</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows[t.id] ?? []).map((r, ri) => (
                        <tr key={ri}>
                          {t.columns.map((c) => (
                            <td key={c.id} className="p-1">
                              <input
                                aria-label={`${c.label}, row ${ri + 1}`}
                                className={inputCls}
                                type={c.kind === 'number' ? 'number' : 'text'}
                                inputMode={c.kind === 'number' ? 'decimal' : undefined}
                                maxLength={60}
                                value={r[c.id] ?? ''}
                                onChange={(e) => setRows((s) => ({ ...s, [t.id]: s[t.id].map((x, i) => (i === ri ? { ...x, [c.id]: e.target.value } : x)) }))}
                              />
                            </td>
                          ))}
                          <td className="p-1">
                            <button
                              type="button"
                              aria-label={`Remove row ${ri + 1}`}
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-red-800 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                              onClick={() => setRows((s) => ({ ...s, [t.id]: s[t.id].filter((_, i) => i !== ri) }))}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className={`${quiet} w-fit`}
                  disabled={(rows[t.id] ?? []).length >= t.maxRows}
                  onClick={() => setRows((s) => ({ ...s, [t.id]: [...(s[t.id] ?? []), Object.fromEntries(t.columns.map((c) => [c.id, '']))] }))}
                >
                  + Add row
                </button>
              </fieldset>
            ))}
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5" aria-labelledby="cert-step-4">
            <h2 id="cert-step-4" className="text-lg font-extrabold text-sapphire">
              4. Signature, stamp and verification
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldInput f={{ id: 'signName', label: 'Signatory name', kind: 'text', max: 60 }} idPrefix="ss" value={school.signName ?? ''} onChange={(v) => setField('signName', v)} />
              <FieldInput f={{ id: 'signTitle', label: 'Signatory designation', kind: 'text', max: 40 }} idPrefix="ss" value={school.signTitle ?? ''} onChange={(v) => setField('signTitle', v)} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ImagePicker label="Signature (optional)" help="A photo of a signature on white paper works best." value={images.signature} whiteDefault onChange={(img) => setImages((s) => ({ ...s, signature: img }))} />
              <ImagePicker label="School stamp (optional)" value={images.stamp} whiteDefault onChange={(img) => setImages((s) => ({ ...s, stamp: img }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate">
              <input type="checkbox" className="h-5 w-5 accent-royal" checked={options.stampBox} onChange={(e) => setOptions((o) => ({ ...o, stampBox: e.target.checked }))} />
              Leave a marked space for a rubber stamp
            </label>
            <label className="flex items-start gap-2 text-sm text-slate">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-royal" checked={options.qr} onChange={(e) => setOptions((o) => ({ ...o, qr: e.target.checked }))} />
              <span>
                Add a verification QR code. It holds the school, certificate number, name and date as text, so anyone can compare it with the printed page. It is not an
                online check, because nothing is stored.
              </span>
            </label>
          </section>

          <LockedFeatures kind="certificate" compact />
        </form>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-20 xl:self-start" aria-label="Certificate preview and actions">
          <div className="flex flex-col gap-3 rounded-3xl border border-slate/10 bg-white p-4">
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Steps">
              <li>
                <button type="button" className={`${action} w-full`} onClick={generate}>
                  1. Generate
                </button>
              </li>
              <li>
                <button type="button" className={`${solid} w-full`} disabled={!generated || busy} onClick={() => exportSvgs([svg], safeFilename(fileBase, 'pdf'), def.docTitle)}>
                  {busy ? 'Making PDF…' : '2. Download PDF'}
                </button>
              </li>
              <li>
                <button type="button" className={`${quiet} w-full`} disabled={!generated} onClick={() => print(<div className="nca-cert-print" dangerouslySetInnerHTML={{ __html: svg }} />, true)}>
                  3. Print
                </button>
              </li>
              <li>
                <button type="button" className={`${quiet} w-full`} onClick={startNew}>
                  4. Start new
                </button>
              </li>
            </ol>
            <p className="text-xs text-slate/70">
              Free and unlimited. No login, no watermark.
            </p>
            <div id="cert-problems" tabIndex={-1} className="outline-none">
              {problems.length > 0 && (
                <div role="alert" className="rounded-xl border-2 border-red-600 p-3">
                  <p className="text-sm font-bold text-red-800">Please fill in or fix:</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm font-semibold text-emerald-text">
              {status}
            </p>
          </div>
          <div className="aspect-[210/297] overflow-hidden rounded-xl border border-slate/20 bg-white shadow-lg [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-xs text-slate/70">Live preview. The PDF is this page at A4, 300 DPI. Check every detail against school records before signing.</p>
          {issued.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl border border-slate/10 bg-white p-4">
              <p className="text-sm font-bold text-slate">Issued in this session: {issued.length}</p>
              <p className="text-xs text-slate/70">This register lives only in this tab. Download it to keep it with your school records.</p>
              <button type="button" className={`${quiet} w-fit`} onClick={registerCsv}>
                <Icon name="download" className="h-4 w-4" /> Download issue register (CSV)
              </button>
            </div>
          )}
        </aside>
      </div>

      {portal}
    </div>
  );
}
