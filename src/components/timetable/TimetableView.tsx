'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';
import { CSV_HEADER, WEEKDAYS, type ImportProblem } from '@/lib/timetable/plan';

// The timetable screen (docs/20 5c, C145). The office picks a class and
// fills its week one period at a time, or imports a CSV; a clash (a teacher
// in two places at once) is refused and the two entries are named. A
// teacher sees their own week. Each day is its own block, so the same
// layout reads on a phone and fills a wide screen.

type Entry = { entry_id: string; class_id: string; class_name: string; weekday: number; period: number; subject_id: string; subject_name: string; teacher_user_id: string; teacher_name: string };
type Choices = { classes: { class_id: string; name: string }[]; subjects: { subject_id: string; name: string }[]; teachers: { user_id: string; name: string }[] };
type Editing = { weekday: number; period: number; subjectId: string; teacherUserId: string; saved: boolean };
// A period this teacher covers today for a teacher on leave (Proxy Auto, C202): the period, class and subject.
type CoverToday = { substitution_id: string; on_date: string; period: number; class_name: string; subject_name: string };

const TAP = 'min-h-[48px] rounded-md border px-3 text-left text-sm';
const dayKey = (weekday: number) => `tt.day.${WEEKDAYS[weekday - 1]}` as MessageKey;

