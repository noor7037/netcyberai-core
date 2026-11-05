'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/components/app-shell/LangContext';
import { PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import type { MessageKey } from '@/lib/i18n';
import { CONFIDENCE_FLOOR, REGISTER_FIELDS, fieldsToCheck, registerCsv, type RegisterField, type RegisterRow } from '@/lib/students/register-ocr';

// The register review (W21-M5): the office photographs a page of the paper admission register (or chooses a PDF scan),
// the app reads its rows, and the office checks them here, the photo beside the rows. A field the reading was not sure
// of is marked; the office corrects any field, removes a row that is not a student, then checks and imports the rows
// through the student import (the same checks as a CSV file). Nothing is saved until the import.

const MAX_PAGES = 3;
const SEND_TYPES = 'image/jpeg,image/png,image/*,application/pdf,.pdf';

type ImportRowError = { row: number; name: string; admissionNo: string | null; errors: string[] };
type ImportResult = { preview: boolean; refused?: boolean; alreadyImported: boolean; rowCount: number; importedCount: number; skippedCount: number; errors: ImportRowError[] };
type Picture = { url: string; blob: Blob };

const FIELD_KEY: Record<RegisterField, MessageKey> = {
  admission_no: 'w21m5.field.admission_no',
  name: 'w21m5.field.name',
  guardian_name: 'w21m5.field.guardian_name',
  dob: 'w21m5.field.dob',
  class: 'w21m5.field.class',
  section: 'w21m5.field.section',
  gender: 'w21m5.field.gender',
  phone: 'w21m5.field.phone',
  address: 'w21m5.field.address',
};
// The two the import does not keep yet: shown so the office can check the row against the page.
const NOT_IMPORTED: readonly RegisterField[] = ['guardian_name', 'address'];

const READ_ERRORS: Record<string, MessageKey> = {
  no_file: 'w21m5.error.no_file',
  too_large: 'w21m5.error.too_large',
  too_many: 'w21m5.error.too_many',
  not_a_page: 'w21m5.error.not_a_page',
  too_small: 'w21m5.error.too_small',
  pdf_no_scan: 'w21m5.error.pdf_no_scan',
  read_only: 'w21m5.error.read_only',
  daily_limit: 'w21m5.error.daily_limit',
  not_switched_on: 'w21m5.error.not_set_up',
  not_cleared_for_minors: 'w21m5.error.not_set_up',
  not_capable: 'w21m5.error.not_set_up',
  cap_reached: 'w21m5.error.daily_limit',
  not_json: 'w21m5.error.not_json',
  failed: 'w21m5.error.failed',
};

// The chosen files as page pictures, made in the browser (a photo the right way up, a PDF a picture a page), each a
// JPEG small enough to send; at most MAX_PAGES pages.
async function picturesOf(files: readonly File[]): Promise<Picture[]> {
  const { openFile } = await import('@/components/marking/render-pages');
  const out: Picture[] = [];
  for (const file of files) {
    const opened = await openFile(file);
    try {
      for await (const page of opened.pages) {
        if (out.length >= MAX_PAGES) break;
        out.push({ url: URL.createObjectURL(page.blob), blob: page.blob });
      }
    } finally {
      opened.close();
    }
    if (out.length >= MAX_PAGES) break;
  }
  return out;
}

export function RegisterReview() {
  const { t, tCount } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [rows, setRows] = useState<RegisterRow[] | null>(null);
  const [working, setWorking] = useState<'reading' | 'checking' | 'importing' | null>(null);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => () => pictures.forEach((p) => URL.revokeObjectURL(p.url)), [pictures]);

  async function read() {
    const files = Array.from(input.current?.files ?? []);
    if (files.length === 0) {
      setProblem('w21m5.error.no_file');
      return;
    }
    setWorking('reading');
    setProblem(null);
    setRows(null);
    setResult(null);
    try {
      let made: Picture[];
      try {
        made = await picturesOf(files);
      } catch {
        setProblem('w21m5.error.not_a_page');
        return;
      }
      setPictures(made);
      if (made.length === 0) {
        setProblem('w21m5.error.not_a_page');
        return;
      }
      const form = new FormData();
      made.forEach((p, i) => form.append('page', p.blob, `page-${i + 1}.jpg`));
      const res = await fetch('/api/app/students/import/ocr', { method: 'POST', body: form }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!res?.ok || !Array.isArray(body?.rows)) {
        setProblem(READ_ERRORS[String(body?.error)] ?? 'w21m5.error.failed');
        return;
      }
      setRows(body.rows as RegisterRow[]);
    } finally {
      setWorking(null);
    }
  }

  function change(i: number, field: RegisterField, value: string) {
    setResult(null);
    setRows((rs) => rs && rs.map((r, k) => (k === i ? { ...r, [field]: { value: value.trim() ? value : null, confidence: 1, low: false } } : r)));
  }
  function remove(i: number) {
    setResult(null);
    setRows((rs) => rs && rs.filter((_, k) => k !== i));
  }

  async function send(preview: boolean) {
    if (!rows || rows.length === 0) return;
    setWorking(preview ? 'checking' : 'importing');
    setProblem(null);
    try {
      const form = new FormData();
      form.set('file', new File([registerCsv(rows)], 'register-page.csv', { type: 'text/csv' }));
      const res = await fetch(`/api/app/students/import${preview ? '?preview=1' : ''}`, { method: 'POST', body: form }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!res || (!res.ok && !body?.refused)) {
        setProblem('w21m5.error.import_failed');
        return;
      }
      setResult(body as ImportResult);
    } finally {
      setWorking(null);
    }
  }

  const summary = (r: ImportResult): string =>
    r.preview
      ? t('students.import.checked', { ready: r.rowCount - r.skippedCount, rows: r.rowCount })
      : r.refused
        ? tCount('students.import.refused', r.skippedCount)
        : t(r.alreadyImported ? 'students.import.again' : 'students.import.done', { imported: r.importedCount, rows: r.rowCount });
  const imported = result && !result.preview && !result.refused;
  const toCheck = rows ? fieldsToCheck(rows) : 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <label htmlFor="register-file" className="text-sm font-medium text-slate">
          {t('w21m5.choose')}
        </label>
        <p className="text-sm text-slate/70">{t('w21m5.choose.help')}</p>
        <input id="register-file" ref={input} data-register-file type="file" accept={SEND_TYPES} multiple className="min-h-[44px] text-sm text-slate" />
        <div>
          <button type="button" data-register-read onClick={read} disabled={working !== null} className={PRIMARY_ACTION}>
            {working === 'reading' ? t('w21m5.reading') : t('w21m5.read')}
          </button>
        </div>
        {problem && (
          <p role="alert" data-register-problem className="rounded-md border border-coral/40 bg-coral/10 p-2 text-sm text-slate">
            {t(problem)}
          </p>
        )}
      </section>

      {rows && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-label={t('w21m5.photo')} className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
            <h2 className="text-sm font-semibold text-slate">{t('w21m5.photo')}</h2>
            {pictures.map((p, i) => (
              <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="block rounded-md border border-slate/10">
                {/* eslint-disable-next-line @next/next/no-img-element -- a picture made in this browser, never stored */}
                <img src={p.url} alt={t('w21m5.photo.alt', { n: i + 1 })} data-register-photo className="h-auto w-full max-h-[70vh] object-contain" />
              </a>
            ))}
          </section>

          <section aria-label={t('w21m5.rows')} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate">{tCount('w21m5.rows.count', rows.length)}</h2>
            <p data-register-to-check className="text-sm text-slate/80">
              {rows.length === 0 ? t('w21m5.rows.none') : toCheck > 0 ? tCount('w21m5.rows.toCheck', toCheck) : t('w21m5.rows.allSure')}
            </p>
            <p className="text-xs text-slate/70">{t('w21m5.rows.howMarked', { percent: Math.round(CONFIDENCE_FLOOR * 100) })}</p>
            {rows.map((r, i) => (
              <fieldset key={i} data-register-row className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-3">
                <legend className="px-1 text-sm font-semibold text-slate">{t('w21m5.row', { n: i + 1 })}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REGISTER_FIELDS.map((f) => {
                    const cell = r[f];
                    const id = `register-${i}-${f}`;
                    return (
                      <div key={f} className={f === 'address' ? 'flex flex-col gap-1 sm:col-span-2' : 'flex flex-col gap-1'}>
                        <label htmlFor={id} className="text-xs font-medium text-slate">
                          {t(FIELD_KEY[f])}
                          {NOT_IMPORTED.includes(f) && <span className="font-normal text-slate/70"> · {t('w21m5.notImported')}</span>}
                        </label>
                        <input
                          id={id}
                          data-register-field={f}
                          data-low={cell.low ? 'true' : undefined}
                          value={cell.value ?? ''}
                          placeholder={t('w21m5.notRead')}
                          onChange={(e) => change(i, f, e.target.value)}
                          aria-describedby={cell.low ? `${id}-low` : undefined}
                          className={`min-h-[44px] rounded-md border px-2 text-sm text-slate ${cell.low ? 'border-amber bg-amber/10' : 'border-slate/20 bg-white'}`}
                        />
                        {cell.low && (
                          <span id={`${id}-low`} className="text-xs text-amber-text">
                            {t('w21m5.low')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <button type="button" data-register-remove onClick={() => remove(i)} className={QUIET_ACTION}>
                    {t('w21m5.remove')}
                  </button>
                </div>
              </fieldset>
            ))}
            {rows.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" data-register-check onClick={() => send(true)} disabled={working !== null} className={QUIET_ACTION}>
                  {working === 'checking' ? t('w21m5.working') : t('w21m5.check')}
                </button>
                <button type="button" data-register-import onClick={() => send(false)} disabled={working !== null || Boolean(imported)} className={PRIMARY_ACTION}>
                  {working === 'importing' ? t('w21m5.working') : t('w21m5.import')}
                </button>
              </div>
            )}
            <p className="text-xs text-slate/70">{t('w21m5.nothingSaved')}</p>
            {result && (
              <div data-register-result className="flex flex-col gap-2 border-t border-slate/10 pt-3">
                <p className={`text-sm font-semibold ${result.refused ? 'text-coral-deep' : 'text-slate'}`}>{summary(result)}</p>
                {result.errors.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {result.errors.map((e) => (
                      <li key={e.row} className="rounded-md border border-coral/40 p-2 text-slate">
                        {t('students.import.row', { row: e.row, name: e.name || e.admissionNo || t('students.import.unnamed'), errors: e.errors.join('; ') })}
                      </li>
                    ))}
                  </ul>
                )}
                {imported && (
                  <Link href="/app/students" className={QUIET_ACTION}>
                    {t('w21m5.backToStudents')}
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
