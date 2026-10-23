'use client';

import { useEffect, useState } from 'react';
import { NO_VOICE_EVENT } from './speech';

// Said once when a speaker button finds nothing on the phone that can read aloud (C230-Y): in the first Android app,
// "update the app"; in a browser, that this browser cannot read aloud. Closed with one tap.
export function NoVoiceNotice({ inApp, words }: { inApp: boolean; words: { app: string; browser: string; close: string } }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = () => setShown(true);
    window.addEventListener(NO_VOICE_EVENT, on);
    return () => window.removeEventListener(NO_VOICE_EVENT, on);
  }, []);
  if (!shown) return null;
  return (
    <div role="status" data-no-voice className="fixed inset-x-3 bottom-[calc(var(--fam-bottom,0px)+6rem)] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-midnight py-2 pl-4 pr-2 text-base font-semibold text-white shadow-lg">
      <span className="flex-1">{inApp ? words.app : words.browser}</span>
      <button type="button" onClick={() => setShown(false)} className="min-h-[44px] rounded-full px-4 font-bold text-white ring-1 ring-white/40">
        {words.close}
      </button>
    </div>
  );
}
