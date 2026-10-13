'use client';

import { useCallback, useEffect, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';

// Today's Pulse messages (docs/20 5f, C151). Each is prepared by one tap
// "taught today" and holds the lesson and the day's homework, in English,
// Hindi and Hinglish. The teacher may change the words and mark it ready.
// Nothing is sent from here: sending starts with WhatsApp, and the screen
// says so.

const LANGS = ['en', 'hi', 'hinglish'] as const;
type BodyLang = (typeof LANGS)[number];
type Draft = { pulse_id: string; class_name: string; subject_name: string | null; status: 'draft' | 'ready' | 'sent'; edited: boolean; body_en: string; body_hi: string; body_hinglish: string; queued?: number; held?: number; understood?: number; needs_help?: number };
const TAP = 'min-h-[48px] rounded-md border px-4 text-sm font-semibold';
const bodyOf = (d: Draft, l: BodyLang) => (l === 'en' ? d.body_en : l === 'hi' ? d.body_hi : d.body_hinglish);

export function PulseDraftsView() {
  const { t, tCount, lang } = useT();
  const toast = useToast();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [shown, setShown] = useState<Record<string, BodyLang>>({});
  const [words, setWords] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/app/pulse-drafts');
      const body = await res.json();
      if (!res.ok) throw new Error('not loaded');
      setDrafts(body.drafts);
      setWords({});
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function change(d: Draft, status?: 'ready' | 'draft') {
    const bodies: Partial<Record<BodyLang, string>> = {};
    for (const l of LANGS) {
      const typed = words[`${d.pulse_id}:${l}`];
      if (typed !== undefined && typed !== bodyOf(d, l)) bodies[l] = typed;
    }
    setBusy(d.pulse_id);
    const res = await fetch(`/api/app/pulse-drafts/${d.pulse_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bodies, status }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(null);
    if (!res?.ok) {
      toast.show(t(body.code === 'words_missing' ? 'pc.wordsMissing' : 'pc.failed'), 'danger');
      return;
    }
    toast.show(t(status === 'ready' ? 'pc.ready.done' : status === 'draft' ? 'pc.draft.done' : 'pc.saved'), 'success');
    void load();
  }

  // A person sends a message they (or a colleague) marked ready (C189). It goes to the class's guardians through
  // the send-gate; the answer says how many were queued and how many were held back.
  async function send(d: Draft) {
    setBusy(d.pulse_id);
    const res = await fetch(`/api/app/pulse-drafts/${d.pulse_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send' }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(null);
    if (!res?.ok) toast.show(t(body.code === 'nobody' ? 'pc.send.nobody' : 'pc.failed'), 'danger');
    else toast.show(t('pc.send.done', { queued: Number(body.queued ?? 0), held: Number(body.held ?? 0) }), 'success');
    void load();
  }

  const ready = drafts.filter((d) => d.status === 'ready').length;

  return (
    <section lang={lang} data-pulse-drafts className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-slate">{t('pc.title')}</h2>
      <p data-not-sent className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">
        {t('pc.notSent')}
      </p>
      {state === 'loading' && (
        <p role="status" className="text-sm text-slate/70">
          {t('pc.loading')}
        </p>
      )}
      {state === 'failed' && <TeachEmpty id="not-loaded" compact />}
      {state === 'ready' && drafts.length === 0 && <TeachEmpty id="pulse-drafts" href="/app/syllabus" compact />}
      {state === 'ready' && drafts.length > 0 && <p className="text-sm text-slate/70">{tCount('pc.count', drafts.length).replace('{ready}', String(ready))}</p>}

      <ul className="flex flex-col gap-3">
        {drafts.map((d) => {
          const l = shown[d.pulse_id] ?? 'en';
          const k = `${d.pulse_id}:${l}`;
          const locked = d.status === 'sent';
          const dirty = LANGS.some((x) => words[`${d.pulse_id}:${x}`] !== undefined && words[`${d.pulse_id}:${x}`] !== bodyOf(d, x));
          return (
            <li key={d.pulse_id} data-pulse-draft className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-base font-semibold">{d.subject_name ? `${d.class_name} · ${d.subject_name}` : d.class_name}</p>
                <Badge variant={d.status === 'ready' ? 'success' : 'neutral'}>{t(`pc.status.${d.status}` as MessageKey)}</Badge>
              </div>
              <div role="tablist" aria-label={t('pc.language')} className="flex flex-wrap gap-1">
                {LANGS.map((x) => (
                  <button key={x} type="button" role="tab" aria-selected={l === x} onClick={() => setShown((s) => ({ ...s, [d.pulse_id]: x }))} className={`${TAP} ${l === x ? 'border-sapphire bg-sapphire/10 text-sapphire' : 'border-slate/10 text-slate'}`}>
                    {t(`pc.lang.${x}` as MessageKey)}
                  </button>
                ))}
              </div>
              <textarea
                aria-label={t(`pc.lang.${l}` as MessageKey)}
                lang={l === 'en' ? 'en' : 'hi'}
                rows={4}
                maxLength={1000}
                readOnly={locked}
                value={words[k] ?? bodyOf(d, l)}
                onChange={(e) => setWords((w) => ({ ...w, [k]: e.target.value }))}
                className="rounded-md border border-slate/20 p-2 text-base text-slate"
              />
              {!locked && (
                <div className="flex flex-wrap gap-2">
                  {dirty && (
                    <button type="button" disabled={busy === d.pulse_id} className={`${TAP} border-sapphire text-sapphire`} onClick={() => void change(d)}>
                      {t('pc.save')}
                    </button>
                  )}
                  {d.status === 'draft' ? (
                    <button type="button" data-mark-ready disabled={busy === d.pulse_id} className="min-h-[48px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void change(d, 'ready')}>
                      {t('pc.ready')}
                    </button>
                  ) : (
                    <>
                      <button type="button" disabled={busy === d.pulse_id} className={`${TAP} border-slate/20 text-slate`} onClick={() => void change(d, 'draft')}>
                        {t('pc.draft')}
                      </button>
                      {!dirty && (
                        <button type="button" data-send-pulse disabled={busy === d.pulse_id} className="min-h-[48px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void send(d)}>
                          {t('pc.send')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {locked && (
                <p data-pulse-sent className="rounded-md bg-off-white px-3 py-2">
                  {t('pc.sent.summary', { queued: d.queued ?? 0, held: d.held ?? 0, understood: d.understood ?? 0, help: d.needs_help ?? 0 })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
