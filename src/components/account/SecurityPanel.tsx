'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

// Account security (C90): the mobile number used to sign in, forgetting
// this device, and signing out on every device.
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

export function SecurityPanel() {
  const [phone, setPhone] = useState('');
  const [phoneMsg, setPhoneMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deviceMsg, setDeviceMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setDeviceMsg('This device is forgotten. The next sign-in here will ask for the email code.');
    setBusy(false);
  }

  async function signOutEverywhere() {
    if (!window.confirm('Sign out on every device, including this one?')) return;
    setBusy(true);
    const r = await post('/api/auth/logout-all').catch(() => null);
    if (r?.ok) {
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
            helperText="Optional. Lets you type your mobile number instead of your email when you sign in. Codes still go to your email."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={busy}>
            Save number
          </Button>
        </form>
        {phoneMsg && (
          <p role={phoneMsg.ok ? 'status' : 'alert'} className={`mt-3 text-sm font-medium ${phoneMsg.ok ? 'text-emerald-text' : 'text-red-800'}`}>
            {phoneMsg.text}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-slate">Devices and sessions</h2>
        <p className="text-sm text-slate/80">
          You stay signed in on each device until you log out. A remembered device skips the email code for 30 days.
        </p>
        <Button type="button" variant="outline" disabled={busy} onClick={forgetDevice}>
          Forget this device
        </Button>
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
