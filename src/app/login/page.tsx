'use client';

// Task 3 (post-B2): brought up to "uses the existing design system,"
// per docs/07_DESIGN_SYSTEM.md tokens and the Floor Device Standard --
// Button/Card/Container (shipped) plus a minimal Input (see
// src/components/ui/Input.tsx's own [GAP] note: Phase 1's fuller Input
// with inline validation is still Prompt C's job). No illustration, no
// marketing copy, no animation -- "presentable and on-brand," not a
// launch-polish pass.
//
// C89 (founder, 2026-09-29): three ways in, all ending in the same
// authenticator and school-choice steps -- password, a one-time code sent
// to the account's email, and "set or reset your password" with an
// emailed code (forgotten passwords and first-time staff alike).
// C90: sign in with an email or mobile number; a password sign-in is
// always followed by a code emailed to the account unless this browser is
// a remembered device.
//
// [GAP] still open: this is the generic shape for the selection step,
// not a final, designer-reviewed layout. Good enough to stop reading
// like an error state or a buried dropdown; not a claim that it's done.

import { useEffect, useState } from 'react';
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
  pending_token_invalid: 'Your sign-in step expired. Please start again.',
  session_expired: 'Your session expired. Please sign in again.',
  session_revoked: 'This session was signed out. Please sign in again.',
  membership_invalid: 'You no longer have access to that school. Choose another, or ask your school admin.',
  forbidden: 'This account cannot do that. Ask your school admin if you think it should.',
  account_disabled: 'This account is switched off. Ask your school admin.',
  code_invalid: 'That code did not work or has expired. Check the latest email, or send a new code.',
  rate_limited: 'Too many codes were asked for. Wait a minute, then try again.',
  password_invalid: 'Use 8 to 72 characters, with no space at the start or end.',
  password_rejected: 'That password was not accepted. Choose a longer one you have not used elsewhere.',
  mfa_invalid_code: 'That authenticator code did not work. Check your authenticator app and try again.',
  mfa_required: 'This account also needs the code from your authenticator app.',
  email_send_failed: 'We could not email your sign-in code. Try again in a minute, or contact support.',
  email_limit:
    'Our email service is busy and could not send another email just now. If an email from us already arrived, use its code or link. Otherwise try again later, or ask your school admin for a sign-in link.',
  link_invalid: 'That link has expired or was already used. Each link works once, for one hour, and only the newest email works. Send a new code below.',
  setup_required: 'This needs a setting that is not switched on yet. Please contact support.',
};

// Supabase sends people back with #error_code=... when an emailed link fails.
const LINK_ERROR_TEXT: Record<string, string> = {
  otp_expired: ERROR_TEXT.link_invalid,
  access_denied: ERROR_TEXT.link_invalid,
};

function humanError(code: unknown, fallback: string): string {
  return (typeof code === 'string' && ERROR_TEXT[code]) || fallback;
}

// Only features the sign-in flow actually has (src/app/api/auth/*).
const FACTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'mail', title: 'A code by email, every new device', body: 'After your password we email you a one-time code. Tick “remember this device” to skip it here for 30 days.' },
  { icon: 'lock', title: 'Stay signed in', body: 'You stay signed in on your device until you log out, as long as you use it at least once a month.' },
  { icon: 'school', title: 'Several schools, one login', body: 'If you work in more than one school, you choose which one to open.' },
  { icon: 'shield', title: 'Your school only', body: 'You only ever see records of the school you signed in to.' },
];

type Membership = { membershipId: string; schoolId: string; schoolName: string; role: string };

type Step =
  | { kind: 'credentials' }
  | { kind: 'code_request' }
  | { kind: 'code_verify' }
  | { kind: 'reset_request' }
  | { kind: 'reset_verify' }
  | { kind: 'reset_mfa' }
  | { kind: 'link_password' }
  | { kind: 'link_checking' }
  | { kind: 'email_step'; maskedEmail: string }
  | { kind: 'mfa' }
  | { kind: 'select_school'; memberships: Membership[] }
  | { kind: 'done'; role: string; schoolId: string | null };

