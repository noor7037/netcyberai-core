'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { useOffline } from '@/components/app-shell/OfflineContext';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';
import type { Operation } from '@/lib/offline/outbox';
import { TAUGHT_KEY, TAUGHT_MARK, type TaughtMark, type TaughtStatus } from '@/lib/offline/taught-sender';
import { indiaDate } from '@/lib/time/india';

// "Taught today" (D5, docs/20 5d, C147): one row per class and subject the
// signed-in person can record. One tap saves it: on the next topic of the
// syllabus map ("Taught today"), or on a status after typing the topic by
// hand. The tap writes the classwork log and prepares the day's Pulse
// draft. It works with no network: the tap waits in the outbox and is sent
// when the network returns. The server and RLS decide what each teacher may
// record.

type Pair = { class_id: string; class_name: string; subject_id: string; subject_name: string; teacher_id: string; teacher_name: string };
type Entry = { class_id: string; subject_id: string; topic: string; status: TaughtStatus; unit_id: string | null; note: string | null };
type Unit = { unit_id: string; class_id: string; subject_id: string; position: number; chapter: string; topic: string; taught: boolean };
type Coverage = { planned: number; taught: number; percent: number | null };
type Tap = { class_id: string; class_name: string; day: string; scheduled: number; marked: number };
type Kept = { date: string; pairs: Pair[]; entries: Entry[]; units: Unit[]; coverage: Record<string, Coverage>; tapCoverage: Tap[] };

const STATUSES: { value: TaughtStatus; variant: 'success' | 'warning' | 'danger' }[] = [
  { value: 'taught', variant: 'success' },
  { value: 'partial', variant: 'warning' },
  { value: 'delayed', variant: 'warning' },
  { value: 'not_taught', variant: 'danger' },
];
const TAP = 'min-h-[48px] rounded-md border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const key = (classId: string, subjectId: string) => `${classId}:${subjectId}`;

