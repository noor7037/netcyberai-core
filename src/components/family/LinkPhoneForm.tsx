'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Words } from '@/lib/family/fill';
import { familyApi } from './client';

// A child's own phone enters the parent's one-time code (M2b-2, C342). A right code opens the app for that one child.
export function LinkPhoneForm({ w }: { w: Words }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const link = async () => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/child-phone/link', 'POST', { code });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'too_many' ? w['fam.link.tooMany'] : w['fam.link.wrong']);
    window.location.assign('/family');
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void link();
      }}
    >
      <h1 className="text-2xl font-extrabold text-slate">{w['fam.link.title']}</h1>
      <p className="text-base text-slate">{w['fam.link.lead']}</p>
      <Input id="fam-link-code" label={w['fam.link.code']} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} />
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || code.replace(/[\s-]/g, '').length !== 6}>
        {w['fam.link.go']}
      </Button>
    </form>
  );
}
