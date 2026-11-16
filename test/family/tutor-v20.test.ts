import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RESOLVER_PROMPTS, LATEST_RESOLVER_PROMPT, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { DEPTH_RULE_V20 } from '@/lib/ai/prompts/family.resolver/elaboration-prompt';
import { elaborationLang, ROMAN_HINDI_LINE } from '@/lib/ai/prompts/family.resolver/v20';
import { looksRomanHindi } from '@/lib/family/question-language';
import { elaborationBlock } from '@/lib/family/elaboration';
import { captionOf } from '@/lib/family/visuals/elab-fill';
import { SimCard } from '@/components/family/blocks/SimCard';
import { checkSim, SIM_FRAME_HOSTS } from '@/lib/family/sim-hosts';
import { matchSim, simRowsFromCsv } from '@/lib/family/curated-sims';
import { EMBED_ORDER } from '@/lib/family/visuals/embed-order';
import { ANSWER_FIRST_MAX, chunkEnd } from '@/lib/family/call';

const ask = (over: Record<string, unknown> = {}) => ({ board: 'CBSE', classLevel: 3, subject: 'evs', openSubjects: ['evs'], classSubjects: ['evs'], language: 'hi', name: 'Aarav', style: 'hi', question: 'Kachra prabandhan', replyLang: 'en', ...over }) as never;
const sys = (p: string, over: Record<string, unknown> = {}) => resolverPrompt(p, false).system(ask(over));

describe('prompt v20', () => {
  it('is registered and opt-in; the fallback stays v10 and v19 is unchanged', () => {
    expect(RESOLVER_PROMPTS.map((p) => p.version)).toContain('v20');
    expect(resolverPrompt('v20', false).elaborate).toBe(true);
    expect(LATEST_RESOLVER_PROMPT).toBe('v10');
    expect(sys('v19')).toContain('ONE clear sentence');
  });
  it('romanised Hindi with a Hindi profile is answered in Hindi, every text', () => {
    expect(looksRomanHindi('Kachra prabandhan')).toBe(true);
    expect(looksRomanHindi('what is waste management')).toBe(false);
    expect(elaborationLang({ replyLang: 'en', language: 'hi', question: 'Kachra prabandhan' })).toBe('hi');
    expect(elaborationLang({ replyLang: 'hinglish', language: 'hi', question: 'paudhe khana kaise banate hain' })).toBe('hi');
    expect(elaborationLang({ replyLang: 'en', language: 'en', question: 'Kachra prabandhan' })).toBe('en');
    const s = sys('v20');
    expect(s).toContain(ROMAN_HINDI_LINE);
    expect(s.split('\n')[0]).toMatch(/Hindi in Devanagari|simple Hindi/);
    expect(s).toContain('every "say"');
    // v19 left the same question in English.
    expect(sys('v19').split('\n')[0]).not.toMatch(/simple Hindi/);
  });
  it('the depth adapts: a fact takes 1 to 2 sentences a step, a why 3 to 5, and the class band stays', () => {
    const s = sys('v20', { classLevel: 8, language: 'en', question: 'why do trees die', replyLang: 'en' });
    expect(s).toContain(DEPTH_RULE_V20);
    expect(s).toMatch(/1 to 2 sentences/);
    expect(s).toMatch(/3 to 5 whole sentences/);
    expect(s).not.toContain('answered in ONE clear sentence');
    expect(sys('v20', { classLevel: 1 })).toMatch(/very young child/);
  });
  it('a why answer of five sentences a step is kept whole, and a caption is its first whole sentences', () => {
    const long = 'पौधे धूप लेते हैं। जड़ें पानी खींचती हैं। पत्तियाँ हवा से गैस लेती हैं। इन सब से भोजन बनता है। यही पौधे की ऊर्जा है। ' .repeat(2);
    const o = { term: 'प्रकाश संश्लेषण', definition: { text: long, say: 'x' }, levels: { basic: long, intermediate: long, advanced: long, say: 'x' }, real_life: { text: long, say: 'x' }, try_it: { question: 'q', right: long, hint: 'h', say: 'x' }, future: { text: long, say: 'x' }, checks: [{ question: 'q', options: ['a', 'b'], answer: 0, right: 'r', hint: 'h' }] };
    const b = elaborationBlock(o, false)!;
    expect(b.definition.text).toBe(long.replace(/\s+/g, ' ').trim());
    expect(b.levels.intermediate.length).toBeGreaterThan(160);
    const cap = captionOf(long);
    expect(cap.length).toBeLessThanOrEqual(240);
    expect(cap.endsWith('।')).toBe(true);
    expect(/[ऀ-ॿ]/.test(cap)).toBe(true);
  });
});

