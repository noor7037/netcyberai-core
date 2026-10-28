'use client';

import { speak, stopSpeaking } from '../english/speech';

// Which voice reads a line aloud (C386): the server voice when Control has set one up, else the phone's own (speech.ts).
// The server voice reads only a line the server holds, named here by where it comes from (src/lib/family/voice-out.ts);
// the phone never sends the words. The audio is played from memory and dropped when the line ends or is stopped; the
// response is never cached. When the server voice is not set up, or the family's turns are used up, the rest of the
// visit uses the phone's voice and the screen says so; a single failure reads that one line with the phone's voice.

export type LineSource = { kind: 'chapter'; chapterKey: string; blockId: string; sentence: number } | { kind: 'live_line'; token: string } | { kind: 'live_turn'; sessionId: string; position: number };
export type VoiceMode = 'server' | 'phone';
export type Spoken = { cancelled: boolean; mode: VoiceMode };

let generation = 0;
let playing: { audio: HTMLAudioElement; url: string } | null = null;

function drop() {
  if (!playing) return;
  playing.audio.pause();
  playing.audio.removeAttribute('src');
  URL.revokeObjectURL(playing.url);
  playing = null;
}

// Stops whatever is being read, by either voice; a line still on its way is not played.
export function stopLine() {
  generation++;
  drop();
  stopSpeaking();
}

type Played = 'played' | 'off' | 'failed' | 'cancelled';

async function playServer(source: LineSource, rate: number, mine: number): Promise<Played> {
  let res: Response;
  try {
    res = await fetch('/api/family/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source), credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return generation === mine ? 'failed' : 'cancelled';
  }
  if (generation !== mine) return 'cancelled';
  if (!res.ok || !/^audio\//.test(res.headers.get('content-type') ?? '')) {
    const error = (await res.json().catch(() => ({})))?.error;
    return error === 'not_set_up' || error === 'ai_cap_reached' ? 'off' : 'failed';
  }
  const blob = await res.blob().catch(() => null);
  if (generation !== mine) return 'cancelled';
  if (!blob) return 'failed';
  drop();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.playbackRate = rate;
  playing = { audio, url };
  return new Promise<Played>((resolve) => {
    const end = (how: Played) => {
      if (playing?.audio === audio) drop();
      resolve(generation === mine ? how : 'cancelled');
    };
    audio.onended = () => end('played');
    // A phone that cannot decode the audio, or will not play it without a tap, would refuse every line the same way:
    // the rest of the visit uses its own voice, so no further line is asked for (each one takes a daily place).
    audio.onerror = () => end('off');
    audio.onpause = () => {
      if (generation !== mine) end('cancelled');
    };
    audio.play().catch(() => end('off'));
  });
}

// Reads one line: with the server voice when `mode` is 'server', else (or when it cannot) with the phone's own.
// Resolves when the line ends, with the voice to use for the next line; `cancelled` when stopLine() came first.
export async function speakLine(mode: VoiceMode, source: LineSource, phone: { text: string; lang: 'en' | 'hi'; rate: number; onWord?: (charIndex: number) => void }): Promise<Spoken> {
  stopLine();
  const mine = generation;
  let next: VoiceMode = mode;
  if (mode === 'server') {
    const played = await playServer(source, phone.rate, mine);
    if (played === 'played') return { cancelled: false, mode };
    if (played === 'cancelled') return { cancelled: true, mode };
    if (played === 'off') next = 'phone';
  }
  await speak(phone.text, phone.lang, phone.rate, phone.onWord);
  return { cancelled: generation !== mine, mode: next };
}
