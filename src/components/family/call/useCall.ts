'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { placeBlock } from '@/lib/family/blocks';
import type { PublicBlock, ResolverEvent } from '@/lib/family/resolver';
import { setAvatarMood } from '@/lib/family/avatar-state';
import { heardNothing } from '@/lib/family/call-heard';
import { readChildSettings } from '@/lib/family/child-settings';
import { useVoiceRecorder, type VoiceAck } from '../voice/useVoiceRecorder';
import { speakLine, stopLine, type VoiceMode } from '../voice/lineVoice';
import { LiveLeg, openRealtimeLeg, type LivePhase } from './RealtimeLeg';

// The call's logic (W16-A4): listen, answer, speak, one turn at a time.
//   1. listen: the microphone's own recorder (useVoiceRecorder): the voice route hears it once and drops it; the day's
//      speaking seconds and the parent's voice consent apply exactly as for the composer's microphone.
//   2. answer: the words go to the understand route as a tutor question with `call: true`; its stream brings each checked
//      block (the board) and, after it, the block's spoken sentences each with a seal (`say`).
//   3. speak: each sentence goes to the server voice by its seal, or, when the server voice is not set up (or the family's
//      voice allowance is used), to the phone's own voice, as soon as it arrives and the one before it has ended. The first
//      sentence is spoken while the rest of the answer is still being written.
// Barge-in: a tap on the microphone while the tutor speaks stops the voice and the stream at once and starts listening.
// W19-B:
//   - the microphone stops by itself when the child stops speaking (useVoiceRecorder's endpointer);
//   - the moment the words are known, the tutor's acknowledgement (sealed by the voice route, call-ack.ts) is queued
//     FIRST on the same voice queue while the answer is asked for in parallel; the answer's first sentence follows it;
//   - hands-free: after the tutor's last sentence the microphone opens again by itself, until the child taps Pause,
//     stays quiet, or the day's seconds run out;
//   - live: with a realtime provider set up, the call runs on the live leg (RealtimeLeg.ts) instead of the chain; if the
//     live voice drops and one reconnect fails, the chain takes over and the child is told only that the voice changed.
// Nothing of the audio is kept here: the recording is dropped after it is sent, spoken audio is played from memory.

// `ack`: the tutor's acknowledgement line, played first and never counted among the answer's sentences (the board).
export type CallLine = { text: string; token: string; ack?: true };
export type CallPhase = 'idle' | 'listening' | 'hearing' | 'thinking' | 'speaking';
export type CallMode = 'chain' | 'connecting' | 'live';

// A breath between the tutor's last word and the microphone opening again, so the speaker's tail is not recorded.
const REOPEN_MS = 350;

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

