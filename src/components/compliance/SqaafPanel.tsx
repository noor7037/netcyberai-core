'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import type { Evidence, Sqaaf, Standard } from '@/lib/compliance/sqaaf';
import { explainError } from '@/lib/errors/catalogue';
import { isUploadProblem } from '@/lib/privacy/upload-problems';
import { CARD, dayFormat, FIELD, LINK, PRIMARY, refusal, send, TAP, type Say } from './desk-client';

// SQAAF evidence on the compliance desk (C227): CBSE's standards as the document prints them (with where they come
// from and the day they were read), domain by domain, and the school's evidence tagged to each: a typed note, or a
// photo or PDF, or both. Never an Aadhaar number and never a scan of an Aadhaar card.

type Form = { code: string; note: string; file: File | null };

export function SqaafPanel({ sqaaf, reload, say }: { sqaaf: Sqaaf; reload: () => Promise<void>; say: Say }) {
  const { t, lang } = useT();
  const [form, setForm] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const date = dayFormat(lang);

  const add = async () => {
    if (!form) return;
    setBusy(true);
    let reply;
    if (form.file) {
      const body = new FormData();
      body.set('file', form.file);
      body.set('standardCode', form.code);
      if (form.note.trim()) body.set('note', form.note);
      reply = await send('/api/app/compliance/sqaaf/file', 'POST', body);
    } else {
      reply = await send('/api/app/compliance/sqaaf', 'POST', { standardCode: form.code, note: form.note });
    }
    setBusy(false);
    // A file the Aadhaar check refused (C232 part A) is said in the error catalogue's own words, in this language.
    if (!reply.ok) return say(false, isUploadProblem(reply.body.code) ? explainError(reply.body, t('cdk.err.other'), lang, reply.status) : t(refusal(reply)));
    say(true, t('cdk.sq.added', { code: form.code }));
    setForm(null);
    await reload();
  };
  const remove = async (id: string) => {
    setBusy(true);
    const reply = await send(`/api/app/compliance/sqaaf/${id}`, 'DELETE');
    setBusy(false);
    setRemoving(null);
    if (!reply.ok) return say(false, t(refusal(reply)));
    say(true, t('cdk.sq.removed'));
    await reload();
  };
  const open = async (id: string) => {
    const res = await fetch(`/api/app/compliance/sqaaf/${id}`).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { url?: string } | null) : null;
    if (body?.url) window.open(body.url, '_blank', 'noopener');
    else say(false, t(res?.status === 503 ? 'cdk.err.storage_unavailable' : 'cdk.err.other'));
  };

  const piece = (e: Evidence) => (
    <li key={e.evidence_id} data-cdk-evidence={e.evidence_id} className="flex flex-col gap-1 rounded-md bg-off-white px-3 py-2">
      {e.note && <p className="whitespace-pre-wrap break-words">{e.note}</p>}
      {e.file_name && (
        <button type="button" data-cdk-evidence-open className={`${LINK} self-start break-all text-left`} onClick={() => void open(e.evidence_id)}>
          {t('cdk.sq.openFile', { name: e.file_name })}
        </button>
      )}
      <p className="text-slate/70">{t('cdk.sq.addedBy', { name: e.added_by ?? '', date: date(e.added_at) })}</p>
      <div className="flex flex-wrap gap-2">
        {removing === e.evidence_id ? (
          <>
            <button type="button" data-cdk-evidence-remove-yes disabled={busy} className={TAP} onClick={() => void remove(e.evidence_id)}>{t('cdk.sq.removeYes')}</button>
            <button type="button" className={TAP} onClick={() => setRemoving(null)}>{t('cdk.cancel')}</button>
          </>
        ) : (
          <button type="button" data-cdk-evidence-remove className={TAP} onClick={() => setRemoving(e.evidence_id)}>{t('cdk.sq.remove')}</button>
        )}
      </div>
    </li>
  );

  const standard = (s: Standard) => (
    <li key={s.code} data-cdk-standard={s.code} data-cdk-pieces={s.evidence.length} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
      <p className="break-words"><span className="font-bold">{s.code}</span> {s.statement}</p>
      {s.evidence.length > 0 && <ul className="flex flex-col gap-2">{s.evidence.map(piece)}</ul>}
      {form?.code === s.code ? (
        <div data-cdk-sq-form className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`cdk-sq-note-${s.code}`} className="text-sm font-medium">{t('cdk.sq.note')}</label>
            <textarea id={`cdk-sq-note-${s.code}`} rows={3} maxLength={600} className={`${FIELD} py-2`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`cdk-sq-file-${s.code}`} className="text-sm font-medium">{t('cdk.sq.file')}</label>
            <input id={`cdk-sq-file-${s.code}`} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className={FIELD} onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
          </div>
          <p className="text-slate/70">{t('cdk.sq.never')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-cdk-sq-save disabled={busy || (!form.note.trim() && !form.file)} className={PRIMARY} onClick={() => void add()}>{t('cdk.sq.save')}</button>
            <button type="button" className={TAP} onClick={() => setForm(null)}>{t('cdk.cancel')}</button>
          </div>
        </div>
      ) : (
        <button type="button" data-cdk-sq-add className={`${TAP} self-start`} onClick={() => setForm({ code: s.code, note: '', file: null })}>{t('cdk.sq.add')}</button>
      )}
    </li>
  );

  return (
    <section data-cdk-sqaaf className={CARD}>
      <div>
        <h2 className="text-base font-bold">{t('cdk.sq.title')}</h2>
        <p className="text-slate/70">{t('cdk.sq.how')}</p>
      </div>
      {sqaaf.source && (
        <div data-cdk-sq-source className="flex flex-col items-start">
          <p className="break-words text-slate/70">{t('cdk.sq.source', { title: sqaaf.source.title, date: date(sqaaf.source.readOn) })}</p>
          <a href={sqaaf.source.url} target="_blank" rel="noopener noreferrer" className={LINK}>{t('cdk.sq.document')}</a>
        </div>
      )}
      <p data-cdk-sq-total className="font-semibold">{t('cdk.sq.total', { with: sqaaf.totals.withEvidence, standards: sqaaf.totals.standards })}</p>
      <ul className="flex flex-col gap-2">
        {sqaaf.domains.map((d) => (
          <li key={d.no}>
            <details data-cdk-domain={d.no} className="rounded-md border border-slate/10 px-3">
              <summary className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-2 font-semibold">
                <span className="break-words">{t('cdk.sq.domain', { no: d.no, name: d.name })}</span>
                <span className="font-normal text-slate/70">{t('cdk.sq.domainCount', { with: d.withEvidence, standards: d.standards })}</span>
              </summary>
              <div className="flex flex-col gap-3 pb-3">
                {d.subDomains.map((sub) => (
                  <div key={sub.code} className="flex flex-col gap-2">
                    <h3 className="break-words font-bold">{sub.code} {sub.name}</h3>
                    <ul className="flex flex-col gap-2">{sub.standards.map(standard)}</ul>
                  </div>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
