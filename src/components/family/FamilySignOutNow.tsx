'use client';

import { useEffect } from 'react';
import { forgetThisBrowser } from './push-client';
import { clearOffline } from './offline/store';

// /family/sign-out (W14-D): the same sign-out as the parent area's button (this phone's reminders and saved pages go,
// the session ends), then the sign-in page. It lands on sign-in even if the call fails, where the person can sign in again.
export function FamilySignOutNow({ working, signIn }: { working: string; signIn: string }) {
  useEffect(() => {
    void (async () => {
      try {
        await forgetThisBrowser();
        await clearOffline();
        await fetch('/api/family/auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      } catch {
        // the sign-in page is next whatever happened here
      }
      window.location.replace('/family/sign-in');
    })();
  }, []);
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="status">{working}</p>
      <a href="/family/sign-in" className="inline-flex min-h-[44px] items-center font-semibold text-ink underline">
        {signIn}
      </a>
    </div>
  );
}
