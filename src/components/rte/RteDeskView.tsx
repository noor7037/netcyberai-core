'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { StatTile } from '@/components/app-ui/StatTile';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { minorToRupees } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';
import type { AgeBucket } from '@/lib/rte/ageing';
import type { Claim, Desk, DeskChild } from '@/lib/rte/desk';
import { minorToPlainRupees, REVERSAL_REASONS } from '@/lib/rte/rules';

// The RTE claim desk (docs/28 slice 10c, C223; C225). The year's state rate (typed with where it comes from) and
// which fee heads count, each RTE child with their evidence file and the year's claim (raise it, record what the
// state pays in parts, write off what is short, reopen a written-off claim), the claim sheet as a CSV, and every
// year's unpaid claims by age. Every figure comes from the server: the screen never works out a claim itself.

const ERRORS = ['rate', 'source', 'aadhaar', 'unknown_session', 'raised_on', 'no_rate', 'not_rte', 'claimed', 'not_on_sheet', 'no_class', 'no_fee', 'no_children', 'settled', 'reference', 'note', 'kind', 'nothing', 'document', 'choose_class', 'class', 'not_written_off', 'amount', 'over', 'received_on', 'reason', 'receipt'];
const DOC_TYPES = ['birth_certificate', 'previous_school_tc', 'previous_report_card', 'address_proof', 'student_photograph', 'caste_category_certificate', 'medical_record'];
const KINDS = ['admission_order', 'lottery', 'income_or_category', 'other'] as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const CARD = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
const BUCKET_TONE: Record<AgeBucket, 'success' | 'neutral' | 'warning' | 'danger'> = { paid: 'success', upTo90: 'neutral', upTo180: 'warning', upTo365: 'warning', overYear: 'danger' };

type Reply = { ok: boolean; body: Record<string, unknown> };
// The one form open on a claim: a payment, a write-off, a reopening, or taking a receipt back.
type ClaimForm =
  | { claimId: string; mode: 'receipt'; amount: string; receivedOn: string; reference: string }
  | { claimId: string; mode: 'write_off'; note: string }
  | { claimId: string; mode: 'reopen'; reason: string }
  | { claimId: string; mode: 'reverse'; receiptId: string; reason: string };
type EvidenceForm = { studentId: string; kind: string; documentId: string; note: string };

