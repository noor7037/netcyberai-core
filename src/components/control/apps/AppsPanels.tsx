'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/app-shell/LangContext';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { FLAG_AUDIENCES, WHOLE_APP, type AppId, type FlagAudience } from '@/lib/contracts/app-flags';
import { isMessageKey, type MessageKey } from '@/lib/i18n';
import type { FlagRow } from '@/lib/control/apps';

// The forms of Control → Apps (M1-7). Each posts to /api/control/apps/** and then reads the page again. Every change
// asks for its reason; the server refuses one without. The whole-app switch asks twice, on the page (no browser
// dialog). Words come from the message files.

type Result = { ok: true } | { ok: false; code: string };

async function send(url: string, body: unknown): Promise<Result> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, code: 'generic' };
  if (res.ok) return { ok: true };
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: false, code: res.status === 401 ? 'session' : (json.code ?? 'generic') };
}

// The state every form keeps: busy, the last error, and the way to run a request and refresh.
function useChange(onDone?: () => void) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await send(url, body);
    setBusy(false);
    if (!r.ok) {
      const key = `control.apps.err.${r.code}`;
      setError(t(isMessageKey(key) ? (key as MessageKey) : 'control.apps.err.generic'));
      return false;
    }
    onDone?.();
    router.refresh();
    return true;
  };
  return { busy, error, run };
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-medium text-red-800">
      {error}
    </p>
  );
}