describe('read aloud without gaps', () => {
  it('the first part is about 200 characters of whole sentences, later parts are longer', () => {
    const sentences = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i} of the answer.`);
    const end = chunkEnd(sentences, 0, ANSWER_FIRST_MAX);
    expect(sentences.slice(0, end).join(' ').length).toBeLessThanOrEqual(ANSWER_FIRST_MAX);
    expect(end).toBeLessThan(chunkEnd(sentences, 0, 600));
  });
  it('the speaker asks for part 2 while part 1 plays, before part 1 ends', async () => {
    const g = globalThis as Record<string, unknown>;
    const audios: { onplaying: (() => void) | null; onended: (() => void) | null }[] = [];
    let plays = 0;
    class FakeAudio {
      playbackRate = 1; paused = true; currentTime = 0; duration = 1;
      onplaying: (() => void) | null = null; onended: (() => void) | null = null;
      constructor() { audios.push(this); }
      play() { plays++; this.paused = false; queueMicrotask(() => this.onplaying?.()); return Promise.resolve(); }
      pause() { this.paused = true; }
      removeAttribute() {}
    }
    g.window = globalThis; g.Audio = FakeAudio;
    g.requestAnimationFrame = (f: () => void) => setTimeout(f, 5) as unknown as number;
    g.cancelAnimationFrame = (id: number) => clearTimeout(id);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    const asked: number[] = [];
    g.fetch = vi.fn(async (_u: string, init: { body: string }) => { asked.push(JSON.parse(init.body).from); return new Response(new Blob(['x']), { headers: { 'content-type': 'audio/mpeg' } }); });
    const v = await import('@/components/family/voice/lineVoice');
    const part1 = v.speakLine('server', { kind: 'tutor_answer', messageId: 'm', from: 0, max: 200 }, { text: 'One.', lang: 'en', rate: 1, onPlaying: () => v.prefetchLine({ kind: 'tutor_answer', messageId: 'm', from: 3 }) });
    await vi.waitFor(() => expect(asked).toEqual([0, 3]));
    // Part 1 has not ended: part 2's audio is already on its way.
    audios[0].onended?.();
    await part1;
    const before = asked.length;
    const part2 = v.speakLine('server', { kind: 'tutor_answer', messageId: 'm', from: 3 }, { text: 'Two.', lang: 'en', rate: 1 });
    // v21: the same <audio> element plays part 2 (one element for the visit).
    await vi.waitFor(() => expect(plays).toBe(2));
    expect(audios.length).toBe(1);
    expect(asked.length).toBe(before);
    audios[0].onended?.();
    await part2;
  });
  it('the speaker uses the short first part and the prefetch', () => {
    const src = readFileSync('src/components/family/voice/AnswerSpeaker.tsx', 'utf8');
    expect(src).toContain('answerParts(');
    expect(src).toContain('voice.prefetchLine(');
  });
});

describe('simulations', () => {
  const rows = [
    { class: '10', subject: 'Science', chapter_name: 'Electricity', topic: "Ohm's law", source: 'phet', title: "Ohm's Law", embed_url: 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_en.html', page_url: 'https://phet.colorado.edu/en/simulations/ohms-law', licence: 'CC BY 4.0', preview: '/sims/ohms-law.jpg' },
    { class: '10', subject: 'Science', chapter_name: 'Electricity', topic: "Ohm's law", source: 'geogebra', title: 'Ohm', embed_url: 'https://www.geogebra.org/m/123', page_url: 'https://www.geogebra.org/m/123', licence: '', preview: null },
  ];
  it('matches by class, subject and topic, the first source first; no match, none', () => {
    expect(matchSim(rows, { subject: 'science', term: "Ohm's law" }, { classLevel: 10 })?.source).toBe('phet');
    expect(matchSim(rows, { subject: 'science', term: "Ohm's law" }, { classLevel: 3 })).toBeNull();
    expect(matchSim(rows, { subject: 'science', term: 'photosynthesis' }, { classLevel: 10 })).toBeNull();
    expect(EMBED_ORDER.slice(0, 4)).toEqual(['phet', 'geogebra', 'nasa_eyes', 'hhmi']);
    expect(EMBED_ORDER[EMBED_ORDER.length - 1]).toBe('wolfram');
  });
  it('a stored card must be on its source\'s own host', () => {
    expect(checkSim({ source: 'phet', title: 't', embed: 'https://evil.example/x', page: 'https://phet.colorado.edu/a' })).toBeNull();
    expect(checkSim({ source: 'phet', title: 't', embed: 'https://phet.colorado.edu/a', page: 'https://phet.colorado.edu/a', preview: 'https://x.y/z.jpg' })?.preview).toBeUndefined();
  });
  it('a card is drawn first and no frame is loaded before the tap', () => {
    const card = checkSim({ source: 'phet', title: "Ohm's Law", embed: rows[0].embed_url, page: rows[0].page_url, licence: 'CC BY 4.0', preview: '/sims/ohms-law.jpg' })!;
    const html = renderToStaticMarkup(h(SimCard, { sim: card, w: { 'fam.elab.trySim': 'Try it yourself', 'fam.elab.simOpen': 'Open', 'fam.elab.simFrom': 'From' } }));
    expect(html).toContain('data-elab-sim-open');
    expect(html).not.toContain('<iframe');
    expect(readFileSync('src/components/family/blocks/SimCard.tsx', 'utf8')).toContain('sandbox=');
  });
  it('an answer without a sim shows photos only; one with a sim loads the card on demand', () => {
    const src = readFileSync('src/components/family/blocks/ElaborationView.tsx', 'utf8');
    expect(src).toContain('{b.sim && <SimCard');
    expect(src).toContain('dynamic(() => import("./SimCard")');
  });
  it('the seed file reads whole and every address is on its source host', () => {
    const { rows: all, skipped } = simRowsFromCsv(readFileSync('scripts/seed/curated_sims.csv', 'utf8'));
    expect(skipped).toEqual([]);
    expect(all.length).toBeGreaterThan(300);
    expect(new Set(all.map((r) => r.source))).toContain('phet');
  });
  it('the CSP frame-src of the Family app lists the same hosts as the code', () => {
    const cfg = readFileSync('next.config.js', 'utf8');
    for (const host of [...SIM_FRAME_HOSTS, 'www.youtube-nocookie.com']) expect(cfg).toContain(`'${host}'`);
    expect(cfg).toContain("source: '/family/:path*'");
    expect(cfg).toMatch(/Content-Security-Policy[^\n]*frame-src/);
  });
});
