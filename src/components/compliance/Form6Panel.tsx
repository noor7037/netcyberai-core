'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { Figure, Form6Advisory } from '@/lib/compliance/form6';
import { minorToRupees } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';
import { CARD, dayFormat, PRIMARY, refusal, send, TAP } from './desk-client';

// Form 6 fee data (C227): exactly what src/lib/compliance/form6.ts's computeForm6Advisory works out from the school's
// fee structures, read from its own route (/api/app/compliance/form6), or handed in by the page (`initial`). Nothing
// is worked out again here: the year's recurring fees of this year and the year before, the increase, and the CPI and
// filing deadline with where they come from.
//
// On the compliance desk the office ENTERS the CPI and the filing deadline (C230-A, C232 part B): each with the https
// address of its source and the day it was read, never a default number; who entered it and when are the database's.
// On the Fees page (`place="fees"`) the accountant reads the same advisory, read-only, and nothing when Form 6 does not
// apply to the school.

// A percent as a person writes it: at most two places, no floating-point tail (4.31 + 5 shows 9.31).
const pct = (x: number | null) => (x === null ? '' : String(Number(x.toFixed(2))));
// A source as a link shows its site; the whole address is the link itself.
const siteOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
};
type Form = { value: string; source: string; readOn: string };
const ERRORS: Record<string, MessageKey> = {
  percent: 'cdk.f6.err.percent',
  deadline: 'cdk.f6.err.deadline',
  source: 'cdk.f6.err.source',
  read_on: 'cdk.f6.err.read_on',
  future: 'cdk.f6.err.future',
  not_haryana: 'cdk.f6.notHaryana',
  aadhaar: 'cdk.err.aadhaar',
  unchanged: 'cdk.err.unchanged',
};

