'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { AuthenticatorEnrolment, type EnrolmentView } from './AuthenticatorEnrolment';

// "Set up authenticator app" / "Replace authenticator" on the account page
// (C95). Platform admins must have one; principals and school admins may add
// one, and are then asked for its code at every sign-in. Replacing enrols the
// new one first; the old one is removed only after the new one has worked.
const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: 'Your current password is not right.',
  mfa_required: 'Enter the code from your current authenticator app too.',
  mfa_invalid_code: 'That code did not work. Check the app and try the current code.',
  pending_token_invalid: 'This setup took too long or was already used. Start again.',
  mfa_enroll_failed: 'We could not update your authenticator just now. Please try again.',
  forbidden: 'This account cannot change an authenticator here.',
  session_expired: 'Your session expired. Sign in again.',
  rate_limited: 'Too many attempts. Wait a minute, then try again.',
};

type Status = { canManage: boolean; required: boolean; enrolled: boolean | null };
type Phase =
  | { kind: 'idle' }
  | { kind: 'prove'; replacing: boolean }
  | { kind: 'scan'; enrolment: EnrolmentView; replacing: boolean }
  | { kind: 'done'; replaced: boolean };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export function AuthenticatorPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/authenticator')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d as Status))
      .catch(() => {});
  }, []);

  if (!status?.canManage) return null;
  const enrolled = phase.kind === 'done' ? true : status.enrolled;

  function begin(replacing: boolean) {
    setError(null);
    setPassword('');
    setCurrentCode('');
    setPhase({ kind: 'prove', replacing });
  }

  async function prove(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind !== 'prove') return;
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post('/api/auth/authenticator/start', {
        currentPassword: password,
        mfaCode: currentCode || undefined,
      });
      if (!ok) {
        // The status can be unknown (null); the server then tells us an
        // authenticator exists by asking for its code.
        if (data.error === 'mfa_required') setPhase({ kind: 'prove', replacing: true });
        return setError(ERROR_TEXT[String(data.error)] ?? 'That did not work. Please try again.');
      }
      setPassword('');
      setCurrentCode('');
      setPhase({
        kind: 'scan',
        replacing: data.replacing === true,
        enrolment: {
          factorId: String(data.factorId),
          qrCode: String(data.qrCode),
          setupKey: String(data.setupKey),
          uri: String(data.uri),
        },
      });
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(code: string) {
    if (phase.kind !== 'scan') return;
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post('/api/auth/authenticator/verify', { factorId: phase.enrolment.factorId, code });
      if (!ok) return setError(ERROR_TEXT[String(data.error)] ?? 'That code did not work. Please try again.');
      setPhase({ kind: 'done', replaced: data.status === 'replaced' });
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-slate">Authenticator app</h2>
        <p className="text-sm text-slate/80">
          {status.required
            ? 'Required for platform admins: every sign-in asks for a 6-digit code from the app on your phone.'
            : 'Optional. Once added, every sign-in also asks for a 6-digit code from the app on your phone.'}
        </p>
        <p className="text-sm font-semibold text-slate" role="status">
          {enrolled === true ? 'On: an authenticator app is set up.' : enrolled === false ? 'Off: no authenticator app yet.' : ''}
        </p>
      </div>

      {phase.kind === 'idle' && (
        <div className="flex flex-col gap-2">
          {enrolled !== true && (
            <Button type="button" onClick={() => begin(false)}>
              Set up authenticator app
            </Button>
          )}
          {enrolled !== false && (
            <Button type="button" variant="outline" onClick={() => begin(true)}>
              Replace authenticator
            </Button>
          )}
          {enrolled === true && (
            <p className="text-sm text-slate/80">
              Lost your phone, or think someone else has the key? Replace it here; the old one stops working at once.
            </p>
          )}
        </div>
      )}

      {phase.kind === 'prove' && (
        <form onSubmit={prove} className="flex flex-col gap-4">
          <p className="text-sm text-slate">First, confirm it is you.</p>
          <Input
            id="authenticator-password"
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {phase.replacing && (
            <Input
              id="authenticator-current-code"
              label="Code from your current authenticator app"
              helperText="The new one is added first; the old one is removed only after the new one works."
              inputMode="numeric"
              autoComplete="one-time-code"
              value={currentCode}
              onChange={(e) => setCurrentCode(e.target.value)}
              required
            />
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Checking…' : 'Continue'}
          </Button>
          <button
            type="button"
            className="min-h-[44px] text-sm font-semibold text-royal underline"
            onClick={() => setPhase({ kind: 'idle' })}
          >
            Cancel
          </button>
        </form>
      )}

      {phase.kind === 'scan' && (
        <AuthenticatorEnrolment
          enrolment={phase.enrolment}
          submitting={busy}
          submitLabel={phase.replacing ? 'Confirm and replace the old one' : 'Turn on authenticator'}
          onSubmit={confirm}
        />
      )}

      {phase.kind === 'done' && (
        <p role="status" className="text-sm font-medium text-emerald-text">
          {phase.replaced
            ? 'Done. The new authenticator is on, the old one no longer works, and your other devices were signed out.'
            : 'Done. Your authenticator app is on. Sign-ins will ask for its code.'}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-800">
          {error}
        </p>
      )}
    </Card>
  );
}
