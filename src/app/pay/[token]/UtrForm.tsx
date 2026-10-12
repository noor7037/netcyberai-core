'use client';

import { useState } from 'react';

// The parent enters the UTR their UPI app showed after paying (docs/24 §3.3 step 5, C174): twelve digits, nothing
// else. There is no screenshot or file field. What is entered is a claim for the school to check, not a payment.
export function UtrForm({ token, labels }: { token: string; labels: { label: string; hint: string; send: string; bad: string; used: string; failed: string } }) {
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const digits = utr.replace(/\s+/g, '');
  async function send() {
    if (!/^[0-9]{12}$/.test(digits)) return setProblem(labels.bad);
    setBusy(true);
    setProblem(null);
    const res = await fetch('/api/public/payments/utr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, utr: digits }) }).catch(() => null);
    if (res?.ok) return window.location.reload();
    const code = ((await res?.json().catch(() => null)) ?? {}).code;
    setProblem(code === 'utr' ? labels.bad : code === 'utr_used' ? labels.used : labels.failed);
    setBusy(false);
  }
  return (
    <div data-utr-form className="flex flex-col gap-2">
      <label htmlFor="utr" className="text-sm font-semibold">{labels.label}</label>
      <input id="utr" inputMode="numeric" autoComplete="off" maxLength={16} value={utr} onChange={(e) => setUtr(e.target.value.replace(/[^0-9 ]/g, ''))} className="min-h-[48px] rounded-md border border-slate/30 px-3 text-lg tracking-widest" />
      <p className="text-xs text-slate/70">{labels.hint}</p>
      {problem && <p role="alert" className="text-sm font-semibold text-red-800">{problem}</p>}
      <button type="button" data-utr-send disabled={busy} className="min-h-[48px] rounded-md bg-sapphire px-5 text-base font-semibold text-white disabled:opacity-60" onClick={() => void send()}>
        {labels.send}
      </button>
    </div>
  );
}
