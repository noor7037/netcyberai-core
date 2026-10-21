'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Lang } from '@/lib/i18n';
import { fill, type Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';
import { LanguageSwitch } from './LanguageSwitch';

// Sign in by a code sent to the email (M1-2, C248): two steps on one screen, no password. The email travels to step 2
// in a signed cookie, so it is never in the address.
export function FamilySignIn({ w, lang }: { w: Words; lang: Lang }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/auth/code', 'POST', { email, lang });
    setBusy(false);
    if (!r.ok) return setError(errorWords(w, r.error));
    setCode('');
    setStep('code');
  };
  const verify = async () => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/auth/verify', 'POST', { code });
    if (!r.ok) {
      setBusy(false);
      if (r.error === 'start_again') setStep('email');
      return setError(errorWords(w, r.error));
    }
    router.replace('/family');
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <LanguageSwitch lang={lang} w={w} />
      </div>
      <div>
        <h1 className="text-3xl font-extrabold text-slate">{w['fam.signIn.title']}</h1>
        <p className="mt-2 text-base text-slate/80">{step === 'email' ? w['fam.signIn.lead'] : fill(w['fam.signIn.codeSent'], { email })}</p>
      </div>
      {step === 'email' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input id="fam-email" label={w['fam.signIn.email']} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={error || undefined} />
          <Button type="submit" disabled={busy || !email.trim()} className="w-full">
            {busy ? w['fam.signIn.sending'] : w['fam.signIn.send']}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <Input
            id="fam-code"
            label={w['fam.signIn.code']}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={error || undefined}
          />
          <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
            {w['fam.signIn.verify']}
          </Button>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className="min-h-[44px] px-1 text-sm font-semibold text-royal underline-offset-4 hover:underline" onClick={() => void send()} disabled={busy}>
              {w['fam.signIn.resend']}
            </button>
            <button type="button" className="min-h-[44px] px-1 text-sm font-semibold text-royal underline-offset-4 hover:underline" onClick={() => setStep('email')}>
              {w['fam.signIn.otherEmail']}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
