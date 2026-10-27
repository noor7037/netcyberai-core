'use client';

import { useEffect, useState } from 'react';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import type { DeviceWords } from './device-words';
import { clearScanOutbox } from '@/lib/marking/outbox-clear';

// Account security (C90): the mobile number used to sign in, the browsers
// trusted to skip the sign-in codes (F1-1, C257: each with "Forget"), and
// signing out on every device.
type Device = { deviceId: string; label: string; proof: 'authenticator' | 'email'; lastUsedAt: string; expiresAt: string; thisDevice: boolean };
// The device list's words come from the page, in its language (device-words.ts). This file exports only the panel:
// it is 'use client', so a list exported from here cannot be read on the server (W2-15).
const PHONE_ERROR: Record<string, string> = {
  phone_invalid: 'Enter a 10-digit Indian mobile number, for example 98765 43210.',
  phone_taken: 'Another account already uses this number.',
  forbidden: 'A support session cannot change this.',
  session_expired: 'Your session expired. Sign in again.',
};

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function SecurityPanel({ w }: { w: DeviceWords }) {
  const day = (iso: string) => new Date(iso).toLocaleDateString(w.lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const [phone, setPhone] = useState('');
  const [phoneMsg, setPhoneMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deviceMsg, setDeviceMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Device[] | null>(null);

  const loadDevices = () =>
    fetch('/api/auth/devices')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDevices(Array.isArray(d?.devices) ? d.devices : []))
      .catch(() => setDevices([]));

  useEffect(() => {
    void loadDevices();
  }, []);

  useEffect(() => {
    fetch('/api/auth/phone')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.phone && setPhone(d.phone))
      .catch(() => {});
  }, []);

  async function savePhone(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPhoneMsg(null);
    try {
      const { ok, data } = await post('/api/auth/phone', { phone });
      if (!ok) return setPhoneMsg({ ok: false, text: PHONE_ERROR[data.error] ?? 'We could not save the number.' });
      setPhone(data.phone ?? '');
      setPhoneMsg({ ok: true, text: data.phone ? 'Saved. You can now sign in with this number.' : 'Number removed.' });
    } catch {
      setPhoneMsg({ ok: false, text: 'We could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  async function forgetDevice() {
    setBusy(true);
    await post('/api/auth/device/forget').catch(() => null);
    setDeviceMsg(w['account.devices.thisForgotten']);
    await loadDevices();
    setBusy(false);
  }

  async function forgetOne(d: Device) {
    setBusy(true);
    const r = await post('/api/auth/devices', { deviceId: d.deviceId }).catch(() => null);
    setDeviceMsg(r?.ok ? w['account.devices.forgotten'].replace('{label}', d.label) : w['account.devices.forgetFailed']);
    await loadDevices();
    setBusy(false);
  }

  async function signOutEverywhere() {
    if (!window.confirm('Sign out on every device, including this one?')) return;
    setBusy(true);
    const r = await post('/api/auth/logout-all').catch(() => null);
    if (r?.ok) {
      // Children's answer pages waiting on this phone go too, as at an ordinary sign-out (C230-AJ, review of AJ-3).
      await clearScanOutbox().catch(() => undefined);
      window.location.href = '/login';
      return;
    }
    setDeviceMsg('We could not sign you out everywhere. Please try again.');
    setBusy(false);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <Card>
        <form onSubmit={savePhone} className="flex flex-col gap-4">
          <Input
            id="phone"
            label="Mobile number for sign-in"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-x-1">
            <Button type="submit" variant="outline" disabled={busy}>
              Save number
            </Button>
            <InfoTip>Optional. Lets you type your mobile number instead of your email when you sign in. Codes still go to your email.</InfoTip>
          </div>
        </form>
        {phoneMsg && (
          <p role={phoneMsg.ok ? 'status' : 'alert'} className={`mt-3 text-sm font-medium ${phoneMsg.ok ? 'text-emerald-text' : 'text-red-800'}`}>
            {phoneMsg.text}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold text-slate">Devices and sessions</h2>
          <InfoTip>{w['account.devices.tip']}</InfoTip>
        </div>
        <h3 className="text-sm font-bold text-slate">{w['account.devices.heading']}</h3>
        {devices === null ? (
          <p className="text-sm text-slate/80">{w['account.devices.loading']}</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-slate/80">{w['account.devices.none']}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {devices.map((d) => (
              <li key={d.deviceId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/15 p-3">
                <span className="text-sm text-slate">
                  <span className="font-semibold">{d.label}</span>
                  {d.thisDevice && <span className="ml-2 rounded bg-sapphire/10 px-2 py-0.5 text-xs font-semibold text-royal">{w['account.devices.this']}</span>}
                  <span className="block text-slate/80">
                    {d.proof === 'authenticator' ? w['account.devices.skipsBoth'] : w['account.devices.skipsEmail']} ·{' '}
                    {w['account.devices.dates'].replace('{used}', day(d.lastUsedAt)).replace('{until}', day(d.expiresAt))}
                  </span>
                </span>
                <Button type="button" variant="outline" disabled={busy} onClick={() => (d.thisDevice ? forgetDevice() : forgetOne(d))}>
                  {w['account.devices.forget']}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" disabled={busy} onClick={signOutEverywhere}>
          Sign out on all devices
        </Button>
        {deviceMsg && (
          <p role="status" className="text-sm font-medium text-slate">
            {deviceMsg}
          </p>
        )}
      </Card>
    </div>
  );
}
