'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '@/components/family/client';
import { VoiceInput } from '@/components/family/VoiceInput';
import { Picture } from '../Picture';
import { speak } from './speech';
import { speakLine, stopLine, type LineSource, type VoiceMode } from '../voice/lineVoice';

// The live English tutor (E1, C382; src/lib/family/english/live.ts). Push-to-talk only: tap to talk, tap to stop; the
// words come back into the box, where the child reads and corrects them, then sends. The reply streams in sentence by
// sentence, each one already through the safety check, and each is read aloud as it arrives (C386): by the server voice
// when Control has set one up, else by the phone's own voice (speech.ts), and the screen says which. A reply the safety
// check stops part-way is taken off the screen and nothing of it is kept. Each state the server reports is
// said plainly: no speech service, no reply partner, no safety check, the family's turns used up, the child's speaking
// time used up (then the child may type). No marks, no score.

type Ready = 'ready' | string;
type Status = { speech: Ready; text: Ready; safety: Ready; tts?: Ready; requestsLeft: number; voice: { left: number; limit: number } };
type Turn = { position: number; childText: string; reply: string };
type Session = { sessionId: string; topic: string; turns: Turn[] };
type State = { status: Status; session: Session | null; topics: readonly string[]; maxTurns: number };
type Recap = { topic: string; turns: number; practised: string | null; newWords: string[] } | null;

const BUBBLE = 'max-w-md rounded-2xl px-4 py-3 text-base';

