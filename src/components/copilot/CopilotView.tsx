'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { HOMEWORK_TITLE_MAX, homeworkDetails, homeworkTitle, nextDay, putPulseFill } from '@/lib/copilot/use';
import type { MessageKey } from '@/lib/i18n';
import { MAX_PULSE_BODY } from '@/lib/pulse/text';

// Teacher Copilot (docs/20 5h, C154; the teacher's hour, W20-C, docs/42 H3). The teacher starts from a lesson taught
// today (one tap picks class, subject and topic), asks for a lesson plan, a worksheet or the day's message to
// families, changes the words, approves them, and then uses them: the worksheet is set as homework, the message
// opens in today's Pulse with the words in, the lesson plan is kept. Nothing is kept or used before approval. What
// is sent to the model is the class level, the subject and the topic: nothing about a person.

const KINDS = ['lesson_plan', 'worksheet', 'pulse_message'] as const;
type Kind = (typeof KINDS)[number];
type State = { on: true; limit: number; used: number } | { on: false; why: 'module_off' | 'no_limit' | 'no_provider' };
type Pair = { class_id: string; class_name: string; subject_id: string; subject_name: string };
type Unit = { unit_id: string; class_id: string; subject_id: string; chapter: string; topic: string };
type Lesson = Unit & { class_name: string; subject_name: string };
type Note = { note_id: string; class_name: string; subject_name: string; kind: 'lesson_plan' | 'worksheet'; title: string; body: string };
type PulseDraft = { pulse_id: string; class_id: string; subject_id: string | null; status: string };
type Homework = { title: string; dueDate: string; classIds: string[] };
const PRIMARY = 'min-h-[48px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const TAP = 'min-h-[48px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const topicLabel = (u: Pick<Unit, 'chapter' | 'topic'>) => (u.chapter === u.topic ? u.topic : `${u.chapter}: ${u.topic}`);
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);