export function TimetableView({ office, teacher, covers: showCovers = false }: { office: boolean; teacher: boolean; covers?: boolean }) {
  const { t, tCount, lang } = useT();
  const toast = useToast();
  const [choices, setChoices] = useState<Choices>({ classes: [], subjects: [], teachers: [] });
  const [periods, setPeriods] = useState(0);
  const [classId, setClassId] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [clash, setClash] = useState<Entry | null>(null);
  const [csv, setCsv] = useState('');
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [busy, setBusy] = useState(false);
  // A teacher sees their own week; everyone else picks a class.
  const mine = teacher;
  // A teacher's covers today sit above their week. Read from Proxy Auto, which answers a teacher with their own
  // covers only. The page asks for them only when the school has that module on; with nothing to cover, nothing
  // is drawn.
  const [covers, setCovers] = useState<CoverToday[]>([]);
  useEffect(() => {
    if (!mine || !showCovers) return;
    fetch('/api/app/proxy')
      .then(async (res) => (res.ok ? ((await res.json()) as { today: string; mine?: CoverToday[] }) : null))
      .then((body) => setCovers(body?.mine?.filter((c) => c.on_date === body.today) ?? []))
      .catch(() => setCovers([]));
  }, [mine, showCovers]);

  const load = useCallback(
    async (id: string) => {
      setState('loading');
      try {
        const res = await fetch(mine ? '/api/app/timetable?mine=1' : `/api/app/timetable?classId=${id}`);
        const body = await res.json();
        if (!res.ok) throw new Error('not loaded');
        setEntries(body.entries);
        setPeriods(body.periods);
        setState('ready');
      } catch {
        setEntries([]);
        setState('failed');
      }
    },
    [mine]
  );

  useEffect(() => {
    if (mine) {
      void load('');
      return;
    }
    fetch('/api/app/timetable')
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error('not loaded');
        setChoices({ classes: body.classes, subjects: body.subjects, teachers: body.teachers });
        setPeriods(body.periods);
        setState('ready');
      })
      .catch(() => setState('failed'));
  }, [mine, load]);

  useEffect(() => {
    if (!mine && classId) void load(classId);
  }, [mine, classId, load]);

  const at = (weekday: number, period: number) => entries.filter((e) => e.weekday === weekday && e.period === period);
  // Monday to Saturday; Sunday only when something is on it.
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d < 7 || entries.some((e) => e.weekday === 7));
  const rows = Math.max(periods, ...entries.map((e) => e.period));

  async function save() {
    if (!editing || !editing.subjectId || !editing.teacherUserId) return;
    setBusy(true);
    setClash(null);
    const res = await fetch('/api/app/timetable', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId, weekday: editing.weekday, period: editing.period, subjectId: editing.subjectId, teacherUserId: editing.teacherUserId }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (res?.ok) {
      toast.show(t('tt.saved'), 'success');
      setEditing(null);
      void load(classId);
    } else if (body.code === 'teacher_clash') {
      setClash(body.clash as Entry);
    } else {
      toast.show(t('tt.save.failed'), 'danger');
    }
  }

  async function clear() {
    if (!editing) return;
    setBusy(true);
    const res = await fetch('/api/app/timetable', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId, weekday: editing.weekday, period: editing.period }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast.show(t('tt.save.failed'), 'danger');
      return;
    }
    toast.show(t('tt.cleared'), 'success');
    setEditing(null);
    void load(classId);
  }

  async function importCsv() {
    setBusy(true);
    setProblems([]);
    const res = await fetch('/api/app/timetable/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (res?.ok) {
      toast.show(tCount('tt.import.done', body.imported), 'success');
      setCsv('');
      if (classId) void load(classId);
    } else if (Array.isArray(body.problems)) {
      setProblems(body.problems);
    } else {
      toast.show(t('tt.import.failed'), 'danger');
    }
  }

  const problemText = (p: ImportProblem) =>
    t(`tt.problem.${p.code}` as MessageKey, { value: p.value ?? '', with: p.with === 'saved' ? t('tt.problem.saved') : p.with ? t('tt.problem.line', { line: p.with }) : '' });

  return (
    <section lang={lang} className="flex flex-col gap-4">
      {!mine && (
        <div className="max-w-xs">
          <Select id="timetable-class" label={t('tt.class')} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('tt.class.choose')}</option>
            {choices.classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {mine && covers.length > 0 && (
        <div data-timetable-covers className="flex flex-col gap-2 rounded-xl border border-slate/20 bg-white p-3">
          <h2 className="text-sm font-bold text-slate">{t('px.tt.title')}</h2>
          <ul className="flex flex-col gap-1">
            {covers.map((c) => (
              <li key={c.substitution_id} className="rounded-md bg-off-white px-3 py-2 text-sm font-semibold text-slate">
                {t('px.tt.line', { period: c.period, class: c.class_name, subject: c.subject_name })}
              </li>
            ))}
          </ul>
          <Link href="/app/proxy" className="inline-flex min-h-[48px] items-center self-start text-sm font-semibold text-sapphire underline">
            {t('px.tt.open')}
          </Link>
        </div>
      )}

      {state === 'loading' && (
        <p role="status" className="text-sm text-slate/70">
          {t('tt.loading')}
        </p>
      )}
      {state === 'failed' && <TeachEmpty id="not-loaded" />}
      {state === 'ready' && mine && entries.length === 0 && <TeachEmpty id="timetable-teacher" />}
      {state === 'ready' && !mine && choices.classes.length === 0 && <TeachEmpty id="timetable-no-classes" href={office ? '/app/students' : undefined} />}
      {state === 'ready' && !mine && classId && !office && entries.length === 0 && <TeachEmpty id="timetable-empty-view" />}

      {state === 'ready' && (mine ? entries.length > 0 : classId && (office || entries.length > 0)) && (
        <div data-timetable className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {days.map((d) => (
            <div key={d} data-day={d} className="flex flex-col gap-1 rounded-xl border border-slate/10 bg-white p-3">
              <h2 className="text-sm font-bold text-slate">{t(dayKey(d))}</h2>
              {Array.from({ length: rows }, (_, i) => i + 1).map((p) => {
                const here = at(d, p);
                const words = here.length === 0 ? t('tt.free') : here.map((e) => (mine ? `${e.class_name} · ${e.subject_name}` : `${e.subject_name} · ${e.teacher_name}`)).join(' / ');
                const label = `${t('tt.period', { period: p })}: ${words}`;
                return office ? (
                  <button
                    key={p}
                    type="button"
                    data-slot={`${d}-${p}`}
                    onClick={() => {
                      setClash(null);
                      setEditing({ weekday: d, period: p, subjectId: here[0]?.subject_id ?? '', teacherUserId: here[0]?.teacher_user_id ?? '', saved: here.length > 0 });
                    }}
                    className={`${TAP} ${here.length ? 'border-slate/20 font-semibold text-slate' : 'border-dashed border-slate/20 text-slate/70'} hover:bg-slate/5`}
                  >
                    {label}
                  </button>
                ) : (
                  (mine ? here.length > 0 : true) && (
                    <p key={p} data-slot={`${d}-${p}`} className={`rounded-md px-3 py-2 text-sm ${here.length ? 'bg-off-white font-semibold text-slate' : 'text-slate/70'}`}>
                      {label}
                    </p>
                  )
                );
              })}
              {mine && !entries.some((e) => e.weekday === d) && <p className="px-3 py-2 text-sm text-slate/70">{t('tt.day.none')}</p>}
            </div>
          ))}
        </div>
      )}

      {office && state !== 'failed' && (
        <details data-timetable-import className="rounded-xl border border-slate/10 bg-white p-3">
          <summary className="min-h-[48px] cursor-pointer py-3 text-sm font-semibold text-sapphire">{t('tt.import.title')}</summary>
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-sm text-slate">{t('tt.import.how')}</p>
            <pre className="overflow-x-auto rounded-md bg-off-white p-2 text-xs text-slate">{`${CSV_HEADER.join(',')}\n5-A,MON,1,Maths,teacher@school.example`}</pre>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label={t('tt.import.file')}
              className="min-h-[48px] text-sm text-slate"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCsv(await file.text());
              }}
            />
            <textarea aria-label={t('tt.import.text')} value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} className="rounded-md border border-slate/20 p-2 font-mono text-xs text-slate" />
            <button type="button" disabled={busy || !csv.trim()} onClick={importCsv} className="min-h-[48px] self-start rounded-md bg-sapphire px-6 text-sm font-semibold text-white disabled:opacity-60">
              {t('tt.import.go')}
            </button>
            {problems.length > 0 && (
              <div role="alert" data-import-problems className="rounded-md border border-red-800/30 p-3 text-sm text-slate">
                <p className="font-semibold text-red-800">{t('tt.import.nothing')}</p>
                <ul className="mt-1 list-disc pl-5">
                  {problems.map((p, i) => (
                    <li key={`${p.line}-${p.code}-${i}`}>
                      {t('tt.problem.line', { line: p.line })}: {problemText(p)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? `${t(dayKey(editing.weekday))} · ${t('tt.period', { period: editing.period })}` : ''}>
        {editing && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Select id="timetable-subject" label={t('tt.subject')} value={editing.subjectId} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })} required>
              <option value="">{t('tt.subject.choose')}</option>
              {choices.subjects.map((s) => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select id="timetable-teacher" label={t('tt.teacher')} value={editing.teacherUserId} onChange={(e) => setEditing({ ...editing, teacherUserId: e.target.value })} required>
              <option value="">{t('tt.teacher.choose')}</option>
              {choices.teachers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name}
                </option>
              ))}
            </Select>
            {clash && (
              <p role="alert" data-clash className="rounded-md border border-red-800/30 p-3 text-sm text-red-800">
                {t('tt.clash', { teacher: clash.teacher_name, class: clash.class_name, subject: clash.subject_name, day: t(dayKey(clash.weekday)), period: clash.period })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="min-h-[48px] rounded-md bg-sapphire px-6 text-sm font-semibold text-white disabled:opacity-60">
                {t('tt.save')}
              </button>
              {editing.saved && (
                <button type="button" disabled={busy} onClick={clear} className="min-h-[48px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate">
                  {t('tt.clear')}
                </button>
              )}
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
