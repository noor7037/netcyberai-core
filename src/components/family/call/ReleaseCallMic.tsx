'use client';

import { useEffect } from 'react';
import { releasePrimedMic } from './callMic';

// C511: a call page that refuses (the call off, no consent, the class) closes the microphone the tap on Call opened.
export function ReleaseCallMic() {
  useEffect(() => releasePrimedMic(), []);
  return null;
}
