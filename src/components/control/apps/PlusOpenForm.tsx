'use client';

import { useState } from 'react';
import { useStepUp } from '@/components/auth/StepUp';
import { useT } from '@/components/app-shell/LangContext';
import { Button } from '@/components/ui/Button';

// Control → Family: Family Plus open to every family, for a pilot (C337). Plus has no checkout before P3 and no school
// sponsors it yet, so its modules (the home plan after a parent-teacher meeting) are used only when this is on. Saving
// asks for the authenticator if this session has not shown it, and is audited.
export function PlusOpenForm({ initial }: { initial: boolean }) {
  const { t } = useT();
  const { stepUpFetch } = useStepUp();
  const [open, setOpen] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (next: boolean) => {
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch('/api/control/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'plus_open', open: next }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) setOpen(next);
    setNote(res?.ok ? { ok: true, text: t('control.family.plus.saved') } : { ok: false, text: t('control.family.plus.failed') });
  };

  return (
    <section aria-labelledby="family-plus-open" data-plus-open={open ? 'on' : 'off'} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
      <h2 id="family-plus-open" className="text-lg font-bold text-slate">
        {t('control.family.plus.title')}
      </h2>
      <p className="text-sm text-slate/80">{t('control.family.plus.lead')}</p>
      <p className="text-sm font-semibold text-slate">{open ? t('control.family.plus.isOn') : t('control.family.plus.isOff')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void save(!open)} disabled={busy} variant={open ? 'outline' : undefined}>
          {open ? t('control.family.plus.turnOff') : t('control.family.plus.turnOn')}
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
