'use client';

import { useEffect, useState } from 'react';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

interface Advisory {
  jurisdictionApplies: boolean;
  cpiState: 'unknown' | 'within_advisory' | 'above_advisory';
  cpiPercent: number | null;
  cpiSource: string | null;
  permissibleIncreasePercent: number | null;
  proposedIncreasePercent: number | null;
  deadlineState: 'unknown' | 'before_deadline' | 'past_deadline';
  filingDeadline: string | null;
  filingDeadlineSource: string | null;
  advisoryMuted: boolean;
}

interface RetentionPolicyRow {
  policy_id: string;
  category: string;
  retention_years: number | null;
  notes: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  financial: 'Financial records',
  academic_record: 'Academic records',
  attendance: 'Attendance',
  communication_log: 'Communication logs',
  audit_trail: 'Audit trail',
  capture_document: 'Uploaded documents',
  pulse_message: 'Pulse message logs',
  consent_record: 'Consent records',
};

export function ComplianceView({ canManage }: { canManage: boolean }) {
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [policies, setPolicies] = useState<RetentionPolicyRow[] | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/app/compliance/form6')
      .then((r) => r.json())
      .then(setAdvisory)
      .catch(() => setAdvisory(null));
    fetch('/api/app/compliance/retention')
      .then((r) => r.json())
      .then((b) => setPolicies(b.policies))
      .catch(() => setPolicies([]));
  }, []);

  async function toggleMute() {
    if (!advisory) return;
    const res = await fetch('/api/app/compliance/form6', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted: !advisory.advisoryMuted }),
    });
    if (!res.ok) {
      toast.show('Could not update', 'danger');
      return;
    }
    setAdvisory((prev) => (prev ? { ...prev, advisoryMuted: !prev.advisoryMuted } : prev));
    toast.show('Setting recorded', 'success');
  }

  async function updateRetention(category: string, retentionYears: number | null) {
    const res = await fetch('/api/app/compliance/retention', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, retentionYears }),
    });
    if (!res.ok) {
      toast.show('Could not update', 'danger');
      return;
    }
    const updated = await res.json();
    setPolicies((prev) => (prev ? prev.map((p) => (p.category === category ? updated : p)) : prev));
    toast.show('Retention updated', 'success');
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-slate/10 p-4">
        <h2 className="mb-2 text-base font-semibold text-slate">Haryana Form 6 fee advisory</h2>
        {advisory === null ? (
          <p className="text-sm text-slate/70">Loading…</p>
        ) : !advisory.jurisdictionApplies ? (
          <p className="text-sm text-slate/70">Does not apply — this school's jurisdiction is not Haryana (IN-HR).</p>
        ) : advisory.advisoryMuted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate/70">Fee advisory notices are hidden for this school. This setting is recorded.</p>
            {canManage && (
              <button type="button" onClick={toggleMute} className="text-sm font-semibold text-sapphire">
                Show again
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <p className="text-slate/70">Current-year CPI</p>
              {advisory.cpiState === 'unknown' ? (
                <Badge variant="warning">CPI not configured</Badge>
              ) : (
                <p className="text-slate">
                  {advisory.cpiPercent}% (source: {advisory.cpiSource ?? '—'}) — permissible increase up to{' '}
                  {advisory.permissibleIncreasePercent}%
                </p>
              )}
              {advisory.proposedIncreasePercent != null && (
                <Badge variant={advisory.cpiState === 'above_advisory' ? 'danger' : 'success'}>
                  Proposed increase: {advisory.proposedIncreasePercent.toFixed(1)}% —{' '}
                  {advisory.cpiState === 'above_advisory' ? 'above advisory' : 'within advisory'}
                </Badge>
              )}
            </div>
            <div>
              <p className="text-slate/70">Filing deadline</p>
              {advisory.deadlineState === 'unknown' ? (
                <Badge variant="warning">Filing deadline not configured</Badge>
              ) : (
                <p className="text-slate">
                  {advisory.filingDeadline} (source: {advisory.filingDeadlineSource ?? '—'}) —{' '}
                  <Badge variant={advisory.deadlineState === 'past_deadline' ? 'danger' : 'neutral'}>
                    {advisory.deadlineState === 'past_deadline' ? 'past deadline' : 'before deadline'}
                  </Badge>
                </p>
              )}
            </div>
            <p className="text-xs text-slate/70">
              Advisory only — never blocking. A salary-linked alternative formula also exists; this school may be compliant under it
              even if the CPI+5% comparison above shows otherwise. Not legal advice.
            </p>
            {canManage && (
              <button type="button" onClick={toggleMute} className="min-h-[44px] self-start text-sm font-semibold text-slate/70">
                Hide fee advisory notices
              </button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate/10 p-4">
        <h2 className="mb-2 text-base font-semibold text-slate">Data retention</h2>
        {policies === null ? (
          <p className="text-sm text-slate/70">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {policies.map((p) => (
              <li key={p.policy_id} className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-md border border-slate/10 p-3">
                {canManage ? (
                  <div className="w-full max-w-xs">
                    <Input
                      id={`retention-${p.category}`}
                      type="number"
                      min={1}
                      label={CATEGORY_LABELS[p.category] ?? p.category}
                      defaultValue={p.retention_years ?? ''}
                      placeholder="Indefinite"
                      onBlur={(e) => {
                        const val = e.currentTarget.value.trim();
                        updateRetention(p.category, val === '' ? null : Number(val));
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-slate">{CATEGORY_LABELS[p.category] ?? p.category}</p>
                    <span className="ml-auto text-slate">{p.retention_years == null ? 'Indefinite' : `${p.retention_years}y`}</span>
                  </>
                )}
                {p.notes && <InfoTip label={CATEGORY_LABELS[p.category] ?? p.category}>{p.notes}</InfoTip>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
