'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { placeBlock } from '@/lib/family/blocks';
import type { PublicBlock, ResolverEvent } from '@/lib/family/resolver';
import { useVoiceRecorder } from '../voice/useVoiceRecorder';
import { speakLine, stopLine, type VoiceMode } from '../voice/lineVoice';

// The call's logic (W16-A4): listen, answer, speak, one turn at a time.
//   1. listen: the microphone's own recorder (useVoiceRecorder): the voice route hears it once and drops it; the day's
//      speaking seconds and the parent's voice consent apply exactly as for the composer's microphone.
//   2. answer: the words go to the understand route as a tutor question with `call: true`; its stream brings each checked
//      block (the board) and, after it, the block's spoken sentences each with a seal (`say`).
//   3. speak: each sentence goes to the server voice by its seal, or, when the server voice is not set up (or the family's
//      voice allowance is used), to the phone's own voice, as soon as it arrives and the one before it has ended. The first
//      sentence is spoken while the rest of the answer is still being written.
// Barge-in: a tap on the microphone while the tutor speaks stops the voice and the stream at once and starts listening.
// Nothing of the audio is kept here: the recording is dropped after it is sent, spoken audio is played from memory.

export type CallLine = { text: string; token: string };
export type CallPhase = 'idle' | 'listening' | 'hearing' | 'thinking' | 'speaking';