export function CopilotView() {
  const { t, lang } = useT();
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<State | 'loading' | 'failed'>('loading');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [today, setToday] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [kind, setKind] = useState<Kind>('lesson_plan');
  const [pair, setPair] = useState('');
  const [unitId, setUnitId] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [kept, setKept] = useState(false);
  const [homework, setHomework] = useState<Homework | null>(null);
  const [busy, setBusy] = useState<'draft' | 'use' | null>(null);
  const [problem, setProblem] = useState<MessageKey | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, map, saved, taught] = await Promise.all([fetch('/api/app/copilot/draft'), fetch('/api/app/syllabus'), fetch('/api/app/copilot/notes'), fetch('/api/app/copilot/today')]);
      if (!s.ok) throw new Error('not loaded');
      setState(await s.json());
      const m = map.ok ? await map.json() : { assignments: [], units: [] };
      const seen = new Set<string>();
      setPairs((m.assignments as Pair[]).filter((p) => (seen.has(`${p.class_id}:${p.subject_id}`) ? false : (seen.add(`${p.class_id}:${p.subject_id}`), true))));
      setUnits(m.units ?? []);
      setNotes(saved.ok ? (await saved.json()).notes : []);
      const day = taught.ok ? await taught.json() : { date: '', lessons: [] };
      setLessons(day.lessons ?? []);
      setToday(day.date ?? '');
    } catch {
      setState('failed');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const [classId, subjectId] = pair.split(':');
  const topics = units.filter((u) => u.class_id === classId && u.subject_id === subjectId);
  const unit = units.find((u) => u.unit_id === unitId) ?? lessons.find((u) => u.unit_id === unitId);
  // The sections homework can go to: the teacher's own classes with this subject.
  const sections = pairs.filter((p) => p.subject_id === subjectId);

  function reset() {
    setText(null);
    setApproved(false);
    setKept(false);
    setHomework(null);
    setProblem(null);
  }
  function pick(l: Lesson) {
    setPair(`${l.class_id}:${l.subject_id}`);
    setUnitId(l.unit_id);
    reset();
  }

  async function makeDraft() {
    if (!unitId) return;
    setBusy('draft');
    reset();
    const res = await post('/api/app/copilot/draft', { kind, classId, subjectId, unitId });
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(null);
    if (!res?.ok) {
      setProblem(body.code === 'over_limit' ? 'cp.overLimit' : body.code === 'off' ? (body.why === 'failed' ? 'w20c.chainFailed' : 'cp.off.no_provider') : res ? 'cp.failed' : 'w20c.offline');
      if (body.code === 'over_limit') void load();
      return;
    }
    setText(body.text);
    setState({ on: true, limit: body.limit, used: body.used });
  }

  // Keeps the approved words as a lesson plan or worksheet, once.
  async function keep(): Promise<boolean> {
    if (kept) return true;
    if (kind === 'pulse_message' || text === null) return false;
    const res = await post('/api/app/copilot/notes', { kind, classId, subjectId, unitId, body: text });
    if (!res?.ok) return false;
    setKept(true);
    return true;
  }

  async function keepNote() {
    setBusy('use');
    const ok = await keep();
    setBusy(null);
    if (!ok) return setProblem('cp.failed');
    toast.show(t('cp.approved'), 'success');
    reset();
    void load();
  }

  function openHomework() {
    if (!unit || !today) return;
    setProblem(null);
    setHomework({ title: homeworkTitle(unit.chapter, unit.topic), dueDate: nextDay(today), classIds: [classId] });
  }

  // "Set as homework": the worksheet is kept (with its answers, for the teacher), then set as homework for the
  // sections ticked, without the answers. Two existing routes, one after the other.
  async function setAsHomework() {
    if (!homework || text === null) return;
    const details = homeworkDetails(text);
    if (!details.ok) return setProblem(details.reason === 'too_long' ? 'w20c.hw.tooLong' : 'w20c.hw.empty');
    if (homework.classIds.length === 0) return setProblem('w20c.hw.noSections');
    setBusy('use');
    if (!(await keep())) {
      setBusy(null);
      return setProblem('cp.failed');
    }
    const res = await post('/api/app/homework', { title: homework.title, details: details.details, dueDate: homework.dueDate, subjectId, classIds: homework.classIds });
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(null);
    if (!res?.ok) return setProblem(body.code === 'due_date' ? 'w20c.hw.due' : body.code === 'title' ? 'w20c.hw.title' : body.code === 'not_your_class' ? 'w20c.hw.notYours' : 'cp.failed');
    toast.show(t('w20c.hw.done', { count: homework.classIds.length }), 'success');
    reset();
    void load();
  }

  // "Send as today's Pulse": opens today's message for this lesson with the approved words in. Nothing is sent.
  async function toPulse() {
    if (text === null) return;
    if (text.trim().length > MAX_PULSE_BODY) return setProblem('w20c.pulse.tooLong');
    setBusy('use');
    const list = await fetch('/api/app/pulse-drafts').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const target = ((list?.drafts ?? []) as PulseDraft[]).find((d) => d.class_id === classId && d.subject_id === subjectId && d.status !== 'sent');
    if (!list || !target) {
      setBusy(null);
      return setProblem(list ? 'cp.pulse.none' : 'cp.failed');
    }
    if (!putPulseFill(target.pulse_id, text.trim())) {
      // This browser keeps nothing between pages: the words are saved into the message instead (still not sent).
      const res = await fetch(`/api/app/pulse-drafts/${target.pulse_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bodies: { en: text.trim() } }) }).catch(() => null);
      if (!res?.ok) {
        setBusy(null);
        return setProblem('cp.failed');
      }
    }
    router.push(`/app/pulse?fill=${target.pulse_id}`);
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

  const overLimit = state.used >= state.limit;
  return (
    <section lang={lang} className="flex flex-col gap-4">
      <p className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('cp.privacy')}</p>
      <p data-usage className={`text-sm ${overLimit ? 'font-semibold text-slate' : 'text-slate/70'}`}>
        {t('cp.usage', { used: Math.min(state.used, state.limit), limit: state.limit })}
        {overLimit ? ` ${t('cp.overLimit')}` : ''}
      </p>

      {pairs.length === 0 || units.length === 0 ? (
        <TeachEmpty id="copilot-no-map" href="/app/syllabus" />
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
          <div data-taught-today className="flex flex-col gap-2">
            <h2 className="text-base font-bold text-slate">{t('w20c.today.title')}</h2>
            {lessons.length === 0 ? (
              <p className="text-sm text-slate/70">
                {t('w20c.today.none')}{' '}
                <a href="/app/syllabus" className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
                  {t('w20c.today.record')}
                </a>
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lessons.map((l) => {
                  const on = unitId === l.unit_id && pair === `${l.class_id}:${l.subject_id}`;
                  return (
                    <li key={`${l.class_id}:${l.subject_id}:${l.unit_id}`}>
                      <button type="button" data-lesson aria-pressed={on} onClick={() => pick(l)} className={`flex min-h-[48px] w-full flex-col items-start justify-center rounded-md border px-4 py-2 text-left text-sm ${on ? 'border-sapphire bg-sapphire/10 text-slate' : 'border-slate/20 text-slate'}`}>
                        <span className="font-semibold">{`${l.class_name} · ${l.subject_name}`}</span>
                        <span>{topicLabel(l)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <details open={lessons.length === 0} className="rounded-md border border-slate/10 px-3">
            <summary className="flex min-h-[48px] cursor-pointer items-center text-sm font-semibold text-slate">{t('w20c.other')}</summary>
            <div className="grid gap-3 pb-3 sm:grid-cols-2">
              <Select id="cp-pair" label={t('cp.class')} value={pair} onChange={(e) => (setPair(e.target.value), setUnitId(''), reset())}>
                <option value="">—</option>
                {pairs.map((p) => (
                  <option key={`${p.class_id}:${p.subject_id}`} value={`${p.class_id}:${p.subject_id}`}>
                    {`${p.class_name} · ${p.subject_name}`}
                  </option>
                ))}
              </Select>
              <Select id="cp-topic" label={t('cp.topic')} value={unitId} onChange={(e) => (setUnitId(e.target.value), reset())} disabled={!pair}>
                <option value="">—</option>
                {topics.map((u) => (
                  <option key={u.unit_id} value={u.unit_id}>
                    {topicLabel(u)}
                  </option>
                ))}
              </Select>
            </div>
          </details>

          <SegmentedControl id="cp-kind" label={t('cp.kind')} value={kind} onChange={(k) => (setKind(k), reset())} options={KINDS.map((k) => ({ value: k, label: t(`cp.kind.${k}` as MessageKey) }))} />

          {unit && (
            <p data-picked className="text-sm text-slate">
              {t('w20c.picked', { topic: topicLabel(unit) })}
            </p>
          )}
          <button type="button" data-draft disabled={busy !== null || !unitId || overLimit} onClick={() => void makeDraft()} className={`${PRIMARY} self-start`}>
            {t('cp.draft')}
          </button>
          {busy === 'draft' && (
            <p role="status" className="text-sm text-slate/70">
              {t('w20c.writing')}
            </p>
          )}
          {problem && (
            <p role="alert" data-copilot-problem className="rounded-md bg-tangerine/10 px-3 py-3 text-sm font-semibold text-slate">
              {t(problem)}
            </p>
          )}

          {text !== null && (
            <div data-copilot-draft className="flex flex-col gap-3 border-t border-slate/10 pt-3">
              <Textarea id="cp-text" label={t(approved ? 'w20c.approvedWords' : 'cp.check')} rows={10} maxLength={8000} readOnly={approved} value={text} onChange={(e) => setText(e.target.value)} />
              {!approved ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-approve disabled={busy !== null || !text.trim()} onClick={() => (setApproved(true), setProblem(null))} className={PRIMARY}>
                    {t('w20c.approve')}
                  </button>
                  <button type="button" className={TAP} onClick={reset}>
                    {t('cp.discard')}
                  </button>
                </div>
              ) : (
                <div data-copilot-use className="flex flex-col gap-3">
                  <p className="text-sm text-slate/70">{t('w20c.useHow')}</p>
                  <div className="flex flex-wrap gap-2">
                    {kind === 'lesson_plan' && (
                      <button type="button" data-keep disabled={busy !== null} onClick={() => void keepNote()} className={PRIMARY}>
                        {t('w20c.keepPlan')}
                      </button>
                    )}
                    {kind === 'worksheet' && (
                      <>
                        <button type="button" data-set-homework disabled={busy !== null || homework !== null} onClick={openHomework} className={PRIMARY}>
                          {t('w20c.setHomework')}
                        </button>
                        <button type="button" data-keep disabled={busy !== null} onClick={() => void keepNote()} className={TAP}>
                          {t('w20c.keepWorksheet')}
                        </button>
                      </>
                    )}
                    {kind === 'pulse_message' && (
                      <button type="button" data-to-pulse disabled={busy !== null} onClick={() => void toPulse()} className={PRIMARY}>
                        {t('w20c.toPulse')}
                      </button>
                    )}
                    <button type="button" className={TAP} disabled={busy !== null} onClick={() => (setApproved(false), setHomework(null))}>
                      {t('w20c.changeAgain')}
                    </button>
                  </div>

                  {homework && (
                    <div data-homework-form className="flex flex-col gap-3 rounded-md bg-off-white p-3">
                      <Input id="cp-hw-title" label={t('hw.what')} maxLength={HOMEWORK_TITLE_MAX} value={homework.title} onChange={(e) => setHomework({ ...homework, title: e.target.value })} />
                      <Input id="cp-hw-due" type="date" label={t('hw.due')} min={today} value={homework.dueDate} onChange={(e) => setHomework({ ...homework, dueDate: e.target.value })} />
                      <fieldset className="flex flex-col gap-2">
                        <legend className="text-sm font-medium text-slate">{t('hw.sections')}</legend>
                        <div className="flex flex-wrap gap-x-4">
                          {sections.map((p) => (
                            <Checkbox
                              key={p.class_id}
                              id={`cp-hw-class-${p.class_id}`}
                              label={p.class_name}
                              checked={homework.classIds.includes(p.class_id)}
                              onChange={() => setHomework({ ...homework, classIds: homework.classIds.includes(p.class_id) ? homework.classIds.filter((c) => c !== p.class_id) : [...homework.classIds, p.class_id] })}
                            />
                          ))}
                        </div>
                      </fieldset>
                      <p className="text-sm text-slate/70">{t('w20c.hw.noAnswers')}</p>
                      <button type="button" data-set-go disabled={busy !== null} onClick={() => void setAsHomework()} className={`${PRIMARY} self-start`}>
                        {t('w20c.hw.go')}
                      </button>
                    </div>
                  )}
                </div>
              )}
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
