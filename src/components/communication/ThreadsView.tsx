'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';

// What parents have written back (docs/25 slice 7f, C187). One conversation per guardian's number. Staff answer
// in their own words only inside the 24 hours the parent's own message opened; after that the box is closed and
// says why. A parent who wrote STOP gets nothing more on WhatsApp until the office lifts it at their asking.

type Thread = { thread_id: string; parent_id: string; guardian: string; children: string | null; phone_last4: string; last_inbound_at: string; unread: number; last_text: string | null; window_open: boolean; stopped: boolean };
type Message = { id: string; direction: 'in' | 'out'; at: string; text: string | null; template_name: string | null; status: string | null; by: string | null };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const REFUSALS = ['window_closed', 'stopped', 'pilot', 'text'];

export function ThreadsView() {
  const { t, lang } = useT();
  const toast = useToast();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [mayLift, setMayLift] = useState(false);
  const [open, setOpen] = useState<{ thread: Thread; messages: Message[] } | null>(null);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/communication/threads').catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setThreads(body?.threads ?? []);
    setMayLift(body?.mayLift === true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const show = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/app/communication/threads/${threadId}`).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setOpen(body);
    setText('');
    setReason('');
  }, []);

  async function post(body: Record<string, unknown>, done: MessageKey) {
    if (!open) return;
    setBusy(true);
    const res = await fetch(`/api/app/communication/threads/${open.thread.thread_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) return toast.show(t(REFUSALS.includes(answer.code) ? (`thr.refused.${answer.code}` as MessageKey) : 'msg.failed'), 'danger');
    toast.show(t(done), 'success');
    await show(open.thread.thread_id);
    void load();
  }

  if (threads === null) return null;
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <section lang={lang} data-threads className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
      <div>
        <h2 className="text-base font-bold text-slate">{t('thr.title')}</h2>
        <p className="text-sm text-slate/70">{t('thr.how')}</p>
      </div>
      {threads.length === 0 && <p data-threads-empty className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('thr.none')}</p>}
      <ul className="flex flex-col gap-2">
        {threads.map((th) => (
          <li key={th.thread_id}>
            <button type="button" data-thread={th.thread_id} aria-expanded={open?.thread.thread_id === th.thread_id} className="flex min-h-[44px] w-full flex-col gap-1 rounded-md border border-slate/10 p-3 text-left text-sm text-slate" onClick={() => void show(th.thread_id)}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{th.guardian}</span>
                {th.children && <span className="text-slate/70">{t('thr.parentOf', { children: th.children })}</span>}
                {th.unread > 0 && <Badge variant="warning">{t('thr.unread', { count: th.unread })}</Badge>}
                {th.stopped && <Badge variant="danger">{t('thr.stopped')}</Badge>}
              </span>
              <span className="text-slate/80">{th.last_text ?? ''}</span>
              <span className="text-xs text-slate/70">{when.format(new Date(th.last_inbound_at))}</span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div data-thread-open className="flex flex-col gap-3 border-t border-slate/10 pt-3 text-sm text-slate">
          <h3 className="text-base font-bold">{t('thr.with', { guardian: open.thread.guardian, last4: open.thread.phone_last4 })}</h3>
          <a data-thread-guardian className="inline-flex min-h-[44px] items-center self-start font-semibold text-sapphire underline" href={`/app/parents?guardian=${open.thread.parent_id}`}>{t('thr.seeGuardian')}</a>
          <ul className="flex flex-col gap-2">
            {open.messages.map((m) => (
              <li key={m.id} data-thread-message={m.direction} className={`max-w-prose rounded-md px-3 py-2 ${m.direction === 'in' ? 'self-start bg-off-white' : 'self-end border border-slate/10'}`}>
                <p className="whitespace-pre-wrap break-words">{m.text ?? (m.template_name ? t('thr.template', { name: m.template_name }) : '')}</p>
                <p className="text-xs text-slate/70">
                  {when.format(new Date(m.at))}
                  {m.direction === 'out' && m.status ? ` · ${t(`msg.state.${m.status.startsWith('blocked_') ? 'held' : m.status}` as MessageKey)}` : ''}
                  {m.by ? ` · ${m.by}` : ''}
                </p>
              </li>
            ))}
          </ul>
          {open.thread.stopped ? (
            <div data-thread-stopped className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <p className="font-semibold">{t('thr.stopped.how')}</p>
              {mayLift && (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Input id="thread-lift-reason" label={t('thr.lift.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button type="button" data-thread-lift disabled={busy || !reason.trim()} className={TAP} onClick={() => void post({ action: 'lift', reason }, 'thr.lifted')}>
                    {t('thr.lift')}
                  </button>
                </div>
              )}
            </div>
          ) : open.thread.window_open ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Input id="thread-reply" label={t('thr.reply.label')} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
              <button type="button" data-thread-send disabled={busy || !text.trim()} className={PRIMARY} onClick={() => void post({ action: 'reply', text }, 'thr.reply.sent')}>
                {t('thr.reply.send')}
              </button>
            </div>
          ) : (
            <p data-thread-closed className="rounded-md bg-off-white px-3 py-2 font-semibold">{t('thr.closed')}</p>
          )}
        </div>
      )}
    </section>
  );
}
