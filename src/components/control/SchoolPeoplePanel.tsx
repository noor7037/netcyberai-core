'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { MessageKey } from '@/lib/i18n';

// Control → a school → its people (C165). The founder sees who belongs to
// the school and can open the app as any active one of them: a reason is
// asked first, the view is time-boxed, and both the start and the end are
// written to the school's own audit trail. The API does all of that; this
// screen only asks.

type Person = { userId: string; membershipId: string; name: string; role: string; status: 'active' | 'inactive' };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function SchoolPeoplePanel({ schoolId }: { schoolId: string }) {
  const { t } = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<Person | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/control/schools/${schoolId}/people`).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (body?.people) setPeople(body.people);
    else setFailed(true);
  }, [schoolId]);
  useEffect(() => {
    void load();
  }, [load]);

  function ask(p: Person) {
    setTarget(p);
    setReason(t('viewAs.reason.default'));
    setError(false);
  }

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!target || !reason.trim()) return;
    setBusy(true);
    const res = await fetch('/api/control/impersonate/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: target.userId, membershipId: target.membershipId, reason: reason.trim() }) }).catch(() => null);
    if (res?.ok) {
      // A full load: the session cookie is now the person's, and the app shell must be built for them.
      window.location.assign('/app/my-day');
      return;
    }
    setBusy(false);
    setError(true);
  }

  return (
    <section data-school-people className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-slate">{t('viewAs.people.title')}</h3>
      <p className="text-sm text-slate/70">{t('viewAs.people.how')}</p>
      {failed && <p role="alert" className="text-sm font-semibold text-red-800">{t('viewAs.people.failed')}</p>}
      {people && people.length === 0 && <p className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('viewAs.people.none')}</p>}
      {people && people.length > 0 && (
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li key={p.membershipId} data-person={p.role} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 bg-white px-3 py-2 text-sm text-slate">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                <span className="text-slate/70">{t(`role.${p.role}` as MessageKey)}</span>
                <Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{t(p.status === 'active' ? 'viewAs.status.active' : 'viewAs.status.inactive')}</Badge>
              </span>
              <button type="button" data-view-as disabled={p.status !== 'active'} className={TAP} onClick={() => ask(p)}>
                {t('viewAs.button')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={target !== null} onClose={() => setTarget(null)} title={target ? t('viewAs.dialog.title', { name: target.name }) : ''}>
        {target && (
          <form onSubmit={start} className="flex flex-col gap-3">
            <p className="text-sm text-slate">{t('viewAs.dialog.how', { role: t(`role.${target.role}` as MessageKey) })}</p>
            <Input id="view-as-reason" label={t('viewAs.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} required />
            {error && <p role="alert" className="text-sm font-semibold text-red-800">{t('viewAs.dialog.failed')}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" data-view-as-start disabled={busy || !reason.trim()} className={PRIMARY}>
                {t('viewAs.dialog.start')}
              </button>
              <button type="button" className={TAP} onClick={() => setTarget(null)}>
                {t('viewAs.dialog.cancel')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
