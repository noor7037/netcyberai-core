'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/visual/Icons';
import { parseCsv } from '@/lib/import/csv';
import { UI, decodeShare, encodeShare, type FieldDef, type Lang, type Row, type ToolSpec, type Values } from '@/lib/free-tools/engine';
import { findToolSpec } from '@/lib/free-tools/specs';
import { ReportActions, btnQuiet, useToday } from './ReportActions';
import { ReportView } from './ReportView';

const SUFFIX: Record<string, { en: string; hi: string }> = {
  money: { en: '₹', hi: '₹' },
  percent: { en: '%', hi: '%' },
  days: { en: 'days', hi: 'din' },
  periods: { en: 'periods', hi: 'periods' },
  sqm: { en: 'sq m', hi: 'sq m' },
  sqft: { en: 'sq ft', hi: 'sq ft' },
  students: { en: 'students', hi: 'students' },
  hours: { en: 'hours', hi: 'ghante' },
  months: { en: 'months', hi: 'mahine' },
  count: { en: '', hi: '' },
};

const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';

const storageKey = (slug: string) => `nca-free-tool:${slug}`;

function readStored(slug: string): Values | null {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as Values) : null;
  } catch {
    return null;
  }
}

export function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <fieldset className="flex items-center gap-1 rounded-full border border-slate/20 bg-white p-1">
      <legend className="sr-only">{UI.language[lang]}</legend>
      {(['en', 'hi'] as const).map((l) => (
        <label key={l} className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-royal ${lang === l ? 'bg-sapphire text-white' : 'text-slate'}`}>
          <input type="radio" name="tool-lang" value={l} checked={lang === l} onChange={() => setLang(l)} className="sr-only" />
          {l === 'en' ? 'English' : 'Hinglish'}
        </label>
      ))}
    </fieldset>
  );
}

function RowsField({ f, value, lang, onChange }: { f: Extract<FieldDef, { kind: 'rows' }>; value: Row[]; lang: Lang; onChange: (r: Row[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const blank = () => Object.fromEntries(f.columns.map((c) => [c.id, ''])) as Row;

  async function importCsv(file: File) {
    if (file.size > 1_000_000) return setMsg(lang === 'en' ? 'That file is over 1 MB.' : 'File 1 MB se badi hai.');
    const table = parseCsv(await file.text());
    if (table.length < 2) return setMsg(lang === 'en' ? 'The file has no data rows.' : 'File mein data rows nahi hain.');
    const head = table[0].map((h) => h.trim().toLowerCase());
    const idx = f.columns.map((c) => head.findIndex((h) => h === c.id.toLowerCase() || h === c.label.en.toLowerCase() || h === c.label.hi.toLowerCase()));
    if (idx.every((i) => i < 0)) return setMsg(lang === 'en' ? 'No matching column names. Export CSV first to see the headings.' : 'Column names match nahi hue.');
    const next = table.slice(1, f.maxRows + 1).map((r) => Object.fromEntries(f.columns.map((c, ci) => [c.id, idx[ci] >= 0 ? (r[idx[ci]] ?? '').trim() : ''])) as Row);
    onChange(next);
    setMsg(lang === 'en' ? `Imported ${next.length} rows.` : `${next.length} rows import hui.`);
  }

  function exportCsv() {
    const lines = [f.columns.map((c) => c.label.en), ...value.map((r) => f.columns.map((c) => r[c.id] ?? ''))];
    const csv = lines.map((l) => l.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${f.id}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-bold text-slate">{f.label[lang]}</legend>
      {f.help && <p className="text-sm text-slate/70">{f.help[lang]}</p>}
      <div className="nca-scroll relative overflow-x-auto" role="region" aria-label={f.label[lang]} tabIndex={0}>
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr>
              {f.columns.map((c) => (
                <th key={c.id} scope="col" className="px-1 pb-1 text-left text-xs font-bold text-slate">
                  {c.label[lang]}
                  {c.suffix && SUFFIX[c.suffix][lang] ? ` (${SUFFIX[c.suffix][lang]})` : ''}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">{UI.remove[lang]}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {value.map((r, ri) => (
              <tr key={ri}>
                {f.columns.map((c) => (
                  <td key={c.id} className="p-1">
                    <input
                      aria-label={`${c.label[lang]}, row ${ri + 1}`}
                      className={`${inputCls} min-w-[5.5rem]`}
                      type={c.kind === 'number' ? 'number' : 'text'}
                      inputMode={c.kind === 'number' ? 'decimal' : undefined}
                      min={c.min}
                      step={c.step ?? 'any'}
                      maxLength={60}
                      value={r[c.id] ?? ''}
                      onChange={(e) => onChange(value.map((x, i) => (i === ri ? { ...x, [c.id]: e.target.value } : x)))}
                    />
                  </td>
                ))}
                <td className="p-1">
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-red-800 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                    onClick={() => onChange(value.filter((_, i) => i !== ri))}
                    aria-label={`${UI.remove[lang]} row ${ri + 1}`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnQuiet} disabled={value.length >= f.maxRows} onClick={() => onChange([...value, blank()])}>
          + {f.addLabel[lang]}
        </button>
        <button type="button" className={btnQuiet} onClick={() => fileRef.current?.click()}>
          <Icon name="download" className="h-4 w-4 rotate-180" /> {UI.importCsv[lang]}
        </button>
        <button type="button" className={btnQuiet} onClick={exportCsv}>
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
            const file = e.target.files?.[0];
            if (file) void importCsv(file);
            e.target.value = '';
          }}
        />
        <span role="status" className="self-center text-sm text-slate/70">
          {msg}
        </span>
      </div>
    </fieldset>
  );
}

function Field({ f, values, lang, set }: { f: FieldDef; values: Values; lang: Lang; set: (id: string, v: string | Row[]) => void }) {
  const id = `f-${f.id}`;
  if (f.kind === 'rows') return <RowsField f={f} value={(values[f.id] as Row[]) ?? []} lang={lang} onChange={(r) => set(f.id, r)} />;
  const helpId = f.help ? `${id}-help` : undefined;
  const v = typeof values[f.id] === 'string' ? (values[f.id] as string) : '';
  const suffix = f.kind === 'number' && f.suffix ? SUFFIX[f.suffix][lang] : '';
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate">
        {f.label[lang]}
        {suffix && <span className="text-slate/70"> ({suffix})</span>}
      </label>
      {f.kind === 'select' ? (
        <select id={id} className={inputCls} value={v} aria-describedby={helpId} onChange={(e) => set(f.id, e.target.value)}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label[lang]}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className={inputCls}
          type={f.kind === 'number' ? 'number' : 'text'}
          inputMode={f.kind === 'number' ? 'decimal' : undefined}
          min={f.kind === 'number' ? f.min : undefined}
          max={f.kind === 'number' ? f.max : undefined}
          step={f.kind === 'number' ? (f.step ?? 'any') : undefined}
          maxLength={f.kind === 'text' ? 80 : undefined}
          aria-describedby={helpId}
          value={v}
          onChange={(e) => set(f.id, e.target.value)}
        />
      )}
      {f.help && (
        <p id={helpId} className="text-xs text-slate/70">
          {f.help[lang]}
        </p>
      )}
    </div>
  );
}

// The generic calculator: fields on the left, the live report on the
// right. The spec is looked up by slug inside this client component, so
// the compute() function never has to cross the server/client boundary.
export function ToolShell({ slug, example, name, path, children }: { slug: string; example: Values; name: string; path: string; children?: ReactNode }) {
  const spec = findToolSpec(slug) as ToolSpec;
  const [lang, setLang] = useState<Lang>('en');
  const [values, setValues] = useState<Values>(example);
  const [isExample, setIsExample] = useState(true);
  const [savedNote, setSavedNote] = useState('');
  const [hasSaved, setHasSaved] = useState(false);
  const formId = useId();
  const today = useToday();

  // A share link (#s=) wins, then values saved on this device, then the
  // example. Read after mount so server and client HTML match.
  useEffect(() => {
    const m = window.location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/);
    const shared = m ? decodeShare(spec, m[1]) : null;
    const stored = readStored(spec.slug);
    setHasSaved(Boolean(stored));
    if (shared) {
      setValues(shared);
      setIsExample(false);
    } else if (stored) {
      setValues({ ...spec.defaults, ...stored });
      setIsExample(false);
    }
  }, [spec]);

  const set = (id: string, v: string | Row[]) => {
    setValues((prev) => ({ ...prev, [id]: v }));
    setIsExample(false);
  };

  const result = useMemo(() => spec.compute(values, lang), [spec, values, lang]);

  function save() {
    try {
      window.localStorage.setItem(storageKey(spec.slug), JSON.stringify(values));
      setHasSaved(true);
      setSavedNote(UI.saved[lang]);
    } catch {
      setSavedNote(lang === 'en' ? 'This browser does not allow saving.' : 'Ye browser save karne nahi deta.');
    }
    window.setTimeout(() => setSavedNote(''), 3000);
  }

  function forget() {
    try {
      window.localStorage.removeItem(storageKey(spec.slug));
    } catch {
      /* nothing stored */
    }
    setHasSaved(false);
  }

  const shareUrl = () => `${window.location.origin}${path}#s=${encodeShare(spec, values)}`;

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <LangToggle lang={lang} setLang={setLang} />
          <button type="button" className={btnQuiet} onClick={() => (setValues(example), setIsExample(true))}>
            <Icon name="sparkle" className="h-4 w-4" /> {UI.example[lang]}
          </button>
          <button type="button" className={btnQuiet} onClick={() => (setValues(spec.defaults), setIsExample(false))}>
            {UI.reset[lang]}
          </button>
        </div>
        {isExample && <p className="rounded-xl border border-amber bg-white p-3 text-sm font-semibold text-amber-text">{UI.exampleBanner[lang]}</p>}
        <form id={formId} className="flex flex-col gap-6 rounded-3xl border border-slate/10 bg-white p-5" onSubmit={(e) => e.preventDefault()} noValidate>
          {spec.groups.map((g) => (
            <fieldset key={g.title.en} className="flex flex-col gap-4">
              <legend className="mb-2 text-base font-extrabold text-sapphire">{g.title[lang]}</legend>
              {g.fields.map((f) => (
                <Field key={f.id} f={f} values={values} lang={lang} set={set} />
              ))}
            </fieldset>
          ))}
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnQuiet} onClick={save}>
            <Icon name="check" className="h-4 w-4" /> {UI.save[lang]}
          </button>
          {hasSaved && (
            <button type="button" className={btnQuiet} onClick={forget}>
              {UI.clearSaved[lang]}
            </button>
          )}
          <span role="status" className="text-sm font-semibold text-emerald-text">
            {savedNote}
          </span>
        </div>
        <p className="flex items-start gap-2 text-sm text-slate/70">
          <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /> {UI.privacy[lang]}
        </p>
      </div>

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
            <ReportActions report={result.report} lang={lang} fileBase={name} rulesUpdated={spec.rulesUpdated} sourcePath={path} shareUrl={shareUrl} />
            <ReportView report={result.report} meta={{ generatedOn: today, rulesUpdated: spec.rulesUpdated, rulesLabel: UI.lastUpdated[lang], assumptionsLabel: UI.assumptions[lang] }} />
          </>
        )}
        {children}
      </div>
    </div>
  );
}
