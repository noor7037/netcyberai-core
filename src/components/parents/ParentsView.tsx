'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';

// Parents (docs/25 slice 7j, C192): find a guardian, then see everything about them on one screen: their children,
// what they have agreed to, their number and its state, and data requests. The office changes consent and the
// language of messages here; a teacher reads, for guardians of their own classes.

type Row = { parent_id: string; name: string; relation: string | null; phone_last4: string; children: { student_id: string; name: string; class_name: string | null }[] };
const PURPOSES = ['core_records', 'operational_communication', 'daily_pulse', 'recognition', 'weekly_brief', 'at_risk'] as const;
type Purpose = (typeof PURPOSES)[number];
type Detail = {
  guardian: { parent_id: string; name: string; relation: string | null; phone: string | null; phone_last4: string; email: string | null; preferred_language: 'en' | 'hi' | null; message_language: 'en' | 'hi' };
  phone: { usable: boolean; stopped: boolean; stopped_at: string | null; last_message: { status: string; at: string } | null; wrote_at: string | null; unread: number };
  children: { student_id: string; name: string; class_name: string | null; verification: string; consent: Record<Purpose, boolean> }[];
  requests: { request_id: string; child: string; type: string; status: string; created_at: string }[] | null;
  mayEdit: boolean;
};
const STATES = ['queued', 'uncertain', 'sent', 'delivered', 'read', 'failed'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';

export function ParentsView() {
  const { t, lang } = useT();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (search: string) => {
    const res = await fetch(`/api/app/guardians?q=${encodeURIComponent(search)}`).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setFailed(!body);
    if (body) setRows(body.guardians);
  }, []);
  useEffect(() => {
    const wait = setTimeout(() => void load(q), q ? 300 : 0);
    return () => clearTimeout(wait);
  }, [load, q]);

  const show = useCallback(async (parentId: string) => {
    const res = await fetch(`/api/app/guardians/${parentId}`).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (body) setOpen(body);
    else setNote({ ok: false, text: t('par.failedOne') });
  }, [t]);

  // A link from a conversation in Communication opens that guardian directly.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('guardian');
    if (id && /^[0-9a-f-]{36}$/i.test(id)) void show(id);
  }, [show]);

  const change = async (url: string, method: 'POST' | 'PATCH', payload: unknown, done: MessageKey) => {
    if (!open) return;
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: explainError(res ? await res.json().catch(() => null) : null, t('par.notSaved'), lang, res?.status) });
    setNote({ ok: true, text: t(done) });
    await show(open.guardian.parent_id);
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('par.failed')}</p>;
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  const g = open?.guardian;

  return (
    <div lang={lang} data-parents className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <section className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <Input id="parents-search" label={t('par.search')} maxLength={80} value={q} onChange={(e) => setQ(e.target.value)} />
        {rows && rows.length === 0 && <p data-parents-empty className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(q ? 'par.noneFound' : 'par.none')}</p>}
        <ul className="flex flex-col gap-2">
          {(rows ?? []).map((r) => (
            <li key={r.parent_id}>
              <button type="button" data-guardian aria-pressed={g?.parent_id === r.parent_id} className={`flex min-h-[44px] w-full flex-col items-start rounded-md border px-3 py-2 text-left text-sm ${g?.parent_id === r.parent_id ? 'border-midnight' : 'border-slate/10'}`} onClick={() => void show(r.parent_id)}>
                <span className="font-bold text-slate">{r.name}</span>
                <span className="text-slate/70">{r.children.length ? r.children.map((c) => (c.class_name ? `${c.name} (${c.class_name})` : c.name)).join(', ') : t('par.noChild')}</span>
              </button>
            </li>
          ))}
        </ul>
        {rows && rows.length === 50 && <p className="text-xs text-slate/70">{t('par.firstFifty')}</p>}
      </section>

      <section data-guardian-open={g ? '' : undefined} className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
        {note && <p role="status" data-parents-note className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}
        {!open || !g ? (
          <p className="rounded-md bg-off-white px-3 py-2">{t('par.choose')}</p>
        ) : (
          <>
            <div>
              <h2 className="text-base font-bold">{g.name}</h2>
              <p className="text-slate/70">{[g.relation, g.phone ?? t('par.numberEnds', { last4: g.phone_last4 }), g.email].filter(Boolean).join(' · ')}</p>
            </div>

            <div data-guardian-phone className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
              <h3 className="font-bold">{t('par.phone.title')}</h3>
              <p className="font-semibold">{t(!open.phone.usable ? 'par.phone.notUsable' : open.phone.stopped ? 'par.phone.stopped' : 'par.phone.ok')}</p>
              {open.phone.last_message && (
                <p className="text-slate/70">{t('par.phone.last', { state: t(`msg.state.${open.phone.last_message.status.startsWith('blocked_') ? 'held' : STATES.includes(open.phone.last_message.status) ? open.phone.last_message.status : 'sent'}` as MessageKey), when: when.format(new Date(open.phone.last_message.at)) })}</p>
              )}
              <p className="text-slate/70">{open.phone.wrote_at ? t('par.phone.wrote', { when: when.format(new Date(open.phone.wrote_at)) }) : t('par.phone.neverWrote')}</p>
              {open.phone.wrote_at && <a className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline" href="/app/communication">{t('par.phone.openThread')}</a>}
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <h3 className="font-bold">{t('par.lang.title')}</h3>
              <p data-guardian-language={g.message_language}>{t(g.message_language === 'hi' ? 'par.lang.goesHi' : 'par.lang.goesEn')}</p>
              {open.mayEdit && (
                <>
                  <label htmlFor="guardian-language" className="font-semibold">{t('par.lang.choose')}</label>
                  <select id="guardian-language" disabled={busy} className="min-h-[44px] rounded-md border border-slate/20 bg-white px-3 sm:max-w-xs" value={g.preferred_language ?? ''} onChange={(e) => void change(`/api/app/guardians/${g.parent_id}`, 'PATCH', { preferred_language: e.target.value }, 'par.lang.saved')}>
                    <option value="">{t('par.lang.school')}</option>
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                  </select>
                  <p className="text-xs text-slate/70">{t('par.lang.hindiHeld')}</p>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="font-bold">{t('par.children.title')}</h3>
              {open.children.length === 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('par.noChild')}</p>}
              {open.children.map((c) => (
                <div key={c.student_id} data-guardian-child className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                  <p>
                    <a className="inline-flex min-h-[44px] items-center font-bold text-sapphire underline" href={`/app/students/${c.student_id}`}>{c.name}</a>
                    {c.class_name ? ` · ${c.class_name}` : ''}
                  </p>
                  {c.verification !== 'active' && <p className="font-semibold">{t('par.notVerified')}</p>}
                  <ul className="flex flex-col gap-2">
                    {PURPOSES.map((p) => (
                      <li key={p} data-consent={p} data-granted={c.consent[p] ? 'yes' : 'no'} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant={c.consent[p] ? 'success' : 'neutral'}>{t(c.consent[p] ? 'par.consent.yes' : 'par.consent.no')}</Badge>
                          {t(`par.purpose.${p}` as MessageKey)}
                        </span>
                        {open.mayEdit && (c.consent[p] || c.verification === 'active') && (
                          <button type="button" data-consent-change disabled={busy} className={TAP} onClick={() => void change(`/api/app/students/${c.student_id}/consent`, 'POST', { purpose: p, granted: !c.consent[p], parentId: g.parent_id }, 'par.consent.saved')}>
                            {t(c.consent[p] ? 'par.consent.withdraw' : 'par.consent.grant')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-slate/70">{t('par.consent.how')}</p>
            </div>

            {open.requests && (
              <div data-guardian-requests className="flex flex-col gap-2">
                <h3 className="font-bold">{t('par.requests.title')}</h3>
                {open.requests.length === 0 ? (
                  <p className="rounded-md bg-off-white px-3 py-2">{t('par.requests.none')}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {open.requests.map((r) => (
                      <li key={r.request_id}>{t('par.requests.row', { type: t(`par.requests.type.${r.type}` as MessageKey), child: r.child, status: t(`par.requests.status.${r.status}` as MessageKey), when: when.format(new Date(r.created_at)) })}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
