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
import {
  BATCH_TABLES,
  BULK_LIMIT,
  BULK_MAX_BYTES,
  SCHOOL_IDS,
  buildBatch,
  issuedFrom,
  nextNumber,
  numbersInSequence,
  readCsv,
  registerRows,
  selectDefaults,
  templateCsv,
  type Issued,
} from '@/lib/certificates/bulk';
import { EMPTY_SETTINGS, fillFromProfile, mergeIntoProfile, profileLogo, readSettings, writeSettings, type StudioSettings } from '@/lib/certificates/studio-settings';
import { FONTS, renderCertificateSvg, type Measure } from '@/lib/certificates/render';
import { formatDate } from '@/lib/certificates/words';
import { A4_300DPI, type JpegPage } from '@/lib/pdf/jpeg-pdf';
import { canvasToJpeg, downloadBlob, pdfBlob, safeFilename, shareFile, svgToCanvas } from '@/lib/pdf/browser';
import { toCsv } from '@/lib/free-tools/report';
import { hasProfile } from '@/lib/free-tools/school-profile';
import { ImagePicker } from './ImagePicker';
import { usePrint } from './PrintPortal';
import { LockedFeatures } from './LockedFeatures';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { shrinkLogoForProfile } from './profile-logo';
import { useSchoolProfile } from './useSchoolProfile';

// The free certificate studio. Student details, signatures and stamps live
// only in this component's memory: no upload, no server rendering, never
// written to storage. Closing, refreshing or pressing "Clear everything"
// removes them. Free and unlimited, with no login (founder, C79).
// The school's own details and logo are filled in from, and can be saved
// to, the school profile kept in this browser (C198-B); the design, the
// next certificate number and the academic year are remembered too. Many
// certificates can be made at once from a CSV, as one PDF.

const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const btn =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:cursor-not-allowed disabled:opacity-50';
const solid = `${btn} bg-sapphire text-white hover:bg-sapphire/90`;
const action = `${btn} bg-tangerine text-slate hover:bg-tangerine/90`;
const quiet = `${btn} border border-slate/20 bg-white text-slate hover:bg-off-white`;
const BOM = String.fromCharCode(0xfeff); // so Excel opens the CSV as UTF-8

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

