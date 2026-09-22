'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

type Guardian = { parent_id: string; name: string; relation: string | null };

const PURPOSES = [
  { key: 'core_records', label: 'Core records', required: true },
  { key: 'operational_communication', label: 'Fee notices, receipts, absence alerts, notices', required: true },
  { key: 'daily_pulse', label: 'Daily Pulse', required: false },
  { key: 'recognition', label: 'Recognition messages', required: false },
  { key: 'weekly_brief', label: 'Weekly confidence brief', required: false },
  { key: 'at_risk', label: 'At-risk alerts', required: false },
] as const;

type Eligibility = Record<string, boolean>;
type LedgerRow = { consent_id: string; purpose: string; granted: boolean; created_at: string; evidence_ref: string | null };

type GuardianLink = {
  verification_status: string;
  verification_method: string | null;
  requested_at: string | null;
  verified_at: string | null;
};

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  not_required: 'neutral',
  pending: 'warning',
  requested: 'warning',
  verified: 'success',
  active: 'success',
  withdrawn: 'danger',
  expired: 'danger',
  tombstoned: 'danger',
};

const DIRECT_METHODS = [
  { value: 'dob_on_record', label: 'DOB matches record' },
  { value: 'school_attested', label: 'Staff attests (known in person)' },
  { value: 'digilocker_token', label: 'Digilocker token shown' },
];

