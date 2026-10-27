'use client';

import { useCallback, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import type { MessageKey } from '@/lib/i18n';
import type { TellParents } from '@/lib/marking/result-send';
import { SECTION, TAP } from './SchemeParts';

// "Tell parents on WhatsApp" on the class result (C351): once the class is published, the office sees who will get a
// private link to their own child's result, child by child in roll order, and who will not and why; then sends. Each
// message's state follows from the message records (queued, sent, delivered, read, failed). Mounted for a published
// class; the list is read only when the office opens it (it asks the send-gate about every guardian), and the server
// answers it only to the principal and the school admin, so for anyone else the section says nothing more.
// A child already sent may have their link ended (a lost phone, a forwarded link; C230-AG): it stops opening at once,
// and the child is sent a new one only by Send, after this same preview.

const END_REASONS = ['lost', 'forwarded', 'other'] as const;
type EndReason = (typeof END_REASONS)[number];

const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60';

export function TellParentsWhatsApp({ examId, classId }: { examId: string; classId: string }) {
  const { t } = useT();
  const [data, setData] = useState<TellParents | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'refused' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // The child whose link is being ended, and why.
  const [ending, setEnding] = useState<{ studentId: string; why: EndReason | null } | null>(null);
  const url = `/api/app/exams/${examId}/classes/${classId}/tell-parents`;

  const load = useCallback(async () => {
    setState('loading');
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as TellParents | null) : null;
    setData(got);
    setState(got ? 'idle' : res && (res.status === 403 || res.status === 404 || res.status === 409) ? 'refused' : 'failed');
  }, [url]);
  const toggle = async () => {
    if (!open && !data) await load();
    setOpen(!open);
  };

  // For anyone the server does not answer (not the principal or the school admin), nothing is shown.
  if (state === 'refused') return null;
  const send = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { queued: number } | null) : null;
    setBusy(false);
    setNote(body ? { kind: 'ok', text: t('ex.tell.sent', { n: body.queued }) } : { kind: 'error', text: t('ex.tell.failed') });
    await load();
  };
  const end = async () => {
    if (!ending?.why) return;
    setBusy(true);
    setNote(null);
    const res = await fetch(`${url}/end`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: ending.studentId, why: ending.why }) }).catch(() => null);
    setBusy(false);
    setNote(res?.ok ? { kind: 'ok', text: t('ex.tell.ended') } : { kind: 'error', text: t('ex.tell.endFailed') });
    setEnding(null);
    await load();
  };
  const who = (c: TellParents['children'][number]) => (c.rollNo ? t('ex.entry.child', { roll: c.rollNo, name: c.name }) : c.name);

  return (
    <section className={SECTION} data-tell-parents aria-labelledby="tell-parents-title">
      <h2 id="tell-parents-title" className="text-base font-bold">
        {t('ex.tell.title')}
      </h2>
      <p>{t('ex.tell.lead')}</p>
      {open && data && (
        <p data-tell-summary className="font-semibold">
          {t('ex.tell.summary', { will: data.will, wont: data.wont, sent: data.sent })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={TAP} aria-expanded={open} aria-controls="tell-parents-list" disabled={state === 'loading'} onClick={() => void toggle()} data-tell-preview>
          {open ? t('ex.tell.hide') : t('ex.tell.preview')}
        </button>
        {open && data && data.will > 0 && (
          <button type="button" className={PRIMARY} disabled={busy} onClick={() => void send()} data-tell-send>
            {busy ? t('ex.tell.sending') : t('ex.tell.send', { n: data.will })}
          </button>
        )}
      </div>
      {state === 'failed' && (
        <p role="alert" className="rounded-md bg-off-white px-3 py-2 font-semibold">
          {t('ex.tell.loadFailed')}
        </p>
      )}
      {open && data && data.will === 0 && <p>{data.sent > 0 ? t('ex.tell.nothing') : t('ex.tell.none')}</p>}
      {note && (
        <p role={note.kind === 'error' ? 'alert' : 'status'} className="rounded-md bg-off-white px-3 py-2 font-semibold">
          {note.text}
        </p>
      )}
      {open && data && (
        <ol id="tell-parents-list" className="flex flex-col gap-2" data-tell-list>
          {data.children.map((c) => (
            <li key={c.studentId} data-tell-child={c.studentId} className="rounded-lg border border-slate/10 bg-white p-3">
              <p className="font-bold">
                {who(c)}
                {c.sent ? ` · ${t('ex.tell.alreadySent')}` : ''}
              </p>
              {c.ended > 0 && <p data-tell-ended className="text-sm">{t('ex.tell.endedBefore', { n: c.ended })}</p>}
              {c.guardians.length === 0 ? (
                <p>{t('ex.tell.noGuardian')}</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {c.guardians.map((g) => (
                    <li key={g.parentId} data-tell-guardian={g.parentId} data-tell-will={g.will ? 'yes' : 'no'} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        {g.name}
                        {g.last4 ? ` · ${t('ex.tell.number', { last4: g.last4 })}` : ''}
                      </span>
                      <span className="font-semibold">
                        {g.state
                          ? t(`ex.tell.state.${g.state}` as MessageKey)
                          : c.sent
                            ? t('ex.tell.notSent')
                            : g.will
                              ? t('ex.tell.will')
                              : t(`ex.tell.why.${g.why ?? 'whatsapp_off'}` as MessageKey)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {c.mayEnd && ending?.studentId !== c.studentId && (
                <button type="button" className={`${TAP} mt-2`} data-tell-end={c.studentId} disabled={busy} onClick={() => setEnding({ studentId: c.studentId, why: null })}>
                  {t('ex.tell.end')}
                </button>
              )}
              {ending?.studentId === c.studentId && (
                <fieldset data-tell-ending className="mt-2 flex flex-col gap-2 rounded-md bg-off-white p-3">
                  <legend className="font-semibold">{t('ex.tell.endLead')}</legend>
                  {END_REASONS.map((r) => (
                    <label key={r} className="flex min-h-[44px] items-center gap-2">
                      <input type="radio" name={`end-why-${c.studentId}`} value={r} checked={ending.why === r} onChange={() => setEnding({ studentId: c.studentId, why: r })} className="h-5 w-5" />
                      <span>{t(`ex.tell.endWhy.${r}` as MessageKey)}</span>
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={PRIMARY} disabled={busy || !ending.why} onClick={() => void end()} data-tell-end-yes>
                      {t('ex.tell.endYes')}
                    </button>
                    <button type="button" className={TAP} onClick={() => setEnding(null)}>
                      {t('ex.tell.endNo')}
                    </button>
                  </div>
                </fieldset>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