export function RteDeskView() {
  const { t, tCount, lang } = useT();
  const [data, setData] = useState<Desk | null>(null);
  const [failed, setFailed] = useState<'failed' | 'notYours' | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [rate, setRate] = useState({ amount: '', source: '' });
  const [raisedOn, setRaisedOn] = useState('');
  const [form, setForm] = useState<ClaimForm | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
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
  const claimUrl = (claim: Claim) => `/api/app/fees/rte/claims/${claim.claim_id}`;

  return (
    <div lang={lang} data-rte-desk className="flex flex-col gap-4 text-sm text-slate">
      {note && <p role="status" data-rte-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}

      <section data-rte-rate className={CARD}>
        <div className="sm:max-w-xs">
          <Select id="rte-year" label={t('rtd.year')} value={sessionId} onChange={(e) => { setForm(null); setEvidence(null); setNote(null); void load(e.target.value); }}>
            {data.sessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>{s.label}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('rtd.rate.title', { year })}</h2>
          <InfoTip>
            <p>{t('rtd.rate.sourceHelp')}</p>
            {data.rate && <p>{t('rtd.rate.replaces')}</p>}
          </InfoTip>
        </div>
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
          <Input id="rte-rate-source" label={t('rtd.rate.sourceLabel')} maxLength={300} value={rate.source} onChange={(e) => setRate({ ...rate, source: e.target.value })} />
        </div>
        <button type="button" data-rte-rate-save disabled={busy || !rate.amount.trim() || !rate.source.trim()} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/fees/rte/rates', 'POST', { sessionId: session.session_id, rate: rate.amount, source: rate.source }, () => t('rtd.rate.saved'), () => setRate({ amount: '', source: '' }))}>
          {t('rtd.rate.save')}
        </button>
        <div data-rte-counting={data.counting.choice} className="flex flex-col gap-1 rounded-md border border-slate/10 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-1">
            <p className="font-semibold">{t('rtd.counting.title')}</p>
            <InfoTip>{t(data.mayDecide ? 'rtd.counting.change' : 'rtd.counting.changeOffice')}</InfoTip>
          </div>
          <p>{t(`set.fees.rte_claim_heads.option.${data.counting.choice}` as MessageKey)}: {data.counting.heads.length ? data.counting.heads.join(', ') : t('rtd.counting.noHeads')}</p>
          <p className="font-semibold">{t('rtd.counting.check')}</p>
          {data.mayDecide && <a href="/app/settings" data-rte-counting-settings className="inline-flex min-h-[44px] items-center self-start text-sapphire underline">{t('rtd.counting.openSettings')}</a>}
        </div>
      </section>

      <section data-rte-sheet className={CARD}>
        <div>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('rtd.sheet.title', { year })}</h2>
            <InfoTip>{t('rtd.sheet.fee')}</InfoTip>
          </div>
          <p className="text-slate/70">{t('rtd.sheet.how')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([
            ['rtd.totals.children', String(data.totals.onSheet), 'users', 'royal'],
            ['rtd.totals.toRaise', money(data.totals.toRaiseMinor), 'fees', 'amber'],
            ['rtd.totals.raised', money(data.totals.raisedMinor), 'chart', 'sapphire'],
            ['rtd.totals.paid', money(data.totals.paidMinor), 'check', 'emerald'],
            ['rtd.totals.noEvidence', String(data.totals.noEvidence), 'alert', 'coral'],
          ] as const).map(([k, v, icon, tone]) => (
            <StatTile key={k} icon={icon} tone={tone} label={t(k)} value={v} valueAttrs={{ 'data-rte-total': k.slice(11) }} />
          ))}
        </div>
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
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('rtd.ageing.title')}</h2>
          <InfoTip>{t('rtd.ageing.how')}</InfoTip>
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
                      <dd data-rte-age-figure={k.slice(12)} className="font-bold">{money(v)}</dd>
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

  function paymentWords(body: Record<string, unknown>): string {
    return body.state === 'paid' ? t('rtd.paidSaved') : t('rtd.receiptSaved', { due: money(Number(body.dueMinor ?? 0)) });
  }

  // The claim's money: what was paid and when, what is still due, and each receipt (one typed wrongly can be taken
  // back while the claim is raised).
  function claimMoney(claim: Claim) {
    const open = form && form.claimId === claim.claim_id ? form : null;
    return (
      <div className="flex flex-col gap-2">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <dt className="text-slate/70">{t('rtd.received')}</dt>
            <dd data-rte-received className="font-bold">{money(claim.received_minor)}</dd>
          </div>
          <div>
            <dt className="text-slate/70">{t('rtd.due')}</dt>
            <dd data-rte-due className="font-bold">{money(claim.due_minor)}</dd>
          </div>
        </dl>
        {claim.receipts.length > 0 && (
          <ul data-rte-receipts={claim.receipts.length} className="flex flex-col gap-2">
            {claim.receipts.map((r) => (
              <li key={r.receipt_id} data-rte-receipt={r.reverses ? 'reversal' : r.reversed ? 'reversed' : 'receipt'} className="flex flex-wrap items-start justify-between gap-2 border-l-2 border-slate/10 pl-3">
                <div className="min-w-0 flex-1">
                  {r.reverses ? (
                    <p className="break-words">{t('rtd.receipt.reversal', { amount: money(-r.amount_minor), date: date(r.received_on), why: t(`rtd.reversal.${r.reversal_reason ?? 'typed_wrong'}` as MessageKey), name: r.recorded_by ?? '' })}</p>
                  ) : (
                    <p className="break-words">{t('rtd.receipt.row', { amount: money(r.amount_minor), date: date(r.received_on), reference: r.reference ?? '', name: r.recorded_by ?? '' })}</p>
                  )}
                  {r.reversed && <p className="text-slate/70">{t('rtd.receipt.takenBack')}</p>}
                </div>
                {claim.state === 'raised' && !r.reverses && !r.reversed && !open && (
                  <button type="button" data-rte-open-reverse className={TAP} onClick={() => setForm({ claimId: claim.claim_id, mode: 'reverse', receiptId: r.receipt_id, reason: 'typed_wrong' })}>{t('rtd.reverse')}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // A render function, not a component: a component made inside this one would be new on every render, and its
  // inputs would lose what is being typed.
  function claimActions(claim: Claim) {
    const open = form && form.claimId === claim.claim_id ? form : null;
    return (
      <>
        {claim.state === 'raised' && !open && (
          <div className="flex flex-wrap gap-2">
            <button type="button" data-rte-open-paid className={TAP} onClick={() => setForm({ claimId: claim.claim_id, mode: 'receipt', amount: minorToPlainRupees(claim.due_minor), receivedOn: data?.today ?? '', reference: '' })}>{t('rtd.recordPayment')}</button>
            <button type="button" data-rte-open-write-off className={TAP} onClick={() => setForm({ claimId: claim.claim_id, mode: 'write_off', note: '' })}>{t(claim.received_minor > 0 ? 'rtd.writeOffRest' : 'rtd.writeOff')}</button>
          </div>
        )}
        {claim.state === 'written_off' && data?.mayDecide && !open && (
          <button type="button" data-rte-open-reopen className={`${TAP} self-start`} onClick={() => setForm({ claimId: claim.claim_id, mode: 'reopen', reason: '' })}>{t('rtd.reopen')}</button>
        )}
        {claim.state === 'written_off' && !data?.mayDecide && <p className="text-slate/70">{t('rtd.reopenOffice')}</p>}
        {open?.mode === 'receipt' && (
          <div className="flex flex-col gap-2">
            <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <Input id={`rte-amount-${claim.claim_id}`} inputMode="decimal" label={t('rtd.amountReceived')} maxLength={14} value={open.amount} onChange={(e) => setForm({ ...open, amount: e.target.value })} />
              <Input id={`rte-paid-on-${claim.claim_id}`} type="date" label={t('rtd.receivedOn')} min={claim.raised_on} max={data?.today} value={open.receivedOn} onChange={(e) => setForm({ ...open, receivedOn: e.target.value })} />
              <Input id={`rte-reference-${claim.claim_id}`} label={t('rtd.reference')} maxLength={80} value={open.reference} onChange={(e) => setForm({ ...open, reference: e.target.value })} />
              <button type="button" data-rte-paid-save disabled={busy || !open.amount.trim() || !open.receivedOn || !open.reference.trim()} className={PRIMARY} onClick={() => void send(claimUrl(claim), 'POST', { action: 'receipt', amount: open.amount, receivedOn: open.receivedOn, reference: open.reference }, paymentWords, () => setForm(null))}>
                {t('rtd.savePayment')}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-1">
              <button type="button" className={TAP} onClick={() => setForm(null)}>{t('rtd.cancel')}</button>
              <InfoTip>{t('rtd.paymentHelp', { due: money(claim.due_minor) })}</InfoTip>
            </div>
          </div>
        )}
        {open?.mode === 'write_off' && (
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <div className="sm:col-span-2">
              <Input id={`rte-write-off-${claim.claim_id}`} label={t('rtd.writeOffNote')} helperText={t('rtd.evidence.noteHelp')} maxLength={300} value={open.note} onChange={(e) => setForm({ ...open, note: e.target.value })} />
            </div>
            <button type="button" data-rte-write-off-save disabled={busy || !open.note.trim()} className={PRIMARY} onClick={() => void send(claimUrl(claim), 'POST', { action: 'write_off', note: open.note }, () => t('rtd.writtenOffSaved'), () => setForm(null))}>
              {t(claim.received_minor > 0 ? 'rtd.writeOffRest' : 'rtd.writeOff')}
            </button>
            <button type="button" className={`${TAP} self-start`} onClick={() => setForm(null)}>{t('rtd.cancel')}</button>
          </div>
        )}
        {open?.mode === 'reopen' && (
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <div className="sm:col-span-2">
              <Input id={`rte-reopen-${claim.claim_id}`} label={t('rtd.reopenReason')} helperText={t('rtd.evidence.noteHelp')} maxLength={300} value={open.reason} onChange={(e) => setForm({ ...open, reason: e.target.value })} />
            </div>
            <button type="button" data-rte-reopen-save disabled={busy || !open.reason.trim()} className={PRIMARY} onClick={() => void send(claimUrl(claim), 'POST', { action: 'reopen', reason: open.reason }, () => t('rtd.reopenedSaved'), () => setForm(null))}>
              {t('rtd.reopen')}
            </button>
            <button type="button" className={`${TAP} self-start`} onClick={() => setForm(null)}>{t('rtd.cancel')}</button>
          </div>
        )}
        {open?.mode === 'reverse' && (
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <div className="sm:col-span-2">
              <Select id={`rte-reverse-${claim.claim_id}`} label={t('rtd.reverseWhy')} value={open.reason} onChange={(e) => setForm({ ...open, reason: e.target.value })}>
                {REVERSAL_REASONS.map((r) => (
                  <option key={r} value={r}>{t(`rtd.reversal.${r}` as MessageKey)}</option>
                ))}
              </Select>
            </div>
            <button type="button" data-rte-reverse-save disabled={busy} className={PRIMARY} onClick={() => void send(claimUrl(claim), 'POST', { action: 'reverse', receiptId: open.receiptId, reason: open.reason }, () => t('rtd.reversedSaved'), () => setForm(null))}>
              {t('rtd.reverse')}
            </button>
            <button type="button" className={`${TAP} self-start`} onClick={() => setForm(null)}>{t('rtd.cancel')}</button>
          </div>
        )}
      </>
    );
  }

  function childCard(c: DeskChild) {
    const claim = c.claim;
    const state = claim?.state ?? 'none';
    const figures = claim ?? c.proposed;
    const evidenceForm = evidence?.studentId === c.student_id ? evidence : null;
    return (
      <li key={c.student_id} data-rte-child={c.student_id} data-rte-state={claim ? state : c.proposed ? 'ready' : (c.blocked ?? c.offSheet ?? 'none')} className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{c.name}</span>
          <span className="text-slate/70">{c.class_name ? t('rtd.child.class', { class: c.class_name }) : t('rtd.child.noClass')}</span>
          {c.admission_no && <span className="text-slate/70">{t('rtd.child.admission', { no: c.admission_no })}</span>}
          {c.onSheet && <Badge variant={state === 'paid' ? 'success' : state === 'raised' ? 'warning' : 'neutral'}>{t(`rtd.state.${state}` as MessageKey)}</Badge>}
        </div>
        {c.class_source && c.class_source !== 'current' && <p data-rte-class-source={c.class_source} className="text-slate/70">{t(`rtd.classSource.${c.class_source}` as MessageKey, { year })}</p>}
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
            {c.blocked === 'choose_class' && data?.mayDecide && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-full sm:w-56">
                  <Select id={`rte-class-${c.student_id}`} label={t('rtd.chooseClass', { year })} value={chosen[c.student_id] ?? ''} onChange={(e) => setChosen({ ...chosen, [c.student_id]: e.target.value })}>
                    <option value="">{t('rtd.chooseClassNone')}</option>
                    {(data?.classes ?? []).map((k) => (
                      <option key={k.class_id} value={k.class_id}>{k.name}</option>
                    ))}
                  </Select>
                </div>
                <button type="button" data-rte-raise-chosen disabled={busy || !raisedOn || !chosen[c.student_id]} className={PRIMARY} onClick={() => void send('/api/app/fees/rte/claims', 'POST', { sessionId, studentIds: [c.student_id], raisedOn, classId: chosen[c.student_id] }, raisedWords)}>
                  {t('rtd.raiseChosen')}
                </button>
              </div>
            )}
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
                {claimMoney(claim)}
                {claim.state === 'paid' && <p data-rte-paid className="font-semibold">{t('rtd.claim.paidInFull', { date: date(claim.paid_on ?? ''), name: claim.settled_by ?? '' })}</p>}
                {claim.state === 'written_off' && <p data-rte-written-off className="break-words font-semibold">{claim.write_off_note ? t('rtd.claim.writtenOff', { name: claim.settled_by ?? '', note: claim.write_off_note }) : t('rtd.claim.writtenOffErased', { name: claim.settled_by ?? '' })}</p>}
                {claim.reopened_by && claim.reopened_at && <p data-rte-reopened className="break-words text-slate/70">{claim.reopen_reason ? t('rtd.claim.reopened', { name: claim.reopened_by, date: date(claim.reopened_at), reason: claim.reopen_reason }) : t('rtd.claim.reopenedErased', { name: claim.reopened_by, date: date(claim.reopened_at) })}</p>}
                {claimActions(claim)}
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
            {!evidenceForm ? (
              <button type="button" data-rte-evidence-open className={`${TAP} self-start`} onClick={() => setEvidence({ studentId: c.student_id, kind: 'admission_order', documentId: '', note: '' })}>
                {t('rtd.evidence.add')}
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select id={`rte-kind-${c.student_id}`} label={t('rtd.evidence.kind')} value={evidenceForm.kind} onChange={(e) => setEvidence({ ...evidenceForm, kind: e.target.value })}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>{t(`rtd.kind.${k}` as MessageKey)}</option>
                    ))}
                  </Select>
                  <Select id={`rte-doc-${c.student_id}`} label={t('rtd.evidence.document')} value={evidenceForm.documentId} onChange={(e) => setEvidence({ ...evidenceForm, documentId: e.target.value })} helperText={c.documents.length === 0 ? t('rtd.evidence.noDocuments') : undefined}>
                    <option value="">{t('rtd.evidence.noDocument')}</option>
                    {c.documents.map((d) => (
                      <option key={d.document_id} value={d.document_id}>{t('rtd.evidence.doc', { type: docType(d.doc_type), date: date(d.uploaded_at) })}</option>
                    ))}
                  </Select>
                </div>
                <Input id={`rte-note-${c.student_id}`} label={t('rtd.evidence.note')} helperText={t('rtd.evidence.noteHelp')} maxLength={300} value={evidenceForm.note} onChange={(e) => setEvidence({ ...evidenceForm, note: e.target.value })} />
                <button type="button" data-rte-evidence-add disabled={busy || (!evidenceForm.documentId && !evidenceForm.note.trim())} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/fees/rte/evidence', 'POST', { studentId: c.student_id, kind: evidenceForm.kind, documentId: evidenceForm.documentId || null, note: evidenceForm.note.trim() || null }, () => t('rtd.evidence.added'), () => setEvidence(null))}>
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
