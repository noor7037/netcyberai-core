'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { t as tIn, type MessageKey } from '@/lib/i18n';
import { makeFittedCheckedPdf, pageFrom, type CheckedPdfInput } from '@/lib/marking/checked-pdf';
import type { TellParents } from '@/lib/marking/result-send';
import { momentWords } from './exam-format';
import { SECTION, TAP } from './SchemeParts';

// "Tell parents on WhatsApp" on the class result (C351): once the class is published, the office sees who will get a
// private link to their own child's result, child by child in roll order, and who will not and why; then sends. Each
// message's state follows from the message records (queued, sent, delivered, read, failed). Mounted for a published
// class; the list is read only when the office opens it (it asks the send-gate about every guardian), and the server
// answers it only to the principal and the school admin, so for anyone else the section says nothing more.
// A child already sent may have their link ended (a lost phone, a forwarded link; C230-AG): it stops opening at once,
// and the child is sent a new one only by Send, after this same preview.

// mode "outputs" (C230-AJ part 5, "publish and notify"): the same previewed send, as one action that also makes the class's
// report cards and progress reports and shows the progress report in the Family app (src/lib/exams/publish-outputs.ts). The
// messages, the preview and the guardians' rules are exactly these. Nothing here changes who approves or publishes.
//
// The checked answer sheets as a PDF (C366): at Send, before the messages are queued, this browser makes the PDF of
// each child the preview marks 'make' (src/lib/marking/checked-pdf.ts, from the child's checked papers and page pictures
// read through the app's own routes, in the family's language) and hands it in to be kept until it is sent. The
// progress is said as it goes. A child whose PDF could not be made gets the link only, and the note says how many.

// The pictures of the checked pages, through the office's own route, which checks who asks every time.
const officePage = pageFrom((pageId) => `/api/app/marking/pages/${pageId}`);

const END_REASONS = ['lost', 'forwarded', 'other'] as const;
type EndReason = (typeof END_REASONS)[number];

const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60';

