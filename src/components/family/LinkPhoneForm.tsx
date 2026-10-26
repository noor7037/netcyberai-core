'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from './client';

// A child's own phone asks for a code and shows it (M2b-2; reversed by C230-AF, C346). The parent types it in the
// parent area on their own phone; this page asks every few seconds, and opens the app for that one child once it is.
const POLL_MS = 3000;
const time = (iso: string, lang: 'en' | 'hi') => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export function LinkPhoneForm({ w, lang }: { w: Words; lang: 'en' | 'hi' }) {
  const [shown, setShown] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setBusy(true);
    setError('');
    const r = await familyApi<{ code: string; expiresAt: string }>('/api/family/child-phone/link', 'POST', { action: 'start' });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'off' ? w['fam.link.off'] : w['fam.link.tooMany']);
    setShown(r.data);
  };
  useEffect(() => {
    if (!shown) return;
    let stop = false;
    const timer = setInterval(async () => {
      const r = await familyApi<{ status: string }>('/api/family/child-phone/link', 'POST', { action: 'check' });
      if (stop) return;
      if (r.ok && r.data.status === 'linked') {
        stop = true;
        clearInterval(timer);
        window.location.assign('/family');
      } else if (!r.ok && r.error === 'gone') {
        stop = true;
        clearInterval(timer);
        setShown(null);
        setError(w['fam.link.gone']);
      }
    }, POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [shown, w]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold text-slate">{w['fam.link.title']}</h1>
      <p className="text-base text-slate">{w['fam.link.lead']}</p>
      {shown ? (
        <div role="status" data-link-code className="flex flex-col gap-2 rounded-2xl bg-white p-5 text-slate">
          <p className="text-sm font-semibold">{w['fam.link.code']}</p>
          <p className="text-4xl font-extrabold tracking-[0.3em]">{shown.code}</p>
          <p className="text-sm">{fill(w['fam.link.wait'], { time: time(shown.expiresAt, lang) })}</p>
        </div>
      ) : (
        <Button type="button" data-link-start disabled={busy} onClick={() => void start()}>
          {w['fam.link.go']}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
