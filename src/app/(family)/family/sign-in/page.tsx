'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestSignInCode, verifySignInCode, recordConsent } from '@/lib/family/accounts';
import { addChildProfile } from '@/lib/family/children';
import { t, type Lang } from '@/lib/i18n';

export default function FamilySignInPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('hi');
  const [step, setStep] = useState<'email' | 'code' | 'child'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [accountId, setAccountId] = useState('');
  const [consentGranted, setConsentGranted] = useState(true);

  // Child Profile Form State
  const [firstName, setFirstName] = useState('');
  const [grade, setGrade] = useState(9);
  const [medium, setMedium] = useState<'hi' | 'en' | 'hinglish'>('hi');
  const [state, setState] = useState('Delhi');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError(t(lang, 'fam.signIn.err.email'));
      return;
    }
    setLoading(true);
    setError(null);
    const res = await requestSignInCode(email);
    setLoading(false);
    if (res.success) {
      if (res.devCode) setCode(res.devCode);
      setStep('code');
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await verifySignInCode(email, code);
    setLoading(false);
    if (res.success && res.account) {
      setAccountId(res.account.accountId);
      recordConsent(res.account.accountId, 'study_core', consentGranted);
      setStep('child');
    } else {
      setError(res.error ? t(lang, 'fam.signIn.err.code') : t(lang, 'fam.signIn.err.code'));
    }
  };

  const handleSaveChild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError(t(lang, 'fam.signIn.err.name'));
      return;
    }
    addChildProfile(accountId || 'fam-acc-demo-101', {
      firstName,
      grade,
      board: 'CBSE',
      medium,
      state,
    });
    router.push('/family');
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <div className="rounded-2xl border border-slate/15 bg-white p-6 shadow-md">
        {/* Language switch */}
        <div className="mb-4 flex items-center justify-between border-b border-slate/10 pb-3">
          <h1 className="text-base font-extrabold text-slate">
            {t(lang, 'fam.signIn.title')}
          </h1>
          <div className="flex gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`rounded px-2 py-0.5 ${lang === 'en' ? 'bg-sapphire text-white' : 'text-slate'}`}
            >
              {t(lang, 'fam.lang.en')}
            </button>
            <button
              type="button"
              onClick={() => setLang('hi')}
              className={`rounded px-2 py-0.5 ${lang === 'hi' ? 'bg-sapphire text-white' : 'text-slate'}`}
            >
              {t(lang, 'fam.lang.hi')}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 font-bold">
            {error}
          </div>
        )}

        {/* Step 1: Email */}
        {step === 'email' && (
          <form onSubmit={handleRequestCode} className="flex flex-col gap-4">
            <p className="text-xs text-slate/70 font-medium">
              {t(lang, 'fam.signIn.subtitle')}
            </p>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate">
              <span>{t(lang, 'fam.signIn.email')}</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@mail.com" // ui-strings: not words (placeholder pattern)
                className="rounded-xl border border-slate/20 px-3.5 py-2.5 text-sm focus:border-sapphire focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-xl bg-sapphire px-4 py-2.5 text-sm font-extrabold text-white transition-all hover:bg-royal shadow-sm"
            >
              {loading ? '...' : t(lang, 'fam.signIn.sendCode')}
            </button>
          </form>
        )}

        {/* Step 2: 6-Digit Code & Consent */}
        {step === 'code' && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate">
              <span>{t(lang, 'fam.signIn.code')}</span>
              <input
                type="text"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded-xl border border-slate/20 px-3.5 py-2.5 text-center text-lg tracking-widest font-mono font-bold focus:border-sapphire focus:outline-none"
              />
            </label>

            <div className="rounded-xl bg-off-white p-3 border border-slate/15">
              <label className="flex items-start gap-2.5 text-xs text-slate font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGranted}
                  onChange={(e) => setConsentGranted(e.target.checked)}
                  className="mt-0.5 rounded border-slate/30"
                />
                <span>{t(lang, 'fam.consent.studyCore')}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !consentGranted}
              className="rounded-xl bg-sapphire px-4 py-2.5 text-sm font-extrabold text-white hover:bg-royal disabled:opacity-50 shadow-sm"
            >
              {loading ? '...' : t(lang, 'fam.signIn.verify')}
            </button>
          </form>
        )}

        {/* Step 3: Add Child Profile */}
        {step === 'child' && (
          <form onSubmit={handleSaveChild} className="flex flex-col gap-3.5">
            <h2 className="text-sm font-extrabold text-slate border-b border-slate/10 pb-2">
              {t(lang, 'fam.child.addTitle')}
            </h2>

            <label className="flex flex-col gap-1 text-xs font-bold text-slate">
              <span>{t(lang, 'fam.child.name')}</span>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-xl border border-slate/20 px-3 py-2 text-sm focus:border-sapphire focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold text-slate">
              <span>{t(lang, 'fam.child.grade')}</span>
              <select
                value={grade}
                onChange={(e) => setGrade(Number(e.target.value))}
                className="rounded-xl border border-slate/20 px-3 py-2 text-sm bg-white"
              >
                {[6, 7, 8, 9, 10].map((g) => (
                  <option key={g} value={g}>
                    {t(lang, 'fam.class.prefix', { grade: g })}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold text-slate">
              <span>{t(lang, 'fam.child.medium')}</span>
              <select
                value={medium}
                onChange={(e) => setMedium(e.target.value as 'hi' | 'en' | 'hinglish')}
                className="rounded-xl border border-slate/20 px-3 py-2 text-sm bg-white"
              >
                <option value="hi">{t(lang, 'fam.lang.hi')}</option>
                <option value="en">{t(lang, 'fam.lang.en')}</option>
                <option value="hinglish">{t(lang, 'fam.lang.hinglish')}</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold text-slate">
              <span>{t(lang, 'fam.child.state')}</span>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="rounded-xl border border-slate/20 px-3 py-2 text-sm"
              />
            </label>

            <button
              type="submit"
              className="mt-2 rounded-xl bg-emerald px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-dark shadow-sm"
            >
              {t(lang, 'fam.child.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
