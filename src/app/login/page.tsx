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
import { Container } from '@/components/ui/Container';
import { Input } from '@/components/ui/Input';

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
        setError(data.error ?? 'Login failed');
        return;
      }
      if (data.status === 'mfa_required') setStep({ kind: 'mfa' });
      else if (data.status === 'select_school') setStep({ kind: 'select_school', memberships: data.memberships });
      else if (data.status === 'ok') {
        setStep({ kind: 'done', role: data.role, schoolId: data.schoolId });
        window.location.href = data.role === 'super_admin' ? '/control' : '/app';
      }
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
        setError(data.error ?? 'Invalid code');
        return;
      }
      if (data.status === 'select_school') setStep({ kind: 'select_school', memberships: data.memberships });
      else if (data.status === 'ok') {
        setStep({ kind: 'done', role: data.role, schoolId: data.schoolId });
        window.location.href = data.role === 'super_admin' ? '/control' : '/app';
      }
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
        setError(data.error ?? 'Selection failed');
        return;
      }
      setStep({ kind: 'done', role: data.role, schoolId: data.schoolId });
      window.location.href = '/app';
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container className="flex min-h-[80vh] items-center justify-center py-10">
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
            <h1 className="text-xl font-bold text-slate">Staff login</h1>
            <p className="mt-1 text-sm text-slate/70">NetCyberAI staff access. Not for parents.</p>

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
      </Card>
    </Container>
  );
}
