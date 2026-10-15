'use client';

import { InfoTip } from '@/components/app-ui/InfoTip';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/app-shell/LangContext';
import type { MessageKey } from '@/lib/i18n';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PaymentRailsPanel } from '@/components/payments/PaymentRailsPanel';
import { SchoolPeoplePanel } from './SchoolPeoplePanel';
import { SchoolBrandingCard } from '@/components/settings/SchoolBrandingCard';

// The onboarding stages in order; their names are in the message files (onb.stage.<id>).
const STAGE_ORDER = ['tenant_created', 'admin_invited', 'data_imported', 'data_validated', 'consent_collection', 'configuration', 'training', 'pilot_outbound_approved', 'go_live'];
const REQUIRED_PURPOSES = ['core_records', 'operational_communication'];
const INVITABLE_ROLES = ['school_admin', 'principal', 'teacher', 'accountant', 'academic_coordinator'] as const;
// The flags the app reads from system_config.enabled_features today (src/app/api/app/pulse/today/route.ts). The
// plan features (personal-best, principal-dashboard, ...) are entitlements from the school's plan, not flags here.
const KNOWN_FLAGS = ['daily_pulse'];
const INVITE_FAILS = ['service_key', 'already_registered', 'email'];
type Note = { tone: 'ok' | 'bad'; text: string };

interface ConsentSummary {
  totalStudents: number;
  grantedByPurpose: Record<string, number>;
  requiredComplete: boolean;
  percentComplete: number;
}

class RequestFailed extends Error {
  code?: string;
  setting?: string;
}
async function jsonOrError(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new RequestFailed(data.error ?? `request failed (${res.status})`);
    if (typeof data.code === 'string') err.code = data.code;
    if (typeof data.setting === 'string') err.setting = data.setting;
    throw err;
  }
  return data;
}

