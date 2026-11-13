'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { placeBlock } from '@/lib/family/blocks';
import type { PublicBlock, ResolverEvent } from '@/lib/family/resolver';
import { avatarState, setAvatarLevel, setAvatarMood } from '@/lib/family/avatar-state';
import { heardNothing } from '@/lib/family/call-heard';
import { bargeIn, CallEar, carryWords, VAD, type TutorBusy } from '@/lib/family/call-vad';
import { readChildSettings } from '@/lib/family/child-settings';
import { familyApi } from '../client';
import { RECORDING_TYPES, toBase64, VOICE_MAX_SECONDS, voiceSay, type VoiceAck } from '../voice/useVoiceRecorder';
import { setLineVolume, speakLine, stopLine, type VoiceMode } from '../voice/lineVoice';
import { openCallMic, primeCallMic, type CallMic } from './callMic';

// The call's logic (W16-A4; an open microphone since C511): a real call, hands-free from the first second.
//   1. the microphone: one stream for the whole call, opened in the child's tap on Call (callMic.ts) and taken here at
//      once; the screen shows "Connecting…" only while that stream arrives. Nothing else is waited for.
//   2. turns: the open microphone's loudness goes to the turn detector (call-vad.ts) twenty times a second; a voice
//      starts a recording, the end of it (0.9 s of quiet) sends it, a cough or a knock is thrown away. The microphone
//      keeps listening after every turn; there is no Talk button (only where the phone gives no loudness: then a tap).
//   3. hear: the recording goes once to the voice route (the day's speaking seconds and the parent's voice consent
//      apply exactly as for the composer's microphone), which drops it and returns the words and the tutor's sealed
//      acknowledgement.
//   4. answer: the words go to the understand route as a tutor question with `call: true`, in the call's chat (`chatId`,
//      so the tutor is told the conversation so far, as in a typed chat); its stream brings each checked block (the board)
//      and its spoken sentences each with a seal (`say`).
//   5. speak: the acknowledgement first, then each sentence by its seal with the server voice, or with the phone's own
//      voice when the server voice is not set up; the first sentence is spoken while the rest is still being written.
// Barge-in by voice: the child talking while the tutor is busy stops the voice and the answer at once (call-vad.ts
// bargeIn); talked over before the answer began, the words already heard are asked again together with the new ones.
// The tutor's own voice is no barge-in: the echo canceller takes it out, and while it plays the speech line is raised
// and the voice must last longer. Leaving the screen (page hidden, another page, End) stops every track of the stream.
// Nothing of the audio is kept here: each recording is dropped after it is sent, spoken audio is played from memory.

// `ack`: the tutor's acknowledgement line, played first and never counted among the answer's sentences (the board).
export type CallLine = { text: string; token: string; ack?: true };
export type CallPhase = 'connecting' | 'listening' | 'hearing' | 'thinking' | 'speaking' | 'muted' | 'idle' | 'ended';
// live: the open microphone runs; asleep: the phone left sound asleep until a tap; manual: no loudness to listen with,
// so the child taps to talk; failed: no microphone (refused, or none) — typing still works.
export type CallStatus = 'connecting' | 'live' | 'asleep' | 'manual' | 'failed' | 'ended';

// The voice route's refusals that stop the listening (asking again would be refused the same way).
const STOPS = new Set(['voice_cap', 'consent_required', 'off', 'not_for_class', 'ai_not_switched_on', 'ai_cap_reached', 'ai_not_cleared_for_minors', 'ai_not_capable', 'denied', 'unsupported']);
export const QUIET_VOLUME = 0.4;

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
  asked: string;
};

