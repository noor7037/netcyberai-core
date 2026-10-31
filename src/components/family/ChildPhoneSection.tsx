'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/family/ui/Button';
import { Input } from '@/components/ui/Input';
import { fill, type Words } from '@/lib/family/fill';
import type { ChildPhone } from '@/lib/family/child-phone-shape';
import { familyApi } from './client';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// Children's own phones (M2b-2; reversed by C230-AF, C346; docs/34 §9.4), in the parent area: the code the child's
// phone shows is typed here, with the child it is for, and each phone still linked is listed, which the parent removes
// at once. `canLink`: Control has the family's Focus Lock switched on; without it only the list (and Remove) shows.
const when = (iso: string, lang: 'en' | 'hi') => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso)));

export function ChildPhoneSection({ w, lang, children, phones, canLink }: { w: Words; lang: 'en' | 'hi'; children: { childId: string; firstName: string }[]; phones: ChildPhone[]; canLink: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const nameOf = (childId: string) => children.find((c) => c.childId === childId)?.firstName ?? '';
  const ready = code.replace(/[\s-]/g, '').length === 6;
  const link = async (childId: string) => {
    setBusy(true);
    setError('');
    setDone('');
    const r = await familyApi('/api/family/child-phone', 'POST', { action: 'link', childId, code });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'too_many' ? w['fam.phone.tooMany'] : r.error === 'wrong' ? w['fam.phone.wrong'] : w['fam.school.saveError']);
    setCode('');
    setDone(fill(w['fam.phone.done'], { name: nameOf(childId) }));
    // The phone takes its session within a few seconds; the list shows it then.
    setTimeout(() => router.refresh(), 6000);
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
    <section data-child-phones className="fam-card fam-section fam-rise bg-white">
      <h2 className="fam-h2 text-slate">{w['fam.phone.title']}</h2>
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
      {canLink && (
        <div data-child-phone-link className="flex flex-col gap-3">
          <p className="text-sm text-slate">{w['fam.phone.how']}</p>
          <Input id="fam-phone-code" label={w['fam.phone.code']} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="off" maxLength={7} />
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Button key={c.childId} type="button" variant="outline" disabled={busy || !ready} onClick={() => void link(c.childId)}>
                {fill(w['fam.phone.link'], { name: c.firstName })}
              </Button>
            ))}
          </div>
        </div>
      )}
      {done && (
        <p role="status" data-child-phone-done className="rounded-xl bg-saffron/10 p-3 text-sm font-semibold text-slate">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
