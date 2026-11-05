'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/family/ui/Button';
import type { GuardianRequest } from '@/lib/family/school';
import { fill, type Words } from '@/lib/family/fill';
import { ptmDay } from '@/lib/time/ptm-words';
import { familyApi } from './client';
import { SchoolText } from './SchoolText';

// Certificate requests of a school child (W21-M7), in the parent area's "Your school": ask for a certificate with a kind
// and a short reason, see where each request stands (waiting, held for fees, issued, ready, collected) with its timeline,
// and download a ready one through a signed link that works once for ten minutes. Read and written as the link's guardian;
// nothing here knows what is owed, only that a request is held.

const KINDS = ['bonafide', 'transfer', 'character', 'study'] as const;
const FIELD = 'min-h-[44px] w-full min-w-0 rounded-xl border border-slate/20 bg-white px-3 text-base text-slate focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/30';
const dayOf = (iso: string, lang: 'en' | 'hi') => ptmDay(iso.slice(0, 10), lang);

export function SchoolCertificates({ w, lang, linkId, studentId }: { w: Words; lang: 'en' | 'hi'; linkId: string; studentId: string }) {
  const [requests, setRequests] = useState<GuardianRequest[]>([]);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('bonafide');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const r = await familyApi<{ requests: GuardianRequest[] }>(`/api/family/school/certificates?linkId=${encodeURIComponent(linkId)}&studentId=${encodeURIComponent(studentId)}`, 'GET');
    if (r.ok) setRequests(r.data.requests);
  }, [linkId, studentId]);
  useEffect(() => {
    void load();
  }, [load]);
  const send = async () => {
    setBusy(true);
    setNote(null);
    const r = await familyApi('/api/family/school/certificates/request', 'POST', { linkId, studentId, kind, reason });
    setBusy(false);
    if (r.ok) {
      setReason('');
      setNote({ ok: true, text: w['fam.w21m7.cert.sent'] });
      await load();
      return;
    }
    setNote({ ok: false, text: r.error === 'duplicate' ? w['fam.w21m7.cert.err.duplicate'] : r.error === 'reason' || r.error === 'aadhaar' ? w['fam.w21m7.cert.err.reason'] : w['fam.w21m7.cert.err.other'] });
  };
  const download = async (requestId: string) => {
    setBusy(true);
    setNote(null);
    const r = await familyApi<{ url: string }>('/api/family/school/certificates/link', 'POST', { linkId, requestId });
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: w['fam.w21m7.cert.err.link'] });
    setNote({ ok: true, text: w['fam.w21m7.cert.opening'] });
    window.location.assign(r.data.url);
  };
  const stageText = (r: GuardianRequest) => (r.stage === 'requested' ? (r.held ? w['fam.w21m7.cert.stage.held'] : r.waived ? w['fam.w21m7.cert.stage.waived'] : w['fam.w21m7.cert.stage.requested']) : w[`fam.w21m7.cert.stage.${r.stage}`]);
  return (
    <section data-school-certificates className="flex flex-col gap-2 rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate" aria-label={w['fam.w21m7.cert.title']}>
      <p className="text-sm font-semibold">{w['fam.w21m7.cert.title']}</p>
      <p>{w['fam.w21m7.cert.lead']}</p>
      <label className="flex flex-col gap-1 font-semibold">
        {w['fam.w21m7.cert.which']}
        <select value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])} disabled={busy} className={FIELD} data-cert-kind>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {w[`fam.w21m7.cert.kind.${k}`]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {w['fam.w21m7.cert.reason']}
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={90} disabled={busy} className={FIELD} data-cert-reason />
      </label>
      <Button type="button" disabled={busy || reason.trim() === ''} onClick={() => void send()}>
        {w['fam.w21m7.cert.ask']}
      </Button>
      {note && (
        <p role={note.ok ? 'status' : 'alert'} data-cert-note className={`font-semibold ${note.ok ? 'text-emerald-text' : 'text-red-800'}`}>
          {note.text}
        </p>
      )}
      {requests.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{w['fam.w21m7.cert.mine']}</p>
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.requestId} data-cert-request={r.requestId} data-cert-stage={r.stage} className="flex flex-col gap-2 rounded-lg bg-white p-3 ring-1 ring-slate/20">
                <p className="font-semibold">
                  {w[`fam.w21m7.cert.kind.${r.kind}`]}
                  {r.number ? ` · ${r.number}` : ''}
                </p>
                {r.reason && (
                  <p>
                    <SchoolText text={r.reason} />
                  </p>
                )}
                <p data-cert-status className={r.stage === 'ready' ? 'font-semibold text-emerald-text' : r.held ? 'font-semibold text-red-800' : ''}>
                  {stageText(r)}
                </p>
                {r.stage === 'ready' && (
                  <div className="flex flex-col gap-1">
                    <Button type="button" disabled={busy} onClick={() => void download(r.requestId)} data-cert-download>
                      {w['fam.w21m7.cert.download']}
                    </Button>
                    <p>{fill(w['fam.w21m7.cert.downloadNote'], { minutes: 10 })}</p>
                  </div>
                )}
                <ol className="flex flex-col gap-1" data-cert-timeline>
                  {r.events.map((e, i) => (
                    <li key={i}>
                      {w[`fam.w21m7.cert.event.${e.kind}`]} · {dayOf(e.at, lang)}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