type Turn = {
  n: number;
  gen: number;
  abort: AbortController | null;
  queue: CallLine[];
  started: number;
  playing: boolean;
  streamDone: boolean;
  mode: VoiceMode;
  heardAt: number;
  textMs: number | null;
  audioMs: number | null;
  sent: boolean;
  chatId: string | null;
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function useCall({ w, subject, lang, secondsLeft }: { w: Words; subject: string; lang: 'en' | 'hi'; secondsLeft: number }) {
  const [heard, setHeard] = useState('');
  const [lines, setLines] = useState<CallLine[]>([]);
  const [current, setCurrent] = useState(-1);
  const [blocks, setBlocks] = useState<PublicBlock[]>([]);
  const [busy, setBusy] = useState<'idle' | 'thinking' | 'speaking'>('idle');
  const [refusal, setRefusal] = useState('');
  const [voice, setVoice] = useState<VoiceMode | null>(null);
  const turn = useRef<Turn>({ n: 0, gen: 0, abort: null, queue: [], started: 0, playing: false, streamDone: true, mode: 'server', heardAt: 0, textMs: null, audioMs: null, sent: false, chatId: null });

  // The two marks of a turn, posted once: from the moment the child stopped speaking to the first words and the first sound.
  const postMarks = useCallback((voiceUsed: VoiceMode | 'none') => {
    const t = turn.current;
    if (t.sent || t.n < 1) return;
    t.sent = true;
    void fetch('/api/family/voice/call/marks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turn: t.n, textMs: t.textMs, audioMs: t.audioMs, voice: voiceUsed }),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => null);
  }, []);

  const pump = useCallback(
    (mine: number) => {
      const t = turn.current;
      if (t.gen !== mine || t.playing) return;
      const line = t.queue.shift();
      if (!line) {
        // Nothing waiting: the turn is over once the answer has finished too.
        if (t.streamDone) {
          setBusy('idle');
          setCurrent(-1);
          postMarks(t.audioMs === null ? 'none' : t.mode);
        }
        return;
      }
      t.playing = true;
      setBusy('speaking');
      setCurrent(t.started++);
      void speakLine(t.mode, { kind: 'call_line', token: line.token }, {
        text: line.text,
        lang,
        rate: 0.95,
        onPlaying: () => {
          if (t.gen !== mine || t.audioMs !== null) return;
          t.audioMs = Math.round(now() - t.heardAt);
        },
      }).then((r) => {
        if (t.gen !== mine) return;
        t.playing = false;
        if (r.cancelled) return;
        t.mode = r.mode;
        setVoice(r.mode);
        // The marks go as soon as the first sound has played: the rest of the turn adds nothing to them.
        if (t.audioMs !== null) postMarks(r.mode);
        pump(mine);
      });
    },
    [lang, postMarks]
  );

  // Stops everything of the turn in progress: the voice, the answer's stream and what is queued.
  const cancel = useCallback(() => {
    const t = turn.current;
    t.gen++;
    t.abort?.abort();
    t.abort = null;
    t.queue = [];
    t.playing = false;
    t.streamDone = true;
    stopLine();
    setBusy('idle');
    setCurrent(-1);
  }, []);

  const ask = useCallback(
    async (text: string, retried = false) => {
      const t = turn.current;
      if (!retried) {
        cancel();
        t.n++;
        t.sent = false;
        t.textMs = null;
        t.audioMs = null;
        t.started = 0;
        setLines([]);
        setBlocks([]);
        setRefusal('');
        setHeard(text);
      }
      const mine = ++t.gen;
      const controller = new AbortController();
      t.abort = controller;
      t.streamDone = false;
      setBusy('thinking');
      const text1 = () => {
        if (t.textMs === null) t.textMs = Math.round(now() - t.heardAt);
      };
      try {
        const res = await fetch('/api/family/understand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'question', text, call: true, tutor: { subject, ...(t.chatId ? { chatId: t.chatId } : {}) } }),
          signal: controller.signal,
          credentials: 'same-origin',
        });
        if (t.gen !== mine) return;
        // The chat filled up: the next question goes to a new one, and this one is asked again once.
        if (res.status === 409 && t.chatId && !retried) {
          t.chatId = null;
          return void ask(text, true);
        }
        if (!res.ok || !res.body) {
          t.streamDone = true;
          setRefusal(res.status === 409 ? fill(w['fam.chat.full'] ?? w['fam.err.network'], { subject: w[`fam.subject.${subject}`] ?? subject }) : w['fam.err.network']);
          return pump(mine);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done || t.gen !== mine) break;
          buf += decoder.decode(value, { stream: true });
          let nl = buf.indexOf('\n');
          while (nl >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            nl = buf.indexOf('\n');
            if (!line.trim() || t.gen !== mine) continue;
            const e = JSON.parse(line) as ResolverEvent;
            if (e.t === 'block') {
              text1();
              setBlocks((b) => placeBlock(b, e.block));
            } else if (e.t === 'say') {
              text1();
              const fresh = e.lines.filter((l) => typeof l.text === 'string' && typeof l.token === 'string');
              setLines((l) => [...l, ...fresh]);
              t.queue.push(...fresh);
              pump(mine);
            } else if (e.t === 'done') {
              if (e.chat?.chatId) t.chatId = e.chat.chatId;
            } else if (e.t === 'refused') setRefusal(e.message);
          }
        }
        if (t.gen !== mine) return;
        t.streamDone = true;
        pump(mine);
      } catch {
        if (t.gen !== mine) return;
        t.streamDone = true;
        setRefusal(w['fam.err.network']);
        pump(mine);
      }
    },
    [cancel, pump, subject, w]
  );

  // The recorder hands its words to the newest `ask` (its own closure is from the render that began the recording).
  const askRef = useRef(ask);
  askRef.current = ask;
  const recorder = useVoiceRecorder({ w, secondsLeft, onText: (text) => void askRef.current(text) });

  // The moment the child stops speaking is the zero of the turn's marks.
  useEffect(() => {
    if (recorder.state === 'sending') turn.current.heardAt = now();
  }, [recorder.state]);

  // Leaving the call stops the voice and the stream.
  useEffect(
    () => () => {
      const t = turn.current;
      t.gen++;
      t.abort?.abort();
      stopLine();
    },
    []
  );

  // The tap on the microphone: begin listening; if the tutor is thinking or speaking, stop it first (barge-in).
  const talk = useCallback(() => {
    if (recorder.state === 'recording') return recorder.stop();
    if (recorder.state === 'sending') return;
    if (busy !== 'idle') cancel();
    setHeard('');
    void recorder.start();
  }, [busy, cancel, recorder]);

  const phase: CallPhase = recorder.state === 'recording' ? 'listening' : recorder.state === 'sending' ? 'hearing' : busy === 'speaking' ? 'speaking' : busy === 'thinking' ? 'thinking' : 'idle';
  return { phase, heard, lines, current, blocks, refusal, voice, recorder, talk, end: cancel, setHeard };
}
