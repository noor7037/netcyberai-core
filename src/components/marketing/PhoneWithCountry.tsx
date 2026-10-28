'use client';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { COUNTRY_CODES, OTHER_COUNTRY } from '@/lib/leads/contact';

// The phone field of every website lead form (W7-L): a country code before the number, India first. "Other" shows a
// small field for the code. The server turns code and number into the international form, so a local number typed
// with a leading 0 still reaches the founder dialable.
export type PhoneValue = { country: string; otherCode: string; phone: string };
export const EMPTY_PHONE: PhoneValue = { country: '+91', otherCode: '', phone: '' };

// What the form sends as countryCode.
export const countryCodeOf = (v: PhoneValue) => (v.country === OTHER_COUNTRY ? v.otherCode.trim() : v.country);

export function PhoneWithCountry({
  idPrefix,
  phoneId,
  label = 'Phone',
  helperText = 'WhatsApp preferred',
  value,
  onChange,
  error,
}: {
  idPrefix: string;
  phoneId: string;
  label?: string;
  helperText?: string;
  value: PhoneValue;
  onChange: (v: PhoneValue) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
        <Select id={`${idPrefix}-countryCode`} label="Country code" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })}>
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {c.country}
            </option>
          ))}
          <option value={OTHER_COUNTRY}>Other</option>
        </Select>
        <Input
          id={phoneId}
          label={label}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          value={value.phone}
          helperText={helperText || undefined}
          error={error}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
      </div>
      {value.country === OTHER_COUNTRY && (
        <Input
          id={`${idPrefix}-otherCode`}
          label="Your country code"
          inputMode="tel"
          required
          placeholder="+20"
          className="max-w-[10rem]"
          value={value.otherCode}
          onChange={(e) => onChange({ ...value, otherCode: e.target.value })}
        />
      )}
    </div>
  );
}
