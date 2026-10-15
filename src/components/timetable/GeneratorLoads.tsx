'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { CARD, namer, PRIMARY, SECONDARY, send, type GeneratorData } from './generator-ui';

// The periods each class needs (C229): for a class, each subject with its periods a week and its teacher. When Setup
// gives that subject in that class to teachers (who teaches what, on the Staff screen, C231), only they are offered,
// and the server refuses another; with none, every active teacher is. The class's total is shown against its week,
// so a class that asks for more than its week has is seen before a proposal is made.

type Form = { subjectId: string; periods: string; teacherUserId: string };
const EMPTY: Form = { subjectId: '', periods: '', teacherUserId: '' };

export function GeneratorLoads({ data, onChanged }: { data: GeneratorData; onChanged: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const names = namer(data.names);
  const [classId, setClassId] = useState('');
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const week = data.rules.days.length * data.rules.periods;
  const used = (id: string) => data.loads.filter((l) => l.classId === id).reduce((n, l) => n + l.periods, 0);
  const mine = data.loads.filter((l) => l.classId === classId).sort((a, b) => names.subject(a.subjectId).localeCompare(names.subject(b.subjectId)));
  const assigned = new Set(data.assigned.filter((a) => a.classId === classId && a.subjectId === form.subjectId).map((a) => a.teacherUserId));
  const teachers = data.names.teachers.filter((p) => p.active && (assigned.size === 0 || assigned.has(p.id)));

  const pickSubject = (subjectId: string) => {
    const saved = data.loads.find((l) => l.classId === classId && l.subjectId === subjectId);
    const offered = data.assigned.filter((a) => a.classId === classId && a.subjectId === subjectId).map((a) => a.teacherUserId);
    setForm({ subjectId, periods: saved ? String(saved.periods) : form.periods, teacherUserId: saved?.teacherUserId ?? (offered.length === 1 ? offered[0] : '') });
  };

  async function save() {
    const periods = Number(form.periods);
    if (!classId || !form.subjectId || !form.teacherUserId || !Number.isInteger(periods)) return;
    setBusy(true);
    const r = await send('/api/app/timetable/generator/constraints', 'PUT', { kind: 'load', classId, subjectId: form.subjectId, periods, teacherUserId: form.teacherUserId });
    setBusy(false);
    if (!r.ok) {
      toast.show(t(r.body.code === 'not_assigned' ? 'ttg.loads.notAssigned' : 'ttg.loads.failed'), 'danger');
      return;
    }
    toast.show(t('ttg.loads.saved'), 'success');
    setForm(EMPTY);
    onChanged();
  }

  async function remove(subjectId: string) {
    setBusy(true);
    const r = await send('/api/app/timetable/generator/constraints', 'DELETE', { kind: 'load', classId, subjectId });
    setBusy(false);
    toast.show(t(r.ok ? 'ttg.loads.removed' : 'ttg.loads.failed'), r.ok ? 'success' : 'danger');
    if (r.ok) onChanged();
  }

  return (
    <section data-ttg-loads className={CARD} aria-labelledby="ttg-loads-title">
      <h2 id="ttg-loads-title" className="text-base font-bold text-slate">
        {t('ttg.loads.title')}
      </h2>
      <p className="text-sm text-slate">{t('ttg.loads.how')}</p>
      {data.names.classes.length === 0 || data.names.subjects.length === 0 ? (
        <p className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ttg.loads.noClasses')}</p>
      ) : (
        <>
          <div className="max-w-sm">
            <Select
              id="ttg-class"
              label={t('tt.class')}
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setForm(EMPTY);
              }}
            >
              <option value="">{t('tt.class.choose')}</option>
              {data.names.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {t('ttg.loads.classOption', { class: c.name, used: used(c.id), week })}
                </option>
              ))}
            </Select>
          </div>
          {classId && (
            <>
              <p data-ttg-class-total className={`text-sm ${used(classId) > week ? 'font-semibold text-red-800' : 'text-slate'}`}>
                {t(used(classId) > week ? 'ttg.loads.over' : 'ttg.loads.total', { used: used(classId), week })}
              </p>
              {mine.length === 0 ? (
                <p className="text-sm text-slate/70">{t('ttg.loads.none')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mine.map((l) => {
                    const teacher = data.names.teachers.find((p) => p.id === l.teacherUserId);
                    return (
                      <li key={l.subjectId} data-ttg-load={l.subjectId} className="flex flex-wrap items-center gap-2 rounded-md bg-off-white px-3 py-2">
                        <span className="min-w-0 flex-1 text-sm font-semibold text-slate">
                          {t('ttg.loads.line', { subject: names.subject(l.subjectId), count: l.periods, teacher: teacher?.active === false ? t('ttg.loads.teacherGone', { name: teacher.name }) : names.teacher(l.teacherUserId) })}
                        </span>
                        <button type="button" disabled={busy} onClick={() => pickSubject(l.subjectId)} className={SECONDARY}>
                          {t('ttg.loads.change')}
                        </button>
                        <button type="button" disabled={busy} onClick={() => remove(l.subjectId)} className={SECONDARY}>
                          {t('ttg.loads.remove')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <form
                data-ttg-load-form
                className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <Select id="ttg-subject" label={t('tt.subject')} value={form.subjectId} onChange={(e) => pickSubject(e.target.value)} required>
                  <option value="">{t('tt.subject.choose')}</option>
                  {data.names.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ttg-periods" className="text-sm font-medium text-slate">
                    {t('ttg.loads.periods')}
                  </label>
                  <input
                    id="ttg-periods"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={week || 1}
                    required
                    value={form.periods}
                    onChange={(e) => setForm({ ...form, periods: e.target.value })}
                    className="min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate"
                  />
                </div>
                <Select id="ttg-teacher" label={t('tt.teacher')} value={form.teacherUserId} onChange={(e) => setForm({ ...form, teacherUserId: e.target.value })} required>
                  <option value="">{t('tt.teacher.choose')}</option>
                  {teachers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {assigned.has(p.id) ? t('ttg.loads.assigned', { name: p.name }) : p.name}
                    </option>
                  ))}
                </Select>
                <button type="submit" data-ttg-load-save disabled={busy} className={PRIMARY}>
                  {t('ttg.loads.save')}
                </button>
              </form>
              {form.subjectId && assigned.size > 0 && (
                <p data-ttg-assigned-only className="text-sm text-slate/70">
                  {t('ttg.loads.assignedOnly')}{' '}
                  {data.mayEditSettings && (
                    <a href="/app/staff#teacher-subjects" className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
                      {t('ttg.loads.assignedWhere')}
                    </a>
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
