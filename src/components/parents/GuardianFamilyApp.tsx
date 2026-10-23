'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';

// The guardian screen's Family app box (C230-AA): the principal or a school admin makes a connect code for this
// guardian to enter in NetCyberAI's Family app (shown once; it works once, for 7 days), or disconnects the guardian's
// Family app. A connected family then sees this guardian's children only, as the school's parent rules allow.
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';

export function GuardianFamilyApp({ parentId }: { parentId: string }) {
  const { t } = useT();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const call = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setNote('');
    const res = await fetch(`/api/app/guardians/${parentId}/family-code`, { method }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!body) return setNote(t('par.familyApp.failed'));
    if (method === 'POST') setCode(body);
    else {
      setCode(null);
      setNote(t('par.familyApp.disconnected', { n: body.closed }));
    }
  };
  return (
    <div data-guardian-family-app className="flex flex-col gap-2">
      <h3 className="font-bold">{t('par.familyApp.title')}</h3>
      <p>{t('par.familyApp.how')}</p>
      {code && (
        <p data-family-code className="rounded-md bg-off-white px-3 py-2">
          <span className="block text-2xl font-extrabold tracking-[0.15em] text-slate">{code.code}</span>
          {t('par.familyApp.until', { when: new Date(code.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) })}
        </p>
      )}
      {note && <p role="status" className="rounded-md bg-off-white px-3 py-2">{note}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={TAP} onClick={() => void call('POST')}>
          {t(code ? 'par.familyApp.again' : 'par.familyApp.make')}
        </button>
        {!confirm ? (
          <button type="button" disabled={busy} className={TAP} onClick={() => setConfirm(true)}>
            {t('par.familyApp.disconnect')}
          </button>
        ) : (
          <>
            <p className="w-full">{t('par.familyApp.disconnectNote')}</p>
            <button type="button" disabled={busy} className={TAP} onClick={() => { setConfirm(false); void call('DELETE'); }}>
              {t('par.familyApp.disconnectYes')}
            </button>
            <button type="button" disabled={busy} className={TAP} onClick={() => setConfirm(false)}>
              {t('par.familyApp.keep')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
