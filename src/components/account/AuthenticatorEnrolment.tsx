'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// The QR code, setup key and first-code form for adding an authenticator app
// (C95). Shown only on the screen of the person who proved who they are; this
// component never sends the key anywhere, and it is dropped from memory as
// soon as the code is confirmed or the step is left.
export type EnrolmentView = { factorId: string; qrCode: string; setupKey: string; uri: string };

export function AuthenticatorEnrolment({
  enrolment,
  submitting,
  submitLabel,
  onSubmit,
}: {
  enrolment: EnrolmentView;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-slate">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar).</li>
        <li>Scan this QR code with it, or type the setup key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>

      <div className="flex justify-center">
        {/* A data: URL of an SVG from Supabase; next/image would add nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enrolment.qrCode}
          alt="QR code for your authenticator app. If you cannot scan it, type the setup key shown below."
          width={200}
          height={200}
          className="h-[200px] w-[200px] rounded-md border-2 border-slate/15 bg-white p-2"
        />
      </div>

      <div className="flex flex-col gap-2 rounded-md border-2 border-slate/15 bg-white p-3">
        <p className="text-sm font-medium text-slate">Setup key (if you cannot scan)</p>
        <p className="break-all font-mono text-base font-bold tracking-wider text-slate" aria-label="Setup key">
          {enrolment.setupKey}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(enrolment.setupKey.replace(/\s+/g, '')).then(
                () => setCopied(true),
                () => setCopied(false)
              );
            }}
          >
            {copied ? 'Copied' : 'Copy key'}
          </Button>
          {/* On a phone, this opens the authenticator app directly. */}
          <a
            href={enrolment.uri}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-sapphire px-4 text-sm font-semibold text-sapphire hover:bg-sapphire/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire md:hidden"
          >
            Open in authenticator app
          </a>
        </div>
        <p className="text-xs text-slate/80">Keep this key private. Anyone with it can make your codes.</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(code);
        }}
      >
        <Input
          id="new-authenticator-code"
          label="6-digit code from the app"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Checking…' : submitLabel}
        </Button>
      </form>
    </div>
  );
}
