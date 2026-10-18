'use client';

import { useCallback, useEffect, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';

// Teacher Copilot v1 (docs/20 5h, C154). The teacher picks a topic from the
// syllabus map and what to draft; the draft appears in a box they can
// change; nothing is kept until they approve. What is sent to the model is
// the class level, the subject and the topic: nothing about a student.

const KINDS = ['lesson_plan', 'worksheet', 'pulse_message'] as const;
type Kind = (typeof KINDS)[number];
type State = { on: true; limit: number; used: number } | { on: false; why: 'module_off' | 'no_limit' | 'no_provider' };
type Pair = { class_id: string; class_name: string; subject_id: string; subject_name: string };
type Unit = { unit_id: string; class_id: string; subject_id: string; chapter: string; topic: string };
type Note = { note_id: string; class_name: string; subject_name: string; kind: 'lesson_plan' | 'worksheet'; title: string; body: string };
type PulseDraft = { pulse_id: string; class_id: string; subject_id: string | null; status: string };
const PRIMARY = 'min-h-[48px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const TAP = 'min-h-[48px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate';

export function CopilotView() {
  const { t, lang } = useT();
  const toast = useToast();
  const [state, setState] = useState<State | 'loading' | 'failed'>('loading');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [kind, setKind] = useState<Kind>('lesson_plan');
  const [pair, setPair] = useState('');
  const [unitId, setUnitId] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, map, saved] = await Promise.all([fetch('/api/app/copilot/draft'), fetch('/api/app/syllabus'), fetch('/api/app/copilot/notes')]);
      if (!s.ok) throw new Error('not loaded');
      setState(await s.json());
      const m = map.ok ? await map.json() : { assignments: [], units: [] };
      const seen = new Set<string>();
      setPairs((m.assignments as Pair[]).filter((p) => (seen.has(`${p.class_id}:${p.subject_id}`) ? false : (seen.add(`${p.class_id}:${p.subject_id}`), true))));
      setUnits(m.units ?? []);
      setNotes(saved.ok ? (await saved.json()).notes : []);
    } catch {
      setState('failed');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const [classId, subjectId] = pair.split(':');
  const topics = units.filter((u) => u.class_id === classId && u.subject_id === subjectId);

  async function makeDraft() {
    if (!unitId) return;
    setBusy(true);
    const res = await fetch('/api/app/copilot/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, classId, subjectId, unitId }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) {
      toast.show(t(body.code === 'over_limit' ? 'cp.overLimit' : body.code === 'off' ? 'cp.off.no_provider' : 'cp.failed'), 'danger');
      if (body.code === 'over_limit' || body.code === 'off') void load();
      return;
    }
    setText(body.text);
    setState({ on: true, limit: body.limit, used: body.used });
  }

  async function approve() {
    if (text === null) return;
    setBusy(true);
    if (kind === 'pulse_message') {
      // The day's message for this lesson must exist: it is prepared by "Taught today".
      const list = await fetch('/api/app/pulse-drafts').then((r) => (r.ok ? r.json() : { drafts: [] })).catch(() => ({ drafts: [] }));
      const target = (list.drafts as PulseDraft[]).find((d) => d.class_id === classId && d.subject_id === subjectId && d.status !== 'sent');
      const res = target ? await fetch(`/api/app/pulse-drafts/${target.pulse_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bodies: { en: text } }) }).catch(() => null) : null;
      setBusy(false);
      toast.show(t(!target ? 'cp.pulse.none' : res?.ok ? 'cp.pulse.used' : 'cp.failed'), res?.ok ? 'success' : 'danger');
      if (res?.ok) setText(null);
      return;
    }
    const res = await fetch('/api/app/copilot/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, classId, subjectId, unitId, body: text }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast.show(t('cp.failed'), 'danger');
      return;
    }
    toast.show(t('cp.approved'), 'success');
    setText(null);
    void load();
  }

  if (state === 'loading')
    return (
      <p role="status" lang={lang} className="text-sm text-slate/70">
        {t('cp.loading')}
      </p>
    );
  if (state === 'failed') return <TeachEmpty id="not-loaded" />;
  if (!state.on)
    return (
      <p role="status" lang={lang} data-copilot-off className="rounded-md bg-tangerine/10 px-3 py-3 text-sm font-semibold text-slate">
        {t(`cp.off.${state.why}` as MessageKey)}
      </p>
    );

  return (
    <section lang={lang} className="flex flex-col gap-4">
      <p className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('cp.privacy')}</p>
      <p data-usage className="text-sm text-slate/70">
        {t('cp.usage', { used: Math.min(state.used, state.limit), limit: state.limit })}
      </p>

      {pairs.length === 0 || units.length === 0 ? (
        <TeachEmpty id="copilot-no-map" href="/app/syllabus" />
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select id="cp-kind" label={t('cp.kind')} value={kind} onChange={(e) => (setKind(e.target.value as Kind), setText(null))}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`cp.kind.${k}` as MessageKey)}
                </option>
              ))}
            </Select>
            <Select id="cp-pair" label={t('cp.class')} value={pair} onChange={(e) => (setPair(e.target.value), setUnitId(''), setText(null))}>
              <option value="">—</option>
              {pairs.map((p) => (
                <option key={`${p.class_id}:${p.subject_id}`} value={`${p.class_id}:${p.subject_id}`}>
                  {`${p.class_name} · ${p.subject_name}`}
                </option>
              ))}
            </Select>
            <Select id="cp-topic" label={t('cp.topic')} value={unitId} onChange={(e) => (setUnitId(e.target.value), setText(null))} disabled={!pair}>
              <option value="">—</option>
              {topics.map((u) => (
                <option key={u.unit_id} value={u.unit_id}>
                  {u.chapter === u.topic ? u.topic : `${u.chapter}: ${u.topic}`}
                </option>
              ))}
            </Select>
          </div>
          <button type="button" data-draft disabled={busy || !unitId} onClick={() => void makeDraft()} className={`${PRIMARY} self-start`}>
            {t('cp.draft')}
          </button>

          {text !== null && (
            <div data-copilot-draft className="flex flex-col gap-2 border-t border-slate/10 pt-3">
              <Textarea id="cp-text" label={t('cp.check')} rows={10} maxLength={8000} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" data-approve disabled={busy || !text.trim()} onClick={() => void approve()} className={PRIMARY}>
                  {t(kind === 'pulse_message' ? 'cp.pulse.use' : 'cp.approve')}
                </button>
                <button type="button" className={TAP} onClick={() => setText(null)}>
                  {t('cp.discard')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {notes.length > 0 && (
        <div data-notes className="flex flex-col gap-2">
          <h2 className="text-base font-bold text-slate">{t('cp.saved')}</h2>
          {notes.map((n) => (
            <details key={n.note_id} className="rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
              <summary className="min-h-[48px] cursor-pointer py-3 font-semibold">{`${t(`cp.kind.${n.kind}` as MessageKey)} · ${n.class_name} · ${n.subject_name} · ${n.title}`}</summary>
              <p className="pb-2 text-xs text-slate/70">{t('cp.aiAssisted')}</p>
              <p className="whitespace-pre-line">{n.body}</p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