// One A4 page as JPEG bytes. The canvas is released straight away, so a
// batch holds only the compressed pages, never hundreds of canvases.
async function svgToJpeg(svg: string, quality: number): Promise<JpegPage> {
  const sized = svg.replace('width="210mm" height="297mm"', `width="${A4_300DPI.w}" height="${A4_300DPI.h}"`);
  const canvas = await svgToCanvas(sized);
  try {
    return await canvasToJpeg(canvas, quality);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

const yieldToBrowser = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

function downloadCsv(rows: string[][], filename: string) {
  downloadBlob(new Blob([BOM + toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename);
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
  const [values, setValues] = useState<CertValues>(() => selectDefaults(def));
  const [rows, setRows] = useState<CertRows>(() => blankRows(def));
  const [images, setImages] = useState<CertDoc['images']>({});
  const [options, setOptions] = useState({ stampBox: true, qr: false });
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [schoolMsg, setSchoolMsg] = useState('');
  const [savingSchool, setSavingSchool] = useState(false);
  const measure = useMeasure();
  const { print, portal } = usePrint();
  const profileRef = useRef<HTMLInputElement>(null);
  const { profile, loaded, save: saveSchool } = useSchoolProfile();
  // School fields typed in this session keep what was typed when the saved
  // profile changes; every other field follows the profile.
  const edited = useRef(new Set<string>());
  const logoEdited = useRef(false);
  const settings = useRef<StudioSettings>(EMPTY_SETTINGS);
  // While the example's fictional numbers are on screen they are never
  // remembered as the school's next number.
  const fromExample = useRef(false);

  // ---- many at once --------------------------------------------------------------
  const [coarse, setCoarse] = useState(false);
  const [bulkFile, setBulkFile] = useState<{ name: string; table: string[][] } | null>(null);
  const [bulkMsg, setBulkMsg] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkOut, setBulkOut] = useState<{ blob: Blob; filename: string; title: string; list: Issued[] } | null>(null);
  const cancelRef = useRef(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const limit = coarse ? BULK_LIMIT.phone : BULK_LIMIT.desktop;

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
  const batch = useMemo(() => (bulkFile ? buildBatch(bulkFile.table, doc, limit, issued.map((i) => i.no)) : null), [bulkFile, doc, limit, issued]);

  const say = (m: string) => setStatus(m);

  // ---- remembered settings (design, next number, academic year) -------------------
  function remember(change: (s: StudioSettings) => StudioSettings) {
    settings.current = change(settings.current);
    writeSettings(settings.current);
  }
  const rememberNext = (t: CertType, no: string) => remember((s) => ({ ...s, next: { ...s.next, [t]: no } }));

  // A new certificate's starting values: the select defaults, the next
  // number and the academic year remembered in this browser.
  function startValues(d: CertDef): CertValues {
    const out = selectDefaults(d);
    const s = settings.current;
    if (numbersInSequence(d) && s.next[d.type]) out[d.numberField] = s.next[d.type] as string;
    if (s.year && d.fields.some((f) => f.id === 'year')) out.year = s.year;
    return out;
  }

  useEffect(() => {
    settings.current = readSettings();
    const t = settings.current.templates[initialType];
    if (t) setTemplate(t);
    const start = startValues(findCertDef(initialType) as CertDef);
    setValues((v) => ({ ...start, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x.trim())) }));
    setCoarse(window.matchMedia('(pointer: coarse)').matches);
    // Runs once on mount: the settings belong to this browser, not the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the school profile saved in this browser -----------------------------------
  useEffect(() => {
    if (!loaded) return;
    setSchool((s) => fillFromProfile(s, profile, edited.current));
    const logo = profileLogo(profile);
    if (logo && !logoEdited.current) setImages((i) => ({ ...i, logo }));
  }, [loaded, profile]);

  async function saveSchoolHere() {
    if (!(school.schoolName ?? '').trim()) return setSchoolMsg('Type the school name first, then save.');
    setSavingSchool(true);
    try {
      let logo: CertImage | null | undefined;
      let note = '';
      if (images.logo && images.logo.src !== profile.logo) {
        const small = await shrinkLogoForProfile(images.logo.src);
        if (small) logo = small;
        else note = ' The logo was too large to keep in the browser, so it was not saved.';
      } else if (!images.logo && logoEdited.current) logo = null;
      if (saveSchool(mergeIntoProfile(profile, school, logo))) {
        edited.current.clear();
        setSchoolMsg(`School details saved in this browser. Every free tool will fill them in.${note}`);
      } else setSchoolMsg('This browser does not allow saving. The details work on this page only.');
    } catch {
      setSchoolMsg('The logo could not be read. Try a PNG or JPG file.');
    } finally {
      setSavingSchool(false);
    }
  }

  function resetBulk() {
    cancelRef.current = true;
    setBulkFile(null);
    setBulkOut(null);
    setBulkMsg('');
  }

  function switchType(next: CertType) {
    const d = findCertDef(next) as CertDef;
    setType(next);
    setTemplate(settings.current.templates[next] ?? d.templates[0]);
    setValues(startValues(d));
    setRows(blankRows(d));
    setGeneratedKey(null);
    setProblems([]);
    resetBulk();
    fromExample.current = false;
    say('');
  }

  function chooseTemplate(t: TemplateId) {
    setTemplate(t);
    remember((s) => ({ ...s, templates: { ...s.templates, [type]: t } }));
  }

  function setField(id: string, v: string) {
    if (SCHOOL_IDS.has(id)) {
      edited.current.add(id);
      setSchool((s) => ({ ...s, [id]: v }));
      return;
    }
    setValues((s) => ({ ...s, [id]: v }));
    if (id === def.numberField && numbersInSequence(def)) {
      fromExample.current = false;
      rememberNext(type, v.trim());
    }
    if (id === 'year') remember((s) => ({ ...s, year: v.trim() }));
  }

  function setLogo(img: CertImage | undefined) {
    logoEdited.current = true;
    setImages((s) => ({ ...s, logo: img }));
  }

  function loadExample() {
    const ex = CERT_EXAMPLES[type];
    // A school with saved details sees the example student on its own
    // letterhead; otherwise the fictional example school is filled in.
    edited.current.clear();
    if (hasProfile(profile)) setSchool((s) => fillFromProfile(s, profile, edited.current));
    else setSchool({ ...CERT_SCHOOL_EXAMPLE, ...Object.fromEntries(Object.entries(ex.values).filter(([k]) => SCHOOL_IDS.has(k))) });
    setValues({ ...selectDefaults(def), ...Object.fromEntries(Object.entries(ex.values).filter(([k]) => !SCHOOL_IDS.has(k))) });
    setRows(ex.rows ? JSON.parse(JSON.stringify(ex.rows)) : blankRows(def));
    setGeneratedKey(null);
    setProblems([]);
    fromExample.current = true;
    say('Example values are filled in.');
  }

  function clearAll() {
    edited.current.clear();
    logoEdited.current = false;
    fromExample.current = false;
    setSchool(fillFromProfile({}, profile, edited.current));
    setValues(startValues(def));
    setRows(blankRows(def));
    setImages({ logo: profileLogo(profile) });
    setOptions({ stampBox: true, qr: false });
    setGeneratedKey(null);
    setIssued([]);
    setProblems([]);
    resetBulk();
    say(hasProfile(profile) ? 'Everything is cleared from this page. The school details saved in this browser are filled in again.' : 'Everything is cleared from this page.');
  }

  function startNew() {
    // Keeps school details, logo and signature; clears the student and
    // moves the certificate number on by one.
    const next = selectDefaults(def);
    if (number && numbersInSequence(def)) {
      next[def.numberField] = nextNumber(number);
      if (!fromExample.current) rememberNext(type, next[def.numberField]);
    }
    if (values.issueDate) next.issueDate = values.issueDate;
    if (values.year) next.year = values.year;
    setValues(next);
    setRows(blankRows(def));
    setGeneratedKey(null);
    setProblems([]);
    say('Ready for the next certificate. School details are kept; the number has moved on by one.');
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('cert-doc-fields')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
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
    setGeneratedKey(key);
    setIssued((l) => [...l.filter((i) => !(i.no === number && i.name === person)), issuedFrom(doc)]);
    if (number && numbersInSequence(def) && !fromExample.current) rememberNext(type, nextNumber(number));
    say('Certificate generated. Download the PDF or print it.');
  }

  async function exportSvgs(svgs: string[], filename: string, title: string) {
    setBusy(true);
    try {
      const pages = [];
      for (const s of svgs) pages.push(await svgToJpeg(s, 0.93));
      const blob = pdfBlob(pages, title);
      const shared = coarse && (await shareFile(blob, filename, title));
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
  function saveProfileFile() {
    const data = { kind: 'netcyberai-school-profile', version: 1, school, logo: images.logo, signature: images.signature, stamp: images.stamp };
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), safeFilename(`${school.schoolName || 'school'} profile`, 'json'));
    setSchoolMsg('School profile saved as a file on your device. Load it next time to skip typing.');
  }

  async function loadProfileFile(file: File) {
    if (file.size > 8 * 1024 * 1024) return setSchoolMsg('That profile file is too large.');
    try {
      const data = JSON.parse(await file.text());
      if (data?.kind !== 'netcyberai-school-profile') throw new Error('bad');
      const clean: CertValues = {};
      for (const id of SCHOOL_IDS) if (typeof data.school?.[id] === 'string') clean[id] = data.school[id].slice(0, 140);
      const img = (x: unknown): CertImage | undefined =>
        x && typeof x === 'object' && typeof (x as CertImage).src === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test((x as CertImage).src) && Number((x as CertImage).aspect) > 0
          ? { src: (x as CertImage).src, aspect: Number((x as CertImage).aspect) }
          : undefined;
      // What the visitor loads is theirs: the saved profile does not refill it.
      for (const id of SCHOOL_IDS) edited.current.add(id);
      logoEdited.current = true;
      setSchool(clean);
      setImages({ logo: img(data.logo), signature: img(data.signature), stamp: img(data.stamp) });
      setSchoolMsg('School profile loaded.');
    } catch {
      setSchoolMsg('That is not a school profile file made by this tool.');
    }
  }

  // ---- many at once ----------------------------------------------------------------
  async function openBulk(file: File) {
    setBulkOut(null);
    setBulkFile(null);
    if (file.size > BULK_MAX_BYTES) return setBulkMsg('That file is over 1 MB. Split it into smaller files and open each in turn.');
    try {
      setBulkFile({ name: file.name, table: readCsv(await file.text()) });
      setBulkMsg('');
    } catch {
      setBulkMsg('That file could not be read. Save it from your spreadsheet as CSV (comma separated) and open it again.');
    }
  }

  async function makeBatch() {
    if (!batch || batch.error || batch.batchProblems.length || !batch.ready.length || progress) return;
    const ready = batch.ready;
    const title = `${def.docTitle}s`;
    cancelRef.current = false;
    setBulkOut(null);
    setBulkMsg('');
    const pages: JpegPage[] = [];
    try {
      for (let i = 0; i < ready.length; i++) {
        if (cancelRef.current) break;
        setProgress({ done: i + 1, total: ready.length });
        pages.push(await svgToJpeg(renderCertificateSvg(ready[i].doc, measure), 0.9));
        await yieldToBrowser();
      }
      if (cancelRef.current) {
        setBulkMsg('Stopped. No PDF was made and no numbers were used.');
        return;
      }
      const list = ready.map((r) => issuedFrom(r.doc));
      const blob = pdfBlob(pages, title);
      setIssued((l) => [...l, ...list]);
      const last = list[list.length - 1].no;
      if (numbersInSequence(def) && last) {
        setValues((v) => ({ ...v, [def.numberField]: nextNumber(last) }));
        if (!fromExample.current) rememberNext(type, nextNumber(last));
      }
      setBulkOut({ blob, filename: safeFilename(`${def.docTitle}s ${list.length}`, 'pdf'), title, list });
      setBulkFile(null);
    } catch (e) {
      setBulkMsg((e as Error).message || 'The PDF could not be made in this browser. Try a smaller file.');
    } finally {
      setProgress(null);
    }
  }

  async function downloadBatch() {
    if (!bulkOut) return;
    const shared = coarse && (await shareFile(bulkOut.blob, bulkOut.filename, bulkOut.title));
    if (!shared) downloadBlob(bulkOut.blob, bulkOut.filename);
  }

  const schoolFields = [...SCHOOL_FIELDS];
  const docFields = def.fields.filter((f) => !SCHOOL_IDS.has(f.id));
  const numberDef = def.fields.find((f) => f.id === def.numberField);
  const badRows = batch ? batch.rows.filter((r) => r.problems.length) : [];
  const batchNos = batch && numbersInSequence(def) ? batch.ready.map((r) => r.doc.values[def.numberField]).filter(Boolean) : [];
  const canMake = Boolean(batch && !batch.error && !batch.batchProblems.length && batch.ready.length && !progress);
  const showValue = (id: string) => {
    const f = def.fields.find((x) => x.id === id);
    const v = (doc.values[id] ?? '').trim();
    return f?.kind === 'date' ? formatDate(v) || v : v;
  };

  return (
    <div className="flex flex-col gap-6">
      <SchoolProfilePanel compact />

      <div className="flex flex-col gap-2 rounded-2xl border-2 border-emerald bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
        <Icon name="lock" className="h-6 w-6 shrink-0 text-emerald-text" />
        <p className="text-sm text-slate">
          <strong>Nothing is uploaded.</strong> Student details, signatures and stamps stay in this browser tab only: they are not stored in the browser and are
          never sent to NetCyberAI. Close or refresh the tab, or press “Clear everything”, and they are gone. Only your school’s own details and logo are kept in
          this browser, if you save them, with the design and the next certificate number. The PDF is made on your device.
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
                    <input type="radio" name="cert-template" value={t} checked={template === t} onChange={() => chooseTemplate(t)} className="sr-only" />
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
            <ImagePicker label="School logo" help="From your gallery or files. It is fitted to each template automatically." value={images.logo} onChange={setLogo} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {schoolFields.map((f) => (
                <FieldInput key={f.id} f={f} idPrefix="cs" value={school[f.id] ?? ''} onChange={(v) => setField(f.id, v)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={solid} disabled={savingSchool} onClick={() => void saveSchoolHere()}>
                <Icon name="check" className="h-4 w-4" /> {savingSchool ? 'Saving…' : 'Save school details in this browser'}
              </button>
              <button type="button" className={quiet} onClick={saveProfileFile}>
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
                  if (f) void loadProfileFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <p role="status" className="text-sm font-semibold text-emerald-text empty:hidden">
              {schoolMsg}
            </p>
            <p className="text-xs text-slate/70">
              Saving in this browser keeps the school’s details, the signatory’s name and the logo on this device, and every free tool fills them in. Signatures and
              stamps are never saved in the browser: they stay in this tab only. The profile file is saved on your device by you, with the signature and stamp if you
              added them. We keep no copy of either.
            </p>
          </section>

          <section id="cert-doc-fields" className="flex scroll-mt-24 flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5" aria-labelledby="cert-step-3">
            <h2 id="cert-step-3" className="text-lg font-extrabold text-sapphire">
              3. {def.name} details
            </h2>
            <p className="text-sm text-slate/70">
              One student at a time, with a live preview. For a whole list, see{' '}
              <a href="#cert-bulk" className="font-semibold text-royal-deep underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                Make many at once
              </a>
              .
            </p>
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
              <ImagePicker label="Signature (optional)" help="A photo of a signature on white paper works best. Never saved in the browser; kept in this tab only." value={images.signature} whiteDefault onChange={(img) => setImages((s) => ({ ...s, signature: img }))} />
              <ImagePicker label="School stamp (optional)" help="Never saved in the browser; kept in this tab only." value={images.stamp} whiteDefault onChange={(img) => setImages((s) => ({ ...s, stamp: img }))} />
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

          <section id="cert-bulk" className="flex scroll-mt-24 flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5" aria-labelledby="cert-step-5">
            <h2 id="cert-step-5" className="text-lg font-extrabold text-sapphire">
              5. Make many at once
            </h2>
            <p className="text-sm text-slate">
              Open a CSV of up to {BULK_LIMIT.desktop} students to make them all at once: one PDF with a page for each,{' '}
              {numbersInSequence(def) ? 'numbered in sequence' : 'in the order of your list'}. The school details, logo, signature, stamp and design above go on
              every page.
            </p>
            {coarse && (
              <p className="rounded-xl border border-amber bg-white p-3 text-sm font-semibold text-amber-text">
                On a phone, up to {BULK_LIMIT.phone} students at a time, so the phone does not run out of memory. Split a longer list, or use a computer for up to{' '}
                {BULK_LIMIT.desktop}.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-slate">a. Get the template</p>
              <p className="text-xs text-slate/70">
                One column for each {def.name} field, with one fictional example row to replace with your students. Write dates as DD/MM/YYYY.
                {(def.tables ?? []).map(
                  (t) =>
                    ` ${t.label} go in numbered columns (${t.columns.map((c) => `${c.id}_1`).join(', ')}, then _2 and so on, up to ${t.maxRows}).${BATCH_TABLES.has(t.id) ? ` Leave them out to use the ${t.label.toLowerCase()} in step 3 for everyone.` : ''}`
                )}{' '}
                Columns you leave out are left blank, except the ones shared by the whole batch, which come from step 3.
              </p>
              <button type="button" className={`${quiet} w-fit`} onClick={() => downloadCsv(templateCsv(def, CERT_EXAMPLES[type]), safeFilename(`${def.docTitle} list template`, 'csv'))}>
                <Icon name="download" className="h-4 w-4" /> Download CSV template
              </button>
            </div>
            {numbersInSequence(def) && numberDef && (
              <div className="max-w-sm">
                <FieldInput
                  f={{
                    id: def.numberField,
                    label: 'First number in the batch',
                    kind: 'text',
                    max: 30,
                    required: numberDef.required,
                    help: numberDef.required ? 'Each certificate takes the next number, counting up from this one.' : 'Each certificate takes the next number, counting up from this one. Leave it blank for no numbers.',
                  }}
                  idPrefix="cb"
                  value={values[def.numberField] ?? ''}
                  onChange={(v) => setField(def.numberField, v)}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-slate">b. Open your list</p>
              <p className="text-xs text-slate/70">A CSV file up to 1 MB, saved from Excel or Google Sheets. It is read in this browser only.</p>
              <button type="button" className={`${quiet} w-fit`} disabled={Boolean(progress)} onClick={() => bulkFileRef.current?.click()}>
                <Icon name="download" className="h-4 w-4 rotate-180" /> Open CSV
              </button>
              <input
                ref={bulkFileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void openBulk(f);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              {batch?.error && (
                <p role="alert" className="rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-semibold text-red-800">
                  {batch.error}
                </p>
              )}
              {batch && !batch.error && (
                <>
                  <p role="status" className="break-words text-sm text-slate">
                    <strong>{bulkFile?.name}</strong>: {batch.total} {batch.total === 1 ? 'row' : 'rows'} read. {batch.ready.length} ready
                    {badRows.length > 0 && `, ${badRows.length} with problems, left out until fixed in the file`}.
                  </p>
                  {batchNos.length > 0 && (
                    <p className="text-sm text-slate">
                      Numbers {batchNos[0]} to {batchNos[batchNos.length - 1]}.
                    </p>
                  )}
                  {batch.fromForm.length > 0 && (
                    <div className="rounded-xl bg-off-white p-3 text-sm text-slate">
                      <p className="font-semibold">Not in your file, so taken from step 3 for every certificate:</p>
                      <ul className="mt-1 list-disc pl-5">
                        {batch.fromForm.map((id) => (
                          <li key={id}>
                            {def.fields.find((f) => f.id === id)?.label}: {showValue(id)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {batch.unknown.length > 0 && <p className="text-xs text-slate/70">Columns not used: {batch.unknown.join(', ')}. Check their names against the template.</p>}
                  {batch.batchProblems.length > 0 && (
                    <div role="alert" className="rounded-xl border-2 border-red-600 bg-white p-3">
                      <p className="text-sm font-bold text-red-800">Fix these first:</p>
                      <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
                        {batch.batchProblems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {badRows.length > 0 && (
                    <div className="nca-scroll relative overflow-x-auto rounded-xl border border-slate/10 bg-white" role="region" aria-label="Rows with problems" tabIndex={0}>
                      <table className="w-full min-w-[28rem] border-collapse text-sm">
                        <thead>
                          <tr className="bg-off-white">
                            <th scope="col" className="px-3 py-2 text-left font-bold text-slate">
                              Row
                            </th>
                            <th scope="col" className="px-3 py-2 text-left font-bold text-slate">
                              Name
                            </th>
                            <th scope="col" className="px-3 py-2 text-left font-bold text-slate">
                              Missing or to fix
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {badRows.map((r) => (
                            <tr key={r.line} className="border-b border-slate/10">
                              <td className="px-3 py-2 tabular-nums text-slate">{r.line}</td>
                              <td className="px-3 py-2 text-slate">{r.person || '—'}</td>
                              <td className="px-3 py-2 text-red-800">{r.problems.join('; ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={action} disabled={!canMake} onClick={() => void makeBatch()}>
                      {`Make ${batch.ready.length} certificate${batch.ready.length === 1 ? '' : 's'}`}
                    </button>
                    {progress && (
                      <button type="button" className={quiet} onClick={() => (cancelRef.current = true)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </>
              )}
              <p role="status" className="text-sm font-semibold text-emerald-text empty:hidden">
                {progress ? `Making ${progress.done} of ${progress.total}…` : bulkMsg}
              </p>
              {bulkOut && (
                <div className="flex flex-col gap-2 rounded-2xl border-2 border-emerald bg-white p-4">
                  <p className="text-sm font-bold text-slate">
                    {`${bulkOut.list.length} certificate${bulkOut.list.length === 1 ? '' : 's'} made: one PDF, a page for each, A4 at 300 DPI.`}
                    {numbersInSequence(def) && bulkOut.list[0].no && ` Numbers ${bulkOut.list[0].no} to ${bulkOut.list[bulkOut.list.length - 1].no}.`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={solid} onClick={() => void downloadBatch()}>
                      <Icon name="download" className="h-4 w-4" /> Download PDF
                    </button>
                    <button type="button" className={quiet} onClick={() => downloadCsv(registerRows(bulkOut.list), 'issue-register-batch.csv')}>
                      <Icon name="download" className="h-4 w-4" /> Download issue register for this batch (CSV)
                    </button>
                  </div>
                  <p className="text-xs text-slate/70">Check the pages against school records before signing. The list you opened is not kept.</p>
                </div>
              )}
            </div>
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
            <p className="text-xs text-slate/70">Free and unlimited. No login, no watermark.</p>
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
              <button type="button" className={`${quiet} w-fit`} onClick={() => downloadCsv(registerRows(issued), 'issue-register.csv')}>
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
