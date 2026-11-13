'use client';

import { useState } from 'react';
import { useStepUp } from '@/components/auth/StepUp';
import { useWords } from '@/components/app-shell/Words';
import { Button } from '@/components/ui/Button';

// Control → Family: the Draw tab's daily creation limit (C513), Control's family.draw.daily_creations: how many new
// drawings a child may start in an India day. The count is kept on the child's phone (never on our servers); drawings
// already made still open. 0 stops new drawings; never set reads as 12. Saving asks for the authenticator if this
// session has not shown it, and is audited.
const MAX = 200;

export function DrawDailyForm({ initial }: { initial: number | null }) {
  const { t } = useWords();
  const { stepUpFetch } = useStepUp();
  const [saved, setSaved] = useState<number | null>(initial);
  const [value, setValue] = useState(initial === null ? '' : String(initial));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const n = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  const valid = Number.isInteger(n) && n >= 0 && n <= MAX;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch('/api/control/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'draw_daily', drawings: n }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) setSaved(n);
    setNote(res?.ok ? { ok: true, text: t('control.family.draw.saved') } : { ok: false, text: t('control.family.draw.failed') });
  };

  return (
    <section aria-labelledby="family-draw-daily" data-draw-daily={saved ?? 'unset'} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
      <h2 id="family-draw-daily" className="text-lg font-bold text-slate">
        {t('control.family.draw.title')}
      </h2>
      <p className="text-sm text-slate/80">{t('control.family.draw.lead')}</p>
      <p className="text-sm font-semibold text-slate">{saved === null ? t('control.family.draw.unset') : t('control.family.draw.now', { n: String(saved) })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
          {t('control.family.draw.label')}
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!valid}
            className="min-h-[44px] w-40 rounded-xl border border-slate/30 px-3 text-base"
          />
        </label>
        <Button type="button" onClick={() => void save()} disabled={busy || !valid}>
          {t('control.family.draw.save')}
        </Button>
        {note && (
          <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-emerald-text' : 'text-coral-deep'}`}>
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