export function SchoolOnboardingPanel({
  schoolId,
  initialStage,
  isPilot,
  pilotAllowOutbound,
}: {
  schoolId: string;
  initialStage: string;
  isPilot: boolean;
  pilotAllowOutbound: boolean;
}) {
  const router = useRouter();
  const { t } = useT();
  const [stage, setStage] = useState(initialStage);
  const [stageError, setStageError] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentSummary | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [flagName, setFlagName] = useState('');
  const [flagEnabled, setFlagEnabled] = useState(true);
  const [flagStatus, setFlagStatus] = useState<Note | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<string>(INVITABLE_ROLES[0]);
  const [inviteStatus, setInviteStatus] = useState<Note | null>(null);

  async function loadConsent() {
    const res = await fetch(`/api/control/schools/${schoolId}/consent-summary`);
    setConsent(await jsonOrError(res).catch(() => null));
  }
  async function loadFeatures() {
    const res = await fetch(`/api/control/schools/${schoolId}/features`);
    const data = await jsonOrError(res).catch(() => ({ enabledFeatures: {} }));
    setFeatures(data.enabledFeatures ?? {});
  }

  useEffect(() => {
    loadConsent();
    loadFeatures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];

  async function advanceStage() {
    setStageError(null);
    try {
      const data = await jsonOrError(
        await fetch(`/api/control/schools/${schoolId}/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStage: nextStage }),
        })
      );
      setStage(data.school.onboarding_stage);
      router.refresh();
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'advance failed');
    }
  }

  async function toggleFlag(e: React.FormEvent) {
    e.preventDefault();
    setFlagStatus(null);
    const name = flagName.trim();
    try {
      await jsonOrError(
        await fetch(`/api/control/schools/${schoolId}/features`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: name, enabled: flagEnabled }),
        })
      );
      setFlagStatus({ tone: 'ok', text: t('onb.flags.saved', { name, state: t(flagEnabled ? 'onb.flags.on' : 'onb.flags.off') }) });
      setFlagName('');
      loadFeatures();
    } catch {
      setFlagStatus({ tone: 'bad', text: t('onb.flags.bad') });
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteStatus(null);
    try {
      await jsonOrError(
        await fetch(`/api/control/schools/${schoolId}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inviteEmail, displayName: inviteName, role: inviteRole }),
        })
      );
      setInviteStatus({ tone: 'ok', text: t('onb.invite.sent', { email: inviteEmail, role: t(`role.${inviteRole}` as MessageKey) }) });
      setInviteEmail('');
      setInviteName('');
    } catch (err) {
      const code = err instanceof RequestFailed && err.code && INVITE_FAILS.includes(err.code) ? err.code : null;
      const setting = err instanceof RequestFailed ? (err.setting ?? '') : '';
      setInviteStatus({ tone: 'bad', text: code ? t(`onb.invite.bad.${code}` as MessageKey, { setting }) : t('onb.invite.bad', { reason: err instanceof Error ? err.message : '' }) });
    }
  }


  return (
    <div className="flex flex-col gap-8">
      {/* The school's official name and logo (C235-B): set here while onboarding, shown in its screens at once. */}
      <SchoolBrandingCard scope="control" schoolId={schoolId} />
      {/* Onboarding at a glance (C230-D redesign): the nine stages as one stepper, the pilot state as two badges, and
          consent as one bar; the long notes moved to one quiet line each. */}
      <section data-onb-stage className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate">{t('onb.stage.title')}</h3>
          {nextStage && (
            <Button variant="outline" onClick={advanceStage}>
              {t('onb.stage.advance', { stage: t(`onb.stage.${nextStage}` as MessageKey) })}
            </Button>
          )}
        </div>
        <ol aria-label={t('onb.stage.title')} className="grid grid-cols-3 gap-1 sm:grid-cols-9">
          {STAGE_ORDER.map((id, i) => {
            const at = STAGE_ORDER.indexOf(stage);
            const state = i < at ? 'done' : i === at ? 'now' : 'next';
            return (
              <li key={id} data-stage={id} data-stage-state={state} aria-current={state === 'now' ? 'step' : undefined} className="flex flex-col gap-1">
                <span aria-hidden="true" className={`h-1.5 rounded-full ${state === 'next' ? 'bg-slate/15' : state === 'now' ? 'bg-sapphire' : 'bg-emerald-text'}`} />
                <span className={`text-xs ${state === 'now' ? 'font-bold text-slate' : 'text-slate/70'}`}>{t(`onb.stage.${id}` as MessageKey)}</span>
              </li>
            );
          })}
        </ol>
        {stage === 'training' && <p className="text-sm text-slate/70">{t('onb.stage.trainingNote')}</p>}
        {stageError && <p role="alert" className="text-sm font-semibold text-red-800">{stageError}</p>}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section data-onb-pilot className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4">
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 className="text-base font-bold text-slate">{t('onb.pilot.title')}</h3>
            <InfoTip>{t('onb.pilot.how')}</InfoTip>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={isPilot ? 'warning' : 'success'}>{t(isPilot ? 'onb.pilot.pilot' : 'onb.pilot.live')}</Badge>
            <Badge variant={pilotAllowOutbound ? 'success' : 'neutral'}>{t(pilotAllowOutbound ? 'onb.pilot.outboundOn' : 'onb.pilot.outboundOff')}</Badge>
          </div>
        </section>

        <section data-onb-consent className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-1">
              <h3 className="text-base font-bold text-slate">{t('onb.consent.title')}</h3>
              <InfoTip>{t('onb.consent.honest')}</InfoTip>
            </div>
            {consent && <span className="text-2xl font-extrabold tabular-nums text-slate">{consent.percentComplete}%</span>}
          </div>
          {!consent ? (
            <p className="text-sm text-slate/70">{t('onb.consent.loading')}</p>
          ) : (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate/10">
                <div className={`h-full ${consent.requiredComplete ? 'bg-emerald-text' : 'bg-sapphire'}`} style={{ width: `${consent.percentComplete}%` }} />
              </div>
              <ul className="flex flex-wrap gap-x-4 text-sm text-slate/70">
                {REQUIRED_PURPOSES.map((p) => (
                  <li key={p}>{t(`onb.consent.${p}` as MessageKey, { n: consent.grantedByPurpose[p] ?? 0, total: consent.totalStudents })}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section data-onb-flags>
        <div className="mb-2 flex flex-wrap items-center gap-x-1">
          <h3 className="text-base font-bold text-slate">{t('onb.flags.title')}</h3>
          <InfoTip>{t('onb.flags.how')}</InfoTip>
        </div>
        <p className="mb-2 text-sm text-slate">
          {t('onb.flags.current')}{' '}
          {Object.keys(features).length === 0 ? (
            t('onb.flags.none')
          ) : (
            <span className="inline-flex flex-wrap gap-1 align-middle">
              {Object.entries(features).map(([name, on]) => (
                <Badge key={name} variant={on ? 'success' : 'neutral'}>
                  {name} · {t(on ? 'onb.flags.on' : 'onb.flags.off')}
                </Badge>
              ))}
            </span>
          )}
        </p>
        <form onSubmit={toggleFlag} className="flex flex-wrap items-start gap-3">
          <Input id="flag-name" label={t('onb.flags.name')} helperText={t('onb.flags.name.hint')} list="flag-known" autoComplete="off" spellCheck={false} maxLength={60} value={flagName} onChange={(e) => setFlagName(e.target.value)} required />
          <datalist id="flag-known">
            {Array.from(new Set([...KNOWN_FLAGS, ...Object.keys(features)])).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Select id="flag-enabled" label={t('onb.flags.enabled')} value={flagEnabled ? 'true' : 'false'} onChange={(e) => setFlagEnabled(e.target.value === 'true')}>
            <option value="true">{t('onb.flags.on')}</option>
            <option value="false">{t('onb.flags.off')}</option>
          </Select>
          <div className="pt-7">
            <Button type="submit" variant="outline">
              {t('onb.flags.save')}
            </Button>
          </div>
        </form>
        {flagStatus && (
          <p role={flagStatus.tone === 'bad' ? 'alert' : 'status'} data-onb-flag-status className={`mt-2 text-sm font-semibold ${flagStatus.tone === 'ok' ? 'text-emerald-text' : 'text-red-800'}`}>
            {flagStatus.text}
          </p>
        )}
      </section>

      <section data-onb-invite>
        <div className="mb-2 flex flex-wrap items-center gap-x-1">
          <h3 className="text-base font-bold text-slate">{t('onb.invite.title')}</h3>
          <InfoTip>{t('onb.invite.how')}</InfoTip>
        </div>
        <form onSubmit={submitInvite} className="flex flex-col gap-3 md:flex-row md:items-start md:gap-3">
          <Input id="invite-email" label={t('onb.invite.email')} helperText={t('onb.invite.email.hint')} type="email" autoComplete="off" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          <Input id="invite-name" label={t('onb.invite.name')} helperText={t('onb.invite.name.hint')} autoComplete="off" maxLength={80} value={inviteName} onChange={(e) => setInviteName(e.target.value)} required />
          <Select id="invite-role" label={t('onb.invite.role')} helperText={t('onb.invite.role.hint')} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}` as MessageKey)}
              </option>
            ))}
          </Select>
          <div className="md:pt-7">
            <Button type="submit">{t('onb.invite.send')}</Button>
          </div>
        </form>
        {inviteStatus && (
          <p role={inviteStatus.tone === 'bad' ? 'alert' : 'status'} data-onb-invite-status className={`mt-2 text-sm font-semibold ${inviteStatus.tone === 'ok' ? 'text-emerald-text' : 'text-red-800'}`}>
            {inviteStatus.text}
          </p>
        )}
      </section>

      <SchoolPeoplePanel schoolId={schoolId} />
      <PaymentRailsPanel scope="control" schoolId={schoolId} />
    </div>
  );
}
