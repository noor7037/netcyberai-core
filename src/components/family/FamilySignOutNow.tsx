'use client';

import { useState } from 'react';
import { Button } from '@/components/family/ui/Button';
import { forgetThisBrowser } from './push-client';
import { clearOffline } from './offline/store';

// /family/sign-out (W14-D, W15-C): asks first. Nothing happens on the visit itself (a prefetch or a stray link must
// never end the session); on "Sign out" it is the same sign-out as the parent area's button (this phone's reminders and
// saved pages go, the session ends), then the sign-in page. "Stay" goes back to the app.
export function FamilySignOutNow({ ask, confirm, stay, working }: { ask: string; confirm: string; stay: string; working: string }) {
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try {
      await forgetThisBrowser();
      await clearOffline();
      await fetch('/api/family/auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch {
      // the sign-in page is next whatever happened here
    }
    window.location.replace('/family/sign-in');
  };
  return (
    <div data-family-sign-out className="flex flex-col items-start gap-4">
      <p role={busy ? 'status' : undefined} className="text-lg font-semibold">{busy ? working : ask}</p>
      {!busy && (
        <div className="flex flex-wrap gap-2">
          <Button data-family-sign-out-confirm onClick={() => void signOut()}>
            {confirm}
          </Button>
          <Button variant="outline" href="/family">
            {stay}
          </Button>
        </div>
      )}
    </div>
  );
}
