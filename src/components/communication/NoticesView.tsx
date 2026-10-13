'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// Notices to parents (docs/25 slice 7i, C191). Staff write one for a class (the office, for every class too); it
// waits for the principal; approving it is what sends it. Who received and read it is counted from the message log.

type Notice = { notice_id: string; class_id: string | null; class_name: string | null; body: string; status: 'waiting' | 'sent' | 'rejected'; written_by_name: string | null; written_at: string; decided_by_name: string | null; reject_reason: string | null; on_its_way: number; delivered: number; read: number; held: number };
type Data = { notices: Notice[]; classes: { class_id: string; name: string }[]; mayDecide: boolean; mayWriteToAll: boolean };
const MAX = 600;
const ERRORS = ['words', 'class', 'whole_school', 'already_decided', 'reason', 'nobody'];
const VARIANT = { waiting: 'warning', sent: 'success', rejected: 'neutral' } as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-50';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function NoticesView() {
  const { t, lang } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [classId, setClassId] = useState('');
  const [body, setBody] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/communication/notices').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (url: string, payload: unknown, done: (r: Record<string, number>) => string) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: ERRORS.includes(got?.code) ? t(`ntc.err.${got.code}` as MessageKey) : t('ntc.err.other') });
    setNote({ ok: true, text: done(got ?? {}) });
    setBody('');
    setRejecting(null);
    setReason('');
    await load();
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ntc.failed')}</p>;
  if (!data) return null;
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const target = classId || (data.mayWriteToAll ? 'all' : (data.classes[0]?.class_id ?? ''));

  return (
    <section lang={lang} data-notices className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
      <div>
        <h2 className="text-base font-bold text-slate">{t('ntc.title')}</h2>
        <p className="text-sm text-slate/70">{t(data.mayDecide ? 'ntc.how.principal' : 'ntc.how')}</p>
      </div>
      {data.classes.length === 0 && !data.mayWriteToAll ? (
        <p data-notices-no-class className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ntc.noClass')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor="notice-class" className="text-sm font-semibold text-slate">{t('ntc.for')}</label>
          <select id="notice-class" className="min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate sm:max-w-xs" value={target} onChange={(e) => setClassId(e.target.value)}>
            {data.mayWriteToAll && <option value="all">{t('ntc.allClasses')}</option>}
            {data.classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>{c.name}</option>
            ))}
          </select>
          <label htmlFor="notice-body" className="text-sm font-semibold text-slate">{t('ntc.words')}</label>
          <textarea id="notice-body" rows={3} maxLength={MAX} className="rounded-md border border-slate/20 px-3 py-2 text-sm text-slate" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" data-notice-write disabled={busy || !body.trim() || !target} className={PRIMARY} onClick={() => void send('/api/app/communication/notices', { classId: target === 'all' ? null : target, body }, () => t('ntc.written'))}>
              {t('ntc.write')}
            </button>
            <span className="text-xs text-slate/70">{t('ntc.left', { count: MAX - body.length })}</span>
          </div>
        </div>
      )}
      {note && <p role="status" data-notices-note className={`rounded-md px-3 py-2 text-sm font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}
      {data.notices.length === 0 ? (
        <p data-notices-empty className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ntc.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.notices.map((n) => (
            <li key={n.notice_id} data-notice={n.status} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3 text-sm text-slate">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={VARIANT[n.status]}>{t(`ntc.status.${n.status}` as MessageKey)}</Badge>
                <span className="font-bold">{n.class_name ?? t('ntc.allClasses')}</span>
                <span className="text-slate/70">{t('ntc.by', { name: n.written_by_name ?? '', when: when.format(new Date(n.written_at)) })}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{n.body}</p>
              {n.status === 'sent' && <p data-notice-counts className="font-semibold">{t('ntc.counts', { onItsWay: n.on_its_way, delivered: n.delivered, read: n.read, held: n.held })}</p>}
              {n.status === 'rejected' && <p className="font-semibold">{t('ntc.rejectedWhy', { name: n.decided_by_name ?? '', reason: n.reject_reason ?? '' })}</p>}
              {n.status === 'waiting' && !data.mayDecide && <p className="text-slate/70">{t('ntc.waitingWhy')}</p>}
              {n.status === 'waiting' && data.mayDecide && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-notice-approve disabled={busy} className={PRIMARY} onClick={() => void send(`/api/app/communication/notices/${n.notice_id}`, { action: 'approve' }, (r) => t('ntc.approved', { queued: r.queued ?? 0, held: r.held ?? 0, withoutNumber: r.withoutNumber ?? 0 }))}>
                      {t('ntc.approve')}
                    </button>
                    <button type="button" data-notice-reject disabled={busy} className={TAP} onClick={() => setRejecting(rejecting === n.notice_id ? null : n.notice_id)}>
                      {t('ntc.reject')}
                    </button>
                  </div>
                  {rejecting === n.notice_id && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <Input id="notice-reject-reason" label={t('ntc.reject.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                      <button type="button" data-notice-reject-save disabled={busy || !reason.trim()} className={TAP} onClick={() => void send(`/api/app/communication/notices/${n.notice_id}`, { action: 'reject', reason }, () => t('ntc.rejected'))}>
                        {t('ntc.reject.save')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
