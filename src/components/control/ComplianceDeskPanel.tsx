'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Textarea } from '@/components/ui/Textarea';
import type { MessageKey } from '@/lib/i18n';

// Control → Compliance (W21-M6): the data-request desk across schools, the consent ledger's counts and the
// retention jobs' last runs. Ids, types, states, counts and times only. "Mark done" closes an access or correction
// request with a note; a deletion request closes only through its authorised erasure in the school app.

type Req = { requestId: string; schoolId: string; schoolName: string; type: string; status: string; createdAt: string; daysOpen: number; authorized: boolean; closable: boolean };
type Consent = { purpose: string; granted: number; withdrawn: number };
type Run = { type: string; lastSucceededAt: string | null; lastStatus: string | null; lastRunAt: string | null; dead: number };
type Desk = { requests: Req[]; consent: Consent[]; retention: Run[] };
const TAP = 'inline-flex min-h-[44px] items-center rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function ComplianceDeskPanel() {
  const { t, lang, has } = useWords();
  const [desk, setDesk] = useState<Desk | null>(null);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState<Req | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/compliance').catch(() => null);
    const out = res?.ok ? ((await res.json().catch(() => null)) as Desk | null) : null;
    setDesk(out);
    setFailed(!out);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const word = (prefix: string, v: string) => {
    const k = `${prefix}${v}`;
    return has(k) ? t(k as MessageKey) : v;
  };
  const markDone = async () => {
    if (!closing) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/control/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'done', requestId: closing.requestId, note }) }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(false);
    if (!res?.ok) return setError(out?.code === 'note_required' ? t('control.m6.cmp.noteNeeded') : t('control.m6.notSaved'));
    setClosing(null);
    setDone(true);
    void load();
  };

  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const at = (v: string | null) => (v ? <time dateTime={v}>{when.format(new Date(v))}</time> : t('control.m6.never'));
  const state = desk === null && !failed ? 'loading' : failed ? 'error' : 'ready';
  const reqCols: TableColumn<Req>[] = [
    { key: 'school', header: t('control.m6.col.school'), render: (r) => r.schoolName },
    { key: 'type', header: t('control.m6.cmp.col.type'), render: (r) => word('control.m6.cmp.type.', r.type) },
    { key: 'status', header: t('control.m6.cmp.col.status'), render: (r) => word('control.m6.cmp.status.', r.status) },
    { key: 'made', header: t('control.m6.cmp.col.logged'), render: (r) => at(r.createdAt) },
    { key: 'days', header: t('control.m6.cmp.col.days'), render: (r) => t('control.m6.cmp.days', { n: r.daysOpen }) },
    {
      key: 'act',
      header: t('control.m6.cmp.col.action'),
      render: (r) =>
        r.closable ? (
          <button type="button" className={TAP} onClick={() => { setClosing(r); setNote(''); setError(null); }} aria-label={t('control.m6.cmp.doneFor', { school: r.schoolName })}>
            {t('control.m6.cmp.done')}
          </button>
        ) : r.type === 'deletion' && (r.status === 'logged' || r.status === 'in_progress') ? (
          <span className="text-sm text-slate">{t('control.m6.cmp.deletionInSchool')}</span>
        ) : null,
    },
  ];
  const consentCols: TableColumn<Consent>[] = [
    { key: 'purpose', header: t('control.m6.cmp.col.purpose'), render: (r) => <span className="font-mono text-xs">{r.purpose}</span> },
    { key: 'granted', header: t('control.m6.cmp.col.granted'), render: (r) => r.granted },
    { key: 'withdrawn', header: t('control.m6.cmp.col.withdrawn'), render: (r) => r.withdrawn },
  ];
  const runCols: TableColumn<Run>[] = [
    { key: 'type', header: t('control.m6.cmp.col.job'), render: (r) => word('control.m6.cmp.job.', r.type.replace('.', '_')) },
    { key: 'ok', header: t('control.m6.cmp.col.lastOk'), render: (r) => at(r.lastSucceededAt) },
    { key: 'last', header: t('control.m6.cmp.col.lastRun'), render: (r) => (r.lastStatus ? <span>{word('control.m6.cmp.run.', r.lastStatus)} · {at(r.lastRunAt)}</span> : t('control.m6.never')) },
    { key: 'dead', header: t('control.m6.cmp.col.dead'), render: (r) => r.dead },
  ];

  return (
    <section lang={lang} data-compliance-desk className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-midnight">{t('control.m6.cmp.requests')}</h2>
      <p className="text-sm text-slate">{t('control.m6.cmp.requestsAbout')}</p>
      {done && (
        <p role="status" className="rounded-md border-2 border-emerald-text bg-white px-4 py-3 text-sm font-bold text-emerald-text">
          {t('control.m6.cmp.closed')}
        </p>
      )}
      <Table
        columns={reqCols}
        rows={desk?.requests ?? []}
        getRowId={(r) => r.requestId}
        state={state}
        errorMessage={t('control.m6.loadError')}
        retryAction={
          <button type="button" className={TAP} onClick={() => void load()}>
            {t('control.m6.retry')}
          </button>
        }
        emptyTitle={t('control.m6.cmp.noRequests')}
      />
      <h2 className="text-xl font-bold text-midnight">{t('control.m6.cmp.consent')}</h2>
      <p className="text-sm text-slate">{t('control.m6.cmp.consentAbout')}</p>
      <Table columns={consentCols} rows={desk?.consent ?? []} getRowId={(r) => r.purpose} state={state} errorMessage={t('control.m6.loadError')} emptyTitle={t('control.m6.cmp.noConsent')} />
      <h2 className="text-xl font-bold text-midnight">{t('control.m6.cmp.retention')}</h2>
      <p className="text-sm text-slate">{t('control.m6.cmp.retentionAbout')}</p>
      <Table columns={runCols} rows={desk?.retention ?? []} getRowId={(r) => r.type} state={state} errorMessage={t('control.m6.loadError')} emptyTitle={t('control.m6.never')} />
      <Modal open={closing !== null} onClose={() => setClosing(null)} title={closing ? t('control.m6.cmp.doneFor', { school: closing.schoolName }) : ''}>
        {closing && (
          <form
            data-dsr-done-form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void markDone();
            }}
          >
            <p className="text-sm text-slate">{t('control.m6.cmp.doneHelp')}</p>
            <Textarea id="dsr-note" data-autofocus label={t('control.m6.cmp.note')} helperText={t('control.m6.cmp.noteHelp')} rows={4} minLength={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            {error && (
              <p role="alert" className="text-sm font-semibold text-red-800">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={PRIMARY} disabled={busy}>
                {t('control.m6.cmp.done')}
              </button>
              <button type="button" className={TAP} onClick={() => setClosing(null)}>
                {t('control.m6.cancel')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
