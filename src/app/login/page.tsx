'use client';

// Task 3 (post-B2): brought up to "uses the existing design system,"
// per docs/07_DESIGN_SYSTEM.md tokens and the Floor Device Standard --
// Button/Card/Container (shipped) plus a minimal Input (see
// src/components/ui/Input.tsx's own [GAP] note: Phase 1's fuller Input
// with inline validation is still Prompt C's job). No illustration, no
// marketing copy, no animation -- "presentable and on-brand," not a
// launch-polish pass.
//
// [GAP] still open: this is the generic shape for the selection step,
// not a final, designer-reviewed layout. Good enough to stop reading
// like an error state or a buried dropdown; not a claim that it's done.

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { Icon, type IconName } from '@/components/visual/Icons';

const NETWORK_ERROR = 'We could not reach the server. Check your connection and try again.';

// The auth API returns machine codes (src/lib/auth/*); staff see a
// sentence, never the raw code. Unknown codes fall back to the caller's
// generic message rather than showing the code itself.
const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: 'That email and password do not match. Check both and try again.',
  no_memberships: 'This account is not linked to any school yet. Ask your school admin to add you.',
  pending_token_invalid: 'Your sign-in step expired. Please enter your email and password again.',
  session_expired: 'Your session expired. Please sign in again.',
  session_revoked: 'This session was signed out. Please sign in again.',
  membership_invalid: 'You no longer have access to that school. Choose another, or ask your school admin.',
  forbidden: 'This account cannot do that. Ask your school admin if you think it should.',
};

function humanError(code: unknown, fallback: string): string {
  return (typeof code === 'string' && ERROR_TEXT[code]) || fallback;
}

// Only features the sign-in flow actually has (src/app/api/auth/*):
// password sign-in, an authenticator-code step for accounts that have
// MFA, and choosing between schools for people with several
// memberships. There is no self-serve password reset route, so the page
// points to the school admin and Support instead of a dead link.
const FACTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'lock', title: 'Authenticator codes', body: 'Accounts with two-step verification are asked for a 6-digit code.' },
  { icon: 'school', title: 'Several schools, one login', body: 'If you work in more than one school, you choose which one to open.' },
  { icon: 'shield', title: 'Your school only', body: 'You only ever see records of the school you signed in to.' },
];

type Membership = { membershipId: string; schoolId: string; schoolName: string; role: string };

type Step =
  | { kind: 'credentials' }
  | { kind: 'mfa' }
  | { kind: 'select_school'; memberships: Membership[] }
  | { kind: 'done'; role: string; schoolId: string | null };

function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export default function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(humanError(data.error, 'Sign-in failed. Please try again.'));
        return;
      }
      if (data.status === 'mfa_required') setStep({ kind: 'mfa' });
      else if (data.status === 'select_school') setStep({ kind: 'select_school', memberships: data.memberships });
      else if (data.status === 'ok') {
        setStep({ kind: 'done', role: data.role, schoolId: data.schoolId });
        window.location.href = data.role === 'super_admin' ? '/control' : '/app';
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(humanError(data.error, 'That code did not work. Check your authenticator app and try again.'));
        return;
      }
      if (data.status === 'select_school') setStep({ kind: 'select_school', memberships: data.memberships });
      else if (data.status === 'ok') {
        setStep({ kind: 'done', role: data.role, schoolId: data.schoolId });
        window.location.href = data.role === 'super_admin' ? '/control' : '/app';
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function chooseSchool(membershipId: string) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/select-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(humanError(data.error, 'We could not open that school. Please try again.'));
        return;
      }
      setStep({ kind: 'done', role: data.role, schoolId: data.schoolId });
      window.location.href = '/app';
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-[80vh] grid-cols-1 lg:grid-cols-2">
      <section aria-label="About staff sign-in" className="relative hidden overflow-hidden bg-midnight text-white lg:block">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <div className="relative flex h-full flex-col justify-center gap-8 p-12">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold uppercase tracking-wide opacity-80">NetCyberAI for school staff</p>
            <p className="max-w-md text-3xl font-extrabold tracking-tight">Principals, admins, teachers and finance, on one school record.</p>
          </div>
          <ul className="flex max-w-md flex-col gap-4">
            {FACTS.map((f) => (
              <li key={f.title} className="nca-glass flex gap-4 rounded-2xl p-4">
                <Icon name={f.icon} className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-bold">{f.title}</span>
                  <span className="text-sm opacity-80">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="max-w-md text-sm opacity-80">
            Parents do not need an account. They receive updates on WhatsApp.
          </p>
        </div>
      </section>
      <div className="flex items-center justify-center bg-off-white px-4 py-10">
      <Card className="w-full max-w-md">
        {step.kind === 'select_school' ? (
          <>
            <h1 className="text-xl font-bold text-slate">Choose which school to work in</h1>
            <p className="mt-1 text-sm text-slate/70">
              Your account has access to more than one school. Pick the one you want to work in now — you can
              switch later without signing out.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              {step.memberships.map((m) => (
                <button
                  key={m.membershipId}
                  type="button"
                  disabled={submitting}
                  onClick={() => chooseSchool(m.membershipId)}
                  className="min-h-[44px] w-full rounded-md border-2 border-sapphire/20 bg-white px-4 py-3 text-left transition-colors hover:border-sapphire hover:bg-sapphire/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire disabled:opacity-50"
                >
                  <span className="block font-semibold text-slate">{m.schoolName}</span>
                  <span className="block text-sm text-slate/70">as {formatRole(m.role)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold text-slate">Staff sign in</h1>
            <p className="mt-1 text-sm text-slate/70">For school staff using NetCyberAI. Parents do not need to sign in.</p>

            {step.kind === 'credentials' && (
              <form onSubmit={submitCredentials} className="mt-6 flex flex-col gap-4">
                <Input
                  id="email"
                  label="Email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  id="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            )}

            {step.kind === 'mfa' && (
              <form onSubmit={submitMfa} className="mt-6 flex flex-col gap-4">
                <p className="text-sm text-slate/70">Enter the 6-digit code from your authenticator app.</p>
                <Input
                  id="mfa-code"
                  label="Authenticator code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Verifying…' : 'Verify'}
                </Button>
              </form>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-800">
            {error}
          </p>
        )}

        {step.kind === 'credentials' && (
          <p className="mt-6 border-t border-slate/10 pt-4 text-sm text-slate/70">
            Forgot your password or locked out? Ask your school admin, or{' '}
            <Link href="/support" className="font-semibold text-royal underline">
              contact support
            </Link>
            . New to NetCyberAI?{' '}
            <Link href="/get-started" className="font-semibold text-royal underline">
              Get started
            </Link>
            .
          </p>
        )}
      </Card>
      </div>
    </div>
  );
}
