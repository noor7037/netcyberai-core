'use client';

import { useCallback, useEffect, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';

// Homework Recovery v1 (docs/20 5g, C152): the students marked "not done"
// for several homeworks in the last school days, each with a suggested
// catch-up plan (one homework a school day, the oldest first). The teacher
// approves the plan or dismisses it. An approved plan waits for the parent
// message that starts with WhatsApp; nothing is sent from here. The list is
// by name; it does not rank children.

type Item = { targetId: string; title: string; subject: string; dueDate: string; catchUpBy: string };
type Candidate = { student_id: string; student_name: string; class_name: string; plan: Item[] };
type Plan = { plan_id: string; student_name: string; class_name: string; status: 'approved' | 'dismissed'; items: Item[] };
type Data = { from: string; threshold: number; windowDays: number; candidates: Candidate[]; decided: Plan[] };
const TAP = 'min-h-[48px] rounded-md border px-4 text-sm font-semibold';

export function RecoveryView() {
  const { t, tCount, lang } = useT();
  const toast = useToast();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/app/recovery');
      const body = await res.json();
      if (!res.ok) throw new Error('not loaded');
      setData(body);
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(c: Candidate, status: 'approved' | 'dismissed') {
    setBusy(c.student_id);
    const res = await fetch('/api/app/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: c.student_id, status }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      toast.show(t('rec.failed'), 'danger');
      void load();
      return;
    }
    toast.show(t(status === 'approved' ? 'rec.approved' : 'rec.dismissed'), 'success');
    void load();
  }

  if (state === 'loading')
    return (
      <p role="status" lang={lang} className="text-sm text-slate/70">
        {t('rec.loading')}
      </p>
    );
  if (state === 'failed' || !data) return <TeachEmpty id="not-loaded" />;

  const planList = (items: Item[]) => (
    <ol className="flex flex-col gap-1">
      {items.map((i) => (
        <li key={i.targetId} className="rounded-md bg-off-white px-3 py-2">
          <span className="font-semibold">{`${i.subject}: ${i.title}`}</span>
          <span className="block text-slate/70">{t('rec.item', { due: i.dueDate, by: i.catchUpBy })}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <section lang={lang} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-base font-bold text-slate">{tCount('rec.count', data.candidates.length)}</h2>
        <InfoTip>{t('rec.rule', { threshold: data.threshold, days: data.windowDays, from: data.from })}</InfoTip>
      </div>
      {data.candidates.length === 0 && <TeachEmpty id="recovery" />}
      <ul className="flex flex-col gap-3">
        {data.candidates.map((c) => (
          <li key={c.student_id} data-candidate className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
            <p className="text-base font-semibold">{`${c.student_name} · ${c.class_name}`}</p>
            <p>{tCount('rec.missed', c.plan.length)}</p>
            <p className="font-semibold">{t('rec.plan')}</p>
            {planList(c.plan)}
            <div className="flex flex-wrap gap-2">
              <button type="button" data-approve disabled={busy === c.student_id} className="min-h-[48px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void decide(c, 'approved')}>
                {t('rec.approve')}
              </button>
              <button type="button" disabled={busy === c.student_id} className={`${TAP} border-slate/20 text-slate`} onClick={() => void decide(c, 'dismissed')}>
                {t('rec.dismiss')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {data.decided.length > 0 && (
        <details data-decided className="rounded-lg border border-slate/10 bg-white p-4">
          <summary className="min-h-[48px] cursor-pointer py-3 text-sm font-semibold text-sapphire">{tCount('rec.decided', data.decided.length)}</summary>
          <p className="pb-2 text-sm text-slate/70">{t('rec.notSent')}</p>
          <ul className="flex flex-col gap-3">
            {data.decided.map((p) => (
              <li key={p.plan_id} className="flex flex-col gap-2 border-t border-slate/10 pt-2 text-sm text-slate">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{`${p.student_name} · ${p.class_name}`}</span>
                  <Badge variant={p.status === 'approved' ? 'success' : 'neutral'}>{t(p.status === 'approved' ? 'rec.status.approved' : 'rec.status.dismissed')}</Badge>
                </span>
                {p.status === 'approved' && planList(p.items)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
