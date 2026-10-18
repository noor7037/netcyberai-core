'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

// Signed-in password change (C89). Accounts with an authenticator are
// asked for its code too; other devices are signed out, this one stays in.
const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: 'Your current password is not right.',
  password_invalid: 'Use 8 to 72 characters, with no space at the start or end.',
  password_rejected: 'That password was not accepted. Choose a longer one you have not used elsewhere.',
  mfa_required: 'Enter the code from your authenticator app too.',
  mfa_invalid_code: 'That authenticator code did not work. Try the current one.',
  forbidden: 'A support session cannot change this password.',
  session_expired: 'Your session expired. Sign in again, then change your password.',
  rate_limited: 'Too many attempts. Wait a minute, then try again.',
};

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [askMfa, setAskMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next, mfaCode: askMfa ? mfaCode : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'mfa_required') setAskMfa(true);
        setError(ERROR_TEXT[data.error] ?? 'We could not change your password. Please try again.');
        return;
      }
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMfaCode('');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          id="current-password"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <Input
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          helperText="8 to 72 characters."
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        <Input
          id="confirm-password"
          label="Type the new password again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {askMfa && (
          <Input
            id="mfa-code"
            label="Authenticator code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            required
          />
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Saving…' : 'Change password'}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-800">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-4 text-sm font-medium text-emerald-text">
          Password changed. Other devices were signed out; this one stays signed in.
        </p>
      )}
    </Card>
  );
}
