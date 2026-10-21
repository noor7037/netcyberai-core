'use client';

import { useStepUp } from '@/components/auth/StepUp';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { MessageKey } from '@/lib/i18n';
import { Select } from '@/components/ui/Select';
import { makePassword } from '@/lib/auth/usernames';
import { LOGIN_ROLES } from '@/lib/control/login-roles';

// Control → a school → its people (C165). The founder sees who belongs to
// the school and can open the app as any active one of them: a reason is
// asked first, the view is time-boxed, and both the start and the end are
// written to the school's own audit trail. The API does all of that; this
// screen only asks.
//
// Logins (founder, 2026-10-15, C230-D): "Create a login" makes a person's sign-in with a username or an email and a
// password, and shows the details to share once. "New password" beside a person sets a new one the same way.

type Person = { userId: string; membershipId: string; name: string; role: string; status: 'active' | 'inactive'; signIn: string | null };
type Shared = { schoolName?: string; name: string; role: string; signIn: string | null; password: string };
const LOGIN_FAILS = ['name', 'role', 'sign_in', 'password', 'guardian', 'service_key', 'already_registered', 'email'];
type Guardian = { parentId: string; name: string; phoneLast4: string | null; children: string; hasLogin: boolean };
const newPassword = () => {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return makePassword(bytes);
};
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function SchoolPeoplePanel({ schoolId }: { schoolId: string }) {
  const { stepUpFetch } = useStepUp();
  const { t } = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<Person | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'failed' | 'aadhaar' | null>(null);
  const [form, setForm] = useState({ name: '', role: 'teacher', signIn: '', password: '', parentId: '' });
  const [guardianQuery, setGuardianQuery] = useState('');
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => setForm((f) => (f.password ? f : { ...f, password: newPassword() })), []);
  // A parent's login is made for one guardian of this school: found by name or phone as the founder types.
  useEffect(() => {
    if (form.role !== 'parent') return;
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/control/schools/${schoolId}/guardians?q=${encodeURIComponent(guardianQuery)}`).catch(() => null);
      const got = res?.ok ? ((await res.json().catch(() => null)) as { guardians?: Guardian[] } | null) : null;
      setGuardians(got?.guardians ?? []);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form.role, guardianQuery, schoolId]);

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
    setError(null);
  }

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!target || !reason.trim()) return;
    setBusy(true);
    const res = await stepUpFetch('/api/control/impersonate/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: target.userId, membershipId: target.membershipId, reason: reason.trim() }) }).catch(() => null);
    if (res?.ok) {
      // A full load: the session cookie is now the person's, and the app shell must be built for them.
      window.location.assign('/app/my-day');
      return;
    }
    setBusy(false);
    // A reason with an Aadhaar number in it is refused (the one rule, C232 part B): said as such.
    const got = res ? ((await res.json().catch(() => null)) as { code?: string } | null) : null;
    setError(got?.code === 'aadhaar' ? 'aadhaar' : 'failed');
  }

  async function createLogin(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const res = await fetch(`/api/control/schools/${schoolId}/logins`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    const got = (await res?.json().catch(() => null)) as (Shared & { code?: string; setting?: string }) | null;
    setCreating(false);
    if (res?.ok && got) {
      setShared({ schoolName: got.schoolName, name: got.name, role: got.role, signIn: got.signIn, password: got.password });
      setCopied(false);
      setForm({ name: '', role: form.role, signIn: '', password: newPassword(), parentId: '' });
      setGuardianQuery('');
      void load();
      return;
    }
    const code = got?.code && LOGIN_FAILS.includes(got.code) ? got.code : null;
    setCreateError(code ? t(`login.bad.${code}` as MessageKey, { setting: got?.setting ?? '' }) : t('login.bad'));
  }

  async function resetPassword(p: Person) {
    const password = newPassword();
    const res = await stepUpFetch(`/api/control/users/${p.userId}/account-action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'temp_password', password }) }).catch(() => null);
    if (res?.ok) {
      setShared({ name: p.name, role: p.role, signIn: p.signIn, password });
      setCopied(false);
      setCreateError(null);
    } else {
      const got = res ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
      setShared(null);
      setCreateError(got?.error === 'setup_required' ? t('login.bad.service_key', { setting: '' }) : t('login.bad'));
    }
  }

  const shareText = shared
    ? [shared.schoolName ? `${t('login.share.school')}: ${shared.schoolName}` : null, `${t('login.share.name')}: ${shared.name}`, `${t('login.share.role')}: ${t(`role.${shared.role}` as MessageKey)}`, `${t('login.share.address')}: ${typeof window === 'undefined' ? '' : window.location.origin}/login`, `${t('login.share.signIn')}: ${shared.signIn ?? '—'}`, `${t('login.share.password')}: ${shared.password}`].filter(Boolean).join('\n')
    : '';

  return (
    <section data-school-people className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-slate">{t('viewAs.people.title')}</h3>

      <form data-create-login onSubmit={createLogin} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <p className="text-sm font-bold text-slate">{t('login.create.title')}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Select id="login-role" label={t('login.field.role')} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, parentId: '' })}>
            {LOGIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}` as MessageKey)}
              </option>
            ))}
          </Select>
          {form.role === 'parent' ? (
            <div className="flex flex-col gap-2">
              <Input id="login-guardian-find" label={t('login.field.guardian')} helperText={t('login.field.guardian.hint')} autoComplete="off" maxLength={60} value={guardianQuery} onChange={(e) => setGuardianQuery(e.target.value)} />
              <Select id="login-guardian" label={t('login.field.guardian.pick')} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} required>
                <option value="">{t(guardians.length ? 'login.field.guardian.choose' : 'login.field.guardian.none')}</option>
                {guardians.map((g) => (
                  <option key={g.parentId} value={g.parentId} disabled={g.hasLogin}>
                    {[g.name, g.phoneLast4 ? `••${g.phoneLast4}` : null, g.children || null, g.hasLogin ? t('login.field.guardian.has') : null].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <Input id="login-name" label={t('login.field.name')} autoComplete="off" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          )}
          <Input id="login-sign-in" label={t('login.field.signIn')} helperText={t('login.field.signIn.hint')} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={254} value={form.signIn} onChange={(e) => setForm({ ...form, signIn: e.target.value })} required />
          <div className="flex flex-col gap-1">
            <Input id="login-password" label={t('login.field.password')} autoComplete="new-password" spellCheck={false} maxLength={72} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <button type="button" data-login-new-password className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-sapphire underline-offset-4 hover:underline" onClick={() => setForm({ ...form, password: newPassword() })}>
              {t('login.newPassword')}
            </button>
          </div>
        </div>
        <button type="submit" data-create-login-submit disabled={creating || (form.role === 'parent' ? !form.parentId : !form.name.trim()) || !form.signIn.trim() || !form.password} className={`${PRIMARY} self-start`}>
          {t('login.create')}
        </button>
        {createError && (
          <p role="alert" data-login-error className="rounded-md border-2 border-red-600 bg-white px-3 py-2 text-sm font-bold text-red-800">
            {createError}
          </p>
        )}
      </form>

      {shared && (
        <div data-login-shared role="status" className="flex flex-col gap-2 rounded-lg border-2 border-emerald-text bg-white p-4 text-sm text-slate">
          <p className="font-bold text-emerald-text">{t('login.shared.title')}</p>
          <pre className="whitespace-pre-wrap break-all rounded-md bg-off-white p-3 font-mono text-sm">{shareText}</pre>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-login-copy className={TAP} onClick={() => void navigator.clipboard?.writeText(shareText).then(() => setCopied(true))}>
              {t(copied ? 'login.copied' : 'login.copy')}
            </button>
            <span className="text-slate/70">{t('login.shared.once')}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-1">
        <p className="text-sm text-slate/70">{t('viewAs.people.how')}</p>
        <InfoTip>{t('viewAs.people.rules')}</InfoTip>
      </div>
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
                {p.signIn && <code className="rounded bg-off-white px-1.5 py-0.5 text-xs">{p.signIn}</code>}
              </span>
              <span className="flex flex-wrap gap-2">
                <button type="button" data-person-password disabled={p.status !== 'active'} className={TAP} onClick={() => void resetPassword(p)}>
                  {t('login.person.password')}
                </button>
                <button type="button" data-view-as disabled={p.status !== 'active' || p.role === 'parent'} className={TAP} onClick={() => ask(p)}>
                  {t('viewAs.button')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal open={target !== null} onClose={() => setTarget(null)} title={target ? t('viewAs.dialog.title', { name: target.name }) : ''}>
        {target && (
          <form onSubmit={start} className="flex flex-col gap-3">
            <p className="text-sm text-slate">{t('viewAs.dialog.how', { role: t(`role.${target.role}` as MessageKey) })}</p>
            <Input id="view-as-reason" label={t('viewAs.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} required />
            {error && <p role="alert" className="text-sm font-semibold text-red-800">{t(error === 'aadhaar' ? 'viewAs.dialog.aadhaar' : 'viewAs.dialog.failed')}</p>}
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
