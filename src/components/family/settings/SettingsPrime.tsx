'use client';

import { primeChildSettings, type ChildSettings } from '@/lib/family/child-settings';

// W19-C (the lead): the layout hands the child's settings to the client cache, so the face, the speaker and the call
// read them without a request. Renders nothing.
export function SettingsPrime({ settings }: { settings: ChildSettings | null }) {
  if (settings) primeChildSettings(settings);
  return null;
}
