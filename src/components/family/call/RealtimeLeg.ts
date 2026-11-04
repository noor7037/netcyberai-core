'use client';

import { audioEndMessage, audioMessage, base64ToBytes, bytesToBase64, fromPcm16, LIVE_SECONDS_PIECE, liveSocketUrl, parseLiveFrame, setupMessage, toPcm16, wholeSeconds, type LiveEvent } from '@/lib/family/realtime-frames';

// The call's realtime leg (W16-A4, built in W19-B as B2): a live two-way voice straight between the phone and the
// provider Control chose for `family.voice_call` (Gemini Live today). The server mints a short-lived, single-use token
// (POST /api/family/voice/call/token) whose locked setup carries the model, the audio answer, the child-safety rules and
// the transcriptions; the phone opens the provider's socket with it and sends only its setup (the model's name) and the
// microphone's sound. The audio never touches NetCyberAI's servers: only the token, and the call's seconds, do.
//   microphone → AudioWorklet (ScriptProcessorNode where there is none) → 16 kHz PCM16 → base64 `realtimeInput` chunks
//   server audio (24 kHz PCM16) → a gapless queue on the AudioContext; `interrupted` flushes it (the child talked over)
//   transcriptions → the captions; `turnComplete` → listening again; `goAway` or a dropped socket → ONE reconnect with a
//   fresh token, then the chain (listen, answer, speak) takes over and the child is told only that the voice changed.
// The seconds the microphone is open while the tutor is not speaking are posted to /api/family/voice/call/seconds and
// taken from the child's day like the chain's recordings; when the day's seconds run out the live voice closes.
// Nothing is kept: the token is dropped once the socket opens, and no sound is stored.

export type RealtimeGrant = { provider: string; token: string; expiresAt: number; url: string; model: string };
export type RealtimeLeg = { available: true; grant: RealtimeGrant } | { available: false; reason: 'not_switched_on' | 'not_built' | 'voice_cap' | 'failed' };