export function TellParentsWhatsApp({ examId, classId, mode = 'tell' }: { examId: string; classId: string; mode?: 'tell' | 'outputs' }) {
  const { t, lang } = useT();
  const outputs = mode === 'outputs';
  const outputsUrl = `/api/app/exams/${examId}/classes/${classId}/outputs`;
  const [made, setMade] = useState<{ made: boolean; madeAt: string | null } | null>(null);
  const [data, setData] = useState<TellParents | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'refused' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // The child whose link is being ended, and why.
  const [ending, setEnding] = useState<{ studentId: string; why: EndReason | null } | null>(null);
  // The PDFs being made at Send (C366), and how many could not be made.
  const [making, setMaking] = useState<{ done: number; total: number } | null>(null);
  const [pdfFailed, setPdfFailed] = useState(0);
  const url = `/api/app/exams/${examId}/classes/${classId}/tell-parents`;

  // One child's PDF: read, drawn here, handed in. False when any step did not work (the child gets the link only).
  const keepPdf = async (studentId: string): Promise<boolean> => {
    const res = await fetch(`${url}/pdf?studentId=${encodeURIComponent(studentId)}`, { cache: 'no-store' }).catch(() => null);
    const input = res?.ok ? ((await res.json().catch(() => null)) as CheckedPdfInput | null) : null;
    if (!input) return false;
    const made = await makeFittedCheckedPdf(input, (key, params) => tIn(input.lang, key, params), officePage).catch(() => null);
    if (!made) return false;
    const kept = await fetch(`${url}/pdf?studentId=${encodeURIComponent(studentId)}`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: made.blob }).catch(() => null);
    return Boolean(kept?.ok);
  };

  const load = useCallback(async () => {
    setState('loading');
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as TellParents | null) : null;
    setData(got);
    setState(got ? 'idle' : res && (res.status === 403 || res.status === 404 || res.status === 409) ? 'refused' : 'failed');
  }, [url]);
  // In outputs mode the state of the action is read at once; for anyone the server does not answer the section says nothing.
  const loadMade = useCallback(async () => {
    const res = await fetch(outputsUrl, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setMade((await res.json().catch(() => null)) as { made: boolean; madeAt: string | null } | null);
    else if (res && (res.status === 403 || res.status === 404 || res.status === 409)) setState('refused');
  }, [outputsUrl]);
  useEffect(() => {
    if (outputs) void loadMade();
  }, [outputs, loadMade]);
  const toggle = async () => {
    if (!open && !data) await load();
    setOpen(!open);
  };

  // For anyone the server does not answer (not the principal or the school admin), nothing is shown.
  if (state === 'refused') return null;
  const send = async () => {
    setBusy(true);
    setNote(null);
    setPdfFailed(0);
    // First the PDFs of the children who will get one, one child at a time.
    const toMake = data?.pdf.on ? data.children.filter((c) => !c.sent && c.pdf === 'make' && c.guardians.some((g) => g.will)) : [];
    let failed = 0;
    for (let i = 0; i < toMake.length; i++) {
      setMaking({ done: i, total: toMake.length });
      if (!(await keepPdf(toMake[i].studentId))) failed += 1;
    }
    setMaking(null);
    setPdfFailed(failed);
    const res = await fetch(outputs ? outputsUrl : url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { queued: number; first?: boolean } | null) : null;
    setBusy(false);
    if (outputs) setNote(body ? { kind: 'ok', text: t(body.first ? 'ex.out.done' : 'ex.out.again', { n: body.queued }) } : { kind: 'error', text: t('ex.out.failed') });
    else setNote(body ? { kind: 'ok', text: t('ex.tell.sent', { n: body.queued }) } : { kind: 'error', text: t('ex.tell.failed') });
    if (outputs) await loadMade();
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
    <section className={SECTION} data-tell-parents data-publish-outputs={outputs ? (made?.made ? 'made' : 'not-made') : undefined} aria-labelledby="tell-parents-title">
      <h2 id="tell-parents-title" className="text-base font-bold">
        {outputs ? t('ex.out.title') : t('ex.tell.title')}
      </h2>
      <p>{outputs ? t('ex.out.lead') : t('ex.tell.lead')}</p>
      {outputs && <p>{t('ex.out.family')}</p>}
      {outputs && made && (
        <p data-outputs-state className="font-semibold">
          {made.made && made.madeAt ? t('ex.out.made', { when: momentWords(made.madeAt, lang) }) : t('ex.out.notMade')}
        </p>
      )}
      {open && data && (
        <p data-tell-summary className="font-semibold">
          {t('ex.tell.summary', { will: data.will, wont: data.wont, sent: data.sent })}
        </p>
      )}
      {open && data && (
        <p data-tell-pdf={data.pdf.on ? 'on' : (data.pdf.why ?? 'off')} className="text-sm">
          {data.pdf.on ? t('ex.pdf.lead') : data.pdf.why ? t(`ex.pdf.why.${data.pdf.why}` as MessageKey) : null}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={TAP} aria-expanded={open} aria-controls="tell-parents-list" disabled={state === 'loading'} onClick={() => void toggle()} data-tell-preview>
          {open ? t('ex.tell.hide') : t('ex.tell.preview')}
        </button>
        {open && data && (outputs ? data.will > 0 || !made?.made : data.will > 0) && (
          <button type="button" className={PRIMARY} disabled={busy} onClick={() => void send()} data-tell-send>
            {outputs ? (busy ? t('ex.out.sending') : data.will > 0 ? t('ex.out.send', { n: data.will }) : t('ex.out.sendNone')) : busy ? t('ex.tell.sending') : t('ex.tell.send', { n: data.will })}
          </button>
        )}
      </div>
      {state === 'failed' && (
        <p role="alert" className="rounded-md bg-off-white px-3 py-2 font-semibold">
          {t('ex.tell.loadFailed')}
        </p>
      )}
      {open && data && data.will === 0 && <p>{data.sent > 0 ? t('ex.tell.nothing') : t('ex.tell.none')}</p>}
      {making && (
        <div role="status" aria-live="polite" data-pdf-making className="flex flex-col gap-1 rounded-md bg-off-white px-3 py-2">
          <p className="font-semibold">{t('ex.pdf.making', { done: making.done, total: making.total })}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white" aria-hidden="true">
            <div className="h-full bg-royal" style={{ width: `${Math.round((making.done / Math.max(1, making.total)) * 100)}%` }} />
          </div>
        </div>
      )}
      {pdfFailed > 0 && !making && (
        <p role="alert" data-pdf-failed className="rounded-md bg-off-white px-3 py-2 font-semibold">
          {t('ex.pdf.failed', { n: pdfFailed })}
        </p>
      )}
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
              {c.pdf && (
                <p data-tell-child-pdf={c.pdf} className="text-sm">
                  {t(`ex.pdf.child.${c.pdf}` as MessageKey)}
                </p>
              )}
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
