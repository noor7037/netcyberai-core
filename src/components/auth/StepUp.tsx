'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useWords } from '@/components/app-shell/Words';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// Step-up for sensitive actions (F1-1b, C260). A screen that saves a credential, opens a school as someone, or acts
// on another person's sign-in sends its request with stepUpFetch instead of fetch. When the server answers
// `step_up_required`, a dialog asks for the password and the authenticator's code (an emailed code for an account
// without one), and the request is sent once more. The proof lasts 15 minutes, so the next sensitive action in that
// time goes straight through. The dialog draws itself over the page; nothing on the screen changes shape.

type Method = 'authenticator' | 'email';
const KEYS = [
  'stepup.title',
  'stepup.lead.authenticator',
  'stepup.lead.email',
  'stepup.password',
  'stepup.showPassword',
  'stepup.code.authenticator',
  'stepup.code.email',
  'stepup.send',
  'stepup.sent',
  'stepup.confirm',
  'stepup.cancel',
  'stepup.wrong',
  'stepup.network',
] as const satisfies readonly MessageKey[];
type Words = Record<(typeof KEYS)[number], string>;

function StepUpDialog({ method: asked, w, onDone }: { method: Method; w: Words; onDone: (ok: boolean) => void }) {
  // The server has the last word: an account that has an authenticator is asked for it, whatever the session said.
  const [method, setMethod] = useState<Method>(asked);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [sent, setSent] = useState(asked === 'authenticator');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onDone(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onDone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/step-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent ? { password, code } : { password }) }).catch(() => null);
    setBusy(false);
    if (!res) return setError(w['stepup.network']);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'ok') return onDone(true);
    if (res.ok && data.status === 'email_sent') {
      setSent(true);
      return;
    }
    if (data.error === 'mfa_required') {
      setMethod('authenticator');
      setSent(true);
      return;
    }
    setError(w['stepup.wrong']);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-midnight/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="step-up-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="step-up-title" className="text-lg font-extrabold text-slate">
          {w['stepup.title']}
        </h2>
        <p className="mt-1 text-sm text-slate/80">{method === 'authenticator' ? w['stepup.lead.authenticator'] : w['stepup.lead.email']}</p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <Input autoFocus id="step-up-password" label={w['stepup.password']} type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <label htmlFor="step-up-show" className="flex min-h-[44px] items-center gap-3 text-sm text-slate">
            <input id="step-up-show" type="checkbox" className="h-5 w-5 shrink-0" checked={show} onChange={(e) => setShow(e.target.checked)} />
            {w['stepup.showPassword']}
          </label>
          {sent && (
            <Input
              id="step-up-code"
              label={method === 'authenticator' ? w['stepup.code.authenticator'] : w['stepup.code.email']}
              helperText={method === 'email' ? w['stepup.sent'] : undefined}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-red-800">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onDone(false)}>
              {w['stepup.cancel']}
            </Button>
            <Button type="submit" disabled={busy || !password || (sent && code.length !== 6)}>
              {sent ? w['stepup.confirm'] : w['stepup.send']}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Opens the dialog over the page and answers whether the person stepped up. Focus goes back where it was.
function askStepUp(method: Method, w: Words): Promise<boolean> {
  return new Promise((resolve) => {
    const before = document.activeElement as HTMLElement | null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (ok: boolean) => {
      root.unmount();
      host.remove();
      before?.focus?.();
      resolve(ok);
    };
    root.render(<StepUpDialog method={method} w={w} onDone={done} />);
  });
}

export function useStepUp() {
  // Its words come with the shell's (shellWords, C401), so a screen that asks for the authenticator stays light.
  const { t } = useWords();
  const words = useRef<Words | null>(null);
  words.current = Object.fromEntries(KEYS.map((k) => [k, t(k)])) as Words;
  const stepUpFetch = useCallback(async (input: string, init?: RequestInit): Promise<Response> => {
    let res = await fetch(input, init);
    // The 15-minute sign-in runs out on a page left open: API calls never renew it (only a page load does), so the
    // first try after that was refused as signed out (W11-B). It is renewed once here and the request sent again.
    if (res.status === 401) {
      const renewed = await fetch('/api/auth/refresh', { method: 'POST' }).catch(() => null);
      if (renewed?.ok) res = await fetch(input, init);
    }
    if (res.status !== 403) return res;
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body?.error !== 'step_up_required') return res;
    const ok = await askStepUp(body.method === 'email' ? 'email' : 'authenticator', words.current!);
    return ok ? fetch(input, init) : res;
  }, []);
  return { stepUpFetch };
}
