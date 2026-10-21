'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Words } from '@/lib/family/fill';

// Six-digit PIN fields: digits only, never shown, with a second field to confirm a new PIN. No hint is ever given.
export function PinFields({
  w,
  confirm = false,
  busy,
  error,
  submitLabel,
  onSubmit,
  idPrefix = 'fam-pin',
}: {
  w: Words;
  confirm?: boolean;
  busy: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (pin: string) => void;
  idPrefix?: string;
}) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  const ready = pin.length === 6 && (!confirm || again.length === 6);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && pin !== again) return setMismatch(true);
        setMismatch(false);
        onSubmit(pin);
      }}
    >
      <Input
        id={`${idPrefix}-new`}
        label={confirm ? w['fam.pin.new'] : w['fam.pin.enter']}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={confirm ? 'new-password' : 'current-password'}
        maxLength={6}
        required
        value={pin}
        onChange={(e) => setPin(digits(e.target.value))}
        error={!confirm && error ? error : undefined}
      />
      {confirm && (
        <Input
          id={`${idPrefix}-again`}
          label={w['fam.pin.again']}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="new-password"
          maxLength={6}
          required
          value={again}
          onChange={(e) => setAgain(digits(e.target.value))}
          error={mismatch ? w['fam.pin.mismatch'] : error || undefined}
        />
      )}
      <Button type="submit" disabled={busy || !ready} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
