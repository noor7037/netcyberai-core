'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { useOffline } from '@/components/app-shell/OfflineContext';
import { useShownRefresh } from '@/components/dashboards/useShownRefresh';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { HOMEWORK_CHECK, HOMEWORK_KEY, homeworkRosterKey, type HomeworkCheck } from '@/lib/offline/homework-sender';
import type { Operation } from '@/lib/offline/outbox';

// The homework screen (docs/20 5e, C150). Set a homework once and tick the
// sections it is for: each section gets its own assignment, checked on its
// own. Changing a homework later asks which sections' copies should change.
// Checking who has done it works with no network: it waits in the outbox
// and is sent when the network returns. Setting, changing and files need
// the network.
//
// `shownAbove` (C210): the page was opened from a dashboard number, and the
// assignments behind it are drawn above this screen. After a change the
// server now holds, that list is read again too.

type Assignment = { target_id: string; homework_id: string; class_id: string; class_name: string; subject_name: string; title: string; details: string | null; due_date: string; students: number; checked: number; done: number; files: number; siblings: { target_id: string; class_name: string }[] };
type Choice = { classes: { class_id: string; name: string }[]; subjects: { subject_id: string; name: string }[] };
type Row = { student_id: string; name: string; roll_no: string | null; done: boolean | null };
type FileRow = { attachment_id: string; file_name: string };
type Kept = { today: string; assignments: Assignment[] } & Choice;
type KeptRoster = { roster: Row[]; files: FileRow[] };