const HEADINGS: Partial<Record<Step['kind'], { title: string; lead: string }>> = {
  credentials: { title: 'Staff sign in', lead: 'For school staff using NetCyberAI. Parents do not need to sign in.' },
  code_request: { title: 'Sign in with an email code', lead: 'We send a one-time code to the email on your account.' },
  code_verify: { title: 'Enter your sign-in code', lead: 'Check your email for the code we just sent.' },
  reset_request: {
    title: 'Set or reset your password',
    lead: 'First time here, or forgot your password? We send a one-time code to the email on your account.',
  },
  reset_verify: { title: 'Choose your new password', lead: 'Enter the code from your email and your new password.' },
  reset_mfa: { title: 'One more step', lead: 'Your account uses an authenticator app. Enter its 6-digit code to save the new password.' },
  email_step: { title: 'Check your email', lead: 'We sent a one-time sign-in code.' },
  link_password: { title: 'Choose your new password', lead: 'Your email is confirmed. Choose a password for your account.' },
  link_checking: { title: 'Signing you in…', lead: 'Checking the link from your email.' },
  mfa: { title: 'Staff sign in', lead: 'Enter the 6-digit code from your authenticator app.' },
};

function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remember, setRemember] = useState(false);
  // Resend is paused while the email service would refuse it anyway (C91),
  // with the seconds shown, instead of an error after every tap.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  function startCooldown(seconds: number) {
    setNow(Date.now());
    setCooldownUntil(Date.now() + seconds * 1000);
  }

  // Links such as /login?mode=reset (sent to first-time staff) open the
  // right step directly. Links from emails land here too (C91): Supabase's
  // own (#access_token=... or #error_code=...) and our own (?th=...&type=...).
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const mode = search.get('mode');
    const tokenHash = search.get('th');
    const linkError = hash.get('error_code') ?? (hash.get('error') ? 'access_denied' : null);
    const accessToken = hash.get('access_token');
    if (tokenHash || accessToken || linkError) window.history.replaceState(null, '', '/login');

    if (linkError) {
      setStep({ kind: 'code_request' });
      setError(LINK_ERROR_TEXT[linkError] ?? ERROR_TEXT.link_invalid);
    } else if (tokenHash || accessToken) {
      const body = tokenHash
        ? { tokenHash, type: search.get('type') }
        : { accessToken, refreshToken: hash.get('refresh_token'), type: hash.get('type') };
      setStep({ kind: 'link_checking' });
      setSubmitting(true);
      post('/api/auth/link', body)
        .then(({ ok, data }) => {
          if (!ok) {
            setStep({ kind: 'code_request' });
            setError(humanError(data.error, ERROR_TEXT.link_invalid));
          } else if (data.status === 'set_password') {
            setPassword('');
            setConfirm('');
            setStep({ kind: 'link_password' });
          } else {
            signedIn(data);
          }
        })
        .catch(() => {
          setStep({ kind: 'code_request' });
          setError(NETWORK_ERROR);
        })
        .finally(() => setSubmitting(false));
    } else if (mode === 'reset') setStep({ kind: 'reset_request' });
    else if (mode === 'code') setStep({ kind: 'code_request' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(next: Step) {
    setError(null);
    setNotice(null);
    setStep(next);
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await action();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  // Every way in ends here: the same answers as password sign-in.
  function signedIn(data: Record<string, unknown>) {
    if (data.status === 'email_step') {
      setEmailCode('');
      setStep({ kind: 'email_step', maskedEmail: String(data.maskedEmail ?? 'your email') });
    } else if (data.status === 'mfa_required') {
      setCode('');
      setStep({ kind: 'mfa' });
    } else if (data.status === 'select_school') {
      setStep({ kind: 'select_school', memberships: data.memberships as Membership[] });
    } else if (data.status === 'ok') {
      const role = data.role as string;
      setStep({ kind: 'done', role, schoolId: (data.schoolId as string | null) ?? null });
      window.location.href = role === 'super_admin' ? '/control' : '/app';
    }
  }

  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/login', { identifier: email, password });
      if (!ok) return setError(humanError(data.error, 'Sign-in failed. Please try again.'));
      signedIn(data);
    });
  };

  const submitEmailStep = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/email-step', { code: emailCode, rememberDevice: remember });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Please try again.'));
      signedIn(data);
    });
  };

  // A refused send is not a dead end: the person may already have a code or
  // link from an earlier email, so they are taken to where they can use it.
  function sendRefused(data: Record<string, unknown>): boolean {
    if (data.error === 'rate_limited') {
      const wait = Number(data.retryAfter) || 60;
      startCooldown(wait);
      setNotice(
        `We already sent an email a moment ago. Use the code or link in the newest one. You can ask for another in ${wait} seconds.`
      );
      return true;
    }
    if (data.error === 'email_limit') {
      startCooldown(60);
      setError(ERROR_TEXT.email_limit);
      return true;
    }
    return false;
  }

  const resendEmailStep = () =>
    run(async () => {
      const { ok, data } = await post('/api/auth/email-step', { resend: true });
      if (!ok) {
        if (sendRefused(data)) return;
        return setError(humanError(data.error, 'We could not send a new code. Please try again.'));
      }
      startCooldown(60);
      setNotice('A new code is on its way. Use the newest email: older codes stop working.');
    });

  const sendCode = (purpose: 'login' | 'reset') => (e?: React.FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/code/request', { identifier: email, purpose });
      const next: Step = { kind: purpose === 'login' ? 'code_verify' : 'reset_verify' };
      if (!ok) {
        if (sendRefused(data)) return setStep(next);
        return setError(humanError(data.error, 'We could not send a code. Check the email and try again.'));
      }
      setEmailCode('');
      setStep(next);
      startCooldown(60);
      setNotice(
        `If ${email.trim()} belongs to a NetCyberAI account, an email is on its way with a code and a link. Use either one. It can take a minute; check spam too.`
      );
    });
  };

  // "I already have a code": go straight to entering it, without sending
  // another email (which would replace the code already sent).
  const haveCode = (purpose: 'login' | 'reset') => () => {
    if (!email.trim()) {
      setError('Enter your email or mobile number first.');
      return;
    }
    go({ kind: purpose === 'login' ? 'code_verify' : 'reset_verify' });
  };

  const submitLinkPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    return run(async () => {
      const { ok, data } = await post('/api/auth/password/reset', { continue: true, newPassword: password, rememberDevice: remember });
      if (!ok) {
        if (data.error === 'mfa_required') {
          setCode('');
          setStep({ kind: 'reset_mfa' });
          return;
        }
        return setError(humanError(data.error, 'We could not save that password. Please try again.'));
      }
      signedIn(data);
    });
  };

  const submitEmailCode = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/code/verify', { identifier: email, code: emailCode, rememberDevice: remember });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Please try again.'));
      signedIn(data);
    });
  };

  const submitReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    return run(async () => {
      const { ok, data } = await post('/api/auth/password/reset', {
        identifier: email,
        code: emailCode,
        newPassword: password,
        rememberDevice: remember,
      });
      if (!ok) return setError(humanError(data.error, 'We could not save that password. Please try again.'));
      if (data.status === 'mfa_required') {
        setCode('');
        setStep({ kind: 'reset_mfa' });
        return;
      }
      signedIn(data);
    });
  };

  const submitResetMfa = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/password/reset', {
        continue: true,
        newPassword: password,
        mfaCode: code,
        rememberDevice: remember,
      });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Please try again.'));
      signedIn(data);
    });
  };

  const submitMfa = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/mfa/verify', { code });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Check your authenticator app and try again.'));
      signedIn(data);
    });
  };

  const chooseSchool = (membershipId: string) =>
    run(async () => {
      const { ok, data } = await post('/api/auth/select-school', { membershipId });
      if (!ok) return setError(humanError(data.error, 'We could not open that school. Please try again.'));
      setStep({ kind: 'done', role: data.role as string, schoolId: (data.schoolId as string | null) ?? null });
      window.location.href = '/app';
    });

  const heading = HEADINGS[step.kind] ?? HEADINGS.credentials!;
  const emailInput = (
    <Input
      id="email"
      label="Email or mobile number"
      type="text"
      autoComplete="username"
      autoCapitalize="none"
      spellCheck={false}
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      required
    />
  );
  const emailCodeInput = (
    <Input
      id="email-code"
      label="Code from your email"
      inputMode="numeric"
      autoComplete="one-time-code"
      value={emailCode}
      onChange={(e) => setEmailCode(e.target.value)}
      required
    />
  );
  const authenticatorInput = (
    <Input
      id="mfa-code"
      label="Authenticator code"
      inputMode="numeric"
      autoComplete="one-time-code"
      value={code}
      onChange={(e) => setCode(e.target.value)}
      required
    />
  );
  const rememberBox = (
    <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate">
      <input type="checkbox" className="h-5 w-5" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      Remember this device for 30 days (skip the email code here)
    </label>
  );
  const linkButton =
    'font-semibold text-royal underline disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';

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
            <h1 className="text-2xl font-extrabold text-slate">{heading.title}</h1>
            <p className="mt-1 text-sm text-slate/70">{heading.lead}</p>

            {step.kind === 'credentials' && (
              <form onSubmit={submitCredentials} className="mt-6 flex flex-col gap-4">
                {emailInput}
                <Input
                  id="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div className="-mt-2 text-right text-sm">
                  <button type="button" className={linkButton} onClick={() => go({ kind: 'reset_request' })}>
                    Forgot password?
                  </button>
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
                <Button type="button" variant="secondary" disabled={submitting} className="w-full" onClick={() => go({ kind: 'code_request' })}>
                  Email me a sign-in code
                </Button>
              </form>
            )}

            {(step.kind === 'code_request' || step.kind === 'reset_request') && (
              <form onSubmit={sendCode(step.kind === 'code_request' ? 'login' : 'reset')} className="mt-6 flex flex-col gap-4">
                {emailInput}
                <Button type="submit" disabled={submitting || cooldown > 0} className="w-full">
                  {submitting ? 'Sending…' : cooldown > 0 ? `Send code (wait ${cooldown}s)` : 'Send code'}
                </Button>
                <p className="text-sm text-slate/70">
                  Already got an email from us?{' '}
                  <button
                    type="button"
                    className={linkButton}
                    onClick={haveCode(step.kind === 'code_request' ? 'login' : 'reset')}
                  >
                    Enter the code
                  </button>{' '}
                  or just tap the link in it.
                </p>
              </form>
            )}

            {step.kind === 'link_checking' && (
              <p role="status" className="mt-6 text-sm text-slate/80">
                One moment…
              </p>
            )}

            {step.kind === 'link_password' && (
              <form onSubmit={submitLinkPassword} className="mt-6 flex flex-col gap-4">
                <Input
                  id="new-password"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  helperText="8 to 72 characters. A short sentence is easy to remember and hard to guess."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                {rememberBox}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Saving…' : 'Save password and sign in'}
                </Button>
              </form>
            )}

            {step.kind === 'code_verify' && (
              <form onSubmit={submitEmailCode} className="mt-6 flex flex-col gap-4">
                {emailCodeInput}
                {rememberBox}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Checking…' : 'Sign in'}
                </Button>
                <p className="text-sm text-slate/70">
                  No email?{' '}
                  <button type="button" className={linkButton} disabled={submitting || cooldown > 0} onClick={() => sendCode('login')()}>
                    {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
                  </button>
                </p>
              </form>
            )}

            {step.kind === 'reset_verify' && (
              <form onSubmit={submitReset} className="mt-6 flex flex-col gap-4">
                {emailCodeInput}
                <Input
                  id="new-password"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  helperText="8 to 72 characters. A short sentence is easy to remember and hard to guess."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                {rememberBox}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Saving…' : 'Save password and sign in'}
                </Button>
                <p className="text-sm text-slate/70">
                  No email?{' '}
                  <button type="button" className={linkButton} disabled={submitting || cooldown > 0} onClick={() => sendCode('reset')()}>
                    {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
                  </button>
                </p>
              </form>
            )}

            {step.kind === 'reset_mfa' && (
              <form onSubmit={submitResetMfa} className="mt-6 flex flex-col gap-4">
                {authenticatorInput}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Saving…' : 'Save password and sign in'}
                </Button>
              </form>
            )}

            {step.kind === 'email_step' && (
              <form onSubmit={submitEmailStep} className="mt-6 flex flex-col gap-4">
                <p className="text-sm text-slate/80">
                  Your password was right. For your safety we also sent a code to <span className="font-semibold">{step.maskedEmail}</span>.
                </p>
                {emailCodeInput}
                {rememberBox}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Checking…' : 'Continue'}
                </Button>
                <p className="text-sm text-slate/70">
                  No email? Check spam, or{' '}
                  <button type="button" className={linkButton} disabled={submitting || cooldown > 0} onClick={resendEmailStep}>
                    {cooldown > 0 ? `send a new code in ${cooldown}s` : 'send a new code'}
                  </button>
                </p>
              </form>
            )}

            {step.kind === 'mfa' && (
              <form onSubmit={submitMfa} className="mt-6 flex flex-col gap-4">
                {authenticatorInput}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Verifying…' : 'Verify'}
                </Button>
              </form>
            )}
          </>
        )}

        {notice && !error && (
          <p role="status" className="mt-4 text-sm text-slate/80">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-800">
            {error}
          </p>
        )}

        {step.kind !== 'credentials' && step.kind !== 'done' && (
          <p className="mt-6 border-t border-slate/10 pt-4 text-sm">
            <button type="button" className={linkButton} onClick={() => go({ kind: 'credentials' })}>
              Back to sign in with password
            </button>
          </p>
        )}

        {step.kind === 'credentials' && (
          <p className="mt-6 border-t border-slate/10 pt-4 text-sm text-slate/70">
            First time signing in?{' '}
            <button type="button" className={linkButton} onClick={() => go({ kind: 'reset_request' })}>
              Set your password
            </button>{' '}
            with a code sent to the email your school registered. Still stuck? Ask your school admin, or{' '}
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
