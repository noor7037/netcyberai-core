'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fill, type Words } from '@/lib/family/fill';
import type { ChildPhone } from '@/lib/family/child-phone-shape';
import { familyApi } from './client';

// Children's own phones (M2b-2, C342; docs/34 §9.4), in the parent area: a one-time code to link one child's phone,
// and each phone still linked, which the parent removes at once.
const when = (iso: string, lang: 'en' | 'hi', time = false) =>
  new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', time ? { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' } : { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export function ChildPhoneSection({ w, lang, children, phones }: { w: Words; lang: 'en' | 'hi'; children: { childId: string; firstName: string }[]; phones: ChildPhone[] }) {
  const router = useRouter();
  const [code, setCode] = useState<{ childId: string; code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameOf = (childId: string) => children.find((c) => c.childId === childId)?.firstName ?? '';
  const makeCode = async (childId: string) => {
    setBusy(true);
    setError('');
    const r = await familyApi<{ code: string; expiresAt: string }>('/api/family/child-phone', 'POST', { action: 'code', childId });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'too_many' ? w['fam.phone.tooMany'] : w['fam.school.saveError']);
    setCode({ childId, code: r.data.code, expiresAt: r.data.expiresAt });
  };
  const remove = async (deviceId: string) => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/child-phone', 'POST', { action: 'remove', deviceId });
    setBusy(false);
    if (!r.ok) return setError(w['fam.school.saveError']);
    router.refresh();
  };
  return (
    <section data-child-phones className="fam-card fam-rise flex flex-col gap-3 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{w['fam.phone.title']}</h2>
      <p className="text-sm text-slate">{w['fam.phone.lead']}</p>
      {phones.length > 0 && (
        <ul className="flex flex-col gap-2">
          {phones.map((p) => (
            <li key={p.deviceId} data-child-phone={p.deviceId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              <span>
                {fill(w['fam.phone.linked'], { name: nameOf(p.childId), date: when(p.linkedAt, lang) })}
                {p.lastSeenAt ? ` · ${fill(w['fam.phone.lastSeen'], { date: when(p.lastSeenAt, lang) })}` : ''}
              </span>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void remove(p.deviceId)}>
                {w['fam.phone.remove']}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {children.map((c) => (
          <Button key={c.childId} type="button" variant="outline" disabled={busy} onClick={() => void makeCode(c.childId)}>
            {fill(w['fam.phone.link'], { name: c.firstName })}
          </Button>
        ))}
      </div>
      {code && (
        <div role="status" data-child-phone-code className="flex flex-col gap-1 rounded-xl bg-royal/10 p-3 text-slate">
          <p className="text-lg font-extrabold tracking-widest">{fill(w['fam.phone.code'], { name: nameOf(code.childId), code: code.code })}</p>
          <p className="text-sm">{fill(w['fam.phone.codeNote'], { name: nameOf(code.childId), time: when(code.expiresAt, lang, true) })}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