const TAP = 'min-h-[48px] rounded-md border px-4 text-sm font-semibold';
const PRIMARY = 'min-h-[48px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function HomeworkView({ shownAbove = false }: { shownAbove?: boolean }) {
  const { t, tCount, lang } = useT();
  const refreshShown = useShownRefresh(shownAbove);
  const { ready, online, store, sync, queue, operations } = useOffline();
  const toast = useToast();
  const [data, setData] = useState<Kept | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'phone' | 'none' | 'failed'>('loading');
  const [form, setForm] = useState({ subjectId: '', title: '', details: '', dueDate: '', classIds: [] as string[] });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [roster, setRoster] = useState<KeptRoster | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [waiting, setWaiting] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ a: Assignment; title: string; details: string; dueDate: string; applyTo: string[] } | null>(null);
  const reloadWhenSaved = useRef(false);

  const loadWaiting = useCallback(async () => {
    const ops = (await operations().catch(() => [])).filter((o) => o.kind === HOMEWORK_CHECK && o.state === 'waiting') as Operation<HomeworkCheck>[];
    setWaiting(new Set(ops.map((o) => o.payload.targetId)));
  }, [operations]);

  const load = useCallback(async () => {
    let kept: Kept | undefined;
    let from: typeof state = 'ready';
    try {
      const res = await fetch('/api/app/homework');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) from = 'failed';
      else {
        kept = { today: body.today, assignments: body.assignments, classes: body.classes, subjects: body.subjects };
        await store?.put(HOMEWORK_KEY, kept).catch(() => undefined);
      }
    } catch {
      kept = await store?.get<Kept>(HOMEWORK_KEY).catch(() => undefined);
      from = kept ? 'phone' : 'none';
    }
    setData(kept ?? null);
    await loadWaiting();
    setState(from);
  }, [store, loadWaiting]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  // After a change the server now holds (a homework set or changed, a check saved): this screen's own list is read
  // again, and then the list drawn above it, which counts the same assignments.
  const afterChange = async () => {
    await load();
    refreshShown();
  };

  useEffect(() => {
    if (!ready) return;
    if (sync.state === 'saved' && reloadWhenSaved.current) {
      reloadWhenSaved.current = false;
      void afterChange();
    } else if (sync.state !== 'saved') {
      reloadWhenSaved.current = true;
      void loadWaiting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.state]);

  async function setHomework() {
    if (!form.subjectId || !form.title.trim() || !form.dueDate || form.classIds.length === 0) {
      toast.show(t('hw.set.missing'), 'danger');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/app/homework', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    if (!res?.ok) {
      setBusy(false);
      toast.show(t(!res ? 'hw.needsNetwork' : body.code === 'not_your_class' ? 'hw.set.notYours' : body.code === 'due_date' ? 'hw.set.badDate' : 'hw.set.failed'), 'danger');
      return;
    }
    let fileNote = '';
    if (file) {
      const send = new FormData();
      send.append('file', file);
      const up = await fetch(`/api/app/homework/${body.homeworkId}/attachments`, { method: 'POST', body: send }).catch(() => null);
      if (!up?.ok) {
        const why = (await up?.json().catch(() => null))?.code;
        fileNote = ` ${t(why === 'not_a_photo_or_pdf' ? 'hw.file.wrongType' : why === 'too_large' ? 'hw.file.tooLarge' : 'hw.file.notKept')}`;
      }
    }
    setBusy(false);
    toast.show(`${tCount('hw.set.done', form.classIds.length)}${fileNote}`, fileNote ? 'danger' : 'success');
    setForm({ subjectId: form.subjectId, title: '', details: '', dueDate: '', classIds: [] });
    setFile(null);
    void afterChange();
  }

  async function openAssignment(a: Assignment) {
    if (openId === a.target_id) {
      setOpenId(null);
      return;
    }
    setOpenId(a.target_id);
    setRoster(null);
    let kept: KeptRoster | undefined;
    try {
      const res = await fetch(`/api/app/homework/targets/${a.target_id}`);
      const body = await res.json();
      if (!res.ok) throw new Error('not loaded');
      kept = { roster: body.roster, files: body.files };
      await store?.put(homeworkRosterKey(a.target_id), kept).catch(() => undefined);
    } catch {
      kept = await store?.get<KeptRoster>(homeworkRosterKey(a.target_id)).catch(() => undefined);
    }
    setRoster(kept ?? { roster: [], files: [] });
    setAnswers(Object.fromEntries((kept?.roster ?? []).filter((r) => r.done !== null).map((r) => [r.student_id, r.done as boolean])));
  }

  async function saveCheck(a: Assignment) {
    const entries = Object.entries(answers).map(([studentId, done]) => ({ studentId, done }));
    if (entries.length === 0) return;
    setBusy(true);
    reloadWhenSaved.current = true;
    const op = await queue(HOMEWORK_CHECK, data?.today ?? '', { targetId: a.target_id, entries } satisfies HomeworkCheck).catch(() => null);
    if (!op) {
      const res = await fetch(`/api/app/homework/targets/${a.target_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) }).catch(() => null);
      setBusy(false);
      toast.show(t(res?.ok ? 'hw.check.saved' : 'hw.check.failed'), res?.ok ? 'success' : 'danger');
      if (res?.ok) void afterChange();
      return;
    }
    // The list kept on the phone shows what was just marked.
    if (roster) await store?.put(homeworkRosterKey(a.target_id), { ...roster, roster: roster.roster.map((r) => (r.student_id in answers ? { ...r, done: answers[r.student_id] } : r)) }).catch(() => undefined);
    await loadWaiting();
    setBusy(false);
    toast.show(t(online ? 'hw.check.saved' : 'hw.check.queued'), 'success');
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    const res = await fetch(`/api/app/homework/${editing.a.homework_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editing.title, details: editing.details, dueDate: editing.dueDate, applyTo: editing.applyTo }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) {
      toast.show(t(!res ? 'hw.needsNetwork' : body.code === 'due_date' ? 'hw.set.badDate' : 'hw.set.failed'), 'danger');
      return;
    }
    toast.show(t('hw.edit.done', { changed: body.changedTargets.length, left: body.leftAsSent.length }), 'success');
    setEditing(null);
    void afterChange();
  }

  async function openFile(a: Assignment, f: FileRow) {
    const res = await fetch(`/api/app/homework/${a.homework_id}/attachments/${f.attachment_id}`).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    if (res?.ok && typeof body.url === 'string') window.open(body.url, '_blank', 'noopener');
    else toast.show(t(res ? 'hw.file.cannotOpen' : 'hw.needsNetwork'), 'danger');
  }

  if (state === 'loading')
    return (
      <p role="status" lang={lang} className="text-sm text-slate/70">
        {t('hw.loading')}
      </p>
    );
  if (state === 'failed') return <TeachEmpty id="not-loaded" />;
  if (state === 'none' || !data)
    return (
      <p role="status" lang={lang} data-homework-offline className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">
        {t('hw.offline.none')}
      </p>
    );

  const toggleClass = (id: string) => setForm((f) => ({ ...f, classIds: f.classIds.includes(id) ? f.classIds.filter((c) => c !== id) : [...f.classIds, id] }));

  return (
    <section lang={lang} className="flex flex-col gap-5">
      {state === 'phone' && (
        <p role="status" data-homework-offline className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">
          {t('hw.offline.kept')}
        </p>
      )}

      <details data-set-homework className="rounded-lg border border-slate/10 bg-white p-4" open={data.assignments.length === 0}>
        <summary className="min-h-[48px] cursor-pointer py-3 text-base font-bold text-slate">{t('hw.set.title')}</summary>
        {data.classes.length === 0 || data.subjects.length === 0 ? (
          <TeachEmpty id="homework-no-classes" compact />
        ) : (
          <div className="flex flex-col gap-3 pt-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select id="hw-subject" label={t('hw.subject')} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">{t('hw.subject.choose')}</option>
                {data.subjects.map((s) => (
                  <option key={s.subject_id} value={s.subject_id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Input id="hw-due" type="date" label={t('hw.due')} min={data.today} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <Input id="hw-title" label={t('hw.what')} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <label htmlFor="hw-details" className="text-sm font-medium text-slate">
              {t('hw.details')}
            </label>
            <textarea id="hw-details" rows={3} maxLength={2000} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} className="rounded-md border border-slate/20 p-2 text-sm text-slate" />
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-slate">{t('hw.sections')}</legend>
              <div className="flex flex-wrap gap-2">
                {data.classes.map((c) => (
                  <label key={c.class_id} className={`${TAP} flex cursor-pointer items-center gap-2 ${form.classIds.includes(c.class_id) ? 'border-sapphire bg-sapphire/10 text-sapphire' : 'border-slate/20 text-slate'}`}>
                    <input type="checkbox" className="h-5 w-5" checked={form.classIds.includes(c.class_id)} onChange={() => toggleClass(c.class_id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label htmlFor="hw-file" className="text-sm font-medium text-slate">
              {t('hw.file')}
            </label>
            <input id="hw-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="min-h-[48px] text-sm text-slate" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" data-set-go disabled={busy} onClick={() => void setHomework()} className={`${PRIMARY} self-start`}>
              {form.classIds.length > 1 ? tCount('hw.set.goMany', form.classIds.length) : t('hw.set.go')}
            </button>
          </div>
        )}
      </details>

      {data.assignments.length === 0 && <TeachEmpty id="homework" />}

      <ul className="flex flex-col gap-3">
        {data.assignments.map((a) => (
          <li key={a.target_id} data-assignment className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-semibold">{`${a.class_name} · ${a.subject_name}`}</p>
                <p className="font-semibold">{a.title}</p>
                {a.details && <p className="whitespace-pre-line text-slate/70">{a.details}</p>}
              </div>
              <p className="text-right">
                <span className="block font-semibold">{t('hw.dueOn', { date: a.due_date })}</span>
                <span data-completion className="block text-slate/70">
                  {t('hw.completion', { done: a.done, checked: a.checked, students: a.students })}
                </span>
                {waiting.has(a.target_id) && (
                  <span data-waiting className="block text-xs font-semibold text-slate/70">
                    {t('hw.waiting')}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-check className={`${TAP} border-sapphire text-sapphire`} aria-expanded={openId === a.target_id} onClick={() => void openAssignment(a)}>
                {t(openId === a.target_id ? 'hw.check.close' : 'hw.check.open')}
              </button>
              <button type="button" className={`${TAP} border-slate/20 text-slate`} onClick={() => setEditing({ a, title: a.title, details: a.details ?? '', dueDate: a.due_date < data.today ? data.today : a.due_date, applyTo: [a.target_id] })}>
                {t('hw.edit')}
              </button>
            </div>

            {openId === a.target_id && roster && (
              <div data-check-list className="flex flex-col gap-2 border-t border-slate/10 pt-3">
                {roster.files.map((f) => (
                  <button key={f.attachment_id} type="button" className="min-h-[48px] self-start text-left text-sm font-semibold text-sapphire underline" onClick={() => void openFile(a, f)}>
                    {t('hw.file.open', { name: f.file_name })}
                  </button>
                ))}
                {roster.roster.length === 0 ? (
                  <p className="text-slate/70">{t('hw.check.none')}</p>
                ) : (
                  <>
                    <button type="button" data-all-done className={`${TAP} self-start border-slate/20 text-slate`} onClick={() => setAnswers(Object.fromEntries(roster.roster.map((r) => [r.student_id, true])))}>
                      {t('hw.check.allDone')}
                    </button>
                    {roster.roster.map((r) => (
                      <div key={r.student_id} data-check-row className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{r.roll_no ? `${r.roll_no}. ${r.name}` : r.name}</span>
                        <span className="flex gap-1" role="group" aria-label={r.name}>
                          {[true, false].map((v) => (
                            <button key={String(v)} type="button" aria-pressed={answers[r.student_id] === v} onClick={() => setAnswers((x) => ({ ...x, [r.student_id]: v }))} className={`${TAP} ${answers[r.student_id] === v ? 'border-sapphire bg-sapphire/10 text-sapphire' : 'border-slate/10 text-slate'}`}>
                              {t(v ? 'hw.check.done' : 'hw.check.notDone')}
                            </button>
                          ))}
                        </span>
                      </div>
                    ))}
                    <button type="button" data-save-check disabled={busy || Object.keys(answers).length === 0} onClick={() => void saveCheck(a)} className={`${PRIMARY} self-start`}>
                      {t('hw.check.save')}
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t('hw.edit.title')}>
        {editing && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <Input id="hw-edit-title" label={t('hw.what')} maxLength={120} required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <label htmlFor="hw-edit-details" className="text-sm font-medium text-slate">
              {t('hw.details')}
            </label>
            <textarea id="hw-edit-details" rows={3} maxLength={2000} value={editing.details} onChange={(e) => setEditing({ ...editing, details: e.target.value })} className="rounded-md border border-slate/20 p-2 text-sm text-slate" />
            <Input id="hw-edit-due" type="date" label={t('hw.due')} min={data.today} required value={editing.dueDate} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} />
            <fieldset data-apply-to className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-slate">{t('hw.edit.which')}</legend>
              {[{ target_id: editing.a.target_id, class_name: editing.a.class_name }, ...editing.a.siblings].map((s) => (
                <label key={s.target_id} className="flex min-h-[48px] cursor-pointer items-center gap-2 text-sm text-slate">
                  <input type="checkbox" className="h-5 w-5" checked={editing.applyTo.includes(s.target_id)} onChange={() => setEditing({ ...editing, applyTo: editing.applyTo.includes(s.target_id) ? editing.applyTo.filter((x) => x !== s.target_id) : [...editing.applyTo, s.target_id] })} />
                  {s.class_name}
                </label>
              ))}
              <p className="text-sm text-slate/70">{t('hw.edit.note')}</p>
            </fieldset>
            <button type="submit" disabled={busy} className={`${PRIMARY} self-start`}>
              {t('hw.edit.save')}
            </button>
          </form>
        )}
      </Modal>
    </section>
  );
}
