'use client';

import { useStepUp } from '@/components/auth/StepUp';
import { useEffect, useState } from 'react';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

type Config = {
  id: string;
  waba_id: string | null;
  phone_number_id: string;
  phone_number_display: string | null;
  status: string;
  updated_at: string;
};

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  not_configured: 'neutral',
  pending_verification: 'warning',
  active: 'success',
  suspended: 'danger',
  revoked: 'danger',
};

// Task 2d: no re-authentication/step-up-auth flow exists yet for
// school_admin/principal (only super_admin's MFA aal2 does, for an
// unrelated purpose) -- this panel's own confirmation modal is the
// deliberate, real friction this prompt puts in front of a live
// credential write instead, short of that bigger lift. Until a school
// completes this and Meta actually verifies the number, every send
// for this school keeps using the platform default (the mock
// provider today) -- nothing here ever blocks sending.
export function WhatsAppConfigPanel({ canManage }: { canManage: boolean }) {
  const { stepUpFetch } = useStepUp();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<FormData | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    const res = await fetch('/api/app/whatsapp-config');
    const body = await res.json();
    setConfig(body.config);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(form: FormData) {
    const res = await stepUpFetch('/api/app/whatsapp-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wabaId: form.get('wabaId'),
        phoneNumberId: form.get('phoneNumberId'),
        phoneNumberDisplay: form.get('phoneNumberDisplay'),
        accessToken: form.get('accessToken'),
        webhookVerifyToken: form.get('webhookVerifyToken'),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.show(body.error ?? 'could not save WhatsApp configuration', 'danger');
      return;
    }
    toast.show('WhatsApp credentials saved -- pending verification', 'success');
    setFormOpen(false);
    setPendingSubmit(null);
    load();
  }

  return (
    <section className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-1">
        <h2 className="text-base font-semibold text-slate">WhatsApp Business Account</h2>
        <InfoTip>Optional. Every school sends via the platform's own number until this is completed -- nothing is ever blocked waiting on it.</InfoTip>
      </div>

      {loading ? (
        <p className="text-sm text-slate/70">Loading…</p>
      ) : config ? (
        <div className="flex items-center justify-between rounded-md border border-slate/10 p-3 text-sm">
          <div>
            <p className="font-semibold text-slate">{config.phone_number_display ?? config.phone_number_id}</p>
            <Badge variant={STATUS_VARIANT[config.status] ?? 'neutral'}>{config.status.replace('_', ' ')}</Badge>
          </div>
          {canManage && (
            <button type="button" className="text-sapphire" onClick={() => setFormOpen(true)}>
              Replace credentials
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate/70">Not connected: messages go from the platform's own number.</p>
      )}

      {canManage && !config && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="mt-3 min-h-[44px] rounded-md border border-slate/10 px-4 text-sm font-semibold text-slate hover:bg-slate/5"
        >
          Connect your own WhatsApp Business Account
        </button>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="WhatsApp Business Account credentials">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPendingSubmit(new FormData(e.currentTarget));
          }}
          className="flex flex-col gap-3"
        >
          <Input id="wabaId" name="wabaId" label="WABA ID" />
          <Input id="phoneNumberId" name="phoneNumberId" label="Phone number ID (Meta)" required />
          <Input id="phoneNumberDisplay" name="phoneNumberDisplay" label="Phone number (for reference, E.164)" />
          <Input id="accessToken" name="accessToken" label="Access token" type="password" required />
          <Input id="webhookVerifyToken" name="webhookVerifyToken" label="Webhook verify token" type="password" required />
          <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Review and save
          </button>
        </form>
      </Modal>

      <Modal open={pendingSubmit !== null} onClose={() => setPendingSubmit(null)} title="Confirm: this grants real sending capability">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate">
            Saving this replaces how this school sends WhatsApp messages. Anyone with this access token could send
            real messages, as this school, to real parents. Confirm you obtained it directly from your own Meta
            Business Manager.
          </p>
          <button
            type="button"
            onClick={() => pendingSubmit && submit(pendingSubmit)}
            className="min-h-[44px] rounded-md bg-red-800 px-4 text-sm font-semibold text-white"
          >
            Yes, save these credentials
          </button>
        </div>
      </Modal>
    </section>
  );
}
