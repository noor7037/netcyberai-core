'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/family/ui/Button';
import type { Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';
import type { BoardOption } from '@/lib/family/children';
import { ChildForm } from './ChildForm';
import { GateFrame } from './GateFrame';
import { PinFields } from './PinFields';

// The parent's first steps after the first sign-in (M1-2, C248): agree to study_core with an explicit tap, set the
// parent PIN, then add the first child (ChildForm). Nothing about a child is kept before the tap.

export function ConsentStep({ w }: { w: Words }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = ['fam.consent.item.child', 'fam.consent.item.answers', 'fam.consent.item.ai', 'fam.consent.item.never', 'fam.consent.item.control'];
  return (
    <GateFrame app={w['fam.app.name']} title={w['fam.consent.title']} lead={w['fam.consent.lead']}>
      <ul className="flex flex-col gap-2">
        {items.map((k) => (
          <li key={k} className="fam-row items-start bg-off-white text-base text-slate">
            <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-ink" />
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
    </GateFrame>
  );
}

export function PinSetup({ w }: { w: Words }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <GateFrame app={w['fam.app.name']} title={w['fam.pin.setTitle']} lead={w['fam.pin.setLead']}>
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
    </GateFrame>
  );
}

export function FirstChildStep({ w, states, boards, lang }: { w: Words; states: { code: string; name: string }[]; boards?: BoardOption[]; lang: 'en' | 'hi' }) {
  const router = useRouter();
  return (
    <GateFrame app={w['fam.app.name']} title={w['fam.child.addTitle']} lead={w['fam.child.addLead']}>
      <ChildForm
        w={w}
        states={states}
        boards={boards}
        initial={{ firstName: '', classLevel: null, board: '', language: lang, style: lang === 'hi' ? 'hinglish' : 'en', stateCode: '' }}
        submitLabel={w['fam.child.add']}
        onDone={() => {
          router.replace('/family');
          router.refresh();
        }}
      />
    </GateFrame>
  );
}
