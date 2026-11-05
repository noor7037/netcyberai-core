'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { IssuedForPrint, Marks } from '@/lib/documents/cert-doc';
import { TYPED_FIELDS, certDef, certificateFileName, fieldOptions } from '@/lib/documents/certificate-rules';
import type { OfficeRequest } from '@/lib/documents/certificate-requests';
import { certificatesPdf } from '@/lib/documents/pdf';
import { minorToRupees } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';

// Requests for certificates (W21-M7): from the office and from families in the Family app. Each request waits for the
// fee clearance (held, with what is owed; the principal waives with a reason), is issued, then made ready (the PDF is
// drawn on this device and kept for the family), and the paper copy is marked collected. The timeline shows each step,
// who and when. Every rule is the server's and the database's: this screen only asks and shows.

const TAP = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
type Printable = { list: IssuedForPrint[]; marks: Marks & { unavailable: string[] } };
type Note = { ok: boolean; text: string };
const BASE = '/api/app/documents/certificates';

export function CertificateRequests() {
  const { t, lang } = useT();
  const [rows, setRows] = useState<OfficeRequest[] | null>(null);
  const [mayWaive, setMayWaive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [waive, setWaive] = useState<{ id: string; reason: string } | null>(null);
  const [typed, setTyped] = useState<Record<string, Record<string, string>>>({});

  const load = useCallback(async () => {
    const res = await fetch(`${BASE}/requests`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setRows(((await res.json().catch(() => null)) as { requests: OfficeRequest[] } | null)?.requests ?? []);
    else setRows(null);
  }, []);
  useEffect(() => {
    void load();
    void fetch(BASE, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((h: { mayWaive?: boolean } | null) => setMayWaive(Boolean(h?.mayWaive)))
      .catch(() => undefined);
  }, [load]);

  if (rows === null) return null;
  const dayFmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const when = (iso: string) => dayFmt.format(new Date(iso));
  const kindName = (k: string) => t(`crt.type.${k}` as MessageKey);
  const refusal = (body: Record<string, unknown>): string => {
    const code = String(body.reason ?? '');
    if (code === 'held' || code === 'not_held' || code === 'duplicate' || code === 'incomplete' || code === 'not_open') return t(`crt.req.err.${code}` as MessageKey, { number: String(body.number ?? '') });
    if (code === 'missing' && typeof body.field === 'string') return t('crt.err.missing', { field: t(`crt.field.${body.field}` as MessageKey) });
    return t('crt.req.err.other');
  };
  const call = async (url: string, init: RequestInit): Promise<Record<string, unknown> | null> => {
    const res = await fetch(url, init).catch(() => null);
    const body = ((res ? await res.json().catch(() => null) : null) ?? {}) as Record<string, unknown>;
    if (res?.ok) return body;
    setNote({ ok: false, text: refusal(body) });
    return null;
  };
  const busyWith = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const json = (b: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

  const issue = (r: OfficeRequest) =>
    busyWith(async () => {
      const body = await call(`${BASE}/requests/${r.requestId}/issue`, json({ typed: typed[r.requestId] ?? {} }));
      if (!body) return;
      setNote({ ok: true, text: t('crt.req.issued', { number: String(body.number ?? '') }) });
      await load();
    });
  const confirmWaive = () =>
    busyWith(async () => {
      if (!waive) return;
      if (!(await call(`${BASE}/requests/${waive.id}/waive`, json({ reason: waive.reason })))) return;
      setWaive(null);
      await load();
    });
  const deliver = (r: OfficeRequest) =>
    busyWith(async () => {
      if (!r.certificate) return;
      setNote({ ok: true, text: t('crt.pdf.making') });
      const res = await fetch(`${BASE}?view=print&ids=${r.certificate.certificateId}`, { cache: 'no-store' }).catch(() => null);
      const p = res?.ok ? ((await res.json().catch(() => null)) as Printable | null) : null;
      if (!p || p.list.length === 0) return setNote({ ok: false, text: t('crt.err.not_found') });
      let blob: Blob;
      try {
        blob = await certificatesPdf(p.list, p.marks, r.certificate.number);
      } catch {
        return setNote({ ok: false, text: t('crt.pdf.failed') });
      }
      const form = new FormData();
      form.append('file', new File([blob], certificateFileName(r.certificate.number), { type: 'application/pdf' }));
      if (!(await call(`${BASE}/requests/${r.requestId}/deliver`, { method: 'POST', body: form }))) return;
      setNote({ ok: true, text: t('crt.req.delivered') });
      await load();
    });
  const collect = (r: OfficeRequest) =>
    busyWith(async () => {
      if (!(await call(`${BASE}/requests/${r.requestId}/collect`, { method: 'POST' }))) return;
      setNote({ ok: true, text: t('crt.req.collected') });
      await load();
    });

  // The words the office types beyond the family's reason (the field the reason fills is left out).
  const extra = (r: OfficeRequest) => TYPED_FIELDS[r.kind].filter((f) => f.required && f.id !== (r.kind === 'transfer' ? 'reason' : 'purpose'));

  return (
    <section data-certificate-requests className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
      <h2 className="text-base font-semibold">{t('crt.req.title')}</h2>
      <p>{t('crt.req.lead')}</p>
      {note && (
        <p role="status" data-certificate-requests-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
      {rows.length === 0 ? (
        <p data-certificate-requests-empty className="rounded-md bg-off-white px-3 py-2">{t('crt.req.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.requestId} data-certificate-request={r.requestId} data-certificate-request-stage={r.stage} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.studentName}{r.className ? ` · ${r.className}` : ''}</span>
                <Badge>{kindName(r.kind)}</Badge>
                <Badge variant={r.stage === 'ready' ? 'success' : undefined}>{t(`crt.req.stage.${r.stage}` as MessageKey)}</Badge>
                {r.certificate && <span className="text-slate/70">{r.certificate.number}</span>}
              </div>
              <p className="text-slate/70">
                {t(r.via === 'app' ? 'crt.req.via.app' : 'crt.req.via.office')}
                {r.askedBy ? ` · ${t('crt.req.by', { name: r.askedBy, date: when(r.createdAt) })}` : ''}
              </p>
              {r.reason && <p className="break-words">{t('crt.req.reason', { reason: r.reason })}</p>}
              {r.heldOwedMinor !== null && (
                <p role="status" data-certificate-request-held className="font-semibold text-red-800">
                  {t('crt.req.held', { amount: minorToRupees(r.heldOwedMinor) })}
                </p>
              )}
              {r.waiver && <p data-certificate-request-waived className="break-words">{t('crt.req.waived', { name: r.waiver.by ?? '', date: r.waiver.on, reason: r.waiver.reason })}</p>}

              {r.stage === 'requested' && r.heldOwedMinor !== null && mayWaive && waive?.id !== r.requestId && (
                <button type="button" data-certificate-request-waive disabled={busy} className={`${TAP} self-start`} onClick={() => setWaive({ id: r.requestId, reason: '' })}>{t('crt.req.waive.open')}</button>
              )}
              {waive?.id === r.requestId && (
                <div className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                  <Input id={`req-waive-${r.requestId}`} label={t('crt.req.waive.reason')} value={waive.reason} maxLength={300} onChange={(e) => setWaive({ id: r.requestId, reason: e.target.value })} />
                  <button type="button" data-certificate-request-waive-confirm disabled={busy || !waive.reason.trim()} className={`${PRIMARY} self-start`} onClick={() => void confirmWaive()}>{t('crt.req.waive.confirm')}</button>
                </div>
              )}

              {r.stage === 'requested' && r.heldOwedMinor === null && (
                <div className="flex flex-col gap-2">
                  {extra(r).map((f) => {
                    const def = certDef(r.kind).fields.find((d) => d.id === f.id);
                    const value = typed[r.requestId]?.[f.id] ?? '';
                    const set = (v: string) => setTyped({ ...typed, [r.requestId]: { ...typed[r.requestId], [f.id]: v } });
                    const label = t('crt.req.typed', { field: t(`crt.field.${f.id}` as MessageKey) });
                    return def?.kind === 'select' ? (
                      <Select key={f.id} id={`req-${r.requestId}-${f.id}`} label={label} value={value} onChange={(e) => set(e.target.value)}>
                        <option value="">{t('crt.field.choose')}</option>
                        {fieldOptions(r.kind, f.id).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </Select>
                    ) : (
                      <Input key={f.id} id={`req-${r.requestId}-${f.id}`} label={label} value={value} maxLength={def?.max} onChange={(e) => set(e.target.value)} />
                    );
                  })}
                  <button type="button" data-certificate-request-issue disabled={busy || extra(r).some((f) => !(typed[r.requestId]?.[f.id] ?? '').trim())} className={`${PRIMARY} self-start`} onClick={() => void issue(r)}>{t('crt.req.issue')}</button>
                </div>
              )}
              {(r.stage === 'issued' || r.stage === 'ready') && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-certificate-request-deliver disabled={busy} className={r.stage === 'issued' ? PRIMARY : TAP} onClick={() => void deliver(r)}>{t('crt.req.deliver')}</button>
                  <button type="button" data-certificate-request-collect disabled={busy} className={TAP} onClick={() => void collect(r)}>{t('crt.req.collect')}</button>
                </div>
              )}

              <div data-certificate-request-timeline>
                <p className="font-semibold">{t('crt.req.timeline')}</p>
                <ol className="flex flex-col gap-1">
                  {r.events.map((e, i) => (
                    <li key={i}>{t('crt.req.event.line', { event: t(`crt.req.event.${e.kind}` as MessageKey), who: e.by ?? t('crt.req.event.system'), when: when(e.at) })}</li>
                  ))}
                </ol>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
