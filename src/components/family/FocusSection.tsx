'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fill, type Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';

// The parent area's Focus Lock section (M2b-1, C305; docs/34 §9.1 rule 8): the phones the lock is set up on, with their
// last report, and what the parent should look at: the lock stopped reporting while it was on, a permission was switched
// off, the clock was changed. Each notice stays until the parent taps "Seen". The server never knows which apps were
// opened, or when; set-up happens on the phone itself (M2b-4). Times come formatted from the server, in India time.

export type FocusDeviceView = { deviceId: string; names: string[]; lastReport: string | null; lockOn: boolean | null; permissionsOk: boolean | null };
export type FocusNoticeView = { noticeId: string; deviceId: string; kind: 'stopped' | 'permissions' | 'clock'; time: string };

const phoneName = (w: Words, names: string[]) => (names.length ? fill(w['fam.focus.phoneFor'], { names: names.join(', ') }) : w['fam.focus.phoneForNone']);

function Device({ w, d, notices }: { w: Words; d: FocusDeviceView; notices: FocusNoticeView[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const call = async (path: string, method: 'POST' | 'DELETE', body: Record<string, string>) => {
    setError('');
    const r = await familyApi(path, method, body);
    if (!r.ok) return setError(errorWords(w, r.error));
    setConfirm(false);
    router.refresh();
  };
  const state = d.lockOn === null ? null : d.permissionsOk === false ? w['fam.focus.state.permissions'] : d.lockOn ? w['fam.focus.state.on'] : w['fam.focus.state.off'];
  return (
    <li data-focus-device className="flex flex-col gap-2 rounded-2xl bg-off-white p-4 text-sm text-slate">
      <p className="break-words text-base font-bold">{phoneName(w, d.names)}</p>
      <p>{d.lastReport ? fill(w['fam.focus.lastReport'], { time: d.lastReport }) : w['fam.focus.noReport']}</p>
      {state && <p>{state}</p>}
      {notices.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{w['fam.focus.notices']}</p>
          <ul className="flex flex-col gap-2">
            {notices.map((n) => (
              <li key={n.noticeId} data-focus-notice={n.kind} className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-slate/15 sm:flex-row sm:items-center sm:justify-between">
                <p>{fill(w[`fam.focus.notice.${n.kind}`], { time: n.time })}</p>
                <div className="shrink-0">
                  <Button type="button" variant="outline" onClick={() => void call('/api/family/focus/notices', 'POST', { noticeId: n.noticeId })}>
                    {w['fam.focus.seen']}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!confirm ? (
          <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
            {w['fam.focus.remove']}
          </Button>
        ) : (
          <>
            <p className="w-full">{w['fam.focus.removeConfirm']}</p>
            <Button type="button" variant="outline" onClick={() => void call('/api/family/focus/devices', 'DELETE', { deviceId: d.deviceId })}>
              {w['fam.focus.removeYes']}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
              {w['fam.common.cancel']}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function FocusSection({ w, devices, notices }: { w: Words; devices: FocusDeviceView[]; notices: FocusNoticeView[] }) {
  return (
    <section data-focus-section className="fam-card fam-rise flex flex-col gap-3 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{w['fam.focus.title']}</h2>
      <p className="text-sm text-slate">{w['fam.focus.lead']}</p>
      {devices.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.focus.none']}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {devices.map((d) => (
            <Device key={d.deviceId} w={w} d={d} notices={notices.filter((n) => n.deviceId === d.deviceId)} />
          ))}
        </ul>
      )}
    </section>
  );
}
