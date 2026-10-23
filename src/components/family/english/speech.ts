'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';

// The phone's own voice and microphone for the English course (docs/family-app/12 §9). The model sentence is read by
// the phone's speech engine (labelled "phone's voice" on screen), Indian English first; nothing is sent anywhere. A
// recording stays in this page's memory only: it plays back to the child and is dropped when the step closes.

const pickVoice = (lang: 'en' | 'hi'): SpeechSynthesisVoice | null => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefs = lang === 'hi' ? ['hi-IN', 'hi'] : ['en-IN', 'en-GB', 'en-US', 'en'];
  for (const p of prefs) {
    const v = voices.find((x) => x.lang === p) ?? voices.find((x) => x.lang.toLowerCase().startsWith(p.toLowerCase()));
    if (v) return v;
  }
  return null;
};

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// The Android app's own speech engine (C230-Y): Android's web view has no speechSynthesis, so in the app a line is read
// by the phone's text-to-speech engine through the shell's TextToSpeech plugin (shell 2 and later). Still on the phone,
// still nothing sent anywhere.
type NativeVoice = { speak(o: { text: string; lang: string; rate: number; pitch: number; volume: number; category: string }): Promise<void>; stop(): Promise<void> };
const NativeTts = registerPlugin<NativeVoice>('TextToSpeech');
const nativeVoice = () => typeof window !== 'undefined' && Capacitor.isPluginAvailable('TextToSpeech');

// Nothing on this phone can read aloud (the first Android shell, or a browser without voices): the page says so once
// (NoVoiceNotice) instead of a speaker button that does nothing.
export const NO_VOICE_EVENT = 'fam:no-voice';
const noVoice = () => {
  window.dispatchEvent(new Event(NO_VOICE_EVENT));
};

// Speaks a line; `rate` slows it for young learners. Returns when it ends (or at once without a speech engine).
export function speak(text: string, lang: 'en' | 'hi' = 'en', rate = 0.9, onWord?: (charIndex: number) => void): Promise<void> {
  if (!text || typeof window === 'undefined') return Promise.resolve();
  if (nativeVoice()) {
    return NativeTts.speak({ text, lang: lang === 'hi' ? 'hi-IN' : 'en-IN', rate, pitch: 1, volume: 1, category: 'ambient' }).catch(() => {
      noVoice();
    });
  }
  return new Promise((resolve) => {
    if (!canSpeak()) {
      noVoice();
      return resolve();
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = v?.lang ?? (lang === 'hi' ? 'hi-IN' : 'en-IN');
    u.rate = rate;
    // A browser with the API but no voice never starts: say so rather than wait in silence.
    let started = false;
    const silent = window.setTimeout(() => {
      if (!started && window.speechSynthesis.getVoices().length === 0) {
        noVoice();
        resolve();
      }
    }, 1500);
    u.onstart = () => {
      started = true;
    };
    if (onWord) u.onboundary = (e) => onWord(e.charIndex);
    u.onend = () => {
      window.clearTimeout(silent);
      resolve();
    };
    u.onerror = () => {
      window.clearTimeout(silent);
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (nativeVoice()) void NativeTts.stop().catch(() => undefined);
  else if (canSpeak()) window.speechSynthesis.cancel();
}

// Record and hear yourself: the microphone only while the child holds it; the clip lives in memory until the step
// closes. `supported` is false where the phone has no recorder, and the button is then not shown.
export function useRecorder() {
  const [state, setState] = useState<'idle' | 'recording' | 'ready' | 'denied'>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const supported = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const drop = useCallback(() => {
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }, []);

  useEffect(() => () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    drop();
  }, [drop]);

  const start = useCallback(async () => {
    if (!supported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      drop();
      chunks.current = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setUrl(URL.createObjectURL(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })));
        setState('ready');
      };
      rec.current = r;
      r.start();
      setState('recording');
      // Never longer than 30 seconds.
      window.setTimeout(() => r.state === 'recording' && r.stop(), 30_000);
    } catch {
      setState('denied');
    }
  }, [drop, supported]);

  const stop = useCallback(() => {
    if (rec.current?.state === 'recording') rec.current.stop();
  }, []);

  const play = useCallback(() => {
    if (url) void new Audio(url).play();
  }, [url]);

  return { supported, state, start, stop, play, hasClip: url !== null };
}
