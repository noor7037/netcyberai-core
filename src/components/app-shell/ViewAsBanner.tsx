'use client';

import { useState } from 'react';
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

  async function end() {
    setBusy(true);
    await fetch('/api/control/impersonate/end', { method: 'POST' }).catch(() => null);
    window.location.assign(`/control/schools/${schoolId}`);
  }

  return (
    <div role="status" lang={lang} data-view-as-banner className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b-2 border-tangerine bg-gold px-4 py-2 text-sm font-semibold text-midnight">
      <span>{t('viewAs.banner', { name, role: t(`role.${role}` as MessageKey), time })}</span>
      <button type="button" data-view-as-end disabled={busy} className="min-h-[44px] rounded-md bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void end()}>
        {t('viewAs.end')}
      </button>
    </div>
  );
}
