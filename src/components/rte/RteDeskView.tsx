'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { minorToRupees } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';
import type { AgeBucket } from '@/lib/rte/rules';
import type { Desk, DeskChild } from '@/lib/rte/desk';

// The RTE claim desk (docs/28 slice 10c, C223). The year's state rate (typed with where it comes from), each RTE
// child with their evidence file and the year's claim (raise it, mark it paid, or write it off), the claim sheet as
// a CSV, and every year's unpaid claims by age. Every figure comes from the server: the screen never works out a
// claim itself.

const ERRORS = ['rate', 'source', 'aadhaar', 'unknown_session', 'raised_on', 'no_rate', 'not_rte', 'claimed', 'not_on_sheet', 'no_class', 'no_fee', 'no_children', 'settled', 'paid_on', 'reference', 'note', 'kind', 'nothing', 'document'];
const DOC_TYPES = ['birth_certificate', 'previous_school_tc', 'previous_report_card', 'address_proof', 'student_photograph', 'caste_category_certificate', 'medical_record'];
const KINDS = ['admission_order', 'lottery', 'income_or_category', 'other'] as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const FIELD = 'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
const CARD = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
const BUCKET_TONE: Record<AgeBucket, 'success' | 'neutral' | 'warning' | 'danger'> = { paid: 'success', upTo90: 'neutral', upTo180: 'warning', upTo365: 'warning', overYear: 'danger' };

type Reply = { ok: boolean; body: Record<string, unknown> };
type Settle = { claimId: string; mode: 'paid' | 'write_off'; paidOn: string; reference: string; note: string };
type EvidenceForm = { studentId: string; kind: string; documentId: string; note: string };