export function Form6Panel({ initial, canEnter = false, place = 'desk' }: { initial?: Form6Advisory; canEnter?: boolean; place?: 'desk' | 'fees' }) {
  const { t, lang } = useT();
  const [data, setData] = useState<Form6Advisory | null>(initial ?? null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<{ figure: Figure; form: Form } | null>(null);
  const [clearing, setClearing] = useState<Figure | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/compliance/form6').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Form6Advisory | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);
  const date = dayFormat(lang);
  const money = (minor: number | null) => (minor === null ? t('cdk.f6.none') : `₹${minorToRupees(minor)}`);

  if (place === 'fees' && (!data || !data.jurisdictionApplies)) return null;

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const open = (figure: Figure) => {
    setNote(null);
    setClearing(null);
    if (!data) return;
    setEditing(
      figure === 'cpi'
        ? { figure, form: { value: data.cpiPercent === null ? '' : pct(data.cpiPercent), source: data.cpiSource ?? '', readOn: data.cpiReadOn ?? '' } }
        : { figure, form: { value: data.filingDeadline ?? '', source: data.filingDeadlineSource ?? '', readOn: data.filingDeadlineReadOn ?? '' } }
    );
  };
  const save = async (payload: Record<string, unknown>, done: MessageKey) => {
    setBusy(true);
    const reply = await send('/api/app/compliance/form6/figures', 'POST', payload);
    setBusy(false);
    if (!reply.ok) return setNote({ ok: false, text: t(ERRORS[String(reply.body.code ?? '')] ?? refusal(reply)) });
    setEditing(null);
    setClearing(null);
    setNote({ ok: true, text: t(done) });
    await load();
  };
  const submit = () => {
    if (!editing) return;
    const { figure, form } = editing;
    const payload = figure === 'cpi' ? { figure, percent: form.value, source: form.source, readOn: form.readOn } : { figure, deadline: form.value, source: form.source, readOn: form.readOn };
    void save(payload, figure === 'cpi' ? 'cdk.f6.savedCpi' : 'cdk.f6.savedDeadline');
  };

  // Where a figure comes from: its site as a link (or the text kept before the desk could enter it), the day it was
  // read, and who entered it and when.
  const sourceLine = (source: string | null, readOn: string | null, by: string | null, at: string | null, id: Figure) => {
    if (!source) return null;
    const site = siteOf(source);
    return (
      <p data-cdk-f6-source={id} className="break-words text-slate/70">
        {t('cdk.f6.sourceLabel')}{' '}
        {site ? (
          <a href={source} target="_blank" rel="noopener noreferrer" className="text-sapphire underline">
            {site}
          </a>
        ) : (
          source
        )}
        {readOn && <> · {t('cdk.f6.readOn', { date: date(readOn) })}</>}
        {by && at && <> · {t('cdk.f6.enteredBy', { name: by, date: date(at) })}</>}
      </p>
    );
  };

  const entry = (figure: Figure, isSet: boolean) => {
    if (!canEnter) return null;
    if (editing?.figure === figure) {
      const f = editing.form;
      const set = (k: keyof Form, v: string) => setEditing({ figure, form: { ...f, [k]: v } });
      return (
        <div data-cdk-f6-form={figure} className="flex flex-col gap-3 rounded-md bg-off-white p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {figure === 'cpi' ? (
              <Input id="cdk-f6-percent" label={t('cdk.f6.f.percent')} helperText={t('cdk.f6.f.percentHelp')} inputMode="decimal" maxLength={6} value={f.value} onChange={(e) => set('value', e.target.value)} />
            ) : (
              <Input id="cdk-f6-deadline" type="date" label={t('cdk.f6.f.deadline')} value={f.value} onChange={(e) => set('value', e.target.value)} />
            )}
            <Input id={`cdk-f6-${figure}-source`} type="url" inputMode="url" label={t('cdk.f6.f.source')} helperText={t('cdk.f6.f.sourceHelp')} maxLength={500} value={f.source} onChange={(e) => set('source', e.target.value)} />
            <Input id={`cdk-f6-${figure}-read`} type="date" label={t('cdk.f6.f.readOn')} max={today} value={f.readOn} onChange={(e) => set('readOn', e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-cdk-f6-save={figure} disabled={busy} className={PRIMARY} onClick={submit}>{t('cdk.f6.save')}</button>
            <button type="button" className={TAP} onClick={() => setEditing(null)}>{t('cdk.cancel')}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" data-cdk-f6-enter={figure} className={TAP} onClick={() => open(figure)}>
          {t(figure === 'cpi' ? (isSet ? 'cdk.f6.changeCpi' : 'cdk.f6.enterCpi') : isSet ? 'cdk.f6.changeDeadline' : 'cdk.f6.enterDeadline')}
        </button>
        {isSet &&
          (clearing === figure ? (
            <button type="button" data-cdk-f6-clear-yes={figure} disabled={busy} className={TAP} onClick={() => void save({ figure, clear: true }, 'cdk.f6.cleared')}>
              {t(figure === 'cpi' ? 'cdk.f6.clearCpiYes' : 'cdk.f6.clearDeadlineYes')}
            </button>
          ) : (
            <button type="button" data-cdk-f6-clear={figure} className={TAP} onClick={() => setClearing(figure)}>{t('cdk.f6.clear')}</button>
          ))}
      </div>
    );
  };

  return (
    <section data-cdk-form6={place} className={CARD}>
      <div>
        <h2 className="text-base font-bold">{t('cdk.f6.title')}</h2>
        <p className="text-slate/70">{t('cdk.f6.how')}</p>
        {place === 'fees' && <p className="text-slate/70">{t('cdk.f6.feesHow')}</p>}
      </div>
      {note && <p role="status" data-cdk-f6-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}
      {failed && !data ? (
        <p role="alert" className="rounded-md bg-off-white px-3 py-2">{t('cdk.f6.failed')}</p>
      ) : !data ? null : !data.jurisdictionApplies ? (
        <p data-cdk-form6-state="not-haryana" className="rounded-md bg-off-white px-3 py-2">{t('cdk.f6.notHaryana')}</p>
      ) : (
        <div data-cdk-form6-state="haryana" className="flex flex-col gap-3">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md bg-off-white px-3 py-2">
              <dt className="text-slate/70">{t('cdk.f6.thisYear')}</dt>
              <dd data-cdk-f6="this" className="text-base font-bold">{money(data.thisYearTotalMinor)}</dd>
            </div>
            <div className="rounded-md bg-off-white px-3 py-2">
              <dt className="text-slate/70">{t('cdk.f6.lastYear')}</dt>
              <dd data-cdk-f6="last" className="text-base font-bold">{money(data.lastYearTotalMinor)}</dd>
            </div>
            <div className="rounded-md bg-off-white px-3 py-2">
              <dt className="text-slate/70">{t('cdk.f6.increase')}</dt>
              <dd data-cdk-f6="increase" className="text-base font-bold">{data.proposedIncreasePercent === null ? t('cdk.f6.none') : `${data.proposedIncreasePercent.toFixed(1)}%`}</dd>
            </div>
          </dl>
          {canEnter && <p className="text-slate/70">{t('cdk.f6.howEnter')}</p>}
          <div data-cdk-f6-figure="cpi" className="flex flex-col gap-2">
            {data.cpiState === 'unknown' ? (
              <Badge variant="warning" className="self-start">{t('cdk.f6.noCpi')}</Badge>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="break-words">{t('cdk.f6.cpi', { cpi: pct(data.cpiPercent), limit: pct(data.permissibleIncreasePercent) })}</p>
                {sourceLine(data.cpiSource, data.cpiReadOn, data.cpiRecordedBy, data.cpiRecordedAt, 'cpi')}
                {/* A verdict only when there is an increase to judge (review of C227): one year of fees is no comparison. */}
                {data.proposedIncreasePercent !== null && (
                  <Badge variant={data.cpiState === 'above_advisory' ? 'danger' : 'success'} className="self-start">{t(data.cpiState === 'above_advisory' ? 'cdk.f6.above' : 'cdk.f6.within')}</Badge>
                )}
              </div>
            )}
            {entry('cpi', data.cpiPercent !== null)}
          </div>
          <div data-cdk-f6-figure="deadline" className="flex flex-col gap-2">
            {data.deadlineState === 'unknown' || !data.filingDeadline ? (
              <Badge variant="warning" className="self-start">{t('cdk.f6.noDeadline')}</Badge>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="break-words">{t(data.deadlineState === 'past_deadline' ? 'cdk.f6.deadlinePassed' : 'cdk.f6.deadline', { date: date(String(data.filingDeadline)) })}</p>
                {sourceLine(data.filingDeadlineSource, data.filingDeadlineReadOn, data.filingDeadlineRecordedBy, data.filingDeadlineRecordedAt, 'deadline')}
              </div>
            )}
            {entry('deadline', data.filingDeadline !== null)}
          </div>
          <p className="text-slate/70">{t('cdk.f6.advisory')}</p>
        </div>
      )}
    </section>
  );
}
