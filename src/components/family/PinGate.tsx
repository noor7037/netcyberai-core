'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';
import { PinFields } from './PinFields';

// The door to the parent area (docs/34 §9.1 rule 1; M1-2, C248): the parent PIN, with waits after 5 wrong tries and no
// hints. A forgotten PIN is reset only with a code sent to the parent's own email.
export function PinGate({ w }: { w: Words }) {
  const router = useRouter();
  const [mode, setMode] = useState<'enter' | 'reset'>('enter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');

  if (mode === 'reset') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate">{w['fam.pin.forgot']}</h1>
          <p className="mt-2 text-base text-slate/80">{sent ? w['fam.pin.resetSent'] : w['fam.pin.resetLead']}</p>
        </div>
        {!sent ? (
          <Button
            disabled={busy}
            className="w-full"
            onClick={async () => {
              setBusy(true);
              setError('');
              const r = await familyApi('/api/family/pin/reset/code', 'POST', {});
              setBusy(false);
              if (!r.ok) return setError(errorWords(w, r.error));
              setSent(true);
            }}
          >
            {w['fam.pin.resetSend']}
          </Button>
        ) : (
          <>
            <Input id="fam-reset-code" label={w['fam.signIn.code']} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <PinFields
              w={w}
              confirm
              idPrefix="fam-reset-pin"
              busy={busy || code.length !== 6}
              error=""
              submitLabel={w['fam.pin.resetSave']}
              onSubmit={async (pin) => {
                setBusy(true);
                setError('');
                const r = await familyApi('/api/family/pin/reset', 'POST', { code, pin });
                setBusy(false);
                if (!r.ok) return setError(errorWords(w, r.error));
                router.refresh();
              }}
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {error}
          </p>
        )}
        <button type="button" className="min-h-[44px] self-start px-1 text-sm font-semibold text-royal underline-offset-4 hover:underline" onClick={() => setMode('enter')}>
          {w['fam.common.cancel']}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-extrabold text-slate">{w['fam.pin.enterTitle']}</h1>
        <p className="mt-2 text-base text-slate/80">{w['fam.pin.enterLead']}</p>
      </div>
      <PinFields
        w={w}
        busy={busy}
        error={error}
        submitLabel={w['fam.pin.open']}
        onSubmit={async (pin) => {
          setBusy(true);
          setError('');
          const r = await familyApi('/api/family/pin/unlock', 'POST', { pin });
          setBusy(false);
          if (!r.ok) return setError(r.error === 'wrong' ? w['fam.err.pinWrong'] : errorWords(w, r.error, { minutes: Number(r.data.minutes ?? 1) }));
          router.refresh();
        }}
      />
      <button type="button" className="min-h-[44px] self-start px-1 text-sm font-semibold text-royal underline-offset-4 hover:underline" onClick={() => setMode('reset')}>
        {w['fam.pin.forgot']}
      </button>
    </div>
  );
}
