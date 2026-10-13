'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import type { MessageKey } from '@/lib/i18n';

// The school's WhatsApp messages and where each got to (docs/25 slice 7b, C183): sent, delivered, read, failed,
// or held back with the reason. Counted from the log; nothing here is estimated.

type Row = { log_id: string; created_at: string; not_before?: string | null; child: string | null; guardian: string | null; phone_last4: string | null; template_name: string | null; status: string; reason: string | null; provider: string | null; delivered_at: string | null; read_at: string | null; failed_at: string | null };
const STATES = ['queued', 'uncertain', 'sent', 'delivered', 'read', 'failed', 'held'] as const;
type State = (typeof STATES)[number];
const stateOf = (status: string): State => (status.startsWith('blocked_') ? 'held' : (STATES as readonly string[]).includes(status) ? (status as State) : 'sent');
const VARIANT = { queued: 'neutral', uncertain: 'warning', sent: 'neutral', delivered: 'success', read: 'success', failed: 'danger', held: 'warning' } as const;
const TEMPLATES = ['attendance_absence_notification', 'daily_pulse', 'class_notice', 'ptm_invitation', 'ptm_booked', 'ptm_time_not_free', 'ptm_reminder', 'ptm_cancelled', 'event_invitation', 'event_reminder', 'event_cancelled', 'complaint_received', 'complaint_escalated', 'complaint_escalated_office', 'complaint_closed', 'home_help'];
const HELD_REASONS = ['blocked_pilot', 'blocked_consent', 'blocked_budget', 'blocked_quiet_hours', 'blocked_no_template'];

export function MessagesView({ mayRead }: { mayRead: boolean }) {
  const { t, lang } = useT();
  const [state, setState] = useState<State | ''>('');
  const [data, setData] = useState<{ messages: Row[]; counts: Record<string, number>; days: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/app/communication/messages${state ? `?state=${state}` : ''}`).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setFailed(!body);
    if (body) setData(body);
  }, [state]);
  useEffect(() => {
    if (mayRead) void load();
  }, [load, mayRead]);

  if (!mayRead) return <p data-messages-office-only className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('msg.officeOnly')}</p>;
  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('msg.failed')}</p>;
  if (!data) return null;
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const total = STATES.reduce((n, s) => n + (data.counts[s] ?? 0), 0);
  const usesStandIn = data.messages.some((m) => m.provider === 'stand-in');

  return (
    <section lang={lang} data-messages className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
      <div>
        <h2 className="text-base font-bold text-slate">{t('msg.title')}</h2>
        <p className="text-sm text-slate/70">{t('msg.how', { days: data.days })}</p>
      </div>
      {usesStandIn && <p data-messages-standin className="rounded-md border border-tangerine/40 bg-off-white px-3 py-2 text-sm font-semibold text-slate">{t('msg.standIn')}</p>}
      <div role="group" aria-label={t('msg.filter')} className="flex flex-wrap gap-2">
        <button type="button" data-state-all aria-pressed={state === ''} className={`min-h-[44px] rounded-md border px-4 text-sm font-semibold ${state === '' ? 'border-midnight bg-midnight text-white' : 'border-slate/20 text-slate'}`} onClick={() => setState('')}>
          {t('msg.state.all', { count: total })}
        </button>
        {STATES.map((s) => (
          <button key={s} type="button" data-state={s} aria-pressed={state === s} className={`min-h-[44px] rounded-md border px-4 text-sm font-semibold ${state === s ? 'border-midnight bg-midnight text-white' : 'border-slate/20 text-slate'}`} onClick={() => setState(s)}>
            {t(`msg.state.${s}` as MessageKey)} · {data.counts[s] ?? 0}
          </button>
        ))}
      </div>
      {data.messages.length === 0 ? (
        <p data-messages-empty className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(total === 0 ? 'msg.none' : 'msg.noneInState')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.messages.map((m) => {
            const s = stateOf(m.status);
            const at = s === 'read' ? m.read_at : s === 'delivered' ? m.delivered_at : s === 'failed' ? m.failed_at : null;
            return (
              <li key={m.log_id} data-message={s} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3 text-sm text-slate">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={VARIANT[s]}>{t(`msg.state.${s}` as MessageKey)}</Badge>
                  <span className="font-bold">{m.template_name && TEMPLATES.includes(m.template_name) ? t(`msg.template.${m.template_name}` as MessageKey) : (m.template_name ?? '')}</span>
                  <span className="text-slate/70">{when.format(new Date(m.created_at))}</span>
                </div>
                <p>
                  {m.child ? t('msg.about', { child: m.child }) : ''} {m.guardian ? t('msg.to', { guardian: m.guardian, last4: m.phone_last4 ?? '' }) : m.phone_last4 ? t('msg.toNumber', { last4: m.phone_last4 }) : ''}
                </p>
                {s === 'uncertain' && <p className="font-semibold">{t('msg.uncertainWhy')}</p>}
                {s === 'queued' && <p className="text-slate/70">{t('msg.queuedWhy')}</p>}
                {at && <p className="text-slate/70">{t(`msg.at.${s}` as MessageKey, { when: when.format(new Date(at)) })}</p>}
                {s === 'held' && <p className="font-semibold">{HELD_REASONS.includes(m.status) ? t(`msg.held.${m.status}` as MessageKey) : (m.reason ?? '')}</p>}
                {s === 'failed' && <p className="font-semibold text-red-800">{t('msg.failedWhy')}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
