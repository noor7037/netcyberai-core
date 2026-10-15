'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';

// What I teach, on a teacher's account page (docs/28 slice 10g, C231): the subjects and classes the office has given
// them, and a proposal of one that is missing. A proposal changes nothing until the principal or the school admin
// confirms it on Staff; the teacher sees it waiting, confirmed or declined. No words are typed: a class and a subject.

type Named = { id: string; name: string };
type Assignment = { classId: string; subjectId: string };
type Request = { requestId: string; classId: string; subjectId: string; state: 'pending' | 'confirmed' | 'declined'; requestedAt: string; decidedAt: string | null };
type Data = { classes: Named[]; subjects: Named[]; assignments: Assignment[]; requests: Request[] };

const BOX = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const EMPTY = { classId: '', subjectId: '' };
const REFUSED: Record<string, MessageKey> = { already_assigned: 'ms.refused.assigned', already_requested: 'ms.refused.waiting' };

export function MySubjectsPanel() {
  const { t, lang } = useT();
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

  async function propose() {
    if (!form.classId || !form.subjectId) return;
    setBusy(true);
    const res = await fetch('/api/app/subjects/assignments/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    const answer = ((await res?.json().catch(() => null)) ?? {}) as { code?: string };
    setBusy(false);
    if (res?.ok) {
      toast.show(t('ms.sent'), 'success');
      setForm(EMPTY);
    } else toast.show(t(REFUSED[answer.code ?? ''] ?? 'ms.failed'), 'danger');
    await load();
  }

  if (failed && !data)
    return (
      <section lang={lang} data-my-subjects="failed" className={`${BOX} w-full max-w-2xl text-sm text-slate`}>
        <h2 className="text-base font-bold">{t('ms.title')}</h2>
        <p role="alert" className="rounded-md bg-off-white px-3 py-2">
          {t('ms.failed.load')}
        </p>
      </section>
    );
  if (!data) return null;

  return (
    <section lang={lang} data-my-subjects className={`${BOX} w-full max-w-2xl text-sm text-slate`} aria-labelledby="ms-title">
      <h2 id="ms-title" className="text-base font-bold">
        {t('ms.title')}
      </h2>
      <p className="text-slate/70">{t('ms.how')}</p>
      {data.assignments.length === 0 ? (
        <p data-my-subjects-none className="rounded-md bg-off-white px-3 py-2">
          {t('ms.none')}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {data.assignments.map((a) => (
            <li key={`${a.classId}:${a.subjectId}`} data-my-subject={`${a.classId}:${a.subjectId}`} className="rounded-md bg-off-white px-3 py-2 font-semibold">
              {t('ts.line', { subject: name(data.subjects, a.subjectId), class: name(data.classes, a.classId) })}
            </li>
          ))}
        </ul>
      )}

      <form
        data-my-subjects-form
        className="grid gap-3 border-t border-slate/10 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void propose();
        }}
      >
        <Select id="ms-class" label={t('ts.class')} value={form.classId} required onChange={(e) => setForm({ ...form, classId: e.target.value })}>
          <option value="">{t('ts.class.choose')}</option>
          {data.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select id="ms-subject" label={t('ts.subject')} value={form.subjectId} required onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
          <option value="">{t('ts.subject.choose')}</option>
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <button type="submit" data-my-subjects-send disabled={busy} className={PRIMARY}>
          {t('ms.send')}
        </button>
      </form>

      {data.requests.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="font-bold">{t('ms.requests')}</h3>
          <ul className="flex flex-col gap-1">
            {data.requests.map((r) => (
              <li key={r.requestId} data-my-request={r.state}>
                {t(`ms.request.${r.state}` as MessageKey, { subject: name(data.subjects, r.subjectId), class: name(data.classes, r.classId), date: when(r.decidedAt ?? r.requestedAt) })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
