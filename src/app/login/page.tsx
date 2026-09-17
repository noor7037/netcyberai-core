'use client';

// [GAP] Visual design of this page, and of the school-selection step in
// particular, is explicitly undecided -- Prompt B2 asked for the
// selection step to "actually exist and work," not for final copy or
// layout. This is bare-bones on purpose: real fields, real requests,
// no styling opinions baked in that a designer would have to undo.

import { useState } from 'react';

type Membership = { membershipId: string; schoolId: string; schoolName: string; role: string };

type Step =
  | { kind: 'credentials' }
  | { kind: 'mfa' }
  | { kind: 'select_school'; memberships: Membership[] }
  | { kind: 'done'; role: string; schoolId: string | null };

export default function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
  }

  async function chooseSchool(membershipId: string) {
    setError(null);
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
  }

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Staff login</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {step.kind === 'credentials' && (
        <form onSubmit={submitCredentials}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit">Sign in</button>
        </form>
      )}

      {step.kind === 'mfa' && (
        <form onSubmit={submitMfa}>
          <p>Enter your authenticator app code.</p>
          <label>
            Code
            <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <button type="submit">Verify</button>
        </form>
      )}

      {step.kind === 'select_school' && (
        <div>
          <p>Choose which school to work in:</p>
          <ul>
            {step.memberships.map((m) => (
              <li key={m.membershipId}>
                <button type="button" onClick={() => chooseSchool(m.membershipId)}>
                  {m.schoolName} — {m.role}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
