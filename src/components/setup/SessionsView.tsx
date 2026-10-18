'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Skeleton } from '@/components/app-ui/States';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';
import { MAX_SESSION_LABEL, type SessionRow } from '@/lib/setup/session-input';

// Setup -> Academic sessions (docs/28 slice 10g, C244), for the principal and the school admin: the school's years,
// which one is current, adding a session and making one current. Making one current first says what follows the
// current session (the six places that read it), then does it in one step; the session itself is never deleted.
// Every change is audited with ids only. The words are in the message files.

const CARD = 'flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm md:p-5';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const TAP = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const FOLLOWS: MessageKey[] = [
  'setup.sessions.follows.classes',
  'setup.sessions.follows.exams',
  'setup.sessions.follows.fees',
  'setup.sessions.follows.gap',
  'setup.sessions.follows.certificates',
  'setup.sessions.follows.leave',
];
const REFUSED: Record<string, MessageKey> = {
  session_label: 'setup.sessions.refused.session_label',
  session_dates: 'setup.sessions.refused.session_dates',
  session_order: 'setup.sessions.refused.session_order',
  session_exists: 'setup.sessions.refused.session_exists',
  session_not_found: 'setup.sessions.refused.session_not_found',
};
const EMPTY = { label: '', startDate: '', endDate: '' };

export function SessionsView() {
  const { t, lang } = useT();
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/setup/sessions', { cache: 'no-store' }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { sessions?: SessionRow[] } | null) : null;
    if (body?.sessions) {
      setSessions(body.sessions);
      setFailed(false);
    } else setFailed(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const day = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

  // Sends one change; says why it was refused in the person's language.
  async function send(url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      const own = answer?.code ? REFUSED[answer.code] : undefined;
      setProblem(own ? t(own) : explainError(answer, t('setup.sessions.failed'), lang, res?.status));
    } else setProblem(null);
    return Boolean(res?.ok);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await send('/api/app/setup/sessions', form)) {
      setForm(EMPTY);
      toast.show(t('setup.sessions.added'), 'success');
      await load();
    }
  }

  async function makeCurrent(s: SessionRow) {
    if (await send(`/api/app/setup/sessions/${s.sessionId}/current`)) {
      setAsking(null);
      toast.show(t('setup.sessions.madeCurrent', { label: s.label }), 'success');
    }
    await load();
  }

  if (failed && !sessions)
    return (
      <p role="alert" data-sessions="failed" className={`${CARD} text-sm text-slate`}>
        {t('setup.sessions.failed.load')}
      </p>
    );
  if (!sessions) return <Skeleton lines={4} className={CARD} />;

  return (
    <div lang={lang} data-sessions className="flex flex-col gap-4">
      <section aria-labelledby="sessions-list" className={CARD}>
        <h2 id="sessions-list" className="text-base font-bold text-slate">
          {t('setup.sessions.list')}
        </h2>
        {sessions.length === 0 ? (
          <p data-sessions-none className="text-sm text-slate/70">
            {t('setup.sessions.none')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate/10">
            {sessions.map((s) => (
              <li key={s.sessionId} data-session={s.sessionId} data-session-current={s.isCurrent ? 'yes' : 'no'} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-slate">{s.label}</p>
                    <p className="text-sm text-slate/70">{t('setup.sessions.dates', { from: day(s.startDate), to: day(s.endDate) })}</p>
                  </div>
                  {s.isCurrent ? (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald/10 px-3 py-1 text-sm font-semibold text-slate">{t('setup.sessions.current')}</span>
                  ) : (
                    <button type="button" data-session-make-current disabled={busy} aria-label={t('setup.sessions.makeLabel', { label: s.label })} className={TAP} onClick={() => setAsking(asking === s.sessionId ? null : s.sessionId)}>
                      {t('setup.sessions.makeCurrent')}
                    </button>
                  )}
                </div>
                {asking === s.sessionId && !s.isCurrent && (
                  <div role="group" aria-labelledby={`confirm-${s.sessionId}`} data-session-confirm className="flex flex-col gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-slate">
                    <p id={`confirm-${s.sessionId}`} className="text-base font-bold">
                      {t('setup.sessions.confirm.title', { label: s.label })}
                    </p>
                    <p>{t('setup.sessions.confirm.intro')}</p>
                    <ul className="flex list-disc flex-col gap-1 pl-5">
                      {FOLLOWS.map((k) => (
                        <li key={k}>{t(k)}</li>
                      ))}
                    </ul>
                    <p>{t('setup.sessions.confirm.keeps')}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" data-session-confirm-yes disabled={busy} className={PRIMARY} onClick={() => void makeCurrent(s)}>
                        {t('setup.sessions.confirm.yes')}
                      </button>
                      <button type="button" disabled={busy} className={TAP} onClick={() => setAsking(null)}>
                        {t('setup.sessions.confirm.no')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sessions-add" className={CARD}>
        <h2 id="sessions-add" className="text-base font-bold text-slate">
          {t('setup.sessions.add')}
        </h2>
        <form data-session-form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-start">
          <Input id="session-label" label={t('setup.sessions.label')} maxLength={MAX_SESSION_LABEL} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Input id="session-start" type="date" label={t('setup.sessions.start')} required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Input id="session-end" type="date" label={t('setup.sessions.end')} required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <button type="submit" data-session-save disabled={busy || !form.label.trim() || !form.startDate || !form.endDate} className={`${PRIMARY} sm:mt-0`}>
            {t('setup.sessions.save')}
          </button>
        </form>
        {problem && (
          <p role="alert" data-session-problem className="rounded-md bg-off-white px-3 py-2 text-sm text-red-800">
            {problem}
          </p>
        )}
      </section>
    </div>
  );
}