// `initial`: the first draw, read by the page on the server (the same view the API answers).
export function LivePractice({ w, initial }: { w: Words; initial?: { state: State } | { error: string } }) {
  const [state, setState] = useState<State | null>(initial && 'state' in initial ? initial.state : null);
  const [error, setError] = useState<string | null>(initial && 'error' in initial ? initial.error : null);
  const [topic, setTopic] = useState('my_day');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [recap, setRecap] = useState<Recap | undefined>(undefined);
  // The reply arriving, sentence by sentence (null: none), and the voice reading the replies.
  const [streaming, setStreaming] = useState<string[] | null>(null);
  const initialTts = initial && 'state' in initial ? initial.state.status.tts : undefined;
  const [voice, setVoice] = useState<VoiceMode>(initialTts === 'ready' ? 'server' : 'phone');
  const voiceRef = useRef(voice);
  // The sentences waiting to be read, one after the other; a new generation drops what the last one queued.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);

  const switchVoice = (mode: VoiceMode) => {
    voiceRef.current = mode;
    setVoice(mode);
  };
  const load = async () => {
    const r = await familyApi<State>('/api/family/english/live', 'GET');
    if (r.ok) {
      setState(r.data);
      setError(null);
      switchVoice(r.data.status.tts === 'ready' ? 'server' : 'phone');
    } else setError(r.error);
  };
  const silence = () => {
    generation.current++;
    queue.current = Promise.resolve();
    stopLine();
  };
  // One line read aloud after the ones before it; the voice it reports carries on to the next.
  const readAloud = (source: LineSource, text: string, mine = generation.current) => {
    queue.current = queue.current.then(async () => {
      if (generation.current !== mine) return;
      const spoken = await speakLine(voiceRef.current, source, { text, lang: 'en', rate: 0.9 });
      if (!spoken.cancelled && spoken.mode !== voiceRef.current) switchVoice(spoken.mode);
    });
  };
  useEffect(() => {
    if (!initial) void load();
    return () => silence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    const text = error === 'consent_needed' ? w['fam.english.live.consent'] : error === 'off' ? w['fam.english.live.off'] : error === 'not_for_class' ? w['fam.english.live.notForClass'] : w['fam.english.live.error'];
    return (
      <div data-live-refused={error} className="flex flex-col items-start gap-3 fam-card bg-white p-5 text-slate">
        <p className="text-lg font-bold text-slate">{text}</p>
        {error === 'consent_needed' && (
          <Link href="/family/parent" className="flex min-h-[44px] items-center rounded-full bg-royal px-5 font-bold text-white">
            {w['fam.english.consentButton']}
          </Link>
        )}
      </div>
    );
  }
  if (!state) return <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-slate/10 motion-reduce:animate-none" />;

  const { status, session } = state;
  // What is not set up, said before the child speaks (the acceptance test: no speech service → the screen says so).
  const missing = status.speech !== 'ready' ? 'noSpeech' : status.text !== 'ready' ? 'noText' : status.safety !== 'ready' ? 'noSafety' : null;
  if (missing) {
    return (
      <div role="status" data-live-not-set-up={missing} className="flex flex-col gap-2 fam-card bg-white p-5 text-slate">
        <p className="text-lg font-bold text-slate">
          <Picture e="🌱" /> {w[`fam.english.live.${missing}`]}
        </p>
        <p className="text-sm text-slate/80">{w['fam.english.live.noScore']}</p>
      </div>
    );
  }

  const say = (code: string) =>
    ({
      unsafe: w['fam.english.live.unsafe'],
      safety_failed: w['fam.english.live.safetyFailed'],
      safety_off: w['fam.english.live.noSafety'],
      ai_failed: w['fam.english.live.aiFailed'],
      ai_cap_reached: w['fam.english.live.capReached'],
      ai_not_switched_on: w['fam.english.live.noText'],
      not_set_up: w['fam.english.live.noSpeech'],
      session_full: w['fam.english.live.full'],
    })[code] ?? w['fam.english.live.error'];

  const start = async () => {
    setBusy(true);
    setNote(null);
    const r = await familyApi<{ session: Session }>('/api/family/english/live', 'POST', { action: 'start', topic });
    setBusy(false);
    if (!r.ok) return setNote(say(r.error));
    setRecap(undefined);
    setState({ ...state, session: r.data.session });
  };

  // The reply streams as JSON lines (the live route): each checked sentence is shown and read aloud at once; the
  // kept turn replaces them at the end; an error takes them away.
  const send = async () => {
    if (!session || !draft.trim() || busy) return;
    setBusy(true);
    setNote(null);
    silence();
    const mine = generation.current;
    let error: string | null = null;
    let turn: Turn | null = null;
    try {
      const res = await fetch('/api/family/english/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'say', sessionId: session.sessionId, text: draft }), credentials: 'same-origin' });
      if (!res.ok || !res.body) error = String((await res.json().catch(() => ({})))?.error ?? 'network');
      else {
        setStreaming([]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          for (let nl = buf.indexOf('\n'); nl >= 0; nl = buf.indexOf('\n')) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const e = JSON.parse(line) as { t: string; text?: string; voice?: string; turn?: Turn; error?: string };
            if (e.t === 'sentence' && typeof e.text === 'string') {
              const text = e.text;
              setStreaming((s) => [...(s ?? []), text]);
              readAloud({ kind: 'live_line', token: String(e.voice ?? '') }, text, mine);
            } else if (e.t === 'turn' && e.turn) turn = e.turn;
            else if (e.t === 'error') error = e.error ?? 'failed';
          }
        }
        if (!turn && !error) error = 'network';
      }
    } catch {
      error = 'network';
    }
    setBusy(false);
    setStreaming(null);
    if (error || !turn) {
      silence();
      if (error === 'no_session') return void load();
      return setNote(say(error ?? 'network'));
    }
    setDraft('');
    const kept = turn;
    setState({ ...state, session: { ...session, turns: [...session.turns, kept] } });
  };

  const finish = async () => {
    if (!session) return;
    setBusy(true);
    silence();
    const r = await familyApi<{ recap: Recap }>('/api/family/english/live', 'POST', { action: 'end', sessionId: session.sessionId });
    setBusy(false);
    if (!r.ok) return setNote(say(r.error));
    setRecap(r.data.recap);
    setState({ ...state, session: null });
  };

  // The recap: what was practised and the words that were new; never a mark.
  if (recap !== undefined) {
    return (
      <section data-live-recap className="flex flex-col gap-3 fam-card bg-white p-5 text-slate">
        <h2 className="fam-h2 text-slate">
          <Picture e="🌟" /> {w['fam.english.live.recapTitle']}
        </h2>
        {recap && <p className="text-base text-slate">{fill(w['fam.english.live.recapTurns'], { n: recap.turns, topic: w[`fam.english.live.topic.${recap.topic}`] ?? '' })}</p>}
        {recap?.practised && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate/80">{w['fam.english.live.recapPractised']}</h3>
            <p lang="en" className="text-base text-slate">{recap.practised}</p>
          </div>
        )}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate/80">{w['fam.english.live.recapWords']}</h3>
          {recap?.newWords.length ? (
            <ul className="mt-1 flex flex-wrap gap-2">
              {recap.newWords.map((word) => (
                <li key={word}>
                  <button type="button" lang="en" onClick={() => void speak(word, 'en', 0.8)} className="fam-press min-h-[44px] rounded-full bg-sunshine/30 px-4 font-bold text-slate">
                    {word}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-slate">{w['fam.english.live.recapNone']}</p>
          )}
        </div>
        <button type="button" onClick={() => setRecap(undefined)} className="fam-press flex min-h-[44px] items-center self-start rounded-full bg-royal px-5 font-bold text-white">
          {w['fam.english.live.again']}
        </button>
      </section>
    );
  }

  const capped = status.requestsLeft < 1;
  if (!session) {
    return (
      <section data-live-ready className="flex flex-col gap-3 fam-card bg-white p-5 text-slate">
        <h2 className="fam-h2 text-slate">{w['fam.english.live.pickTopic']}</h2>
        <div role="radiogroup" aria-label={w['fam.english.live.pickTopic']} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {state.topics.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={topic === k}
              onClick={() => setTopic(k)}
              className={`fam-press min-h-[44px] rounded-2xl px-3 py-2 text-base font-bold ${topic === k ? 'bg-royal text-white' : 'bg-off-white text-slate ring-1 ring-slate/15'}`}
            >
              {w[`fam.english.live.topic.${k}`]}
            </button>
          ))}
        </div>
        {capped ? (
          <p role="status" className="rounded-2xl bg-slate/5 px-3 py-2 text-base text-slate">{w['fam.english.live.capReached']}</p>
        ) : (
          <button type="button" disabled={busy} onClick={() => void start()} className="fam-press flex min-h-[44px] items-center self-start rounded-full bg-royal px-5 font-bold text-white disabled:opacity-60">
            {w['fam.english.live.start']}
          </button>
        )}
        {note && <p role="alert" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-slate">{note}</p>}
        <p className="text-sm text-slate/80">{w['fam.english.live.noScore']}</p>
      </section>
    );
  }

  const left = state.maxTurns - session.turns.length;
  // The voice input's words, in the live tutor's own: its button, its check line and its "not set up" refusal.
  const voiceWords: Words = { ...w, 'fam.voice.speak': w['fam.english.live.talk'], 'fam.voice.check': w['fam.english.live.check'], 'fam.voice.err.voice_cap': w['fam.english.live.voiceUsed'], 'ai.not_switched_on': w['fam.english.live.noSpeech'] };
  return (
    <section data-live-session className="flex flex-col gap-3">
      <p className="self-start rounded-full bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-slate shadow-sm ring-1 ring-slate/10">{w[`fam.english.live.topic.${session.topic}`]}</p>
      <ol data-live-turns aria-live="polite" className="flex flex-col gap-3">
        {session.turns.map((t) => (
          <li key={t.position} className="flex flex-col gap-2">
            <p lang="en" className={`${BUBBLE} self-end bg-royal text-white`}>
              <span className="sr-only">{w['fam.english.live.you']}: </span>
              {t.childText}
            </p>
            <div className={`${BUBBLE} self-start bg-white text-slate shadow-sm ring-1 ring-slate/10`}>
              <span className="sr-only">{w['fam.english.live.partner']}: </span>
              <span lang="en">{t.reply}</span>
              <button
                type="button"
                onClick={() => {
                  silence();
                  readAloud({ kind: 'live_turn', sessionId: session.sessionId, position: t.position }, t.reply);
                }}
                className="fam-press ml-2 inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-bold text-royal ring-1 ring-royal/30">
                <Picture e="🔊" /> {w['fam.english.live.hearAgain']}
              </button>
            </div>
          </li>
        ))}
        {streaming && streaming.length > 0 && (
          <li data-live-streaming className={`${BUBBLE} self-start bg-white text-slate shadow-sm ring-1 ring-slate/10`}>
            <span className="sr-only">{w['fam.english.live.partner']}: </span>
            <span lang="en">{streaming.join(' ')}</span>
          </li>
        )}
      </ol>
      {busy && !streaming?.length && <p role="status" className="text-base font-semibold text-royal">{w['fam.english.live.thinking']}</p>}
      <div className="flex flex-col gap-3 fam-card bg-white p-4 text-slate">
        {left > 0 ? (
          <>
            <VoiceInput w={voiceWords} endpoint="/api/family/english/live/hear" secondsLeft={status.voice.left} onText={(text) => setDraft(text)} />
            <label className="flex flex-col gap-1 text-base font-bold text-slate">
              {w['fam.english.live.yourWords']}
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} rows={2} lang="en" className="rounded-2xl bg-off-white p-3 text-base font-normal text-slate ring-1 ring-slate/20" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy || !draft.trim()} onClick={() => void send()} className="fam-press flex min-h-[44px] items-center rounded-full bg-royal px-6 font-bold text-white disabled:opacity-60">
                {w['fam.english.live.send']}
              </button>
              <span className="text-sm text-slate/80">{fill(w['fam.english.live.turnsLeft'], { n: left })}</span>
            </div>
          </>
        ) : (
          <p className="text-base text-slate">{w['fam.english.live.full']}</p>
        )}
        {note && <p role="alert" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-slate">{note}</p>}
        <p data-voice-in-use={voice} className="text-sm text-slate/80">
          {w[voice === 'server' ? 'fam.voiceOut.server' : 'fam.voiceOut.phone']}
        </p>
        <button type="button" disabled={busy} onClick={() => void finish()} className="fam-press flex min-h-[44px] items-center self-start rounded-full bg-off-white px-5 font-bold text-slate ring-1 ring-slate/20 disabled:opacity-60">
          {w['fam.english.live.finish']}
        </button>
      </div>
    </section>
  );
}
