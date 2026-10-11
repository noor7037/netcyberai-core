'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FounderAccountTools } from './FounderAccountTools';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';

// Account list with "send reset code" (C89). Used by principals and school
// admins for their own school (/app/staff, endpoint /api/app/users) and by
// super_admin for every account (/control/users, endpoint /api/control/users).
// A reset emails the person a one-time code; nobody but them ever sees or
// chooses their password.

type Account = {
  userId: string;
  displayName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  schools?: string;
};

const SEND_ERROR: Record<string, string> = {
  no_email: 'This account has no email, so no code can be sent.',
  not_found: 'That account is not in this school.',
  rate_limited: 'An email was sent to this address a moment ago. Wait a minute, then try again.',
  email_limit: 'The email service has reached its hourly limit. Try again later, or use Founder tools to create a link to share.',
  email_send_failed: 'The email service refused to send. Check the SMTP settings in Supabase, or use Founder tools to create a link to share.',
  forbidden: 'Only principals, school admins and platform admins can do this.',
};

function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function StaffAccounts({
  endpoint,
  showSchools = false,
  founderTools = false,
  currentUserId,
}: {
  endpoint: string;
  showSchools?: boolean;
  founderTools?: boolean;
  // The signed-in founder: their own row hides "Remove authenticator" (C95).
  currentUserId?: string;
}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [signOut, setSignOut] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ userId: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(endpoint);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(res.status === 403 ? SEND_ERROR.forbidden : 'We could not load the accounts. Please refresh.');
        return;
      }
      setAccounts(data.accounts as Account[]);
    } catch {
      setLoadError('We could not reach the server. Check your connection and refresh.');
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendReset(a: Account) {
    setBusy(a.userId);
    setResult(null);
    try {
      const res = await fetch(`${endpoint}/${a.userId}/send-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signOutEverywhere: signOut }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ userId: a.userId, ok: false, text: SEND_ERROR[data.error] ?? 'The code could not be sent. Please try again.' });
        return;
      }
      const signedOut = data.signedOutSessions > 0 ? ` Signed out of ${data.signedOutSessions} device(s).` : '';
      setResult({
        userId: a.userId,
        ok: true,
        text: `Reset code sent to ${a.email}. They open the login page, choose "Forgot password?" and enter it.${signedOut}`,
      });
    } catch {
      setResult({ userId: a.userId, ok: false, text: 'We could not reach the server. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  const q = query.trim().toLowerCase();
  const shown = (accounts ?? []).filter(
    (a) => !q || a.displayName.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q) || a.role.includes(q)
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-slate/80">
          Someone forgot their password, or is signing in for the first time? Send them a reset code. It goes to the
          email on their account; they set their own password on the login page. You never see it.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate">
            <input type="checkbox" className="h-5 w-5" checked={signOut} onChange={(e) => setSignOut(e.target.checked)} />
            Also sign them out on every device
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate sm:w-64">
            <span className="sr-only">Search accounts</span>
            <input
              type="search"
              placeholder="Search name, email or role"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-[44px] rounded-md border-2 border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
            />
          </label>
        </div>
      </Card>

      {loadError && (
        <p role="alert" className="text-sm font-medium text-red-800">
          {loadError}
        </p>
      )}
      {!accounts && !loadError && <p className="text-sm text-slate/70">Loading accounts…</p>}
      {accounts && shown.length === 0 && <TeachEmpty id="staff-search" compact onAction={() => setQuery('')} />}

      <ul className="flex flex-col gap-3">
        {shown.map((a) => (
          <li key={a.userId}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-slate">
                  {a.displayName}
                  {!a.isActive && <span className="ml-2 text-xs font-medium text-slate/70">(switched off)</span>}
                </p>
                <p className="break-all text-sm text-slate/70">{a.email ?? 'No email on file'}</p>
                <p className="text-sm text-slate/70">
                  {formatRole(a.role)}
                  {showSchools && a.schools ? ` · ${a.schools}` : ''}
                </p>
                {result?.userId === a.userId && (
                  <p role={result.ok ? 'status' : 'alert'} className={`mt-1 text-sm font-medium ${result.ok ? 'text-emerald-text' : 'text-red-800'}`}>
                    {result.text}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <Button type="button" variant="outline" disabled={!a.email || busy !== null} onClick={() => sendReset(a)}>
                  {busy === a.userId ? 'Sending…' : 'Email reset code'}
                </Button>
              </div>
              {founderTools && (
                <div className="w-full sm:basis-full">
                  <FounderAccountTools userId={a.userId} name={a.displayName} isSelf={a.userId === currentUserId} />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