function Reason({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  return <Input id={id} label={t('control.apps.reason')} value={value} onChange={(e) => onChange(e.target.value)} maxLength={300} required helperText={t('control.apps.reason.help')} />;
}

const toIso = (local: string): string | null => {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// --- The oldest accepted version -------------------------------------------------------------------------------

export function VersionForm({ app, current }: { app: AppId; current: number }) {
  const { t } = useT();
  const [value, setValue] = useState(String(current));
  const [reason, setReason] = useState('');
  const { busy, error, run } = useChange(() => setReason(''));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('/api/control/apps/version', { app, minShellVersion: Number(value), reason });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-app-version-form={app}>
      <Input id={`ver-${app}`} type="number" inputMode="numeric" min={0} step={1} label={t('control.apps.minShell')} value={value} onChange={(e) => setValue(e.target.value)} helperText={t('control.apps.minShell.help')} required />
      <Reason id={`ver-reason-${app}`} value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <div>
        <Button type="submit" variant="outline" disabled={busy || reason.trim() === ''}>
          {busy ? t('control.apps.saving') : t('control.apps.save')}
        </Button>
      </div>
    </form>
  );
}

// --- The whole app's switch ------------------------------------------------------------------------------------

export function KillSwitch({ app, flag, live }: { app: AppId; flag: FlagRow | null; live: boolean }) {
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useChange(() => {
    setConfirming(false);
    setReason('');
  });
  const turningOff = live;
  const status = flag === null ? t('control.apps.kill.unset') : live ? t('control.apps.kill.on') : t('control.apps.kill.off');
  const go = (e: FormEvent) => {
    e.preventDefault();
    void run('/api/control/apps/flags', {
      app,
      module: WHOLE_APP,
      enabled: !turningOff,
      audience: 'everyone',
      reason,
      endsAt: null,
      offMessageEn: flag?.off_message_en ?? null,
      offMessageHi: flag?.off_message_hi ?? null,
    });
  };
  return (
    <div data-kill-switch={app} data-kill-state={live ? 'on' : 'off'} className={`flex flex-col gap-3 rounded-xl border-2 p-4 ${live ? 'border-slate/20 bg-white' : 'border-red-800 bg-red-50'}`}>
      <p className="text-base font-bold text-slate">{status}</p>
      {!confirming && (
        <div>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            {turningOff ? t('control.apps.kill.turnOff') : t('control.apps.kill.turnOn')}
          </Button>
        </div>
      )}
      {confirming && (
        <form onSubmit={go} className="flex flex-col gap-3" data-kill-confirm={app}>
          <p role="alert" className="text-sm font-semibold text-slate">
            {turningOff ? t('control.apps.kill.confirmOff') : t('control.apps.kill.confirmOn')}
          </p>
          <Reason id={`kill-reason-${app}`} value={reason} onChange={setReason} />
          <ErrorLine error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || reason.trim() === ''}>
              {busy ? t('control.apps.saving') : turningOff ? t('control.apps.kill.yesOff') : t('control.apps.kill.yesOn')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {t('control.apps.cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// --- One module's flag -----------------------------------------------------------------------------------------

// `label`: the module's name in words (C230-V), when Control has one; otherwise its id is shown.
export function FlagEditor({ flag, label, live, schools, summary }: { flag: FlagRow; label?: string; live: boolean; schools: { id: string; name: string }[]; summary: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(flag.enabled ? 'on' : 'off');
  const [audience, setAudience] = useState<FlagAudience>(flag.audience);
  const [percent, setPercent] = useState(String(flag.audience_percent ?? 10));
  const [chosen, setChosen] = useState<string[]>(flag.audience_schools ?? []);
  const [endsAt, setEndsAt] = useState(toLocalInput(flag.ends_at));
  const [offEn, setOffEn] = useState(flag.off_message_en ?? '');
  const [offHi, setOffHi] = useState(flag.off_message_hi ?? '');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useChange(() => {
    setOpen(false);
    setReason('');
  });
  const id = `flag-${flag.app}-${flag.module}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('/api/control/apps/flags', {
      app: flag.app,
      module: flag.module,
      enabled: enabled === 'on',
      audience,
      audiencePercent: audience === 'percent' ? Number(percent) : null,
      audienceSchools: audience === 'schools' ? chosen : null,
      reason,
      endsAt: toIso(endsAt),
      offMessageEn: offEn,
      offMessageHi: offHi,
    });
  };
  return (
    <li data-flag={`${flag.app}:${flag.module}`} data-flag-live={live ? 'on' : 'off'} className="flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="break-words text-base font-bold text-slate">{label ?? t('control.apps.module.name', { name: flag.module })}</h4>
          <p className="text-sm text-slate/70">{summary}</p>
        </div>
        {!open && (
          <Button type="button" variant="outline" onClick={() => setOpen(true)} aria-label={t('control.apps.edit.for', { name: label ?? flag.module })}>
            {t('control.apps.edit')}
          </Button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Select id={`${id}-state`} label={t('control.apps.state')} value={enabled} onChange={(e) => setEnabled(e.target.value)}>
            <option value="on">{t('control.apps.module.on')}</option>
            <option value="off">{t('control.apps.module.off')}</option>
          </Select>
          <Select id={`${id}-audience`} label={t('control.apps.audience')} value={audience} onChange={(e) => setAudience(e.target.value as FlagAudience)}>
            {FLAG_AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {t(`control.apps.audience.${a}` as MessageKey)}
              </option>
            ))}
          </Select>
          {audience === 'percent' && <Input id={`${id}-percent`} type="number" inputMode="numeric" min={0} max={100} step={1} label={t('control.apps.percent')} value={percent} onChange={(e) => setPercent(e.target.value)} required />}
          {audience === 'schools' && (
            <fieldset className="flex flex-col">
              <legend className="text-sm font-semibold text-slate">{t('control.apps.schools')}</legend>
              {schools.length === 0 && <p className="text-sm text-slate/70">{t('control.apps.schools.none')}</p>}
              {schools.map((s) => (
                <Checkbox key={s.id} id={`${id}-school-${s.id}`} label={s.name} checked={chosen.includes(s.id)} onChange={(e) => setChosen((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))} />
              ))}
            </fieldset>
          )}
          <Input id={`${id}-ends`} type="datetime-local" floating={false} label={t('control.apps.endsAt')} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          <Textarea id={`${id}-off-en`} rows={2} maxLength={300} label={t('control.apps.offMessageEn')} value={offEn} onChange={(e) => setOffEn(e.target.value)} />
          <Textarea id={`${id}-off-hi`} rows={2} maxLength={300} label={t('control.apps.offMessageHi')} value={offHi} onChange={(e) => setOffHi(e.target.value)} />
          <Reason id={`${id}-reason`} value={reason} onChange={setReason} />
          <ErrorLine error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || reason.trim() === ''}>
              {busy ? t('control.apps.saving') : t('control.apps.save')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('control.apps.cancel')}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

// --- Banner ----------------------------------------------------------------------------------------------------

export function BannerForm({ app }: { app: AppId }) {
  const { t } = useT();
  const [textEn, setTextEn] = useState('');
  const [textHi, setTextHi] = useState('');
  const [tone, setTone] = useState('info');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useChange(() => {
    setTextEn('');
    setTextHi('');
    setStartsAt('');
    setEndsAt('');
    setReason('');
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('/api/control/apps/banners', { app, tone, textEn, textHi, startsAt: toIso(startsAt), endsAt: toIso(endsAt), reason });
  };
  const id = `banner-${app}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-banner-form={app}>
      <h4 className="text-base font-bold text-slate">{t('control.apps.banner.new')}</h4>
      <Textarea id={`${id}-en`} rows={2} maxLength={300} required label={t('control.apps.banner.textEn')} value={textEn} onChange={(e) => setTextEn(e.target.value)} />
      <Textarea id={`${id}-hi`} rows={2} maxLength={300} required label={t('control.apps.banner.textHi')} value={textHi} onChange={(e) => setTextHi(e.target.value)} />
      <Select id={`${id}-tone`} label={t('control.apps.banner.tone')} value={tone} onChange={(e) => setTone(e.target.value)}>
        <option value="info">{t('control.apps.banner.tone.info')}</option>
        <option value="warning">{t('control.apps.banner.tone.warning')}</option>
      </Select>
      <Input id={`${id}-starts`} type="datetime-local" floating={false} label={t('control.apps.banner.starts')} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      <Input id={`${id}-ends`} type="datetime-local" floating={false} required label={t('control.apps.banner.ends')} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      <Reason id={`${id}-reason`} value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <div>
        <Button type="submit" variant="outline" disabled={busy || reason.trim() === '' || textEn.trim() === '' || textHi.trim() === '' || endsAt === ''}>
          {busy ? t('control.apps.saving') : t('control.apps.banner.create')}
        </Button>
      </div>
    </form>
  );
}

// A one-line form: a reason and one button (end a banner, remove a preview account).
export function ReasonButton({ url, field, id, label }: { url: string; field: string; id: string; label: string }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useChange(() => setReason(''));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(url, { [field]: id, reason });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Reason id={`${field}-${id}`} value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <div>
        <Button type="submit" variant="outline" disabled={busy || reason.trim() === ''}>
          {busy ? t('control.apps.saving') : label}
        </Button>
      </div>
    </form>
  );
}

// --- Undo ------------------------------------------------------------------------------------------------------

export function UndoButton({ auditId }: { auditId: string }) {
  const { t } = useT();
  const { busy, error, run } = useChange();
  return (
    <span className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" data-undo={auditId} disabled={busy} onClick={() => void run('/api/control/apps/undo', { auditId })}>
        {busy ? t('control.apps.saving') : t('control.apps.changes.undo')}
      </Button>
      <ErrorLine error={error} />
    </span>
  );
}