export async function openRealtimeLeg(): Promise<RealtimeLeg> {
  let res: Response;
  try {
    res = await fetch('/api/family/voice/call/token', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { available: false, reason: 'failed' };
  }
  const body = (await res.json().catch(() => null)) as Partial<RealtimeGrant> & { error?: string } | null;
  if (!res.ok) {
    if (res.status === 503 && body?.error === 'not_switched_on') return { available: false, reason: 'not_switched_on' };
    return { available: false, reason: body?.error === 'voice_cap' ? 'voice_cap' : 'failed' };
  }
  if (!body || typeof body.token !== 'string' || typeof body.url !== 'string' || typeof body.model !== 'string') return { available: false, reason: 'failed' };
  // Only the Gemini Live socket is built; another provider's token is left unused and the chain keeps the call.
  // The address is the adapter's own (the server sends it with the token); only a secure socket is opened.
  if (body.provider !== 'gemini' || !body.url.startsWith('wss://')) return { available: false, reason: 'not_built' };
  return { available: true, grant: { provider: body.provider, token: body.token, expiresAt: Number(body.expiresAt) || 0, url: body.url, model: body.model } };
}

export type LivePhase = 'connecting' | 'listening' | 'speaking' | 'paused';
export type LiveCallbacks = {
  phase: (p: LivePhase) => void;
  // A piece of the child's words / of the tutor's words, as the provider transcribes them.
  heard: (text: string) => void;
  said: (text: string) => void;
  // The tutor's turn ended (after its audio has been queued).
  turn: () => void;
  interrupted: () => void;
  // The live voice is over for this call: the chain takes over. 'voice_cap': the day's seconds are spent.
  fallback: (reason: 'failed' | 'voice_cap') => void;
  secondsLeft: (left: number) => void;
};

// The microphone tap, as a worklet module made from this text (no separate file to serve): it hands each render
// quantum's samples to the page, which converts and sends them.
const TAP = `class NcaTap extends AudioWorkletProcessor { process(inputs) { const c = inputs[0] && inputs[0][0]; if (c && c.length) this.port.postMessage(c.slice(0)); return true; } } registerProcessor('nca-tap', NcaTap);`;

const READY_MS = 8000;
const CHUNK_SECONDS = 0.1;
const POST_EVERY_S = 15;

type Ctor = typeof AudioContext;

export class LiveLeg {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private nodes: AudioNode[] = [];
  private pending: Float32Array[] = [];
  private pendingLen = 0;
  private ready = false;
  private muted = false;
  private closed = false;
  private reconnected = false;
  private playHead = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private turnDone = true;
  private tick: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private openMs = 0;
  private posting = false;

  constructor(private grant: RealtimeGrant, private cb: LiveCallbacks) {}

  // Opens the microphone, the audio context and the socket; false when any of them cannot (the chain is then used).
  async start(): Promise<boolean> {
    this.cb.phase('connecting');
    const Ctx: Ctor | undefined = typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctx || !navigator.mediaDevices?.getUserMedia || typeof WebSocket === 'undefined') return false;
    try {
      // Echo cancellation keeps the tutor's own voice from the speaker out of the microphone (so it is not barge-in).
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      this.ctx = new Ctx();
      await this.ctx.resume().catch(() => undefined);
      await this.tapMicrophone(this.ctx, this.stream);
      // A phone that keeps sound asleep until a tap (iOS): the call starts paused, and the child's tap on the button
      // (setMuted(false), inside the tap) wakes it.
      if (this.ctx.state !== 'running') this.muted = true;
    } catch {
      this.teardown();
      return false;
    }
    const ok = await this.connect(this.grant);
    if (!ok) {
      this.teardown();
      return false;
    }
    this.lastTick = Date.now();
    this.tick = setInterval(() => this.count(), 1000);
    return true;
  }

  setMuted(muted: boolean) {
    if (this.closed || this.muted === muted) return;
    this.muted = muted;
    if (!muted) void this.ctx?.resume().catch(() => undefined);
    if (muted) {
      this.pending = [];
      this.pendingLen = 0;
      if (this.ready) this.send(audioEndMessage());
      this.cb.phase('paused');
    } else this.cb.phase(this.sources.size > 0 ? 'speaking' : 'listening');
  }

  // Ends the live voice for good (End call, or leaving the screen); the seconds counted so far are posted.
  close() {
    if (this.closed) return;
    this.closed = true;
    this.count();
    void this.post(true);
    this.teardown();
  }

  private teardown() {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        ws.close(1000);
      } catch {}
    }
    this.flush();
    this.nodes.forEach((n) => n.disconnect());
    this.nodes = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private async tapMicrophone(ctx: AudioContext, stream: MediaStream) {
    const source = ctx.createMediaStreamSource(stream);
    const onSamples = (s: Float32Array) => this.capture(s);
    try {
      if (!ctx.audioWorklet) throw new Error('no worklet');
      const url = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      // Wired on to the speakers through a silent gain, so every browser keeps rendering it.
      const node = new AudioWorkletNode(ctx, 'nca-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onSamples(e.data);
      source.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
      this.nodes.push(source, node, mute);
    } catch {
      // An older web view: the deprecated processor, routed through a silent gain so it runs without playing the mic.
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.onaudioprocess = (e) => onSamples(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
      this.nodes.push(source, node, mute);
    }
  }

  private capture(samples: Float32Array) {
    if (!this.ready || this.muted || this.closed || !this.ctx) return;
    this.pending.push(samples);
    this.pendingLen += samples.length;
    const rate = this.ctx.sampleRate;
    if (this.pendingLen < rate * CHUNK_SECONDS) return;
    const all = new Float32Array(this.pendingLen);
    let at = 0;
    for (const p of this.pending) {
      all.set(p, at);
      at += p.length;
    }
    this.pending = [];
    this.pendingLen = 0;
    this.send(audioMessage(bytesToBase64(toPcm16(all, rate))));
  }

  private send(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(message);
  }

  private connect(grant: RealtimeGrant): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      let ws: WebSocket;
      try {
        ws = new WebSocket(liveSocketUrl(grant.url, grant.token));
      } catch {
        return resolve(false);
      }
      this.ws = ws;
      this.ready = false;
      const timer = setTimeout(() => {
        if (settled) return;
        ws.onclose = null;
        try {
          ws.close();
        } catch {}
        done(false);
      }, READY_MS);
      ws.onopen = () => ws.send(setupMessage(grant.model));
      ws.onmessage = async (e: MessageEvent) => {
        // The socket may hand a frame over as text or as a Blob of the same JSON text.
        const text = typeof e.data === 'string' ? e.data : e.data instanceof Blob ? await e.data.text().catch(() => '') : '';
        for (const ev of parseLiveFrame(text)) {
          if (ev.t === 'ready' && !settled) {
            this.ready = true;
            this.cb.phase(this.muted ? 'paused' : 'listening');
            done(true);
          } else this.onEvent(ev);
        }
      };
      ws.onerror = () => undefined;
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.ready = false;
        if (!settled) return done(false);
        void this.lost();
      };
    });
  }

  // The socket ended under the call (goAway, a network drop): one reconnect with a fresh token, then the chain.
  private async lost() {
    if (this.closed) return;
    if (this.reconnected) return this.giveUp('failed');
    this.reconnected = true;
    this.flush();
    this.cb.phase('connecting');
    const leg = await openRealtimeLeg();
    if (this.closed) return;
    if (!leg.available) return this.giveUp(leg.reason === 'voice_cap' ? 'voice_cap' : 'failed');
    this.grant = leg.grant;
    if (!(await this.connect(leg.grant))) return this.giveUp('failed');
  }

  private giveUp(reason: 'failed' | 'voice_cap') {
    if (this.closed) return;
    this.close();
    this.cb.fallback(reason);
  }

  private onEvent(ev: LiveEvent) {
    switch (ev.t) {
      case 'audio':
        this.play(ev.data, ev.rate);
        break;
      case 'heard':
        this.cb.heard(ev.text);
        break;
      case 'said':
        this.cb.said(ev.text);
        break;
      case 'interrupted':
        // Barge-in: the child spoke over the tutor; what was still queued is dropped at once.
        this.flush();
        this.turnDone = true;
        this.cb.interrupted();
        this.cb.phase(this.muted ? 'paused' : 'listening');
        break;
      case 'turn_complete':
        this.turnDone = true;
        this.cb.turn();
        if (this.sources.size === 0) this.cb.phase(this.muted ? 'paused' : 'listening');
        break;
      case 'go_away':
        // The provider will close soon: reconnect now rather than lose the end of a sentence.
        if (this.ws) {
          const ws = this.ws;
          ws.onclose = null;
          this.ws = null;
          try {
            ws.close(1000);
          } catch {}
          void this.lost();
        }
        break;
      case 'error':
        break;
    }
  }

  private play(b64: string, rate: number) {
    const ctx = this.ctx;
    if (!ctx || this.closed) return;
    let samples: Float32Array;
    try {
      samples = fromPcm16(base64ToBytes(b64));
    } catch {
      return;
    }
    if (!samples.length) return;
    const buffer = ctx.createBuffer(1, samples.length, rate);
    buffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    // Gapless: each piece starts where the one before it ends (a little ahead of now when the queue ran dry).
    const at = Math.max(ctx.currentTime + 0.03, this.playHead);
    src.start(at);
    this.playHead = at + buffer.duration;
    this.sources.add(src);
    this.turnDone = false;
    if (this.sources.size === 1) this.cb.phase('speaking');
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0 && !this.closed) this.cb.phase(this.muted ? 'paused' : this.turnDone ? 'listening' : 'speaking');
    };
  }

  private flush() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.playHead = 0;
  }

  // The child's seconds: the microphone open on a ready socket while the tutor is not speaking (the chain's
  // recording time), posted in pieces.
  private count() {
    const now = Date.now();
    const gap = Math.min(now - this.lastTick, 5000);
    this.lastTick = now;
    if (this.ready && !this.muted && this.sources.size === 0) this.openMs += gap;
    if (!this.closed && this.openMs >= POST_EVERY_S * 1000) void this.post(false);
  }

  private async post(last: boolean) {
    if (this.posting && !last) return;
    let seconds = wholeSeconds(this.openMs);
    if (seconds < 1) return;
    this.posting = true;
    this.openMs = 0;
    try {
      while (seconds > 0) {
        const piece = Math.min(seconds, LIVE_SECONDS_PIECE);
        const res = await fetch('/api/family/voice/call/seconds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ seconds: piece }), keepalive: last });
        const body = (await res.json().catch(() => null)) as { left?: unknown } | null;
        if (res.status >= 500) throw new Error('not counted');
        seconds -= piece;
        if (res.status === 429) {
          this.cb.secondsLeft(0);
          if (!last) this.giveUp('voice_cap');
          return;
        }
        // Refused (the call switched off, the consent withdrawn): the live voice stops.
        if (!res.ok) {
          if (!last) this.giveUp('failed');
          return;
        }
        if (typeof body?.left === 'number') {
          this.cb.secondsLeft(body.left);
          if (body.left < 1 && !last) return this.giveUp('voice_cap');
        }
      }
    } catch {
      // A count that did not arrive goes again with the next piece.
      this.openMs += seconds * 1000;
    } finally {
      this.posting = false;
    }
  }
}
