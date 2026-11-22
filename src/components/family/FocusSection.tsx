'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/family/ui/Button';
import { fill, type Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';
import { connectFocusApp, focusLink, focusLinkAvailable, type FocusLinkStatus } from './focus-link';

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

export type FocusChildView = { childId: string; firstName: string };

// C538: the lock is its own app, NetCyberAI Focus. On this phone, the parent installs it and connects it with one tap:
// no code to type. Only in the Android app (the FocusLink plugin); a browser is told where to do it.
function SetUpHere({ w, kids, lang, onPlay }: { w: Words; kids: FocusChildView[]; lang: string; onPlay: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<FocusLinkStatus | 'browser' | null>(null);
  const [chosen, setChosen] = useState<string[]>(kids.map((k) => k.childId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!focusLinkAvailable()) return setState('browser');
    const read = () => void focusLink.status().then(setState, () => setState('browser'));
    read();
    // Back from the Play Store: look again.
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, []);
  if (state === null) return null;
  const box = 'flex flex-col gap-3 rounded-2xl bg-off-white p-4 text-sm text-slate';
  if (state === 'browser') return <p className={box}>{w['fam.focus.app.browser']}</p>;
  if (!state.installed) {
    return (
      <div data-focus-setup="install" className={box}>
        <p className="text-base font-bold">{w['fam.focus.app.title']}</p>
        <p>{w['fam.focus.app.what']}</p>
        {onPlay ? (
          <div>
            <Button type="button" onClick={() => void focusLink.install()}>
              {w['fam.focus.app.install']}
            </Button>
          </div>
        ) : (
          <p className="font-semibold">{w['fam.focus.app.soon']}</p>
        )}
      </div>
    );
  }
  if (!state.sameKey) return <p data-focus-setup="key" role="alert" className={box}>{w['fam.focus.app.key']}</p>;
  const connect = async () => {
    setBusy(true);
    setError('');
    const r = await connectFocusApp(chosen, lang);
    setBusy(false);
    if (!r.ok) return setError(r.error === 'focus_app' ? w['fam.focus.app.failed'] : errorWords(w, r.error));
    setDone(true);
    router.refresh();
  };
  return (
    <div data-focus-setup="connect" className={box}>
      <p className="text-base font-bold">{w['fam.focus.app.title']}</p>
      <p>{w['fam.focus.app.connectLead']}</p>
      {kids.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{w['fam.focus.app.who']}</legend>
          {kids.map((k) => (
            <label key={k.childId} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={chosen.includes(k.childId)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, k.childId] : c.filter((x) => x !== k.childId)))}
              />
              <span className="text-base">{k.firstName}</span>
            </label>
          ))}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="font-semibold text-red-700">
          {error}
        </p>
      )}
      {done && <p role="status">{w['fam.focus.app.done']}</p>}
      <div>
        <Button type="button" disabled={busy || chosen.length === 0} onClick={() => void connect()}>
          {busy ? w['fam.focus.app.connecting'] : w['fam.focus.app.connect']}
        </Button>
      </div>
    </div>
  );
}

export function FocusSection({
  w,
  devices,
  notices,
  kids = [],
  canSetUp = false,
  lang = 'en',
  onPlay = false,
}: {
  w: Words;
  devices: FocusDeviceView[];
  notices: FocusNoticeView[];
  kids?: FocusChildView[];
  canSetUp?: boolean;
  lang?: string;
  onPlay?: boolean;
}) {
  return (
    <section data-focus-section className="fam-card fam-section fam-rise bg-white">
      <h2 className="fam-h2 text-slate">{w['fam.focus.title']}</h2>
      <p className="text-sm text-slate">{w['fam.focus.lead']}</p>
      {canSetUp && kids.length > 0 && <SetUpHere w={w} kids={kids} lang={lang} onPlay={onPlay} />}
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
