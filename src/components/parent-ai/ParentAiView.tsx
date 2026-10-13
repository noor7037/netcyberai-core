'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// Parent AI v1 (docs/25 slice 7n, C196): "What can I do at home?". Choose a guardian and their child; a draft is put
// together from what the child's class was taught and the child's own homework, and shows what it used. A person
// reads it, changes the words if need be, and approves: that is what sends it.

type Source = { kind: 'taught'; subject: string | null; topic: string; on: string } | { kind: 'homework'; subject: string; title: string; due: string } | { kind: 'followup' };
type Answer = { answer_id: string; child: string; guardian: string; body: string; sources: Source[]; ai_assisted: boolean; status: 'draft' | 'sent'; drafted_by: string | null; drafted_at: string; approved_by: string | null; message: string | null };
type Guardian = { parent_id: string; name: string; children: { student_id: string; name: string; class_name: string | null }[] };
const ERRORS = ['child', 'guardian', 'nothing_to_go_on', 'not_a_draft', 'words', 'no_number'];
const STATES = ['queued', 'uncertain', 'sent', 'delivered', 'read', 'failed'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const MAX = 700;

export function ParentAiView() {
  const { t, lang } = useT();
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Guardian[]>([]);
  const [who, setWho] = useState<Guardian | null>(null);
  const [studentId, setStudentId] = useState('');
  const [words, setWords] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/parent-ai').catch(() => null);
    const got = res?.ok ? await res.json().catch(() => null) : null;
    setFailed(!got);
    if (got) setAnswers(got.answers);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // From a conversation in Communication: that guardian is already chosen.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('guardian');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    void fetch(`/api/app/guardians/${id}`).then(async (res) => {
      const d = res.ok ? await res.json().catch(() => null) : null;
      if (d) setWho({ parent_id: d.guardian.parent_id, name: d.guardian.name, children: d.children });
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!q.trim() || who) return setFound([]);
    const wait = setTimeout(() => void fetch(`/api/app/guardians?q=${encodeURIComponent(q)}`).then(async (res) => setFound(res.ok ? ((await res.json()).guardians as Guardian[]).slice(0, 8) : [])).catch(() => setFound([])), 300);
    return () => clearTimeout(wait);
  }, [q, who]);

  const send = async (url: string, payload: unknown, done: (r: { status?: string | null }) => string) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: ERRORS.includes(got?.code) ? t(`pai.err.${got.code}` as MessageKey) : t('pai.err.other') });
    setNote({ ok: true, text: done(got ?? {}) });
    await load();
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('pai.failed')}</p>;
  if (!answers) return null;
  const day = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const sayDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
  const child = studentId || who?.children[0]?.student_id || '';
  const cite = (s: Source) => (s.kind === 'taught' ? (s.subject ? t('pai.source.taught', { topic: s.topic, subject: s.subject, when: sayDay(s.on) }) : t('pai.source.taughtPlain', { topic: s.topic, when: sayDay(s.on) })) : s.kind === 'homework' ? t('pai.source.homework', { title: s.title, subject: s.subject, when: sayDay(s.due) }) : t('pai.source.followup'));

  return (
    <div lang={lang} data-parent-ai className="flex flex-col gap-4 text-sm text-slate">
      {note && <p role="status" data-parent-ai-note className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}

      <section data-parent-ai-new className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <div>
          <h2 className="text-base font-bold">{t('pai.new.title')}</h2>
          <p className="text-slate/70">{t('pai.new.how')}</p>
        </div>
        {!who ? (
          <>
            <Input id="parent-ai-guardian" label={t('pai.new.find')} maxLength={80} value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="flex flex-col gap-2">
              {found.map((g) => (
                <li key={g.parent_id}>
                  <button type="button" data-parent-ai-guardian className={`${TAP} w-full text-left`} onClick={() => { setWho(g); setQ(''); setStudentId(''); }}>
                    {g.name} · {g.children.map((c) => c.name).join(', ')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{t('pai.new.for', { guardian: who.name })}</span>
              <button type="button" className={TAP} onClick={() => setWho(null)}>{t('pai.new.other')}</button>
            </p>
            {who.children.length === 0 ? (
              <p className="rounded-md bg-off-white px-3 py-2">{t('pai.new.noChild')}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="flex flex-col gap-1">
                  <label htmlFor="parent-ai-child" className="font-semibold">{t('pai.new.child')}</label>
                  <select id="parent-ai-child" className="min-h-[44px] rounded-md border border-slate/20 bg-white px-3" value={child} onChange={(e) => setStudentId(e.target.value)}>
                    {who.children.map((c) => (
                      <option key={c.student_id} value={c.student_id}>{c.name}{c.class_name ? ` (${c.class_name})` : ''}</option>
                    ))}
                  </select>
                </div>
                <button type="button" data-parent-ai-draft disabled={busy || !child} className={PRIMARY} onClick={() => void send('/api/app/parent-ai', { studentId: child, parentId: who.parent_id }, () => t('pai.drafted'))}>
                  {t('pai.new.draft')}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="text-base font-bold">{t('pai.list.title')}</h2>
        {answers.length === 0 ? (
          <p data-parent-ai-empty className="rounded-md bg-off-white px-3 py-2">{t('pai.none')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {answers.map((a) => {
              const text = words[a.answer_id] ?? a.body;
              return (
                <li key={a.answer_id} data-answer={a.status} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.status === 'sent' ? 'success' : 'warning'}>{t(a.status === 'sent' ? 'pai.status.sent' : 'pai.status.draft')}</Badge>
                    <span className="font-bold">{t('pai.forChild', { child: a.child, guardian: a.guardian })}</span>
                    <span className="text-slate/70">{t(a.ai_assisted ? 'pai.madeWithAi' : 'pai.madeByRules')}</span>
                  </div>
                  {a.status === 'draft' ? (
                    <>
                      <label htmlFor={`answer-${a.answer_id}`} className="font-semibold">{t('pai.words')}</label>
                      <textarea id={`answer-${a.answer_id}`} rows={4} maxLength={MAX} className="rounded-md border border-slate/20 px-3 py-2" value={text} onChange={(e) => setWords({ ...words, [a.answer_id]: e.target.value })} />
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{a.body}</p>
                  )}
                  <div data-answer-sources>
                    <p className="font-semibold">{t('pai.used')}</p>
                    <ul className="list-disc pl-5">
                      {a.sources.map((s, i) => (
                        <li key={i}>{cite(s)}</li>
                      ))}
                    </ul>
                  </div>
                  {a.status === 'draft' ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" data-answer-approve disabled={busy || !text.trim()} className={PRIMARY} onClick={() => void send(`/api/app/parent-ai/${a.answer_id}`, { action: 'approve', words: text }, (r) => t(r.status === 'queued' ? 'pai.approved' : 'pai.approvedHeld'))}>
                        {t('pai.approve')}
                      </button>
                      <button type="button" data-answer-discard disabled={busy} className={TAP} onClick={() => void send(`/api/app/parent-ai/${a.answer_id}`, { action: 'discard' }, () => t('pai.discarded'))}>
                        {t('pai.discard')}
                      </button>
                    </div>
                  ) : (
                    <p className="text-slate/70">
                      {t('pai.approvedBy', { name: a.approved_by ?? '' })}
                      {a.message ? ` · ${t(`msg.state.${a.message.startsWith('blocked_') ? 'held' : STATES.includes(a.message) ? a.message : 'sent'}` as MessageKey)}` : ''}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
