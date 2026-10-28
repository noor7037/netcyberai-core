'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useWords } from '@/components/app-shell/Words';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// What every Control → Apps change shares (M1-7): the request, its busy state and error, the reason it asks for, and
// the one-reason button the People page uses too. Its words are picked on the server (the `control.apps.` messages,
// C395), so a page that shows it does not carry the whole message table.

type Result = { ok: true } | { ok: false; code: string };

async function send(url: string, body: unknown): Promise<Result> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, code: 'generic' };
  if (res.ok) return { ok: true };
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: false, code: res.status === 401 ? 'session' : (json.code ?? 'generic') };
}

// The state every form keeps: busy, the last error, and the way to run a request and refresh.
export function useChange(onDone?: () => void) {
  const { words } = useWords();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await send(url, body);
    setBusy(false);
    if (!r.ok) {
      setError(words[`control.apps.err.${r.code}` as MessageKey] ?? words['control.apps.err.generic'] ?? '');
      return false;
    }
    onDone?.();
    router.refresh();
    return true;
  };
  return { busy, error, run };
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-medium text-red-800">
      {error}
    </p>
  );
}

export function Reason({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t } = useWords();
  return <Input id={id} label={t('control.apps.reason')} value={value} onChange={(e) => onChange(e.target.value)} maxLength={300} required helperText={t('control.apps.reason.help')} />;
}


export function ReasonButton({ url, field, id, label }: { url: string; field: string; id: string; label: string }) {
  const { t } = useWords();
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

