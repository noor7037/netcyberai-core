'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';
import { ChildForm } from './ChildForm';
import { PinFields } from './PinFields';

// The parent's first steps after the first sign-in (M1-2, C248): agree to study_core with an explicit tap, set the
// parent PIN, then add the first child (ChildForm). Nothing about a child is kept before the tap.

export function ConsentStep({ w }: { w: Words }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = ['fam.consent.item.child', 'fam.consent.item.answers', 'fam.consent.item.ai', 'fam.consent.item.never', 'fam.consent.item.control'];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-extrabold text-slate">{w['fam.consent.title']}</h1>
        <p className="mt-2 text-base text-slate/80">{w['fam.consent.lead']}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((k) => (
          <li key={k} className="flex gap-3 rounded-2xl bg-white p-4 text-base text-slate shadow-sm ring-1 ring-slate/10">
            <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full bg-royal" />
            <span>{w[k]}</span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <Button
        disabled={busy}
        className="w-full"
        onClick={async () => {
          setBusy(true);
          const r = await familyApi('/api/family/consent', 'POST', { purpose: 'study_core', granted: true, tap: true });
          if (!r.ok) {
            setBusy(false);
            return setError(errorWords(w, r.error));
          }
          router.replace('/family/welcome/pin');
          router.refresh();
        }}
      >
        {w['fam.consent.agree']}
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          await familyApi('/api/family/auth/sign-out', 'POST', {});
          router.replace('/family/sign-in');
          router.refresh();
        }}
      >
        {w['fam.consent.notNow']}
      </Button>
    </div>
  );
}

export function PinSetup({ w }: { w: Words }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-extrabold text-slate">{w['fam.pin.setTitle']}</h1>
        <p className="mt-2 text-base text-slate/80">{w['fam.pin.setLead']}</p>
      </div>
      <PinFields
        w={w}
        confirm
        busy={busy}
        error={error}
        submitLabel={w['fam.pin.save']}
        onSubmit={async (pin) => {
          setBusy(true);
          setError('');
          const r = await familyApi('/api/family/pin', 'POST', { pin });
          if (!r.ok) {
            setBusy(false);
            return setError(errorWords(w, r.error));
          }
          router.replace('/family/welcome/child');
          router.refresh();
        }}
      />
    </div>
  );
}

export function FirstChildStep({ w, states, lang }: { w: Words; states: { code: string; name: string }[]; lang: 'en' | 'hi' }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-extrabold text-slate">{w['fam.child.addTitle']}</h1>
        <p className="mt-2 text-base text-slate/80">{w['fam.child.addLead']}</p>
      </div>
      <ChildForm
        w={w}
        states={states}
        initial={{ firstName: '', classLevel: null, board: '', language: lang, style: lang === 'hi' ? 'hinglish' : 'en', stateCode: '' }}
        submitLabel={w['fam.child.add']}
        onDone={() => {
          router.replace('/family');
          router.refresh();
        }}
      />
    </div>
  );
}
