'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from './LangContext';
import type { MessageKey } from '@/lib/i18n';

// Shown on every /app page while the founder is viewing the app as someone
// else (C165): who, in what role, until when, and the way out. The session
// behind it is the person's real membership, time-boxed and audited; ending
// it puts the founder's own session back.

export function ViewAsBanner({ name, role, endsAt, schoolId }: { name: string; role: string; endsAt: string; schoolId: string }) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const time = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(endsAt));

  // Time left, counted down each second from the server's own end time (C180). At zero the view is ended here
  // as well: the session behind it has already stopped working.
  const [left, setLeft] = useState<number | null>(null);

  const end = useCallback(async () => {
    setBusy(true);
    await fetch('/api/control/impersonate/end', { method: 'POST' }).catch(() => null);
    window.location.assign(`/control/schools/${schoolId}`);
  }, [schoolId]);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  useEffect(() => {
    if (left === 0) void end();
  }, [left, end]);
  const clock = left === null ? '' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (
    <div role="status" lang={lang} data-view-as-banner className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b-2 border-tangerine bg-gold px-4 py-2 text-sm font-semibold text-midnight">
      <span>
        {t('viewAs.banner', { name, role: t(`role.${role}` as MessageKey), time })}
        {left !== null && (
          <span data-view-as-left={left} className={`ml-2 inline-block rounded px-2 py-0.5 tabular-nums ${left <= 120 ? 'bg-midnight text-white' : ''}`}>
            {t(left <= 120 ? 'viewAs.left.soon' : 'viewAs.left', { clock })}
          </span>
        )}
      </span>
      <button type="button" data-view-as-end disabled={busy} className="min-h-[44px] rounded-md bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void end()}>
        {t('viewAs.end')}
      </button>
    </div>
  );
}
