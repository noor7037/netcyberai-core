'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

// "Taught today": one row per class + subject the signed-in person can
// record. Tapping a status saves immediately (PUT /api/app/syllabus); the
// topic is required, because the Daily Learning Pulse quotes it to
// parents. The server and RLS decide what each teacher may record.

type Status = 'taught' | 'partial' | 'delayed' | 'not_taught';
type Pair = { class_id: string; class_name: string; subject_id: string; subject_name: string; teacher_id: string; teacher_name: string };
type Entry = { class_id: string; subject_id: string; topic: string; status: Status; teacher_name: string };

const STATUSES: { value: Status; label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }[] = [
  { value: 'taught', label: 'Taught', variant: 'success' },
  { value: 'partial', label: 'Partly taught', variant: 'warning' },
  { value: 'delayed', label: 'Delayed', variant: 'warning' },
  { value: 'not_taught', label: 'Not taught', variant: 'danger' },
];

const key = (classId: string, subjectId: string) => `${classId}:${subjectId}`;

export function SyllabusView({ isTeacher }: { isTeacher: boolean }) {
  const [date, setDate] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [topics, setTopics] = useState<Record<string, string>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<Record<string, { ok: boolean; text: string }>>({});

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/app/syllabus');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load today’s lessons.');
      const map: Record<string, Entry> = {};
      for (const e of body.entries as Entry[]) map[key(e.class_id, e.subject_id)] = e;
      // One row per class+subject, even if two teachers share it.
      const seen = new Set<string>();
      const unique = (body.assignments as Pair[]).filter((p) => (seen.has(key(p.class_id, p.subject_id)) ? false : (seen.add(key(p.class_id, p.subject_id)), true)));
      setDate(body.date);
      setPairs(unique);
      setEntries(map);
      setTopics(Object.fromEntries(Object.entries(map).map(([k, e]) => [k, e.topic])));
      setState('ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load today’s lessons.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(p: Pair, status: Status) {
    const k = key(p.class_id, p.subject_id);
    const topic = (topics[k] ?? '').trim();
    if (!topic) {
      setRowMessage((m) => ({ ...m, [k]: { ok: false, text: 'Write the topic first. Parents see it in the Pulse.' } }));
      document.getElementById(`topic-${k}`)?.focus();
      return;
    }
    setSaving(k);
    setRowMessage((m) => ({ ...m, [k]: { ok: true, text: '' } }));
    try {
      const res = await fetch('/api/app/syllabus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: p.class_id, subjectId: p.subject_id, topic, status, ...(isTeacher ? {} : { teacherId: p.teacher_id }) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Not saved. Please try again.');
      setEntries((e) => ({ ...e, [k]: { ...body.entry, teacher_name: p.teacher_name } }));
      setRowMessage((m) => ({ ...m, [k]: { ok: true, text: 'Saved' } }));
    } catch (err) {
      setRowMessage((m) => ({ ...m, [k]: { ok: false, text: err instanceof Error ? err.message : 'Not saved. Please try again.' } }));
    } finally {
      setSaving(null);
    }
  }

  if (state === 'loading') return <LoadingState label="Loading today’s lessons…" />;
  if (state === 'error')
    return (
      <ErrorState
        message={loadError}
        action={
          <button type="button" onClick={load} className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Try again
          </button>
        }
      />
    );
  if (pairs.length === 0)
    return (
      <EmptyState
        title={isTeacher ? 'No classes assigned to you yet' : 'No subject assignments yet'}
        description={
          isTeacher
            ? 'Ask your school admin to assign your subjects and classes. They will appear here.'
            : 'Assign teachers to subjects and classes first; each assignment becomes a row here.'
        }
      />
    );

  const done = pairs.filter((p) => entries[key(p.class_id, p.subject_id)]).length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate/70">{`${date} · ${done} of ${pairs.length} recorded`}</p>
      <ul className="flex flex-col gap-3">
        {pairs.map((p) => {
          const k = key(p.class_id, p.subject_id);
          const entry = entries[k];
          const msg = rowMessage[k];
          return (
            <li key={k} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate">
                  {`${p.class_name} · ${p.subject_name}`}
                  {!isTeacher && <span className="ml-2 text-sm font-normal text-slate/70">{p.teacher_name}</span>}
                </p>
                {entry ? (
                  <Badge variant={STATUSES.find((s) => s.value === entry.status)?.variant ?? 'neutral'}>{STATUSES.find((s) => s.value === entry.status)?.label}</Badge>
                ) : (
                  <Badge variant="neutral">Not recorded</Badge>
                )}
              </div>
              <label htmlFor={`topic-${k}`} className="text-sm font-medium text-slate">
                Topic taught
              </label>
              <input
                id={`topic-${k}`}
                maxLength={200}
                value={topics[k] ?? ''}
                onChange={(e) => setTopics((t) => ({ ...t, [k]: e.target.value }))}
                placeholder="e.g. Fractions: comparing 3/4 and 5/8"
                className="min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-base text-slate placeholder:text-slate/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
              />
              <div role="group" aria-label={`Status for ${p.class_name} ${p.subject_name}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    disabled={saving === k}
                    aria-pressed={entry?.status === s.value}
                    onClick={() => save(p, s.value)}
                    className={`min-h-[44px] rounded-md border px-3 text-sm font-semibold disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${entry?.status === s.value ? 'border-sapphire bg-sapphire text-white' : 'border-slate/20 bg-white text-slate hover:border-sapphire'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {msg?.text && (
                <p role={msg.ok ? 'status' : 'alert'} className={`text-sm font-medium ${msg.ok ? 'text-emerald-text' : 'text-red-800'}`}>
                  {msg.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
