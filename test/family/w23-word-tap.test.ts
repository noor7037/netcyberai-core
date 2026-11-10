import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanState, cleanTap } from '@/components/family/book/messages';
import { LANGS, isLangCode } from '@/components/family/words/languages';
import { wordSettingsOf } from '@/components/family/words/settings';
import { cleanAsk, sentenceAtOffset, sentenceIndexIn, wordAtOffset } from '@/components/family/words/tapTarget';
import { clearWordHelpCache, fetchWordHelp } from '@/components/family/words/wordHelp';

describe('which word a tap landed on', () => {
  const text = 'Plants make food by photosynthesis. It happens in leaves.';
  it('finds the word, without its punctuation', () => {
    expect(wordAtOffset(text, 20)?.word).toBe('photosynthesis');
    expect(wordAtOffset(text, text.indexOf('photosynthesis') + 14)?.word).toBe('photosynthesis');
    expect(wordAtOffset("It's here", 2)?.word).toBe("It's");
  });
  it('finds nothing on a space between words or on a bare mark', () => {
    expect(wordAtOffset('a  b', 2)).toBeNull();
    expect(wordAtOffset('- . -', 2)).toBeNull();
  });
  it('reads Devanagari words whole, marks included', () => {
    const hi = 'पौधे भोजन बनाते हैं।';
    expect(wordAtOffset(hi, 7)?.word).toBe('भोजन');
  });
});

describe('which sentence', () => {
  const text = 'Plants make food. It happens in leaves! Why? Because of light.';
  it('cuts the sentence around a tap', () => {
    expect(sentenceAtOffset(text, 20).text).toBe('It happens in leaves!');
    expect(sentenceAtOffset(text, 2).text).toBe('Plants make food.');
    expect(sentenceAtOffset(text, text.length - 2).text).toBe('Because of light.');
  });
  it('maps a tap to the spoken sentence the voice would start at', () => {
    const spoken = ['Plants make food.', 'It happens in leaves!', 'Why?', 'Because of light.'];
    expect(sentenceIndexIn(text, 3, spoken)).toBe(0);
    expect(sentenceIndexIn(text, 25, spoken)).toBe(1);
    expect(sentenceIndexIn(text, text.length - 3, spoken)).toBe(3);
  });
  it('says -1 for text the voice does not read', () => {
    expect(sentenceIndexIn('A heading', 3, ['Something else.'])).toBe(-1);
  });
});

describe('what is asked', () => {
  it('is one short line, or nothing', () => {
    expect(cleanAsk('  two\n words ', 'ctx')).toEqual({ text: 'two words', context: 'ctx' });
    expect(cleanAsk('123', '')).not.toBeNull();
    expect(cleanAsk(' ... ', 'x')).toBeNull();
    expect(cleanAsk('a'.repeat(500), 'b'.repeat(900))).toMatchObject({ text: 'a'.repeat(200), context: 'b'.repeat(400) });
  });
});

describe('the word-help call', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearWordHelpCache();
  });
  const stub = (res: { ok: boolean; body: unknown }) => {
    const f = vi.fn(async () => ({ ok: res.ok, json: async () => res.body }));
    vi.stubGlobal('fetch', f);
    return f;
  };
  it('sends the word, its sentence and the language; returns meaning and translation', async () => {
    const f = stub({ ok: true, body: { meaning: ' food-making ', translation: 'प्रकाश संश्लेषण', lang: 'hi' } });
    const r = await fetchWordHelp('photosynthesis', 'Plants make food by photosynthesis.', 'hi');
    expect(r).toEqual({ ok: true, help: { meaning: 'food-making', translation: 'प्रकाश संश्लेषण', lang: 'hi' } });
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('/api/family/word-help');
    expect(JSON.parse(init.body)).toEqual({ text: 'photosynthesis', context: 'Plants make food by photosynthesis.', to: 'hi' });
  });
  it('asks once for the same word and language', async () => {
    const f = stub({ ok: true, body: { meaning: 'm', translation: null, lang: 'ta' } });
    await fetchWordHelp('leaf', 'c', 'ta');
    const again = await fetchWordHelp('leaf', 'c', 'ta');
    expect(again.ok && again.help.translation).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('turns each refusal into its reason, and an odd one into failed', async () => {
    stub({ ok: false, body: { error: 'daily_limit' } });
    expect(await fetchWordHelp('a', '', 'en')).toEqual({ ok: false, error: 'daily_limit' });
    stub({ ok: false, body: { error: 'something_else' } });
    expect(await fetchWordHelp('b', '', 'en')).toEqual({ ok: false, error: 'failed' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await fetchWordHelp('c', '', 'en')).toEqual({ ok: false, error: 'failed' });
  });
});

describe('the reader bridge', () => {
  const good = { text: ' cell ', context: 'The cell is small.', lang: 'en', rect: { left: 10, top: 20, width: 30, height: 18 }, step: 2, sent: 1 };
  it('accepts a tap with its place and the step to read from', () => {
    expect(cleanTap(good)).toEqual({ text: 'cell', context: 'The cell is small.', lang: 'en', rect: good.rect, at: { step: 2, sent: 1 } });
  });
  it('a tap outside a topic has no place to read from', () => {
    expect(cleanTap({ ...good, step: null, sent: null })?.at).toBeNull();
  });
  it('refuses a tap that is not well formed', () => {
    expect(cleanTap({ ...good, text: '   ' })).toBeNull();
    expect(cleanTap({ ...good, lang: 'fr' })).toBeNull();
    expect(cleanTap({ ...good, rect: { left: 'x' } })).toBeNull();
    expect(cleanTap({ ...good, step: 1.5 })?.at).toBeNull();
  });
  it('cuts a long selection and context', () => {
    const t = cleanTap({ ...good, text: 'w '.repeat(300), context: 'c'.repeat(900) });
    expect(t?.text.length).toBeLessThanOrEqual(200);
    expect(t?.context.length).toBe(400);
  });
  it('reads the reader state defensively', () => {
    expect(cleanState({ playing: true, percent: 41.6, can: true })).toEqual({ playing: true, percent: 42, can: true });
    expect(cleanState({ playing: 'yes', percent: 500, can: 1 })).toEqual({ playing: false, percent: 0, can: false });
  });
});

describe('the child switches and the languages', () => {
  it('a missing setting is its default', () => {
    expect(wordSettingsOf({})).toEqual({ tapToRead: true, wordHelp: true, meaningLang: null, autoScroll: true });
    expect(wordSettingsOf({ tapToRead: false, meaningLang: 'ta', wordHelp: 'no' })).toEqual({ tapToRead: false, wordHelp: true, meaningLang: 'ta', autoScroll: true });
  });
  it('lists the thirteen languages', () => {
    expect(LANGS.map((l) => l.code).join(' ')).toBe('en hi bn te mr ta ur gu kn ml or pa as');
    expect(isLangCode('hi')).toBe(true);
    expect(isLangCode('fr')).toBe(false);
  });
});