type Rec = { rec: MediaRecorder; chunks: Blob[]; at: number; send: boolean };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function useCall({ w, subject, lang, secondsLeft, tutorKey = null }: { w: Words; subject: string; lang: 'en' | 'hi'; secondsLeft: number; tutorKey?: string | null }) {
  const [status, setStatus] = useState<CallStatus>('connecting');
  const statusRef = useRef<CallStatus>('connecting');
  statusRef.current = status;
  const [heard, setHeard] = useState('');
  const [lines, setLines] = useState<CallLine[]>([]);
  const [current, setCurrent] = useState(-1);
  const [blocks, setBlocks] = useState<PublicBlock[]>([]);
  const [busy, setBusyState] = useState<TutorBusy>('idle');
  const [refusal, setRefusal] = useState('');
  const [problem, setProblem] = useState('');
  const [voice, setVoice] = useState<VoiceMode | null>(null);
  const [ack, setAck] = useState('');
  const [muted, setMutedState] = useState(false);
  const [loud, setLoud] = useState(true);
  const [recording, setRecording] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const busyRef = useRef<TutorBusy>('idle');
  const setBusy = useCallback((b: TutorBusy) => {
    busyRef.current = b;
    setBusyState(b);
  }, []);
  const mic = useRef<CallMic | null>(null);
  const ear = useRef(new CallEar());
  const rec = useRef<Rec | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedRef = useRef(false);
  const stoppedRef = useRef(false);
  const ended = useRef(false);
  // Each start of the microphone; an older one that arrives late (the screen left, or started again) is closed.
  const startGen = useRef(0);
  const startedAt = useRef(0);
  const level = useRef(0);
  const limit = useRef(Math.max(0, Math.min(VOICE_MAX_SECONDS, secondsLeft)));
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  // Words heard from a turn the child talked over before the answer began, waiting to be asked with the next ones.
  const carry = useRef<Promise<string>>(Promise.resolve(''));
  const hearing = useRef<{ gen: number; text: Promise<string> } | null>(null);
  const hearGen = useRef(0);
  const rate = useRef(0.95);
  const turn = useRef<Turn>({ n: 0, gen: 0, abort: null, queue: [], started: 0, playing: false, streamDone: true, mode: 'server', heardAt: 0, textMs: null, audioMs: null, sent: false, chatId: null, asked: '' });
  const wRef = useRef(w);
  wRef.current = w;

  // W19-C: the child's own voice speed.
  useEffect(() => {
    let live = true;
    void readChildSettings().then((s) => {
      if (live) rate.current = s.voiceSpeed === 'slow' ? 0.8 : 0.95;
    });
    return () => {
      live = false;
    };
  }, []);

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
        rate: rate.current,
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
    [lang, postMarks, setBusy]
  );

  // Stops everything of the turn in progress: the voice, the answer's stream and what is queued (the unsaid sentences).
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
  }, [setBusy]);

  const ask = useCallback(
    async (text: string, retried = false, heardAck?: VoiceAck) => {
      const t = turn.current;
      // A quiet room transcribed ("Thank you.") is no question: nothing is sent or counted; the microphone listens on.
      if (!retried && heardNothing(text)) {
        setBusy('idle');
        setRefusal(wRef.current['fam.call.notHeard'] ?? '');
        return;
      }
      if (!retried) {
        cancel();
        t.n++;
        t.sent = false;
        t.textMs = null;
        t.audioMs = null;
        t.started = 0;
        t.asked = text;
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
      const ww = wRef.current;
      try {
        // The call's chat (`chatId`, from the first answer's last line): the tutor is told the conversation so far.
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
          setRefusal(res.status === 409 ? fill(ww['fam.chat.full'] ?? ww['fam.err.network'], { subject: ww[`fam.subject.${subject}`] ?? subject }) : ww['fam.err.network']);
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
        setRefusal(ww['fam.err.network']);
        pump(mine);
      }
    },
    [cancel, pump, setBusy, subject, tutorKey]
  );

  // The words carried from a talked-over turn, taken once.
  const takeCarry = () => {
    const p = carry.current;
    carry.current = Promise.resolve('');
    return p;
  };

  // A turn's recording goes to the voice route; the words come back and are asked.
  const hear = useCallback(
    async (blob: Blob, seconds: number) => {
      const g = ++hearGen.current;
      turn.current.heardAt = now();
      setBusy('hearing');
      setRefusal('');
      let resolveText: (s: string) => void = () => undefined;
      hearing.current = { gen: g, text: new Promise<string>((r) => (resolveText = r)) };
      const r = await familyApi<{ text: string; maxSeconds: number; ack?: VoiceAck }>('/api/family/voice', 'POST', { audio: await toBase64(blob), seconds });
      resolveText(r.ok && typeof r.data.text === 'string' && !heardNothing(r.data.text) ? r.data.text : '');
      if (hearing.current?.gen === g) hearing.current = null;
      if (ended.current) return;
      // The server says how long the next turn may be (the seconds left today, 60 at most).
      if (typeof r.data.maxSeconds === 'number') {
        limit.current = Math.max(0, Math.min(VOICE_MAX_SECONDS, r.data.maxSeconds));
        ear.current.detector.setMaxTurn(Math.min(VAD.maxTurnMs, limit.current * 1000));
      }
      // Talked over while it was being heard: these words were carried into the next turn (bargeIn `continue`).
      if (g !== hearGen.current) return;
      if (busyRef.current === 'hearing') setBusy('idle');
      const carried = await takeCarry();
      if (!r.ok) {
        if (r.error === 'nothing_heard') {
          if (carried) return void ask(carried);
          return setRefusal(wRef.current['fam.call.notHeard'] ?? '');
        }
        if (STOPS.has(r.error)) {
          stoppedRef.current = true;
          setStopped(true);
        }
        return setProblem(voiceSay(wRef.current, r.error));
      }
      if (limit.current < 1) {
        stoppedRef.current = true;
        setStopped(true);
        setProblem(voiceSay(wRef.current, 'voice_cap'));
      }
      const ackOk = !carried && r.data.ack && typeof r.data.ack.text === 'string' && typeof r.data.ack.token === 'string' ? r.data.ack : undefined;
      void ask(carryWords(carried, r.data.text), false, ackOk);
    },
    [ask, setBusy]
  );

  const beginRecording = useCallback(() => {
    const m = mic.current;
    if (!m || rec.current || ended.current) return;
    const mimeType = RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(m.stream, mimeType ? { mimeType } : undefined);
    } catch {
      return;
    }
    const cur: Rec = { rec: r, chunks: [], at: Date.now(), send: false };
    r.ondataavailable = (e) => {
      if (e.data.size > 0) cur.chunks.push(e.data);
    };
    r.onstop = () => {
      if (rec.current === cur) rec.current = null;
      setRecording(false);
      const ms = Date.now() - cur.at;
      const chunks = cur.chunks;
      cur.chunks = [];
      if (!cur.send || ended.current || chunks.length === 0) return;
      const seconds = Math.min(Math.max(1, Math.ceil(ms / 1000)), Math.max(1, limit.current));
      void hear(new Blob(chunks, { type: r.mimeType || mimeType || 'audio/webm' }), seconds);
    };
    try {
      r.start();
    } catch {
      return;
    }
    rec.current = cur;
    setRecording(true);
  }, [hear]);

  // Ends the recording: sent (`send`) or thrown away.
  const finishRecording = useCallback((send: boolean) => {
    const cur = rec.current;
    if (!cur) return;
    cur.send = send;
    rec.current = null;
    try {
      if (cur.rec.state !== 'inactive') cur.rec.stop();
    } catch {
      setRecording(false);
    }
  }, []);

  // The child's voice is confirmed while the tutor is busy (call-vad.ts bargeIn).
  const interrupt = useCallback(() => {
    const how = bargeIn(busyRef.current, turn.current.started > 0);
    if (how === 'none') return;
    if (how === 'continue') {
      const before = carry.current;
      if (busyRef.current === 'hearing' && hearing.current) {
        const words = hearing.current.text;
        hearGen.current++;
        carry.current = Promise.all([before, words]).then(([a, b]) => carryWords(a, b));
      } else {
        const asked = turn.current.asked;
        carry.current = before.then((a) => carryWords(a, asked));
      }
    } else carry.current = Promise.resolve('');
    cancel();
    setAck('');
  }, [cancel]);

  // Twenty times a second: the loudness to the turn detector.
  const onFrame = useCallback(() => {
    const m = mic.current;
    if (!m || ended.current) return;
    if (mutedRef.current || stoppedRef.current || (m.ctx && m.ctx.state !== 'running')) {
      level.current = 0;
      return;
    }
    const lv = m.level();
    level.current = lv;
    if (busyRef.current === 'idle') setAvatarLevel(Math.min(1, lv * 8));
    const ev = ear.current.frame(lv, turn.current.playing);
    if (ev === 'onset') beginRecording();
    else if (ev === 'cancel') finishRecording(false);
    else if (ev === 'start') {
      beginRecording();
      interrupt();
    } else if (ev === 'end') finishRecording(true);
    else if (ev === 'drop') {
      finishRecording(false);
      // A cough after talking over the tutor: the carried words are asked on their own.
      if (busyRef.current === 'idle') {
        void takeCarry().then((c) => {
          if (c && !ended.current) void ask(c);
        });
      }
    }
  }, [ask, beginRecording, finishRecording, interrupt]);
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

  const releaseWake = () => {
    const l = wake.current;
    wake.current = null;
    void l?.release().catch(() => undefined);
  };

  // End: every track of the microphone stopped, the voice and the answer stopped, the wake lock let go; and the chat the
  // call was held in is marked as a session that ended (W16-B1), so its quick quiz is made within minutes.
  const end = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    startGen.current++;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    finishRecording(false);
    const t = turn.current;
    t.gen++;
    t.abort?.abort();
    t.abort = null;
    t.queue = [];
    stopLine();
    setLineVolume(1);
    mic.current?.close();
    mic.current = null;
    releaseWake();
    setAvatarMood('idle');
    setAvatarLevel(0);
    busyRef.current = 'idle';
    setBusyState('idle');
    setStatus('ended');
    const chatId = t.chatId;
    if (chatId) void fetch('/api/family/tutor/done', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ chatId }), keepalive: true }).catch(() => null);
  }, [finishRecording]);
  const endRef = useRef(end);
  endRef.current = end;

  // The call starts: the microphone (already asked for in the tap), then listening. Nothing else is waited for.
  const start = useCallback(async () => {
    const mine = ++startGen.current;
    ended.current = false;
    stoppedRef.current = false;
    setStopped(false);
    setProblem('');
    setStatus('connecting');
    const opened = await openCallMic();
    if (ended.current || mine !== startGen.current) {
      if (opened.ok) opened.mic.close();
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    if (!opened.ok) {
      setStatus('failed');
      stoppedRef.current = true;
      setStopped(true);
      return setProblem(voiceSay(wRef.current, opened.error));
    }
    const m = opened.mic;
    mic.current = m;
    ear.current = new CallEar();
    ear.current.detector.setMaxTurn(Math.min(VAD.maxTurnMs, limit.current * 1000));
    mutedRef.current = false;
    setMutedState(false);
    m.setMuted(false);
    // The screen stays on while the call is on; a phone that refuses is fine.
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (k: 'screen') => Promise<{ release: () => Promise<void> }> } };
      void nav.wakeLock
        ?.request('screen')
        .then((l) => {
          if (ended.current) void l.release().catch(() => undefined);
          else wake.current = l;
        })
        .catch(() => null);
    } catch {}
    if (limit.current < 1) {
      stoppedRef.current = true;
      setStopped(true);
      setProblem(voiceSay(wRef.current, 'voice_cap'));
    }
    if (!m.analyser) return setStatus('manual');
    if (m.ctx && m.ctx.state !== 'running') await m.ctx.resume().catch(() => undefined);
    if (ended.current || mine !== startGen.current) return;
    tick.current = setInterval(() => frameRef.current(), VAD.frameMs);
    setStatus(m.ctx && m.ctx.state !== 'running' ? 'asleep' : 'live');
  }, []);

  // The call opens with the screen; leaving it (another page, the page hidden, the app in the background) ends it.
  useEffect(() => {
    void start();
    // Not while connecting: a phone's permission prompt can hide the page for a moment, and that is the call starting.
    const hide = () => {
      if (document.visibilityState === 'hidden' && statusRef.current !== 'connecting') endRef.current();
    };
    const gone = () => endRef.current();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', gone);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', gone);
      endRef.current();
    };
  }, [start]);

  // The call's clock, once a second while it is on.
  useEffect(() => {
    if (status === 'connecting' || status === 'ended') return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status]);

  // A phone that left sound asleep: the child's tap wakes it (inside the tap).
  const wakeUp = useCallback(() => {
    const m = mic.current;
    if (!m?.ctx) return;
    void m.ctx.resume().then(
      () => {
        if (m.ctx?.state === 'running' && !ended.current) setStatus('live');
      },
      () => undefined
    );
  }, []);

  // Mute: the microphone sends silence and no turn is heard or sent until unmuted; the recording under way is dropped.
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMutedState(next);
    mic.current?.setMuted(next);
    ear.current.mute(next);
    finishRecording(false);
    level.current = 0;
  }, [finishRecording]);

  // Speaker (web): loud or quiet. The phone's speaker or earpiece cannot be chosen from a web page.
  const toggleLoud = useCallback(() => {
    setLoud((l) => {
      setLineVolume(l ? QUIET_VOLUME : 1);
      return !l;
    });
  }, []);

  // Manual (no loudness to listen with): a tap starts the turn and a tap sends it; a tap over the tutor stops it first.
  const talk = useCallback(() => {
    if (status !== 'manual' || stoppedRef.current || mutedRef.current) return;
    if (rec.current) return finishRecording(true);
    if (busyRef.current !== 'idle') interrupt();
    beginRecording();
  }, [beginRecording, finishRecording, interrupt, status]);

  // Type instead: a typed turn, asked like a spoken one (the tutor stops first if it is busy).
  const typed = useCallback(
    (text: string) => {
      const s = text.trim();
      if (!s || ended.current) return;
      carry.current = Promise.resolve('');
      hearGen.current++;
      turn.current.heardAt = now();
      void ask(s);
    },
    [ask]
  );

  // Call again (after the call ended): inside the tap, as the first one.
  const again = useCallback(() => {
    primeCallMic();
    void start();
  }, [start]);

  const phase: CallPhase =
    status === 'connecting' ? 'connecting' : status === 'ended' ? 'ended' : busy === 'hearing' ? 'hearing' : busy === 'thinking' ? 'thinking' : busy === 'speaking' ? 'speaking' : muted ? 'muted' : (status === 'live' && !stopped) || (status === 'manual' && recording) ? 'listening' : 'idle';

  // The tutor's face follows the call: listening while the microphone is open, thinking while the words are heard and
  // the answer written. Speaking is set by the voice itself (lineVoice).
  useEffect(() => {
    if (phase === 'listening') setAvatarMood('listening');
    else if (phase === 'hearing' || phase === 'thinking') setAvatarMood('thinking');
    else if (phase !== 'speaking') setAvatarMood('idle');
  }, [phase]);

  // The voice indicator's level: the child's while listening, the tutor's voice while it speaks, nothing when muted.
  const levelOf = useCallback(() => {
    if (mutedRef.current && busyRef.current !== 'speaking') return 0;
    return busyRef.current === 'speaking' ? avatarState().level : Math.min(1, level.current * 8);
  }, []);

  // W18-P1: the sentence being spoken, by its place in the turn's say lines; the board draws up to the step it reaches.
  const sentence = current >= 0 ? current : undefined;
  return { status, phase, heard, lines, current, sentence, blocks, refusal, problem, voice, ack, muted, loud, recording, stopped, elapsed, levelOf, end, again, wakeUp, toggleMute, toggleLoud, talk, typed };
}