export function useCall({ w, subject, lang, secondsLeft, tutorKey = null, realtime = false }: { w: Words; subject: string; lang: 'en' | 'hi'; secondsLeft: number; tutorKey?: string | null; realtime?: boolean }) {
  const [heard, setHeard] = useState('');
  const [lines, setLines] = useState<CallLine[]>([]);
  const [current, setCurrent] = useState(-1);
  const [blocks, setBlocks] = useState<PublicBlock[]>([]);
  const [busy, setBusy] = useState<'idle' | 'thinking' | 'speaking'>('idle');
  const [refusal, setRefusal] = useState('');
  const [voice, setVoice] = useState<VoiceMode | null>(null);
  const [ack, setAck] = useState('');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  // Set when a turn ends with the tutor having spoken: the microphone opens again once the call is idle.
  const reopen = useRef(false);
  // W19-C: the child's own switches: hands-free listening after the tutor speaks, and the voice's speed.
  const prefs = useRef({ handsFree: true, rate: 0.95 });
  useEffect(() => {
    let live = true;
    void readChildSettings().then((s) => {
      if (live) prefs.current = { handsFree: s.handsFree, rate: s.voiceSpeed === 'slow' ? 0.8 : 0.95 };
    });
    return () => {
      live = false;
    };
  }, []);
  // The live leg: the call's mode, the leg's own phase, and a notice when the voice changes under the call.
  const [mode, setMode] = useState<CallMode>(realtime ? 'connecting' : 'chain');
  const [livePhase, setLivePhase] = useState<LivePhase>('connecting');
  const [notice, setNotice] = useState('');
  const [liveLeft, setLiveLeft] = useState<number | null>(null);
  const leg = useRef<LiveLeg | null>(null);
  const liveTurnDone = useRef(true);
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
          // Hands-free: a turn the tutor answered aloud opens the microphone again.
          if (t.started > 0 && prefs.current.handsFree) reopen.current = true;
          setBusy('idle');
          setCurrent(-1);
          postMarks(t.audioMs === null ? 'none' : t.mode);
        } else setBusy('thinking');
        return;
      }
      t.playing = true;
      setBusy('speaking');
      // The acknowledgement is not one of the answer's sentences: the board stays where it is while it plays.
      setCurrent(line.ack ? -1 : t.started++);
      void speakLine(t.mode, { kind: 'call_line', token: line.token }, {
        text: line.text,
        lang,
        rate: prefs.current.rate,
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
    async (text: string, retried = false, heardAck?: VoiceAck) => {
      const t = turn.current;
      // A quiet room transcribed ("Thank you.") is no question: nothing is sent or counted; the child is asked again.
      if (!retried && heardNothing(text)) {
        cancel();
        setLines([]);
        setBlocks([]);
        setHeard('');
        setAck('');
        setRefusal(w['fam.call.notHeard'] ?? '');
        return;
      }
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
        setAck('');
      }
      const mine = ++t.gen;
      const controller = new AbortController();
      t.abort = controller;
      t.streamDone = false;
      setBusy('thinking');
      // The tutor reacts at once: its acknowledgement goes first on the voice queue, while the answer is asked for.
      if (!retried && heardAck) {
        setAck(heardAck.text);
        t.queue.push({ text: heardAck.text, token: heardAck.token, ack: true });
        pump(mine);
      }
      const text1 = () => {
        if (t.textMs === null) t.textMs = Math.round(now() - t.heardAt);
      };
      try {
        const res = await fetch('/api/family/understand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'question', text, call: true, tutor: { subject, ...(tutorKey ? { tutorKey } : {}), ...(t.chatId ? { chatId: t.chatId } : {}) } }),
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
    [cancel, pump, subject, tutorKey, w]
  );

  // The recorder hands its words to the newest `ask` (its own closure is from the render that began the recording).
  const askRef = useRef(ask);
  askRef.current = ask;
  const recorder = useVoiceRecorder({ w, secondsLeft, onText: (text, heardAck) => void askRef.current(text, false, heardAck) });
  const recRef = useRef(recorder);
  recRef.current = recorder;

  // The moment the child stops speaking is the zero of the turn's marks.
  useEffect(() => {
    if (recorder.state === 'sending') turn.current.heardAt = now();
  }, [recorder.state]);

  // Leaving the call stops the voice, the stream and the live leg.
  useEffect(
    () => () => {
      const t = turn.current;
      t.gen++;
      t.abort?.abort();
      stopLine();
      leg.current?.close();
      leg.current = null;
      setAvatarMood('idle');
    },
    []
  );

  // The live leg: asked for only when a realtime provider is set up; anything short of a ready socket leaves the chain,
  // with nothing said (the child has not heard the live voice yet).
  const wRef = useRef(w);
  wRef.current = w;
  useEffect(() => {
    if (!realtime) return;
    let gone = false;
    void (async () => {
      const grant = await openRealtimeLeg();
      if (gone) return;
      if (!grant.available) {
        if (grant.reason === 'voice_cap') setLiveLeft(0);
        return setMode('chain');
      }
      const live = new LiveLeg(grant.grant, {
        phase: (p) => {
          if (!gone) setLivePhase(p);
        },
        heard: (piece) => {
          if (gone) return;
          // The first words after the tutor's turn begin a new turn on the captions.
          if (liveTurnDone.current) {
            liveTurnDone.current = false;
            setHeard(piece.trim());
            setLines([]);
          } else setHeard((h) => `${h}${piece}`.replace(/\s+/g, ' ').trimStart());
        },
        said: (piece) => {
          if (gone) return;
          // The tutor speaking first (a greeting) also begins a turn; otherwise its words join this turn's line.
          if (liveTurnDone.current) {
            liveTurnDone.current = false;
            setLines([]);
          }
          setLines((l) => {
            const last = l[l.length - 1];
            return last ? [...l.slice(0, -1), { ...last, text: `${last.text}${piece}` }] : [{ text: piece.trimStart(), token: '' }];
          });
        },
        turn: () => {
          liveTurnDone.current = true;
        },
        interrupted: () => {
          liveTurnDone.current = true;
        },
        fallback: (reason) => {
          if (gone) return;
          leg.current = null;
          setPaused(false);
          setMode('chain');
          if (reason === 'voice_cap') setLiveLeft(0);
          else setNotice(wRef.current['fam.call.voiceChanged'] ?? '');
        },
        secondsLeft: (left) => {
          if (!gone) setLiveLeft(left);
        },
      });
      leg.current = live;
      const ok = await live.start();
      if (gone) return live.close();
      if (!ok) {
        leg.current = null;
        return setMode('chain');
      }
      setMode('live');
    })();
    return () => {
      gone = true;
    };
  }, [realtime]);

  // End call (W16-B1): the call stops, and the chat it was held in is marked as a session that ended, so its quick quiz is
  // made within minutes. keepalive: the request outlives the page this button leaves.
  const end = useCallback(() => {
    cancel();
    reopen.current = false;
    recRef.current.cancel();
    leg.current?.close();
    leg.current = null;
    const chatId = turn.current.chatId;
    if (chatId) void fetch('/api/family/tutor/done', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ chatId }), keepalive: true }).catch(() => null);
  }, [cancel]);

  // The tap on the microphone: begin listening; if the tutor is thinking or speaking, stop it first (barge-in). Live: the
  // button pauses and resumes the microphone (the provider hears the child over its own voice, which is the barge-in).
  const talk = useCallback(() => {
    if (mode === 'live' && leg.current) {
      const next = livePhase !== 'paused';
      leg.current.setMuted(next);
      setPaused(next);
      return;
    }
    if (mode === 'connecting') return;
    setPaused(false);
    reopen.current = false;
    if (recorder.state === 'recording') return recorder.stop();
    if (recorder.state === 'sending') return;
    if (busy !== 'idle') cancel();
    setHeard('');
    setAck('');
    void recorder.start();
  }, [busy, cancel, recorder, mode, livePhase]);

  // Pause (hands-free): the microphone closes without sending, and does not open again until the child taps.
  const pause = useCallback(() => {
    setPaused(true);
    reopen.current = false;
    if (mode === 'live') return leg.current?.setMuted(true);
    recRef.current.cancel();
  }, [mode]);

  const chainPhase: CallPhase = recorder.state === 'recording' ? 'listening' : recorder.state === 'sending' ? 'hearing' : busy === 'speaking' ? 'speaking' : busy === 'thinking' ? 'thinking' : 'idle';
  const phase: CallPhase = mode === 'chain' ? chainPhase : mode === 'connecting' || livePhase === 'connecting' ? 'thinking' : livePhase === 'listening' ? 'listening' : livePhase === 'speaking' ? 'speaking' : 'idle';

  // Hands-free: the turn is over and the tutor spoke, so the microphone opens again; not after Pause, not with the day's
  // seconds spent, not after a problem (a quiet room, a refusal): those wait for a tap.
  useEffect(() => {
    if (mode !== 'chain' || chainPhase !== 'idle' || !reopen.current) return;
    reopen.current = false;
    const r = recRef.current;
    if (pausedRef.current || r.limit < 1 || r.error) return;
    const id = setTimeout(() => {
      if (!pausedRef.current && recRef.current.state === 'idle') {
        setHeard('');
        setAck('');
        void recRef.current.start();
      }
    }, REOPEN_MS);
    return () => clearTimeout(id);
  }, [mode, chainPhase]);

  // The tutor's face follows the call: listening while the microphone is open, thinking while the words are heard and
  // the answer written. Speaking is set by the voice itself (lineVoice) on the chain; here on the live leg.
  useEffect(() => {
    if (phase === 'listening') setAvatarMood('listening');
    else if (phase === 'hearing' || phase === 'thinking') setAvatarMood('thinking');
    else if (phase === 'speaking') {
      if (mode === 'live') setAvatarMood('speaking');
    } else setAvatarMood('idle');
  }, [phase, mode]);

  // W18-P1: the sentence being spoken, by its place in the turn's say lines (either voice: both play through the one
  // queue); the board draws up to the step it reaches. Undefined while nothing is spoken: the board stays where it is.
  const sentence = current >= 0 ? current : undefined;
  // Hands-free is on once a turn has been answered (or the live voice is open), until the child pauses.
  const handsFree = !paused && (mode === 'live' || (turn.current.n > 0 && prefs.current.handsFree));
  return { phase, heard, lines, current, sentence, blocks, refusal, voice, recorder, talk, end, setHeard, ack, pause, paused, handsFree, mode, notice, liveLeft };
}
