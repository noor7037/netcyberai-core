'use client';

import { useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { IMPORT_COLUMNS } from '@/lib/import/rules';
import { checkImportCsv, IMPORT_TEMPLATE_CSV, type ImportCheckResult } from '@/lib/free-tools/import-check';

const MAX_BYTES = 5 * 1024 * 1024;

export function ImportCheckerTool() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(csv: string) {
    setError(null);
    if (!csv.trim()) {
      setResult(null);
      setError('Paste a CSV or open a file first.');
      return;
    }
    const r = checkImportCsv(csv);
    if (r.rowCount === 0) {
      setResult(null);
      setError('No data rows found. The file needs a header row and at least one student row.');
      return;
    }
    setResult(r);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('That file is over 5 MB. Split it into smaller files and check each one.');
      return;
    }
    file
      .text()
      .then((t) => {
        setText(t);
        run(t);
      })
      .catch(() => setError('That file could not be read. Save it as CSV (comma separated) and try again.'));
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE_CSV], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'netcyberai-student-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6">
          <label htmlFor="import-file" className="text-sm font-bold text-slate">
            Open a CSV file
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="text-sm text-slate file:mr-3 file:min-h-[44px] file:rounded-md file:border-0 file:bg-royal/10 file:px-4 file:font-semibold file:text-royal-deep"
          />
          <label htmlFor="import-paste" className="text-sm font-bold text-slate">
            Or paste it here
          </label>
          <textarea
            id="import-paste"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={IMPORT_TEMPLATE_CSV}
            className="w-full rounded-xl border border-slate/20 bg-white px-4 py-3 font-mono text-sm text-slate placeholder:text-slate/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run(text)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-sapphire px-5 text-sm font-semibold text-white hover:bg-sapphire/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            >
              <Icon name="check" className="h-4 w-4" /> Check my list
            </button>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md border-2 border-royal px-4 text-sm font-semibold text-royal hover:bg-royal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            >
              <Icon name="download" className="h-4 w-4" /> Download template
            </button>
          </div>
          <p className="text-sm text-slate/70">Your file is read by your browser only. Nothing is uploaded to NetCyberAI.</p>
        </div>
        <div className="flex flex-col gap-3 rounded-3xl bg-off-white p-6">
          <p className="text-sm font-bold text-slate">Columns the import understands</p>
          <ul className="flex flex-col gap-2">
            {IMPORT_COLUMNS.map((c) => (
              <li key={c.key} className="text-sm text-slate">
                <code className="rounded bg-white px-1.5 py-0.5 font-semibold">{c.key}</code>
                {c.required ? <span className="ml-1 font-semibold text-red-800">required</span> : <span className="ml-1 text-slate/70">optional</span>}
                <span className="block text-slate/70">{c.hint}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="rounded-2xl border border-red-600 bg-white p-4 font-semibold text-red-800">
            {error}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-6">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { l: 'Student rows', v: result.rowCount },
                { l: 'Ready to import', v: result.okRows },
                { l: 'Rows to fix', v: result.rowIssues.length },
                { l: 'Repeated admission numbers', v: result.duplicateAdmissionNos.length },
              ].map((t) => (
                <li key={t.l} className="rounded-2xl border border-slate/10 bg-white p-4">
                  <p className="text-3xl font-extrabold text-slate">{t.v}</p>
                  <p className="text-sm text-slate/70">{t.l}</p>
                </li>
              ))}
            </ul>
            {result.missingRequired.length > 0 && (
              <p role="alert" className="rounded-2xl border border-red-600 bg-white p-4 font-semibold text-red-800">
                {`Missing required column: ${result.missingRequired.join(', ')}. Add it to the first row.`}
              </p>
            )}
            {result.unknownColumns.length > 0 && (
              <p className="rounded-2xl bg-gold/15 p-4 text-sm text-slate">
                {`These columns are not part of the student import and will be ignored: ${result.unknownColumns.join(', ')}. Guardians and phone numbers are added separately.`}
              </p>
            )}
            {result.rowIssues.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-slate/10 bg-white">
                <table className="w-full text-left text-sm">
                  <caption className="px-4 pt-4 text-left font-bold text-slate">Rows that would be skipped</caption>
                  <thead>
                    <tr className="text-slate/70">
                      <th scope="col" className="px-4 py-2">Row</th>
                      <th scope="col" className="px-4 py-2">Student</th>
                      <th scope="col" className="px-4 py-2">What to fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rowIssues.slice(0, 200).map((i) => (
                      <tr key={i.row} className="border-t border-slate/10 text-slate">
                        <td className="px-4 py-2">{i.row}</td>
                        <td className="px-4 py-2">{i.name}</td>
                        <td className="px-4 py-2">{i.errors.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.duplicateAdmissionNos.length > 0 && (
              <div className="rounded-2xl border border-slate/10 bg-white p-4 text-sm text-slate">
                <p className="font-bold">Admission numbers used more than once</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {result.duplicateAdmissionNos.slice(0, 50).map((d) => (
                    <li key={d.admissionNo}>{`${d.admissionNo}: rows ${d.rows.join(', ')}`}</li>
                  ))}
                </ul>
                <p className="mt-2 text-slate/70">Each of these would become a separate student record. Check they are really different students.</p>
              </div>
            )}
            {result.classNames.length > 0 && (
              <div className="rounded-2xl border border-slate/10 bg-white p-4 text-sm text-slate">
                <p className="font-bold">Class names in your file</p>
                <p className="text-slate/70">Each must exactly match a class set up in NetCyberAI before importing.</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {result.classNames.map((c) => (
                    <li key={c.name} className="rounded-full bg-royal/10 px-3 py-1 font-semibold text-royal-deep">{`${c.name} · ${c.count}`}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.rowIssues.length === 0 && result.missingRequired.length === 0 && (
              <p className="rounded-2xl bg-turquoise/15 p-4 font-semibold text-emerald">Every row passed these checks.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
