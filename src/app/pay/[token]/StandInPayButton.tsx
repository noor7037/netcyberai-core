'use client';

import { useState } from 'react';

// The stand-in provider's "checkout": one button that plays the gateway's
// part (C169). It is rendered only where the stand-in is configured. The
// page is read again afterwards; what it then shows comes from the database.
export function StandInPayButton({ token, labels }: { token: string; labels: { pay: string; note: string; failed: string } }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function pay() {
    setBusy(true);
    const res = await fetch('/api/public/payments/standin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    if (res?.ok) window.location.reload();
    else {
      setFailed(true);
      setBusy(false);
    }
  }
  return (
    <>
      <p>{labels.note}</p>
      <button type="button" data-standin-pay disabled={busy} className="min-h-[48px] rounded-md bg-sapphire px-5 text-base font-semibold text-white disabled:opacity-60" onClick={() => void pay()}>
        {labels.pay}
      </button>
      {failed && <p role="alert" className="font-semibold text-red-800">{labels.failed}</p>}
    </>
  );
}
