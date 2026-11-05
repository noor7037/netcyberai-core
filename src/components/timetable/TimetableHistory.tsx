'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Select } from '@/components/ui/Select';
import type { MessageKey } from '@/lib/i18n';
import { WEEKDAYS } from '@/lib/timetable/plan';
import type { ChangeHistory, ChangeLine } from '@/lib/timetable/changes';

// The timetable's history (W21-M3): every period that changed in the last 30 days, newest first, what it was and what it
// became, who and when, and the reason if one was given. Filter by class or by teacher. A teacher is shown their own
// classes' history only (the database decides; the screen asks for no more).

type Choices = { classes: { class_id: string; name: string }[]; teachers: { user_id: string; name: string }[] };

export function TimetableHistory({ office }: { office: boolean }) {
  const { t, lang } = useT();
  const [choices, setChoices] = useState<Choices>({ classes: [], teachers: [] });
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [data, setData] = useState<ChangeHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void fetch('/api/app/timetable')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setChoices({ classes: b.classes ?? [], teachers: b.teachers ?? [] }))
      .catch(() => undefined);
  }, []);
  const load = useCallback(async () => {
    const q = new URLSearchParams({ history: '1' });
    if (classId) q.set('classId', classId);
    if (teacherId) q.set('teacherUserId', teacherId);
    const res = await fetch(`/api/app/timetable?${q}`).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as ChangeHistory | null) : null;
    setFailed(!body);
    if (body) setData(body);
  }, [classId, teacherId]);
  useEffect(() => {
    void load();
  }, [load]);

  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const slot = (subject: string | null, teacher: string | null) => (subject ? `${subject}${teacher ? ` (${teacher})` : ''}` : t('w21m3.tt.empty'));
  const line = (c: ChangeLine) => (
    <li key={c.change_id} data-timetable-change={c.kind} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3 text-sm text-slate">
      <p className="font-bold">
        {c.class_name} · {t(`tt.day.${WEEKDAYS[c.weekday - 1]}` as MessageKey)} · {t('tt.period', { period: c.period })}
      </p>
      <p className="break-words">
        {slot(c.before_subject, c.before_teacher)} → {slot(c.after_subject, c.after_teacher)}
      </p>
      <p className="text-slate/70">
        {t(`w21m3.tt.kind.${c.kind}` as MessageKey)} · {when.format(new Date(c.at))}
        {c.changed_by_name ? ` · ${t('w21m3.tt.by', { name: c.changed_by_name })}` : ''}
      </p>
      {c.reason && <p data-timetable-change-reason className="break-words">{t('w21m3.tt.reasonLine', { reason: c.reason })}</p>}
    </li>
  );

  return (
    <section data-timetable-history aria-labelledby="timetable-history-title" className="flex flex-col gap-3 rounded-md border border-slate/10 p-4">
      <h2 id="timetable-history-title" className="text-lg font-bold text-midnight">
        {t('w21m3.tt.title')}
      </h2>
      <p className="text-sm text-slate/70">{t('w21m3.tt.days', { days: data?.days ?? 30 })}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select id="timetable-history-class" label={t('tt.class')} value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t('w21m3.tt.all')}</option>
          {choices.classes.map((c) => (
            <option key={c.class_id} value={c.class_id}>
              {c.name}
            </option>
          ))}
        </Select>
        {office && (
          <Select id="timetable-history-teacher" label={t('tt.teacher')} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">{t('w21m3.tt.all')}</option>
            {choices.teachers.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {failed && <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('w21m3.tt.failed')}</p>}
      {data && data.changes.length === 0 && <p data-timetable-history-empty className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('w21m3.tt.none')}</p>}
      {data && data.changes.length > 0 && <ul className="flex flex-col gap-2">{data.changes.map(line)}</ul>}
      {data?.cut && <p role="status" className="text-sm font-semibold text-slate">{t('w21m3.tt.cut')}</p>}
    </section>
  );
}
