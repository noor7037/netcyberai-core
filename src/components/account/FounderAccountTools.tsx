'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

// Founder console account tools for one account (C91). They work even when
// email is not being delivered: a one-time link and code to pass on over
// WhatsApp or in person, a temporary password, removing a lost authenticator,
// signing out everywhere.
const ERROR_TEXT: Record<string, string> = {
  setup_required: 'Needs the one-time setup in the “Sign-in setup” box above (founder tools off).',
  no_email: 'This account has no email.',
  password_invalid: 'Use 8 to 72 characters, with no space at the start or end.',
  password_rejected: 'Supabase did not accept that password. Try a longer one.',
  own_authenticator: 'You cannot remove your own authenticator. Replace it under Account and security instead.',
  not_found: 'Account not found.',
};

type Result = { kind: 'link'; link: string; code: string | null } | { kind: 'text'; ok: boolean; text: string };

export function FounderAccountTools({ userId, name, isSelf = false }: { userId: string; name: string; isSelf?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [tempPassword, setTempPassword] = useState('');

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/control/users/${userId}/account-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setResult({ kind: 'text', ok: false, text: ERROR_TEXT[data.error] ?? 'That did not work. Please try again.' });
      if (data.link) return setResult({ kind: 'link', link: data.link, code: data.code ?? null });
      const text =
        action === 'temp_password'
          ? `Temporary password set and ${name} signed out everywhere. Tell them the password privately; they can change it under Account and security.`
          : action === 'remove_authenticator'
            ? `Removed ${data.removed ?? 0} authenticator(s) and signed ${name} out everywhere. A platform admin sets up a new one at their next sign-in.`
            : `${name} is signed out on every device.`;
      setTempPassword('');
      setResult({ kind: 'text', ok: true, text });
    } catch {
      setResult({ kind: 'text', ok: false, text: 'We could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
        Founder tools
      </Button>
    );
  }

  const whatsapp = result?.kind === 'link'
    ? `https://wa.me/?text=${encodeURIComponent(
        `NetCyberAI sign-in for ${name}: open this link within 1 hour (works once): ${result.link}` +
          (result.code ? `\nOr enter this code on the login page: ${result.code}` : '')
      )}`
    : null;

  return (
    <div className="flex w-full flex-col gap-3 rounded-md border border-slate/15 bg-off-white p-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => act('signin_link')}>
          Sign-in link
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => act('reset_link')}>
          Password link
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => act('sign_out_all')}>
          Sign out everywhere
        </Button>
        {!isSelf && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              window.confirm(`Remove ${name}'s authenticator app? They will be signed out everywhere and asked to set up a new one.`) &&
              act('remove_authenticator')
            }
          >
            Remove authenticator
          </Button>
        )}
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          act('temp_password', { password: tempPassword });
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-sm text-slate">
          <span>Temporary password</span>
          <input
            type="text"
            autoComplete="off"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            className="min-h-[44px] rounded-md border-2 border-slate/20 bg-white px-3 text-base text-slate"
          />
        </label>
        <Button type="submit" variant="outline" disabled={busy || tempPassword.length < 8} className="sm:self-end">
          Set password
        </Button>
      </form>
      {result?.kind === 'text' && (
        <p role={result.ok ? 'status' : 'alert'} className={`text-sm font-medium ${result.ok ? 'text-emerald-text' : 'text-red-800'}`}>
          {result.text}
        </p>
      )}
      {result?.kind === 'link' && (
        <div role="status" className="flex flex-col gap-2 text-sm text-slate">
          <p className="font-semibold">One-time link for {name} (works once, within 1 hour). No email was sent.</p>
          <input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} className="min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-sm" />
          {result.code && (
            <p>
              Or the code for the login page: <span className="font-mono text-base font-bold tracking-widest">{result.code}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(result.link)}>
              Copy link
            </Button>
            {whatsapp && (
              <Button href={whatsapp} target="_blank" rel="noopener noreferrer" variant="outline">
                Share on WhatsApp
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
