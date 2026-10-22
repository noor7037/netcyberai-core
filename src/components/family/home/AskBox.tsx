'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Words } from '@/lib/family/fill';
import { Picture } from '../Picture';
import { PRESS } from '../ui/motion';
import { UnderstandView, type UnderstandInput } from '../UnderstandView';
import { VoiceInput } from '../VoiceInput';

// The ask box on the home, as on the overview board (D1-2, C294): one line to type a question, the camera to the
// homework helper (homework module on) and the microphone (voice input on and the parent's voice consent given). A typed
// question is asked exactly as in Study (StudyQuestion's flow: UnderstandView with a question; the server decides its
// subject). The words stay on this page and are never kept in the shared library.
export function AskBox({ w, camera, voice, tone }: { w: Words; camera: boolean; voice: { secondsLeft: number } | null; tone: string }) {
  const [text, setText] = useState('');
  const [asked, setAsked] = useState<UnderstandInput | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const ready = text.trim().length >= 3;
  const icon = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-royal/10 hover:bg-royal/20 ${PRESS}`;
  return (
    <div data-family-ask className="flex flex-col gap-3">
      <form
        role="search"
        aria-label={w['fam.home.askLabel']}
        className="flex items-center gap-1 rounded-full bg-white py-1 pl-4 pr-1 shadow-lg ring-1 ring-slate/10 focus-within:ring-2 focus-within:ring-royal"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) setAsked({ kind: 'question', text: text.trim() });
        }}
      >
        <label htmlFor="fam-home-ask" className="sr-only">
          {w['fam.home.askLabel']}
        </label>
        <input
          id="fam-home-ask"
          type="search"
          enterKeyHint="search"
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={camera ? w['fam.home.askPlaceholder'] : w['fam.home.askPlaceholderType']}
          className="min-h-[44px] min-w-0 flex-1 bg-transparent text-base text-slate placeholder:text-sm placeholder:text-slate/70 focus:outline-none"
        />
        {ready && (
          <button type="submit" className={`flex min-h-[44px] shrink-0 items-center rounded-full bg-royal px-4 text-sm font-bold text-white hover:bg-royal-deep ${PRESS}`}>
            {w['fam.study.askButton']}
          </button>
        )}
        {camera && (
          <Link href="/family/study/homework" data-ask-camera aria-label={w['fam.homework.studyLink']} className={icon}>
            <Picture e="📷" size={24} />
          </Link>
        )}
        {voice && (
          <button type="button" data-ask-microphone aria-label={w['fam.voice.speak']} aria-expanded={speaking} onClick={() => setSpeaking((s) => !s)} className={icon}>
            <Picture e="🎙️" size={24} />
          </button>
        )}
      </form>
      {voice && speaking && (
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
          <VoiceInput w={w} secondsLeft={voice.secondsLeft} onText={(heard) => setText((t) => (t.trim() ? `${t.trim()} ${heard}` : heard).slice(0, 500))} />
        </div>
      )}
      {asked && <UnderstandView key={asked.kind === 'question' ? asked.text : ''} w={w} input={asked} tone={tone} />}
    </div>
  );
}
