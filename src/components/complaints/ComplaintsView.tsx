'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// Complaints from parents (docs/25 slice 7m, C195). Record one for a guardian, with who will look into it and by
// when; add notes; close it with what was done, which the parent is told. Overdue ones pass to the principal.

type Step = { kind: string; note: string | null; by: string | null; parent_told: boolean; at: string };
type Complaint = { complaint_id: string; ref: string; guardian: string; child: string | null; about: string | null; owner_id: string; owner: string; source: 'thread' | 'office'; summary: string; status: 'open' | 'closed'; due_at: string; overdue: boolean; escalated: boolean; created_at: string; closing_note: string | null; mayChange: boolean; events: Step[] };
type Data = { complaints: Complaint[]; staff: { user_id: string; name: string; role: string }[]; me: string; office: boolean };
type Guardian = { parent_id: string; name: string; children: { student_id: string; name: string; class_name: string | null }[] };
const ERRORS = ['summary', 'due', 'guardian', 'child', 'owner', 'about', 'owner_is_about', 'for_the_office', 'closed', 'note'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const FIELD = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';

export function ComplaintsView() {
  const { t, lang } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Guardian[]>([]);
  const [who, setWho] = useState<Guardian | null>(null);
  const [fromThread, setFromThread] = useState(false);
  const [form, setForm] = useState({ studentId: '', aboutUserId: '', ownerId: '', summary: '', dueHours: 48 });
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/complaints').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    setFailed(!got);
    if (got) setData(got);
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
      if (!d) return;
      setWho({ parent_id: d.guardian.parent_id, name: d.guardian.name, children: d.children });
      setFromThread(true);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!q.trim() || who) return setFound([]);
    const wait = setTimeout(() => void fetch(`/api/app/guardians?q=${encodeURIComponent(q)}`).then(async (res) => setFound(res.ok ? ((await res.json()).guardians as Guardian[]).slice(0, 8) : [])).catch(() => setFound([])), 300);
    return () => clearTimeout(wait);
  }, [q, who]);

  const send = async (url: string, payload: unknown, done: (r: { parentTold?: boolean | null }) => string, after?: () => void) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: ERRORS.includes(got?.code) ? t(`cmp.err.${got.code}` as MessageKey) : t('cmp.err.other') });
    setNote({ ok: true, text: done(got ?? {}) });
    after?.();
    await load();
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('cmp.failed')}</p>;
  if (!data) return null;
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const owner = data.office ? form.ownerId : data.me;
  const toldWords = (r: { parentTold?: boolean | null }) => t(r.parentTold ? 'cmp.parentTold' : 'cmp.parentNotTold');

  return (
    <div lang={lang} data-complaints className="flex flex-col gap-4 text-sm text-slate">
      {note && <p role="status" data-complaints-note className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}

      <section data-complaint-new className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <div>
          <h2 className="text-base font-bold">{t('cmp.new.title')}</h2>
          <p className="text-slate/70">{t(data.office ? 'cmp.new.how' : 'cmp.new.howTeacher')}</p>
        </div>
        {!who ? (
          <>
            <Input id="complaint-guardian" label={t('cmp.new.find')} maxLength={80} value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="flex flex-col gap-2">
              {found.map((g) => (
                <li key={g.parent_id}>
                  <button type="button" data-complaint-guardian className={`${TAP} w-full text-left`} onClick={() => { setWho(g); setQ(''); }}>
                    {g.name} · {g.children.map((c) => c.name).join(', ')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{t('cmp.new.from', { guardian: who.name })}</span>
              <button type="button" className={TAP} onClick={() => { setWho(null); setFromThread(false); setForm({ ...form, studentId: '' }); }}>{t('cmp.new.other')}</button>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="complaint-child" className="font-semibold">{t('cmp.new.child')}</label>
                <select id="complaint-child" className={FIELD} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                  <option value="">{t('cmp.new.noChild')}</option>
                  {who.children.map((c) => (
                    <option key={c.student_id} value={c.student_id}>{c.name}{c.class_name ? ` (${c.class_name})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="complaint-due" className="font-semibold">{t('cmp.new.due')}</label>
                <select id="complaint-due" className={FIELD} value={form.dueHours} onChange={(e) => setForm({ ...form, dueHours: Number(e.target.value) })}>
                  {[24, 48, 72].map((h) => (
                    <option key={h} value={h}>{t('cmp.new.dueIn', { count: h / 24 })}</option>
                  ))}
                </select>
              </div>
              {data.office && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="complaint-owner" className="font-semibold">{t('cmp.new.owner')}</label>
                    <select id="complaint-owner" className={FIELD} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                      <option value="">{t('cmp.new.choose')}</option>
                      {data.staff.filter((s) => s.user_id !== form.aboutUserId).map((s) => (
                        <option key={s.user_id} value={s.user_id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="complaint-about" className="font-semibold">{t('cmp.new.about')}</label>
                    <select id="complaint-about" className={FIELD} value={form.aboutUserId} onChange={(e) => setForm({ ...form, aboutUserId: e.target.value, ownerId: form.ownerId === e.target.value ? '' : form.ownerId })}>
                      <option value="">{t('cmp.new.aboutNobody')}</option>
                      {data.staff.filter((s) => s.user_id !== data.me).map((s) => (
                        <option key={s.user_id} value={s.user_id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <label htmlFor="complaint-summary" className="font-semibold">{t('cmp.new.summary')}</label>
            <textarea id="complaint-summary" rows={3} maxLength={600} className="rounded-md border border-slate/20 px-3 py-2" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            <button type="button" data-complaint-open disabled={busy || !form.summary.trim() || !owner} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/complaints', { parentId: who.parent_id, studentId: form.studentId || null, aboutUserId: form.aboutUserId || null, ownerId: owner, summary: form.summary, dueHours: form.dueHours, source: fromThread ? 'thread' : 'office' }, (r) => `${t('cmp.opened')} ${toldWords(r)}`, () => { setWho(null); setFromThread(false); setForm({ studentId: '', aboutUserId: '', ownerId: '', summary: '', dueHours: 48 }); })}>
              {t('cmp.new.open')}
            </button>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="text-base font-bold">{t('cmp.list.title')}</h2>
        {data.complaints.length === 0 ? (
          <p data-complaints-empty className="rounded-md bg-off-white px-3 py-2">{t('cmp.none')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.complaints.map((c) => (
              <li key={c.complaint_id} data-complaint={c.status} data-overdue={c.overdue ? 'yes' : 'no'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={c.status === 'closed' ? 'success' : c.overdue ? 'danger' : 'warning'}>{t(c.status === 'closed' ? 'cmp.status.closed' : c.overdue ? 'cmp.status.overdue' : 'cmp.status.open')}</Badge>
                  <span className="font-bold">{c.child ? t('cmp.fromAbout', { guardian: c.guardian, child: c.child }) : c.guardian}</span>
                  <span className="text-slate/70">{t('cmp.ref', { ref: c.ref })}</span>
                </div>
                <p className="whitespace-pre-wrap break-words">{c.summary}</p>
                {c.about && <p className="font-semibold">{t('cmp.aboutStaff', { name: c.about })}</p>}
                <p className="text-slate/70">{t(c.status === 'closed' ? 'cmp.ownerWas' : 'cmp.ownerDue', { owner: c.owner, due: when.format(new Date(c.due_at)) })}</p>
                {c.escalated && <p className="font-semibold">{t('cmp.escalated')}</p>}
                <ul className="flex flex-col gap-1 border-l-2 border-slate/10 pl-3">
                  {c.events.map((e, i) => (
                    <li key={i} data-complaint-step={e.kind}>
                      <span className="font-semibold">{t(`cmp.step.${e.kind}` as MessageKey, { by: e.by ?? '', note: e.note ?? '' })}</span>{' '}
                      <span className="text-slate/70">{when.format(new Date(e.at))}{e.kind === 'opened' || e.kind === 'escalated' || e.kind === 'closed' ? ` · ${t(e.parent_told ? 'cmp.parentTold' : 'cmp.parentNotTold')}` : ''}</span>
                    </li>
                  ))}
                </ul>
                {c.mayChange && (
                  <div className="flex flex-col gap-2">
                    <Input id={`complaint-text-${c.complaint_id}`} label={t('cmp.text')} maxLength={600} value={texts[c.complaint_id] ?? ''} onChange={(e) => setTexts({ ...texts, [c.complaint_id]: e.target.value })} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" data-complaint-note disabled={busy || !(texts[c.complaint_id] ?? '').trim()} className={TAP} onClick={() => void send(`/api/app/complaints/${c.complaint_id}`, { action: 'note', text: texts[c.complaint_id] }, () => t('cmp.noted'), () => setTexts({ ...texts, [c.complaint_id]: '' }))}>
                        {t('cmp.addNote')}
                      </button>
                      <button type="button" data-complaint-close disabled={busy || !(texts[c.complaint_id] ?? '').trim()} className={PRIMARY} onClick={() => void send(`/api/app/complaints/${c.complaint_id}`, { action: 'close', text: texts[c.complaint_id] }, (r) => `${t('cmp.closed')} ${toldWords(r)}`, () => setTexts({ ...texts, [c.complaint_id]: '' }))}>
                        {t('cmp.close')}
                      </button>
                    </div>
                    <p className="text-xs text-slate/70">{t('cmp.closeHow')}</p>
                    {data.office && (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`complaint-give-${c.complaint_id}`} className="font-semibold">{t('cmp.give')}</label>
                          <select id={`complaint-give-${c.complaint_id}`} className={FIELD} value="" disabled={busy} onChange={(e) => e.target.value && void send(`/api/app/complaints/${c.complaint_id}`, { action: 'assign', ownerId: e.target.value }, () => t('cmp.given'))}>
                            <option value="">{t('cmp.new.choose')}</option>
                            {data.staff.filter((s) => s.user_id !== c.owner_id && s.name !== c.about).map((s) => (
                              <option key={s.user_id} value={s.user_id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
