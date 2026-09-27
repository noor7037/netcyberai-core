'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { submitLead } from '@/components/marketing/submitLead';
import { GATE_MESSAGE, markFreeAccount } from '@/lib/certificates/usage';

// Shown after the third free certificate. A free account is the same
// lead record every website form creates (source "free_tools"): name,
// school and phone. No password, no payment, and nothing from the
// certificate form is sent.
export function FreeAccountGate({ open, onClose, onUnlocked }: { open: boolean; onClose: () => void; onUnlocked: () => void }) {
  const [v, setV] = useState({ contactName: '', schoolName: '', contactPhone: '', contactEmail: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!v.contactName.trim() || !v.schoolName.trim() || v.contactPhone.replace(/\D/g, '').length < 10) {
      setError('Enter your name, your school’s name and a phone number with at least 10 digits.');
      return;
    }
    setBusy(true);
    try {
      await submitLead({ source: 'free_tools', orgType: 'school', ...v, preferredContact: 'whatsapp' });
      markFreeAccount();
      onUnlocked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create your free account">
      <p className="mt-3 rounded-xl bg-off-white p-3 text-sm font-semibold text-slate">{GATE_MESSAGE}</p>
      <form className="mt-4 flex flex-col gap-3" onSubmit={submit} noValidate>
        <Input id="fa-name" label="Your name" required autoComplete="name" value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} />
        <Input id="fa-school" label="School name" required autoComplete="organization" value={v.schoolName} onChange={(e) => setV({ ...v, schoolName: e.target.value })} />
        <Input id="fa-phone" label="Mobile number" required type="tel" inputMode="tel" autoComplete="tel" value={v.contactPhone} onChange={(e) => setV({ ...v, contactPhone: e.target.value })} />
        <Input id="fa-email" label="Email (optional)" type="email" autoComplete="email" value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} />
        <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
          <label htmlFor="fa-website">Website</label>
          <input id="fa-website" tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} />
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-5 text-base font-semibold text-white hover:bg-sapphire/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:opacity-60"
        >
          {busy ? 'Creating your account…' : 'Create free account and continue'}
        </button>
        <p className="text-xs text-slate/70">
          We keep only your name, school and contact details, to recognise your free account and to reach you if you ask. Unlimited certificates on this browser once created. See our{' '}
          <a href="/privacy" className="font-semibold text-royal underline">
            privacy policy
          </a>
          .
        </p>
      </form>
    </Modal>
  );
}
