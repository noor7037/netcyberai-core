'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/components/ui/Toast';

// One homework, section by section (W20-D, H4): how many students of each section have done it, the first names of
// those who have not, and "Send to more sections" of the same class level. Needs the network.

type Section = { target_id: string; class_name: string; students: number; done: number; notYet: string[] };
type Choice = { class_id: string; name: string };

const PRIMARY = 'min-h-[48px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function HomeworkSections({ homeworkId, onSent }: { homeworkId: string; onSent: () => void }) {
  const { t, tCount } = useT();
  const toast = useToast();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [sections, setSections] = useState<Section[]>([]);
  const [more, setMore] = useState<Choice[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/app/homework/${homeworkId}/sections`).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? null;
    if (!res?.ok || !body) {
      setState('failed');
      return;
    }
    setSections(body.sections);
    setMore(body.more);
    setPicked([]);
    setState('ready');
  }, [homeworkId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    setBusy(true);
    const res = await fetch(`/api/app/homework/${homeworkId}/sections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classIds: picked }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast.show(t('hw.sections.sendFailed'), 'danger');
      return;
    }
    toast.show(tCount('hw.sections.sent', picked.length), 'success');
    await load();
    onSent();
  }

  if (state === 'loading')
    return (
      <p role="status" className="border-t border-slate/10 pt-3 text-sm text-slate/70">
        {t('hw.sections.loading')}
      </p>
    );
  if (state === 'failed')
    return (
      <p role="status" className="border-t border-slate/10 pt-3 text-sm font-semibold text-slate">
        {t('hw.sections.failed')}
      </p>
    );

  return (
    <div data-sections className="flex flex-col gap-3 border-t border-slate/10 pt-3 text-sm text-slate">
      <ul className="flex flex-col gap-2">
        {sections.map((s) => (
          <li key={s.target_id} data-section className="flex flex-col gap-1">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{s.class_name}</span>
              <span data-section-done className="font-semibold tabular-nums">
                {t('hw.sections.done', { done: s.done, students: s.students })}
              </span>
            </p>
            {s.students > 0 && <p className="text-slate/70">{s.notYet.length === 0 ? t('hw.sections.all') : t('hw.sections.notYet', { names: s.notYet.join(', ') })}</p>}
          </li>
        ))}
      </ul>
      <fieldset data-send-more className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate">{t('hw.sections.more')}</legend>
        {more.length === 0 ? (
          <p className="text-slate/70">{t('hw.sections.moreNone')}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4">
              {more.map((c) => (
                <Checkbox key={c.class_id} id={`hw-more-${homeworkId}-${c.class_id}`} label={c.name} checked={picked.includes(c.class_id)} onChange={() => setPicked((p) => (p.includes(c.class_id) ? p.filter((x) => x !== c.class_id) : [...p, c.class_id]))} />
              ))}
            </div>
            <button type="button" data-send-sections disabled={busy || picked.length === 0} onClick={() => void send()} className={`${PRIMARY} self-start`}>
              {t('hw.sections.send')}
            </button>
          </>
        )}
      </fieldset>
    </div>
  );
}