export function ConsentPanel({ studentId, guardians, canManage }: { studentId: string; guardians: Guardian[]; canManage: boolean }) {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [history, setHistory] = useState<LedgerRow[]>([]);
  const [links, setLinks] = useState<Record<string, GuardianLink | null>>({});
  const [grantOpen, setGrantOpen] = useState<{ purpose: string; granted: boolean } | null>(null);
  const [verifyGuardian, setVerifyGuardian] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const toast = useToast();

  async function loadConsent() {
    const res = await fetch(`/api/app/students/${studentId}/consent`);
    if (!res.ok) return;
    const body = await res.json();
    setEligibility(body.eligibility);
    setHistory(body.history);
  }

  async function loadLinks() {
    const entries = await Promise.all(
      guardians.map(async (g) => {
        const res = await fetch(`/api/app/guardians/${g.parent_id}/students/${studentId}/verification`);
        return [g.parent_id, res.ok ? await res.json() : null] as const;
      })
    );
    setLinks(Object.fromEntries(entries));
  }

  useEffect(() => {
    loadConsent();
    if (guardians.length > 0) loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardians.length]);

  async function handleDecision(parentId: string) {
    if (!grantOpen) return;
    const res = await fetch(`/api/app/students/${studentId}/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: grantOpen.purpose, granted: grantOpen.granted, parentId }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'could not record decision' }));
      toast.show(error, 'danger');
      return;
    }
    setGrantOpen(null);
    toast.show(grantOpen.granted ? 'Consent granted' : 'Consent withdrawn', 'success');
    loadConsent();
  }

  async function callVerification(parentId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/app/guardians/${parentId}/students/${studentId}/verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.show(result.error ?? 'action failed', 'danger');
      return null;
    }
    return result;
  }

  async function handleDirectVerify(parentId: string, method: string) {
    const r = await callVerification(parentId, { action: 'verify_direct', method });
    if (r) {
      toast.show('Guardian is now Active', 'success');
      setVerifyGuardian(null);
      loadLinks();
    }
  }

  async function handleRequestCode(parentId: string) {
    const r = await callVerification(parentId, { action: 'request_code' });
    if (r) {
      setOtpCode(r.code);
      loadLinks();
    }
  }

  async function handleConfirmCode(parentId: string, code: string) {
    const r = await callVerification(parentId, { action: 'confirm_code', code });
    if (r) {
      toast.show('Guardian is now Active', 'success');
      setOtpCode(null);
      setVerifyGuardian(null);
      loadLinks();
    }
  }

  return (
    <section className="rounded-lg border border-slate/10 p-4">
      <h2 className="mb-3 text-base font-semibold text-slate">Consent</h2>

      <div className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-slate/70">Guardian verification</h3>
        {guardians.length === 0 ? (
          <p className="text-sm text-slate/70">Add a guardian first.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {guardians.map((g) => {
              const link = links[g.parent_id];
              const status = link?.verification_status ?? 'not_required';
              return (
                <li key={g.parent_id} className="flex items-center justify-between rounded-md border border-slate/10 p-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate">{g.name}</p>
                    <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>{status.replace('_', ' ')}</Badge>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      {status !== 'active' && status !== 'tombstoned' && (
                        <button type="button" className="text-sapphire" onClick={() => setVerifyGuardian(g.parent_id)}>
                          Verify
                        </button>
                      )}
                      {status === 'active' && (
                        <button
                          type="button"
                          className="text-red-800"
                          onClick={async () => {
                            const r = await callVerification(g.parent_id, { action: 'withdraw' });
                            if (r) loadLinks();
                          }}
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-slate/70">Purposes</h3>
        {eligibility === null ? (
          <p className="text-sm text-slate/70">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {PURPOSES.map((p) => (
              <li key={p.key} className="flex items-center justify-between rounded-md border border-slate/10 p-3 text-sm">
                <div>
                  <p className="font-medium text-slate">
                    {p.label} {p.required && <span className="text-slate/70">(required for service)</span>}
                  </p>
                  <Badge variant={eligibility[p.key] ? 'success' : 'neutral'}>{eligibility[p.key] ? 'Granted' : 'Not granted'}</Badge>
                </div>
                {canManage && guardians.length > 0 && (
                  <div className="flex gap-2">
                    <button type="button" className="text-sapphire" onClick={() => setGrantOpen({ purpose: p.key, granted: true })}>
                      Grant
                    </button>
                    <button type="button" className="text-red-800" onClick={() => setGrantOpen({ purpose: p.key, granted: false })}>
                      Withdraw
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate/70">History ({history.length})</summary>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-slate/70">
          {history.map((h) => (
            <li key={h.consent_id}>
              {new Date(h.created_at).toLocaleString()} — {h.purpose}: {h.granted ? 'granted' : 'withdrawn'}
            </li>
          ))}
        </ul>
      </details>

      <Modal open={grantOpen !== null} onClose={() => setGrantOpen(null)} title={grantOpen?.granted ? 'Grant consent' : 'Withdraw consent'}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate/70">Which guardian is this decision tied to?</p>
          {guardians.map((g) => (
            <button
              key={g.parent_id}
              type="button"
              onClick={() => handleDecision(g.parent_id)}
              className="min-h-[44px] rounded-md border border-slate/10 px-4 text-left text-sm font-semibold text-slate hover:bg-slate/5"
            >
              {g.name}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={verifyGuardian !== null} onClose={() => { setVerifyGuardian(null); setOtpCode(null); }} title="Verify guardian">
        <div className="flex flex-col gap-4">
          {otpCode ? (
            <>
              <p className="rounded-md bg-amber-50 p-3 text-sm text-slate">
                Interim method — no WhatsApp/SMS delivery exists yet. Read this code aloud or show it to the guardian:
              </p>
              <p className="text-center text-3xl font-bold tracking-widest text-slate">{otpCode}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = new FormData(e.currentTarget).get('code');
                  if (verifyGuardian && typeof code === 'string') handleConfirmCode(verifyGuardian, code);
                }}
                className="flex flex-col gap-3"
              >
                <Input id="code" name="code" label="Code the guardian read back" required />
                <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
                  Confirm
                </button>
              </form>
            </>
          ) : (
            <>
              {DIRECT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => verifyGuardian && handleDirectVerify(verifyGuardian, m.value)}
                  className="min-h-[44px] rounded-md border border-slate/10 px-4 text-left text-sm font-semibold text-slate hover:bg-slate/5"
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => verifyGuardian && handleRequestCode(verifyGuardian)}
                className="min-h-[44px] rounded-md border border-slate/10 px-4 text-left text-sm font-semibold text-slate hover:bg-slate/5"
              >
                Generate a code (interim, staff-read, no WhatsApp/SMS)
              </button>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}
