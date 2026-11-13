'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { shellVersion } from '@/lib/family/flags';
import type { Words } from '@/lib/family/fill';
import { CallScreen } from './CallScreen';
import { useCall } from './useCall';

// The call (W16-A4; a real call since C511): the child taps Call and talks; the microphone is open for the whole call
// and the tutor answers each turn aloud, with captions and the board. The logic is useCall.ts, the screen CallScreen.tsx.
// The answer's blocks gather on the board as they arrive, drawn by the lesson page's own renderer, loaded only when the
// first one comes.

// The board is its own chunk: the figures, charts and models come only when an answer carries them.
const CallBoard = dynamic(() => import('./CallBoard'), { ssr: false });

export type CallViewProps = {
  w: Words;
  lang: 'en' | 'hi';
  subject: string;
  tutorName: string;
  // The Tutor Hall's key of the tutor on the line (W16-B5), kept with the chat so the persona stays; null: the default tutor.
  tutorKey?: string | null;
  // What the server says is left of today's speaking time, as for the composer's microphone.
  secondsLeft: number;
  // Where End goes: the subject's Study page.
  endHref: string;
};

export function CallView({ w, lang, subject, tutorName, tutorKey = null, secondsLeft, endHref }: CallViewProps) {
  const call = useCall({ w, subject, lang, secondsLeft, tutorKey });
  // Speaker: in a browser it sets the voice loud or quiet (a web page cannot choose the phone's earpiece or speaker). In
  // the Android app it is hidden: the app has no plugin to switch the earpiece and the speaker yet. The app is known by its
  // user agent (flags.ts shellVersion); until that is read, the button is not drawn.
  const [inApp, setInApp] = useState<boolean | null>(null);
  useEffect(() => setInApp(shellVersion(navigator.userAgent) !== null), []);
  const board =
    call.blocks.length > 0 ? (
      <CallBoard w={w} blocks={call.blocks} tone={subject} sentence={call.sentence} />
    ) : (
      <p data-call-board-empty className="fam-surface mx-auto max-w-md bg-white p-5 text-center text-base text-slate">
        {w['fam.call.boardEmpty']}
      </p>
    );
  return (
    <CallScreen
      w={w}
      lang={lang}
      tutorName={tutorName}
      status={call.status}
      phase={call.phase}
      elapsed={call.elapsed}
      heard={call.heard}
      ack={call.ack}
      lines={call.lines}
      current={call.current}
      board={board}
      boardFull={call.blocks.length > 0}
      problem={call.problem}
      refusal={call.refusal}
      muted={call.muted}
      loud={call.loud}
      showSpeaker={inApp === false}
      recording={call.recording}
      stopped={call.stopped}
      voice={call.voice}
      levelOf={call.levelOf}
      endHref={endHref}
      onEnd={call.end}
      onMute={call.toggleMute}
      onSpeaker={call.toggleLoud}
      onTalk={call.talk}
      onWake={call.wakeUp}
      onAgain={call.again}
      onType={call.typed}
    />
  );
}
