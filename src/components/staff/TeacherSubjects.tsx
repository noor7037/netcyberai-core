'use client';

import { InfoTip } from '@/components/app-ui/InfoTip';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';

// Who teaches what, on Staff, for the principal and the school admin (docs/28 slice 10g, C231): for each teacher,
// the subjects they teach and in which classes, added and taken away here; and the teachers' own proposals, confirmed
// or declined here. What a teacher may read and mark follows these lines (the teacher_scope_* policies), and the
// timetable offers only these teachers for a subject in a class. Every change is saved at once and audited with ids.

type Named = { id: string; name: string };
// A teacher who left but still has subjects here is listed too, marked, so the office can take them away.
type Teacher = Named & { active: boolean };
type Assignment = { teacherUserId: string; classId: string; subjectId: string };
type Request = { requestId: string; teacherUserId: string; classId: string; subjectId: string; requestedAt: string };
type Data = { teachers: Teacher[]; classes: Named[]; subjects: Named[]; assignments: Assignment[]; requests: Request[] };

const BOX = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const TAP = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const EMPTY = { teacherUserId: '', classId: '', subjectId: '' };

const REFUSED: Record<string, MessageKey> = {
  unknown_teacher: 'ts.refused.teacher',
  unknown_class: 'ts.refused.place',
  unknown_subject: 'ts.refused.place',
};

export function TeacherSubjects() {
  const { t, tCount, lang } = useT();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/subjects/assignments').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const name = (list: Named[] | undefined, id: string) => list?.find((x) => x.id === id)?.name ?? '';
  const when = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

  async function send(url: string, method: 'POST' | 'PUT' | 'DELETE', body: unknown, done: MessageKey) {
    setBusy(true);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = ((await res?.json().catch(() => null)) ?? {}) as { code?: string };
    setBusy(false);
    if (res?.ok) toast.show(t(done), 'success');
    else toast.show(t(REFUSED[answer.code ?? ''] ?? 'ts.failed'), 'danger');
    await load();
    return Boolean(res?.ok);
  }

  if (failed && !data)
    return (
      <section lang={lang} id="teacher-subjects" data-teacher-subjects="failed" className={`${BOX} text-sm text-slate`}>
        <h2 className="text-base font-bold">{t('ts.title')}</h2>
        <p role="alert" className="rounded-md bg-off-white px-3 py-2">
          {t('ts.failed.load')}
        </p>
      </section>
    );
  if (!data) return null;

  // Classes in the order the server lists them, the class order (C235-A): "2-A" before "10-A".
  const classAt = (id: string) => data.classes.findIndex((c) => c.id === id);
  const byTeacher = (id: string) =>
    data.assignments
      .filter((a) => a.teacherUserId === id)
      .sort((a, b) => classAt(a.classId) - classAt(b.classId) || name(data.subjects, a.subjectId).localeCompare(name(data.subjects, b.subjectId)));

  return (
    <section lang={lang} id="teacher-subjects" data-teacher-subjects className={`${BOX} text-sm text-slate`} aria-labelledby="ts-title">
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 id="ts-title" className="text-base font-bold">
          {t('ts.title')}
        </h2>
        <InfoTip>{t('ts.how')}</InfoTip>
      </div>

      {data.requests.length > 0 && (
        <div data-subject-requests={data.requests.length} className="flex flex-col gap-2 rounded-md border border-amber/40 bg-amber/10 p-3">
          <h3 className="font-bold">{tCount('ts.requests.title', data.requests.length)}</h3>
          <ul className="flex flex-col gap-2">
            {data.requests.map((r) => (
              <li key={r.requestId} data-subject-request={r.requestId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 break-words">
                  {t('ts.requests.line', { teacher: name(data.teachers, r.teacherUserId), subject: name(data.subjects, r.subjectId), class: name(data.classes, r.classId), date: when(r.requestedAt) })}
                </span>
                <button type="button" data-request-confirm disabled={busy} className={PRIMARY} onClick={() => void send('/api/app/subjects/assignments/requests', 'PUT', { requestId: r.requestId, decision: 'confirm' }, 'ts.requests.confirmed')}>
                  {t('ts.requests.confirm')}
                </button>
                <button type="button" data-request-decline disabled={busy} className={TAP} onClick={() => void send('/api/app/subjects/assignments/requests', 'PUT', { requestId: r.requestId, decision: 'decline' }, 'ts.requests.declined')}>
                  {t('ts.requests.decline')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.teachers.length === 0 ? (
        <p className="rounded-md bg-off-white px-3 py-2">{t('ts.noTeachers')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.teachers.map((p) => {
            const mine = byTeacher(p.id);
            return (
              <li key={p.id} data-teacher-line={p.id} className="flex flex-col gap-2 border-t border-slate/10 pt-3">
                <p className="font-semibold">{p.active ? p.name : t('ts.gone', { name: p.name })}</p>
                {mine.length === 0 ? (
                  <p className="text-slate/70">{t('ts.none')}</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {mine.map((a) => (
                      <li key={`${a.classId}:${a.subjectId}`} data-assignment={`${a.classId}:${a.subjectId}`} className="flex items-center gap-2 rounded-md bg-off-white py-1 pl-3 pr-1">
                        <span>{t('ts.line', { subject: name(data.subjects, a.subjectId), class: name(data.classes, a.classId) })}</span>
                        <button
                          type="button"
                          data-assignment-remove
                          disabled={busy}
                          aria-label={t('ts.removeLabel', { teacher: p.name, subject: name(data.subjects, a.subjectId), class: name(data.classes, a.classId) })}
                          className="min-h-[44px] min-w-[44px] rounded-md px-2 font-semibold text-sapphire underline disabled:opacity-60"
                          onClick={() => void send('/api/app/subjects/assignments', 'DELETE', a, 'ts.removed')}
                        >
                          {t('ts.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data.teachers.some((p) => p.active) && (
        <form
          data-assign-form
          className="grid gap-3 border-t border-slate/10 pt-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.teacherUserId || !form.classId || !form.subjectId) return;
            if (await send('/api/app/subjects/assignments', 'POST', form, 'ts.added')) setForm(EMPTY);
          }}
        >
          <Select id="ts-teacher" label={t('ts.teacher')} value={form.teacherUserId} required onChange={(e) => setForm({ ...form, teacherUserId: e.target.value })}>
            <option value="">{t('ts.teacher.choose')}</option>
            {data.teachers
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <Select id="ts-class" label={t('ts.class')} value={form.classId} required onChange={(e) => setForm({ ...form, classId: e.target.value })}>
            <option value="">{t('ts.class.choose')}</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select id="ts-subject" label={t('ts.subject')} value={form.subjectId} required onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
            <option value="">{t('ts.subject.choose')}</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <button type="submit" data-assign-save disabled={busy} className={PRIMARY}>
            {t('ts.add')}
          </button>
        </form>
      )}
    </section>
  );
}