export function RteDeskView() {
  const { t, tCount, lang } = useT();
  const [data, setData] = useState<Desk | null>(null);
  const [failed, setFailed] = useState<'failed' | 'notYours' | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [rate, setRate] = useState({ amount: '', source: '' });
  const [raisedOn, setRaisedOn] = useState('');
  const [settle, setSettle] = useState<Settle | null>(null);
  const [evidence, setEvidence] = useState<EvidenceForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (session: string) => {
    const res = await fetch(`/api/app/fees/rte/desk${session ? `?session=${encodeURIComponent(session)}` : ''}`).catch(() => null);
    if (res?.status === 403) return setFailed('notYours');
    const got = res?.ok ? ((await res.json().catch(() => null)) as Desk | null) : null;
    setFailed(got ? null : 'failed');
    if (!got) return;
    setData(got);
    setSessionId(got.session?.session_id ?? '');
    setRaisedOn((d) => d || got.today);
  }, []);
  useEffect(() => {
    void load('');
  }, [load]);

  const send = async (url: string, method: 'POST' | 'DELETE', payload: unknown, done: (body: Record<string, unknown>) => string, after?: () => void) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) }).catch(() => null);
    const reply: Reply = { ok: Boolean(res?.ok), body: ((res ? await res.json().catch(() => null) : null) ?? {}) as Record<string, unknown> };
    setBusy(false);
    if (!reply.ok) {
      const code = String(reply.body.code ?? '');
      setNote({ ok: false, text: res?.status === 403 ? t('rtd.notYours') : res?.status === 404 ? t('rtd.err.not_found') : ERRORS.includes(code) ? t(`rtd.err.${code}` as MessageKey) : t('rtd.err.other') });
      if (res?.status === 404) await load(sessionId);
      return;
    }
    setNote({ ok: true, text: done(reply.body) });
    after?.();
    await load(sessionId);
  };

  if (failed) return <p role="alert" data-rte-failed={failed} className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(failed === 'notYours' ? 'rtd.notYours' : 'rtd.failed')}</p>;
  if (!data) return null;
  const day = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  const date = (iso: string) => day.format(new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso));
  const money = (minor: number) => `₹${minorToRupees(minor)}`;
  const year = data.session?.label ?? '';

  if (!data.session) return <p data-rte-no-year className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('rtd.noYear')}</p>;
  const session = data.session;
  const ready = data.children.filter((c) => c.proposed);

  return (
    <div lang={lang} data-rte-desk className="flex flex-col gap-4 text-sm text-slate">
      {note && <p role="status" data-rte-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}

      <section data-rte-rate className={CARD}>
        <div className="flex flex-col gap-1 sm:max-w-xs">
          <label htmlFor="rte-year" className="font-semibold">{t('rtd.year')}</label>
          <select id="rte-year" className={FIELD} value={sessionId} onChange={(e) => { setSettle(null); setEvidence(null); setNote(null); void load(e.target.value); }}>
            {data.sessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>{s.label}</option>
            ))}
          </select>
        </div>
        <h2 className="text-base font-bold">{t('rtd.rate.title', { year })}</h2>
        {data.rate ? (
          <div data-rte-rate-now className="flex flex-col gap-1 rounded-md bg-off-white px-3 py-2">
            <p className="text-base font-bold">{t('rtd.rate.shown', { rate: minorToRupees(data.rate.rate_minor) })}</p>
            <p className="break-words">{t('rtd.rate.source', { source: data.rate.source })}</p>
            <p className="text-slate/70">{t('rtd.rate.typed', { name: data.rate.typed_by ?? '', date: date(data.rate.typed_at) })}</p>
          </div>
        ) : (
          <p data-rte-rate-none className="rounded-md bg-off-white px-3 py-2">{t('rtd.rate.none', { year })}</p>
        )}
        {data.earlierRates.length > 0 && (
          <details className="rounded-md border border-slate/10 px-3">
            <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('rtd.rate.earlier')}</summary>
            <ul className="flex flex-col gap-1 pb-2">
              {data.earlierRates.map((r) => (
                <li key={r.rate_id} className="break-words text-slate/70">{t('rtd.rate.earlierRow', { rate: minorToRupees(r.rate_minor), name: r.typed_by ?? '', date: date(r.typed_at), source: r.source })}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="rte-rate" inputMode="decimal" label={t('rtd.rate.amount')} maxLength={14} value={rate.amount} onChange={(e) => setRate({ ...rate, amount: e.target.value })} />
          <Input id="rte-rate-source" label={t('rtd.rate.sourceLabel')} helperText={t('rtd.rate.sourceHelp')} maxLength={300} value={rate.source} onChange={(e) => setRate({ ...rate, source: e.target.value })} />
        </div>
        {data.rate && <p className="text-slate/70">{t('rtd.rate.replaces')}</p>}
        <button type="button" data-rte-rate-save disabled={busy || !rate.amount.trim() || !rate.source.trim()} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/fees/rte/rates', 'POST', { sessionId: session.session_id, rate: rate.amount, source: rate.source }, () => t('rtd.rate.saved'), () => setRate({ amount: '', source: '' }))}>
          {t('rtd.rate.save')}
        </button>
      </section>

      <section data-rte-sheet className={CARD}>
        <div>
          <h2 className="text-base font-bold">{t('rtd.sheet.title', { year })}</h2>
          <p className="text-slate/70">{t('rtd.sheet.how')}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {([
            ['rtd.totals.children', String(data.totals.onSheet)],
            ['rtd.totals.toRaise', money(data.totals.toRaiseMinor)],
            ['rtd.totals.raised', money(data.totals.raisedMinor)],
            ['rtd.totals.paid', money(data.totals.paidMinor)],
            ['rtd.totals.noEvidence', String(data.totals.noEvidence)],
          ] as const).map(([k, v]) => (
            <div key={k} className="rounded-md bg-off-white px-3 py-2">
              <dt className="text-slate/70">{t(k)}</dt>
              <dd data-rte-total={k.slice(11)} className="text-base font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-48">
            <Input id="rte-raised-on" type="date" label={t('rtd.raisedOn')} min={session.start_date} max={data.today} value={raisedOn} onChange={(e) => setRaisedOn(e.target.value)} />
          </div>
          <button type="button" data-rte-raise-all disabled={busy || ready.length === 0 || !raisedOn} className={PRIMARY} onClick={() => void send('/api/app/fees/rte/claims', 'POST', { sessionId: session.session_id, studentIds: ready.map((c) => c.student_id), raisedOn }, raisedWords)}>
            {t('rtd.raiseAll')} ({ready.length})
          </button>
          <a href={`/api/app/fees/rte/sheet?session=${session.session_id}`} data-rte-csv className={`${TAP} inline-flex items-center`}>
            {t('rtd.download')}
          </a>
        </div>
        {data.children.length === 0 ? (
          <div data-rte-empty className="flex flex-col items-start gap-2 rounded-md bg-off-white px-3 py-2">
            <p>{t('rtd.none')}</p>
            <a href="/app/fees" className={`${TAP} inline-flex items-center bg-white`}>{t('rtd.openFees')}</a>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.children.map((c) => childCard(c))}
          </ul>
        )}
      </section>

      <section data-rte-ageing className={CARD}>
        <div>
          <h2 className="text-base font-bold">{t('rtd.ageing.title')}</h2>
          <p className="text-slate/70">{t('rtd.ageing.how')}</p>
        </div>
        {data.ageing.length === 0 ? (
          <p data-rte-ageing-empty className="rounded-md bg-off-white px-3 py-2">{t('rtd.ageing.none')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.ageing.map((y) => (
              <li key={y.session_id} data-rte-age-year={y.label} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <p className="text-base font-bold">{y.label}</p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ['rtd.ageing.claimed', y.claimed_minor],
                    ['rtd.ageing.paid', y.paid_minor],
                    ['rtd.ageing.writtenOff', y.written_off_minor],
                    ['rtd.ageing.due', y.due_minor],
                  ] as const).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-slate/70">{t(k)}</dt>
                      <dd className="font-bold">{money(v)}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="flex flex-wrap gap-2">
                  {y.buckets.map((b) => (
                    <li key={b.bucket} data-rte-bucket={b.bucket} data-rte-bucket-count={b.count}>
                      <Badge variant={b.count ? BUCKET_TONE[b.bucket] : 'neutral'}>{t(`rtd.bucket.${b.bucket}` as MessageKey)}: {money(b.minor)}</Badge>
                    </li>
                  ))}
                </ul>
                {y.oldest_days !== null && <p className="text-slate/70">{tCount('rtd.ageing.oldest', y.oldest_days)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  function raisedWords(body: Record<string, unknown>): string {
    const skipped = Array.isArray(body.skipped) ? body.skipped.length : 0;
    return `${tCount('rtd.raisedSaved', Number(body.raised ?? 0))}${skipped ? ` ${tCount('rtd.skipped', skipped)}` : ''}`;
  }

  // A render function, not a component: a component made inside this one would be new on every render, and its
  // inputs would lose what is being typed.
  function childCard(c: DeskChild) {
    const claim = c.claim;
    const state = claim?.state ?? 'none';
    const figures = claim ?? c.proposed;
    const open = settle && claim && settle.claimId === claim.claim_id ? settle : null;
    const form = evidence?.studentId === c.student_id ? evidence : null;
    return (
      <li key={c.student_id} data-rte-child={c.student_id} data-rte-state={claim ? state : c.proposed ? 'ready' : (c.blocked ?? c.offSheet ?? 'none')} className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{c.name}</span>
          <span className="text-slate/70">{c.class_name ? t('rtd.child.class', { class: c.class_name }) : t('rtd.child.noClass')}</span>
          {c.admission_no && <span className="text-slate/70">{t('rtd.child.admission', { no: c.admission_no })}</span>}
          {c.onSheet && <Badge variant={state === 'paid' ? 'success' : state === 'raised' ? 'warning' : 'neutral'}>{t(`rtd.state.${state}` as MessageKey)}</Badge>}
        </div>
        {c.entry_class && c.admitted_on && <p className="text-slate/70">{t('rtd.child.entry', { class: c.entry_class, date: date(c.admitted_on) })}</p>}
        {c.offSheet && <p className="font-semibold">{t(c.offSheet === 'left' ? 'rtd.child.left' : 'rtd.child.admittedLater')}</p>}
        {!c.rte && <p className="font-semibold">{t('rtd.child.untagged')}</p>}

        {c.onSheet && (
          <>
            {figures && (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <dt className="text-slate/70">{t('rtd.fee')}</dt>
                  <dd data-rte-fee className="font-bold">{money(figures.fee_minor)}</dd>
                </div>
                <div>
                  <dt className="text-slate/70">{t('rtd.stateRate')}</dt>
                  <dd className="font-bold">{money(figures.rate_minor)}</dd>
                </div>
                <div>
                  <dt className="text-slate/70">{t('rtd.claim')}</dt>
                  <dd data-rte-amount className="font-bold">{money(figures.amount_minor)}</dd>
                </div>
                <div>
                  <dt className="text-slate/70">{t('rtd.claimedAt')}</dt>
                  <dd className="font-bold">{t(`rtd.applied.${figures.applied}` as MessageKey)}</dd>
                </div>
              </dl>
            )}
            {c.blocked && <p data-rte-blocked={c.blocked} className="rounded-md bg-off-white px-3 py-2">{t(`rtd.blocked.${c.blocked}` as MessageKey)}</p>}
            {c.proposed && (
              <button type="button" data-rte-raise disabled={busy || !raisedOn} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/fees/rte/claims', 'POST', { sessionId, studentIds: [c.student_id], raisedOn }, raisedWords)}>
                {t('rtd.raise')}
              </button>
            )}
            {claim && (
              <div className="flex flex-col gap-2">
                <p>{t('rtd.claim.raised', { date: date(claim.raised_on), name: claim.raised_by ?? '' })}</p>
                {claim.state === 'raised' && (
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-slate/70">{tCount('rtd.claim.days', claim.days)}</span>
                    <Badge variant={BUCKET_TONE[claim.bucket]}>{t(`rtd.bucket.${claim.bucket}` as MessageKey)}</Badge>
                  </p>
                )}
                {claim.state === 'paid' && <p data-rte-paid className="font-semibold">{t('rtd.claim.paid', { date: date(claim.paid_on ?? ''), reference: claim.reference ?? '', name: claim.settled_by ?? '' })}</p>}
                {claim.state === 'written_off' && <p className="break-words font-semibold">{t('rtd.claim.writtenOff', { name: claim.settled_by ?? '', note: claim.write_off_note ?? '' })}</p>}
                {claim.state === 'raised' && !open && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-rte-open-paid className={TAP} onClick={() => setSettle({ claimId: claim.claim_id, mode: 'paid', paidOn: data?.today ?? '', reference: '', note: '' })}>{t('rtd.markPaid')}</button>
                    <button type="button" data-rte-open-write-off className={TAP} onClick={() => setSettle({ claimId: claim.claim_id, mode: 'write_off', paidOn: '', reference: '', note: '' })}>{t('rtd.writeOff')}</button>
                  </div>
                )}
                {open && open.mode === 'paid' && (
                  <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
                    <Input id={`rte-paid-on-${claim.claim_id}`} type="date" label={t('rtd.paidOn')} min={claim.raised_on} max={data?.today} value={open.paidOn} onChange={(e) => setSettle({ ...open, paidOn: e.target.value })} />
                    <Input id={`rte-reference-${claim.claim_id}`} label={t('rtd.reference')} maxLength={80} value={open.reference} onChange={(e) => setSettle({ ...open, reference: e.target.value })} />
                    <button type="button" data-rte-paid-save disabled={busy || !open.paidOn || !open.reference.trim()} className={PRIMARY} onClick={() => void send(`/api/app/fees/rte/claims/${claim.claim_id}`, 'POST', { action: 'paid', paidOn: open.paidOn, reference: open.reference }, () => t('rtd.paidSaved'), () => setSettle(null))}>
                      {t('rtd.markPaid')}
                    </button>
                  </div>
                )}
                {open && open.mode === 'write_off' && (
                  <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
                    <div className="sm:col-span-2">
                      <Input id={`rte-write-off-${claim.claim_id}`} label={t('rtd.writeOffNote')} helperText={t('rtd.evidence.noteHelp')} maxLength={300} value={open.note} onChange={(e) => setSettle({ ...open, note: e.target.value })} />
                    </div>
                    <button type="button" data-rte-write-off-save disabled={busy || !open.note.trim()} className={PRIMARY} onClick={() => void send(`/api/app/fees/rte/claims/${claim.claim_id}`, 'POST', { action: 'write_off', note: open.note }, () => t('rtd.writtenOffSaved'), () => setSettle(null))}>
                      {t('rtd.writeOff')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <details data-rte-evidence={c.evidence.length} className="rounded-md border border-slate/10 px-3">
          <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('rtd.evidence.title', { count: c.evidence.length })}</summary>
          <div className="flex flex-col gap-3 pb-3">
            {c.evidence.length === 0 ? (
              <p className="text-slate/70">{t('rtd.evidence.none')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.evidence.map((e) => (
                  <li key={e.evidence_id} data-rte-evidence-item={e.kind} className="flex flex-wrap items-start justify-between gap-2 border-l-2 border-slate/10 pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{t(`rtd.kind.${e.kind}` as MessageKey)}</p>
                      {e.document && <p>{t('rtd.evidence.doc', { type: docType(e.document.doc_type), date: date(e.document.uploaded_at) })}</p>}
                      {e.note && <p className="whitespace-pre-wrap break-words">{e.note}</p>}
                      <p className="text-slate/70">{t('rtd.evidence.by', { name: e.added_by ?? '', date: date(e.added_at) })}</p>
                    </div>
                    <button type="button" data-rte-evidence-remove disabled={busy} className={TAP} onClick={() => void send(`/api/app/fees/rte/evidence/${e.evidence_id}`, 'DELETE', undefined, () => t('rtd.evidence.removed'))}>
                      {t('rtd.evidence.remove')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!form ? (
              <button type="button" data-rte-evidence-open className={`${TAP} self-start`} onClick={() => setEvidence({ studentId: c.student_id, kind: 'admission_order', documentId: '', note: '' })}>
                {t('rtd.evidence.add')}
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`rte-kind-${c.student_id}`} className="font-semibold">{t('rtd.evidence.kind')}</label>
                    <select id={`rte-kind-${c.student_id}`} className={FIELD} value={form.kind} onChange={(e) => setEvidence({ ...form, kind: e.target.value })}>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>{t(`rtd.kind.${k}` as MessageKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`rte-doc-${c.student_id}`} className="font-semibold">{t('rtd.evidence.document')}</label>
                    <select id={`rte-doc-${c.student_id}`} className={FIELD} value={form.documentId} onChange={(e) => setEvidence({ ...form, documentId: e.target.value })}>
                      <option value="">{t('rtd.evidence.noDocument')}</option>
                      {c.documents.map((d) => (
                        <option key={d.document_id} value={d.document_id}>{t('rtd.evidence.doc', { type: docType(d.doc_type), date: date(d.uploaded_at) })}</option>
                      ))}
                    </select>
                    {c.documents.length === 0 && <p className="text-slate/70">{t('rtd.evidence.noDocuments')}</p>}
                  </div>
                </div>
                <Input id={`rte-note-${c.student_id}`} label={t('rtd.evidence.note')} helperText={t('rtd.evidence.noteHelp')} maxLength={300} value={form.note} onChange={(e) => setEvidence({ ...form, note: e.target.value })} />
                <button type="button" data-rte-evidence-add disabled={busy || (!form.documentId && !form.note.trim())} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/fees/rte/evidence', 'POST', { studentId: c.student_id, kind: form.kind, documentId: form.documentId || null, note: form.note.trim() || null }, () => t('rtd.evidence.added'), () => setEvidence(null))}>
                  {t('rtd.evidence.add')}
                </button>
              </div>
            )}
          </div>
        </details>
      </li>
    );
  }

  function docType(type: string): string {
    return t(`rtd.doc.${DOC_TYPES.includes(type) ? type : 'other'}` as MessageKey);
  }
}
