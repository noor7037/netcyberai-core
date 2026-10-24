import { t, type Lang } from '@/lib/i18n';

// The words of the trusted-devices list on both account pages (F1-1, C257), from the message files in the page's
// language. They live here, outside SecurityPanel: that file is 'use client', and on the server anything else a
// client file exports is only a reference, so a page calling DEVICE_WORD_KEYS.map from there failed for every role
// (W2-15). The pages build the words here and hand them to the panel; test/app-shell/client-boundary.test.ts keeps
// server code from taking anything but components out of a client file again.
export const DEVICE_WORD_KEYS = [
  'account.devices.heading',
  'account.devices.tip',
  'account.devices.loading',
  'account.devices.none',
  'account.devices.this',
  'account.devices.skipsBoth',
  'account.devices.skipsEmail',
  'account.devices.dates',
  'account.devices.forget',
  'account.devices.forgotten',
  'account.devices.thisForgotten',
  'account.devices.forgetFailed',
] as const;

export type DeviceWords = Record<(typeof DEVICE_WORD_KEYS)[number], string> & { lang: Lang };

export function deviceWords(lang: Lang): DeviceWords {
  return { lang, ...(Object.fromEntries(DEVICE_WORD_KEYS.map((k) => [k, t(lang, k)])) as Record<(typeof DEVICE_WORD_KEYS)[number], string>) };
}
