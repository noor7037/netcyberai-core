'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';

// The founder's sign-in setup checklist (C91). The app can see only its own
// settings; the Supabase ones are listed as steps because no key the app
// holds can read or change them.
type Status = { serviceRoleKey: boolean; settingName: string; emailStep: boolean; origin: string };

export function SignInSetupPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    fetch('/api/control/auth-status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);
  const origin = status?.origin ?? 'https://www.netcyberai.com';

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-slate">Sign-in setup</h2>
      <ul className="flex flex-col gap-2 text-sm text-slate">
        <li>
          <span className="font-semibold">{status?.serviceRoleKey ? '✓ Founder tools on' : '✗ Founder tools off'}</span>
          {!status?.serviceRoleKey && (
            <>
              {' '}
              — in Vercel → Settings → Environment Variables, add <code>{status?.settingName}</code> with the “service_role” secret
              key from Supabase → Project Settings → API Keys, then redeploy.
            </>
          )}
        </li>
        <li>
          <span className="font-semibold">{status?.emailStep ? '✓ Email code after password: on' : '• Email code after password: off'}</span>
        </li>
        <li>
          <span className="font-semibold">Supabase → Authentication → URL Configuration:</span> Site URL <code>{origin}</code>, and add{' '}
          <code>{origin}/**</code> to Redirect URLs. Without this, links in emails open “localhost”.
        </li>
        <li>
          <span className="font-semibold">Supabase → Authentication → Emails → SMTP:</span> connect an email service (for example
          Resend). Until then Supabase sends only a few emails an hour, and only to your Supabase team.
        </li>
      </ul>
    </Card>
  );
}