export function SyllabusView({ isTeacher }: { isTeacher: boolean }) {
  const { t, tCount, lang } = useT();
  const { ready, online, store, sync, queue, operations, remove } = useOffline();
  const toast = useToast();
  const [data, setData] = useState<Kept | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'phone' | 'none' | 'failed'>('loading');
  const [topics, setTopics] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [waiting, setWaiting] = useState<Record<string, TaughtMark>>({});
  const [failed, setFailed] = useState<Operation<TaughtMark>[]>([]);
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({});
  const [newLines, setNewLines] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const reloadWhenSaved = useRef(false);

  const statusWord = (s: TaughtStatus) => t(`taught.status.${s}` as MessageKey);

  const loadPhoneState = useCallback(
    async (date: string) => {
      const ops = (await operations().catch(() => [])).filter((o) => o.kind === TAUGHT_MARK) as Operation<TaughtMark>[];
      const queued: Record<string, TaughtMark> = {};
      for (const op of ops) if (op.state === 'waiting' && op.forDate === date) queued[key(op.payload.classId, op.payload.subjectId)] = op.payload;
      setWaiting(queued);
      setFailed(ops.filter((o) => o.state === 'failed'));
    },
    [operations]
  );

  const load = useCallback(async () => {
    let kept: Kept | undefined;
    let from: typeof state = 'ready';
    try {
      const res = await fetch('/api/app/syllabus');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        from = 'failed';
      } else {
        // One row per class and subject, even if two teachers share it.
        const seen = new Set<string>();
        const pairs = (body.assignments as Pair[]).filter((p) => (seen.has(key(p.class_id, p.subject_id)) ? false : (seen.add(key(p.class_id, p.subject_id)), true)));
        kept = { date: body.date, pairs, entries: body.entries, units: body.units ?? [], coverage: body.coverage ?? {}, tapCoverage: body.tapCoverage ?? [] };
        await store?.put(TAUGHT_KEY, kept).catch(() => undefined);
      }
    } catch {
      // No network: the day as last loaded on this phone, if it is today's.
      const onPhone = await store?.get<Kept>(TAUGHT_KEY).catch(() => undefined);
      if (onPhone && onPhone.date === indiaDate()) {
        kept = onPhone;
        from = 'phone';
      } else {
        from = 'none';
      }
    }
    setData(kept ?? null);
    if (kept) {
      setTopics((old) => ({ ...Object.fromEntries(kept!.entries.map((e) => [key(e.class_id, e.subject_id), e.topic])), ...old }));
      setNotes((old) => ({ ...Object.fromEntries(kept!.entries.filter((e) => e.note).map((e) => [key(e.class_id, e.subject_id), e.note as string])), ...old }));
      await loadPhoneState(kept.date);
    }
    setState(from);
  }, [store, loadPhoneState]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  // When what waited has been sent, show what the server now holds.
  useEffect(() => {
    if (!ready || !data) return;
    if (sync.state === 'saved' && reloadWhenSaved.current) {
      reloadWhenSaved.current = false;
      void load();
    } else if (sync.state !== 'saved') {
      reloadWhenSaved.current = true;
      void loadPhoneState(data.date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.state]);

  async function save(p: Pair, status: TaughtStatus, unit?: Unit) {
    if (!data) return;
    const k = key(p.class_id, p.subject_id);
    const topic = (unit ? unit.topic : topics[k] ?? '').trim();
    if (!topic) {
      setRowMessage((m) => ({ ...m, [k]: t('taught.topicFirst') }));
      document.getElementById(`topic-${k}`)?.focus();
      return;
    }
    setRowMessage((m) => ({ ...m, [k]: '' }));
    if (unit) setTopics((old) => ({ ...old, [k]: unit.topic }));
    // A status tapped after the topic was typed by hand keeps the unit only if the topic is still that unit's.
    const current = data.entries.find((e) => key(e.class_id, e.subject_id) === k);
    const unitId = unit ? unit.unit_id : current?.unit_id && current.topic === topic ? current.unit_id : null;
    const mark: TaughtMark = { classId: p.class_id, subjectId: p.subject_id, topic, status, unitId, note: (notes[k] ?? '').trim() || null, ...(isTeacher ? {} : { teacherId: p.teacher_id }) };
    setBusy(k);
    reloadWhenSaved.current = true;
    const op = await queue(TAUGHT_MARK, data.date, mark).catch(() => null);
    if (!op) {
      // The phone refused to keep anything: send it directly.
      const res = await fetch('/api/app/syllabus', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...mark, date: data.date }) }).catch(() => null);
      setBusy(null);
      if (!res?.ok) {
        setRowMessage((m) => ({ ...m, [k]: t('taught.notSaved') }));
        return;
      }
      void load();
      return;
    }
    await loadPhoneState(data.date);
    setBusy(null);
    toast.show(online ? t('taught.saved') : t('taught.queued'), 'success');
  }

  async function addTopics(p: Pair) {
    const k = key(p.class_id, p.subject_id);
    const lines = (newLines[k] ?? '').trim();
    if (!lines) return;
    setBusy(k);
    const res = await fetch('/api/app/syllabus/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId: p.class_id, subjectId: p.subject_id, lines }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(null);
    if (!res?.ok) {
      toast.show(t(res ? 'taught.map.addFailed' : 'taught.map.needsNetwork'), 'danger');
      return;
    }
    toast.show(tCount('taught.map.added', body.added), 'success');
    setNewLines((n) => ({ ...n, [k]: '' }));
    void load();
  }

  async function removeUnit(unit: Unit) {
    const res = await fetch('/api/app/syllabus/units', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId: unit.unit_id }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    if (!res?.ok) {
      toast.show(t(!res ? 'taught.map.needsNetwork' : body.code === 'in_use' ? 'taught.map.inUse' : 'taught.map.addFailed'), 'danger');
      return;
    }
    void load();
  }

  if (state === 'loading')
    return (
      <p role="status" lang={lang} className="text-sm text-slate/70">
        {t('taught.loading')}
      </p>
    );
  if (state === 'failed') return <TeachEmpty id="not-loaded" onAction={() => void load()} />;
  if (state === 'none' || !data)
    return (
      <p role="status" lang={lang} data-taught-offline className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">
        {t('taught.offline.none')}
      </p>
    );
  if (data.pairs.length === 0) return isTeacher ? <TeachEmpty id="taught-today-teacher" /> : <TeachEmpty id="taught-today-office" href="/app/help/ticket/new" />;

  const entryOf = (k: string): Entry | undefined => {
    const queued = waiting[k];
    if (queued) return { class_id: queued.classId, subject_id: queued.subjectId, topic: queued.topic, status: queued.status, unit_id: queued.unitId, note: queued.note };
    return data.entries.find((e) => key(e.class_id, e.subject_id) === k);
  };
  const done = data.pairs.filter((p) => entryOf(key(p.class_id, p.subject_id))).length;
  const week = data.tapCoverage.reduce((sum, c) => ({ scheduled: sum.scheduled + c.scheduled, marked: sum.marked + c.marked }), { scheduled: 0, marked: 0 });
  const pairName = (classId: string, subjectId: string) => {
    const p = data.pairs.find((x) => x.class_id === classId && x.subject_id === subjectId);
    return p ? `${p.class_name} · ${p.subject_name}` : '';
  };

  return (
    <div lang={lang} className="flex flex-col gap-4">
      <p className="text-sm text-slate/70">{t('taught.summary', { date: data.date, done, total: data.pairs.length })}</p>

      {state === 'phone' && (
        <p role="status" data-taught-offline className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">
          {t('taught.offline.kept')}
        </p>
      )}

      {failed.length > 0 && (
        <div role="alert" data-taught-failed className="flex flex-col gap-2 rounded-md border border-red-800/30 bg-white p-3 text-sm text-slate">
          <p className="font-semibold text-red-800">{t('taught.failed.title')}</p>
          {failed.map((op) => (
            <div key={op.id} className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1">{t('taught.failed.line', { lesson: pairName(op.payload.classId, op.payload.subjectId), date: op.forDate, topic: op.payload.topic })}</p>
              <button type="button" className={`${TAP} border-slate/20 text-slate`} onClick={() => void remove(op.id).then(() => loadPhoneState(data.date))}>
                {t('taught.failed.remove')}
              </button>
            </div>
          ))}
        </div>
      )}

      {!isTeacher && week.scheduled > 0 && (
        <div data-tap-coverage className="rounded-md border border-slate/10 bg-white p-3 text-sm text-slate">
          <p className="font-semibold">{t('taught.week', { marked: week.marked, scheduled: week.scheduled })}</p>
          <p className="text-slate/70">{t('taught.week.how')}</p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {data.pairs.map((p) => {
          const k = key(p.class_id, p.subject_id);
          const entry = entryOf(k);
          const units = data.units.filter((u) => u.class_id === p.class_id && u.subject_id === p.subject_id);
          const cover = data.coverage[k];
          const next = units.find((u) => !u.taught && u.unit_id !== entry?.unit_id) ?? null;
          return (
            <li key={k} data-lesson className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate">
                  {`${p.class_name} · ${p.subject_name}`}
                  {!isTeacher && <span className="ml-2 text-sm font-normal text-slate/70">{p.teacher_name}</span>}
                </p>
                <span className="flex items-center gap-2">
                  {waiting[k] && (
                    <span data-waiting className="text-xs font-semibold text-slate/70">
                      {t('taught.waiting')}
                    </span>
                  )}
                  {entry ? <Badge variant={STATUSES.find((s) => s.value === entry.status)?.variant ?? 'neutral'}>{statusWord(entry.status)}</Badge> : <Badge variant="neutral">{t('taught.notRecorded')}</Badge>}
                </span>
              </div>

              {cover && cover.planned > 0 && (
                <p data-coverage className="text-sm text-slate/70">
                  {t('taught.coverage', { taught: cover.taught, planned: cover.planned, percent: cover.percent ?? 0 })}
                </p>
              )}

              {next && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-off-white p-3">
                  <p className="min-w-0 flex-1 text-sm text-slate">
                    <span className="font-semibold">{t('taught.next')}</span> {next.chapter === next.topic ? next.topic : `${next.chapter}: ${next.topic}`}
                  </p>
                  <button type="button" data-one-tap disabled={busy === k} onClick={() => void save(p, 'taught', next)} className="min-h-[48px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {t('taught.oneTap')}
                  </button>
                </div>
              )}

              <label htmlFor={`topic-${k}`} className="text-sm font-medium text-slate">
                {t('taught.topic')}
              </label>
              <input
                id={`topic-${k}`}
                maxLength={200}
                value={topics[k] ?? ''}
                onChange={(e) => setTopics((old) => ({ ...old, [k]: e.target.value }))}
                placeholder={t('taught.topic.example')}
                className="min-h-[48px] rounded-md border border-slate/20 bg-white px-3 text-base text-slate placeholder:text-slate/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
              />
              <label htmlFor={`note-${k}`} className="text-sm font-medium text-slate">
                {t('taught.note')}
              </label>
              <input
                id={`note-${k}`}
                maxLength={500}
                value={notes[k] ?? ''}
                onChange={(e) => setNotes((old) => ({ ...old, [k]: e.target.value }))}
                className="min-h-[48px] rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
              />
              <div role="group" aria-label={`${p.class_name} ${p.subject_name}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STATUSES.map((s) => (
                  <button key={s.value} type="button" disabled={busy === k} aria-pressed={entry?.status === s.value} onClick={() => void save(p, s.value)} className={`${TAP} disabled:opacity-50 ${entry?.status === s.value ? 'border-sapphire bg-sapphire text-white' : 'border-slate/20 bg-white text-slate hover:border-sapphire'}`}>
                    {statusWord(s.value)}
                  </button>
                ))}
              </div>
              {rowMessage[k] && (
                <p role="alert" className="text-sm font-medium text-red-800">
                  {rowMessage[k]}
                </p>
              )}

              <details data-syllabus-map className="rounded-md border border-slate/10 p-3">
                <summary className="min-h-[48px] cursor-pointer py-3 text-sm font-semibold text-sapphire">{tCount('taught.map.title', units.length)}</summary>
                <div className="flex flex-col gap-2 pt-1">
                  {units.length === 0 && <p className="text-sm text-slate">{t('taught.map.empty')}</p>}
                  <ol className="flex flex-col gap-1">
                    {units.map((u) => (
                      <li key={u.unit_id} className="flex flex-wrap items-center gap-2 text-sm text-slate">
                        <span className="min-w-0 flex-1">
                          {u.chapter === u.topic ? u.topic : `${u.chapter}: ${u.topic}`}
                          {u.taught && <span className="ml-2 font-semibold text-emerald-text">{statusWord('taught')}</span>}
                        </span>
                        {!u.taught && (
                          <>
                            <button type="button" disabled={busy === k} className={`${TAP} border-slate/20 text-slate`} onClick={() => void save(p, 'taught', u)}>
                              {t('taught.oneTap')}
                            </button>
                            <button type="button" className={`${TAP} border-slate/20 text-slate`} onClick={() => void removeUnit(u)}>
                              {t('taught.map.remove')}
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                  <label htmlFor={`lines-${k}`} className="text-sm font-medium text-slate">
                    {t('taught.map.add')}
                  </label>
                  <textarea id={`lines-${k}`} rows={4} value={newLines[k] ?? ''} onChange={(e) => setNewLines((n) => ({ ...n, [k]: e.target.value }))} placeholder={t('taught.map.example')} className="rounded-md border border-slate/20 p-2 text-sm text-slate placeholder:text-slate/70" />
                  <button type="button" disabled={busy === k || !(newLines[k] ?? '').trim()} onClick={() => void addTopics(p)} className={`${TAP} self-start border-sapphire text-sapphire disabled:opacity-60`}>
                    {t('taught.map.addGo')}
                  </button>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
