import { describe, expect, it } from 'vitest';
import { Endpointer } from '@/lib/family/endpointer';
import { ackHash, callAck, englishTopic, findSum, hindiTopic } from '@/lib/family/call-ack';
import { audioEndMessage, audioMessage, base64ToBytes, bytesToBase64, fromPcm16, liveSocketUrl, parseLiveFrame, setupMessage, toPcm16, wholeSeconds } from '@/lib/family/realtime-frames';
import { VOICE_MAX_SECONDS } from '@/lib/family/voice';
import { VOICE_MAX_SECONDS as RECORDER_MAX } from '@/components/family/voice/useVoiceRecorder';

// W19-B: the call that talks like a person. The endpointer (when the child has finished), the tutor's instant
// acknowledgement, and the Gemini Live wire format, all pure.

const LOUD = 0.05;
const QUIET = 0.002;
const run = (ep: Endpointer, frames: number[]) => frames.map((f) => ep.push(f));
const many = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('endpointer', () => {
  it('is done after a voice and then 1.1 s of quiet, not before', () => {
    const ep = new Endpointer({ frameMs: 100 });
    const states = run(ep, [...many(5, QUIET), ...many(10, LOUD), ...many(10, QUIET)]);
    expect(states.slice(5, 15).every((s) => s === 'speaking')).toBe(true);
    expect(states.slice(15, 25).every((s) => s === 'silence')).toBe(true);
    expect(ep.push(QUIET)).toBe('done');
    expect(ep.heard).toBe(true);
  });

  it('a pause between words (under 1.1 s) does not end the question', () => {
    const ep = new Endpointer({ frameMs: 100 });
    const states = run(ep, [...many(6, LOUD), ...many(8, QUIET), ...many(6, LOUD), ...many(5, QUIET)]);
    expect(states).not.toContain('done');
  });

  it('a click or knock is not a voice; a quiet room ends after 8 s with nothing heard', () => {
    const ep = new Endpointer({ frameMs: 100 });
    const states = run(ep, [LOUD, ...many(78, QUIET)]);
    expect(states).not.toContain('done');
    expect(ep.push(QUIET)).toBe('done');
    expect(ep.heard).toBe(false);
  });

  it('stops at the cap even while the child is still talking, and stays done', () => {
    const ep = new Endpointer({ frameMs: 100, maxMs: 2000 });
    const states = run(ep, many(25, LOUD));
    expect(states.indexOf('done')).toBe(19);
    expect(states[24]).toBe('done');
  });

  it('a voice trailing off just under the speech line still counts as speaking (hysteresis)', () => {
    const ep = new Endpointer({ frameMs: 100 });
    expect(run(ep, [LOUD, LOUD, LOUD, 0.013, 0.013])).toEqual(['speaking', 'speaking', 'speaking', 'speaking', 'speaking']);
    expect(ep.push(0.005)).toBe('silence');
  });

  it('the cap is 60 s on the phone and on the server', () => {
    expect(VOICE_MAX_SECONDS).toBe(60);
    expect(RECORDER_MAX).toBe(60);
  });
});

describe('call acknowledgement', () => {
  it('says back the topic of an English question, with its politeness and question form taken off', () => {
    expect(callAck('Why is the sky blue?', 'en')).toBe("You asked why the sky is blue. Let's look at it.");
    expect(englishTopic('Please tell me, why is the sky blue?')).toEqual({ kind: 'clause', text: 'why the sky is blue' });
    expect(englishTopic('Can you tell me what are fractions')).toEqual({ kind: 'clause', text: 'what fractions are' });
    expect(englishTopic('Where is the Taj Mahal?')).toEqual({ kind: 'clause', text: 'where the Taj Mahal is' });
    expect(englishTopic('How is rain formed?')).toEqual({ kind: 'clause', text: 'how rain is formed' });
    expect(englishTopic('Explain photosynthesis please')).toEqual({ kind: 'noun', text: 'photosynthesis' });
    expect(englishTopic('How does a plant make its food?')).toEqual({ kind: 'quote', text: 'how does a plant make its food' });
  });

  it('cuts a long topic to about ten words, never ending on a little word', () => {
    const t = englishTopic('Tell me about the history of the great wall of china and the people of the old kingdoms')!;
    expect(t.text.split(' ').length).toBeLessThanOrEqual(10);
    expect(t.text).not.toMatch(/\b(the|of|and)$/);
  });

  it('reads a sum out instead', () => {
    expect(callAck('12 x 15', 'en')).toMatch(/12 times 15/);
    expect(callAck('What is 12 × 15?', 'en')).toMatch(/12 times 15/);
    expect(callAck('what is 45 plus 17', 'en')).toMatch(/45 plus 17/);
    expect(callAck('100 divided by 4', 'en')).toMatch(/100 divided by 4/);
    expect(findSum('class 7 chapter 2')).toBeNull();
    expect(callAck('12 गुणा 15 कितना होता है', 'hi')).toMatch(/12 गुणा 15/);
    expect(callAck('12 x 15', 'hi')).toMatch(/^[^a-z]*$/i);
  });

  it('Hindi: the question already reads as what was asked; politeness comes off; the line is Devanagari', () => {
    expect(hindiTopic('आसमान नीला क्यों है?')).toBe('आसमान नीला क्यों है');
    expect(hindiTopic('सर, मुझे बताइए प्रकाश संश्लेषण क्या है')).toBe('प्रकाश संश्लेषण क्या है');
    // A word that only begins like a polite word is left whole.
    expect(hindiTopic('असर क्या होता है')).toBe('असर क्या होता है');
    const line = callAck('आसमान नीला क्यों है?', 'hi');
    expect(line).toContain('आसमान नीला क्यों है');
    expect(line).not.toMatch(/[a-z]/i);
  });

  it('varies by question but is stable for the same words: at least four lines per language', () => {
    const qs = ['Why is the sky blue?', 'Why is the sea salty?', 'Why is grass green?', 'Why is the sun hot?', 'Why are leaves green?', 'Why is ice cold?', 'Why is the moon round?', 'Why are clouds white?', 'Why is the road wet?', 'Why is milk white?'];
    const en = new Set(qs.map((q) => callAck(q, 'en').replace(/why .*? (is|are) \w+/, '…')));
    expect(en.size).toBeGreaterThanOrEqual(3);
    const hiQs = ['आसमान नीला क्यों है', 'समुद्र खारा क्यों है', 'घास हरी क्यों है', 'सूरज गरम क्यों है', 'बर्फ ठंडी क्यों है', 'चाँद गोल क्यों है', 'बादल सफ़ेद क्यों हैं', 'दूध सफ़ेद क्यों है'];
    const hi = new Set(hiQs.map((q) => callAck(q, 'hi').replace(q, '…')));
    expect(hi.size).toBeGreaterThanOrEqual(3);
    for (const q of [...qs, ...hiQs]) expect(callAck(q, 'en')).toBe(callAck(q, 'en'));
    expect(ackHash('Why is the sky blue?')).toBe(ackHash('  why IS the   sky blue?'));
  });

  it('nothing to say back: a plain line, never an empty one', () => {
    expect(callAck('please', 'en')).toBe("Let's look at it.");
    expect(callAck('कृपया', 'hi')).toBe('चलिए देखते हैं।');
  });
});

