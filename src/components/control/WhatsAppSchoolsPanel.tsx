'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { MessageKey } from '@/lib/i18n';

// Control → WhatsApp, per school (W21-M6): each school's number and status, today's sends and failures from the
// delivery log, and the held queue with "Release" where the gate allows. No parent's number, name or words.

type School = { schoolId: string; schoolName: string; isFixture: boolean; pilotNoOutbound: boolean; number: string | null; status: string; sentToday: number; failedToday: number; stoppedToday: number; queued: number };
type Held = { logId: string; schoolId: string; schoolName: string; template: string; purpose: string | null; createdAt: string; notBefore: string | null; attempts: number; releasable: boolean; heldBy: 'quiet_hours' | 'pilot' | 'sending' | null };
const TAP = 'inline-flex min-h-[44px] items-center rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function WhatsAppSchoolsPanel() {
  const { t, lang, has } = useWords();
  const [data, setData] = useState<{ schools: School[]; held: Held[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [releasing, setReleasing] = useState<Held | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/whatsapp/schools').catch(() => null);
    const out = res?.ok ? ((await res.json().catch(() => null)) as { schools: School[]; held: Held[] } | null) : null;
    setData(out);
    setFailed(!out);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const release = async () => {
    if (!releasing) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/control/whatsapp/schools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'release', logId: releasing.logId, reason }) }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      const k = `control.m6.wa.refused.${out?.code ?? ''}`;
      return setError(out?.code === 'reason_required' ? t('control.m6.reasonNeeded') : has(k) ? t(k as MessageKey) : t('control.m6.notSaved'));
    }
    setReleasing(null);
    setDone(true);
    void load();
  };

  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const statusWord = (s: string) => {
    const k = `control.m6.wa.status.${s}`;
    return has(k) ? t(k as MessageKey) : s;
  };
  const schoolCols: TableColumn<School>[] = [
    { key: 'school', header: t('control.m6.col.school'), render: (r) => <span>{r.schoolName}{r.isFixture ? ` · ${t('control.m6.testSchool')}` : ''}</span> },
    { key: 'number', header: t('control.m6.wa.col.number'), render: (r) => r.number ?? t('control.m6.wa.platformNumber') },
    { key: 'status', header: t('control.m6.wa.col.status'), render: (r) => `${statusWord(r.status)}${r.pilotNoOutbound ? ` · ${t('control.m6.wa.pilot')}` : ''}` },
    { key: 'sent', header: t('control.m6.wa.col.sent'), render: (r) => r.sentToday },
    { key: 'failed', header: t('control.m6.wa.col.failed'), render: (r) => r.failedToday },
    { key: 'stopped', header: t('control.m6.wa.col.stopped'), render: (r) => r.stoppedToday },
    { key: 'queued', header: t('control.m6.wa.col.queued'), render: (r) => r.queued },
  ];
  const heldCols: TableColumn<Held>[] = [
    { key: 'school', header: t('control.m6.col.school'), render: (r) => r.schoolName },
    { key: 'template', header: t('control.m6.wa.col.template'), render: (r) => <span className="break-all font-mono text-xs">{r.template}</span> },
    { key: 'made', header: t('control.m6.wa.col.made'), render: (r) => <time dateTime={r.createdAt}>{when.format(new Date(r.createdAt))}</time> },
    { key: 'goes', header: t('control.m6.wa.col.goes'), render: (r) => (r.notBefore ? <time dateTime={r.notBefore}>{when.format(new Date(r.notBefore))}</time> : '') },
    {
      key: 'act',
      header: t('control.m6.wa.col.action'),
      render: (r) =>
        r.releasable ? (
          <button type="button" className={TAP} onClick={() => { setReleasing(r); setReason(''); setError(null); }} aria-label={t('control.m6.wa.releaseFor', { school: r.schoolName })}>
            {t('control.m6.wa.release')}
          </button>
        ) : (
          <span className="text-sm text-slate">{t(`control.m6.wa.heldBy.${r.heldBy ?? 'sending'}` as MessageKey)}</span>
        ),
    },
  ];

  const tableState = data === null && !failed ? 'loading' : failed ? 'error' : 'ready';
  return (
    <section lang={lang} data-wa-schools className="mt-8 flex flex-col gap-4">
      <h2 className="text-xl font-bold text-midnight">{t('control.m6.wa.title')}</h2>
      <p className="text-sm text-slate">{t('control.m6.wa.about')}</p>
      <Table
        columns={schoolCols}
        rows={data?.schools ?? []}
        getRowId={(r) => r.schoolId}
        state={tableState}
        errorMessage={t('control.m6.loadError')}
        retryAction={
          <button type="button" className={TAP} onClick={() => void load()}>
            {t('control.m6.retry')}
          </button>
        }
        emptyTitle={t('control.m6.noSchools')}
      />
      <h3 className="text-lg font-bold text-midnight">{t('control.m6.wa.heldTitle')}</h3>
      <p className="text-sm text-slate">{t('control.m6.wa.heldAbout')}</p>
      {done && (
        <p role="status" className="rounded-md border-2 border-emerald-text bg-white px-4 py-3 text-sm font-bold text-emerald-text">
          {t('control.m6.wa.released')}
        </p>
      )}
      <Table columns={heldCols} rows={data?.held ?? []} getRowId={(r) => r.logId} state={tableState} errorMessage={t('control.m6.loadError')} emptyTitle={t('control.m6.wa.heldEmpty')} />
      <Modal open={releasing !== null} onClose={() => setReleasing(null)} title={releasing ? t('control.m6.wa.releaseFor', { school: releasing.schoolName }) : ''}>
        {releasing && (
          <form
            data-wa-release-form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void release();
            }}
          >
            <p className="text-sm text-slate">{t('control.m6.wa.releaseHelp')}</p>
            <Input id="release-reason" data-autofocus label={t('control.m6.reason')} helperText={t('control.m6.reasonHelp')} minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
            {error && (
              <p role="alert" className="text-sm font-semibold text-red-800">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={PRIMARY} disabled={busy}>
                {t('control.m6.wa.release')}
              </button>
              <button type="button" className={TAP} onClick={() => setReleasing(null)}>
                {t('control.m6.cancel')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
