'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import type { Words } from '@/lib/family/fill';
import { familyApi } from './client';

// What the app tells the parent about (M3-8a, C338): the school's new homework, notices and results, and tonight's
// practice and plan. An off kind is not counted as new on the home, and is never pushed.
const KINDS = ['homework', 'notices', 'results', 'tonight'] as const;

// This browser's notifications (M3-8b, C339): Web Push where the browser has it (not inside the Android app, until its
// own push arrives with Firebase). The service worker for /family carries them (public/sw.js).
type PushState = 'unknown' | 'unsupported' | 'blocked' | 'on' | 'off';

function urlKey(base64url: string): Uint8Array {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function PushControl({ w, publicKey }: { w: Words; publicKey: string }) {
  const [state, setState] = useState<PushState>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported');
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await navigator.serviceWorker.getRegistration('/family/').catch(() => undefined);
      setState((await reg?.pushManager.getSubscription().catch(() => null)) ? 'on' : 'off');
    })();
  }, []);
  const turnOn = async () => {
    setBusy(true);
    setError('');
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setState('blocked');
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/family' });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(publicKey) as BufferSource });
      const r = await familyApi('/api/family/push', 'POST', { action: 'subscribe', subscription: sub.toJSON() });
      if (!r.ok) {
        await sub.unsubscribe().catch(() => undefined);
        return setError(w['fam.school.saveError']);
      }
      setState('on');
    } catch {
      setError(w['fam.school.saveError']);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    setError('');
    const reg = await navigator.serviceWorker.getRegistration('/family/').catch(() => undefined);
    const sub = await reg?.pushManager.getSubscription().catch(() => null);
    if (sub) {
      await familyApi('/api/family/push', 'POST', { action: 'unsubscribe', endpoint: sub.endpoint });
      await sub.unsubscribe().catch(() => undefined);
    }
    setState('off');
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-off-white p-3" data-push-state={state}>
      <p className="text-sm font-semibold text-slate">{w['fam.push.title']}</p>
      {state === 'unsupported' && <p className="text-sm text-slate">{w['fam.push.unsupported']}</p>}
      {state === 'blocked' && <p className="text-sm text-slate">{w['fam.push.blocked']}</p>}
      {state === 'on' && (
        <>
          <p className="text-sm text-slate">{w['fam.push.isOn']}</p>
          <Button type="button" variant="outline" className="self-start" disabled={busy} onClick={() => void turnOff()}>
            {w['fam.push.turnOff']}
          </Button>
        </>
      )}
      {state === 'off' && (
        <Button type="button" className="self-start" disabled={busy} onClick={() => void turnOn()}>
          {w['fam.push.turnOn']}
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

export function NotifySection({ w, off, publicKey }: { w: Words; off: readonly string[]; publicKey: string | null }) {
  const [state, setState] = useState<Record<string, boolean>>(Object.fromEntries(KINDS.map((k) => [k, !off.includes(k)])));
  const [error, setError] = useState('');
  const flip = async (kind: (typeof KINDS)[number], on: boolean) => {
    setError('');
    setState((s) => ({ ...s, [kind]: on }));
    const r = await familyApi('/api/family/notify', 'POST', { kind, on });
    if (!r.ok) {
      setState((s) => ({ ...s, [kind]: !on }));
      setError(w['fam.school.saveError']);
    }
  };
  return (
    <section data-notify-section className="fam-card fam-rise flex flex-col gap-2 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{w['fam.notify.title']}</h2>
      <p className="text-sm text-slate">{w['fam.notify.lead']}</p>
      {publicKey && <PushControl w={w} publicKey={publicKey} />}
      {KINDS.map((k) => (
        <Switch
          key={k}
          id={`fam-notify-${k}`}
          label={w[`fam.notify.${k}`]}
          stateText={state[k] ? w['fam.notify.on'] : w['fam.notify.off']}
          checked={state[k]}
          onChange={(e) => void flip(k, e.target.checked)}
        />
      ))}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