describe('Gemini Live frames', () => {
  it('the phone sends a setup naming only the model, then audio chunks', () => {
    expect(JSON.parse(setupMessage('gemini-live-2.5-flash-preview'))).toEqual({ setup: { model: 'models/gemini-live-2.5-flash-preview' } });
    expect(JSON.parse(setupMessage('models/x'))).toEqual({ setup: { model: 'models/x' } });
    expect(JSON.parse(audioMessage('AAAA'))).toEqual({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: 'AAAA' } } });
    expect(JSON.parse(audioEndMessage())).toEqual({ realtimeInput: { audioStreamEnd: true } });
    expect(liveSocketUrl('wss://h/ws/x', 'auth_tokens/a b')).toBe('wss://h/ws/x?access_token=auth_tokens%2Fa%20b');
  });

  it('parses setupComplete, audio, both transcriptions, interrupted, turnComplete and goAway', () => {
    expect(parseLiveFrame('{"setupComplete":{}}')).toEqual([{ t: 'ready' }]);
    expect(
      parseLiveFrame({
        serverContent: {
          modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQID' } }, { text: 'thinking' }] },
          outputTranscription: { text: 'The sky ' },
        },
      })
    ).toEqual([
      { t: 'audio', data: 'AQID', rate: 24000 },
      { t: 'said', text: 'The sky ' },
    ]);
    expect(parseLiveFrame({ serverContent: { inputTranscription: { text: 'why is' } } })).toEqual([{ t: 'heard', text: 'why is' }]);
    expect(parseLiveFrame({ serverContent: { interrupted: true } })).toEqual([{ t: 'interrupted' }]);
    expect(parseLiveFrame({ serverContent: { turnComplete: true } })).toEqual([{ t: 'turn_complete' }]);
    expect(parseLiveFrame({ goAway: { timeLeft: '10s' } })).toEqual([{ t: 'go_away', ms: 10_000 }]);
    expect(parseLiveFrame({ goAway: {} })).toEqual([{ t: 'go_away', ms: null }]);
    expect(parseLiveFrame({ usageMetadata: { totalTokenCount: 5 } })).toEqual([]);
    expect(parseLiveFrame('not json')).toEqual([]);
    expect(parseLiveFrame(null)).toEqual([]);
  });

  it('PCM16: 48 kHz floats down to 16 kHz little-endian and back', () => {
    const samples = new Float32Array(480).fill(0.5);
    const bytes = toPcm16(samples, 48_000);
    expect(bytes.length).toBe(320);
    expect(new DataView(bytes.buffer).getInt16(0, true)).toBe(Math.round(0.5 * 0x7fff));
    const back = fromPcm16(bytes);
    expect(back.length).toBe(160);
    expect(back[0]).toBeCloseTo(0.5, 3);
    expect(toPcm16(new Float32Array([2, -2]), 16_000)).toEqual(new Uint8Array([0xff, 0x7f, 0x00, 0x80]));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('counts whole seconds, rounded up', () => {
    expect([wholeSeconds(0), wholeSeconds(1), wholeSeconds(15_000), wholeSeconds(15_001), wholeSeconds(NaN)]).toEqual([0, 1, 15, 16, 0]);
  });
});
