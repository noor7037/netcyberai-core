import { describe, expect, it, vi } from 'vitest';
import {
  CANCEL_GAP_MS,
  guidedSteps,
  lineKey,
  melodySchedule,
  MELODY_LENGTH,
  MUSIC_LEVEL,
  pickVoice,
  speakWith,
  type DrawLineAsk,
  type SpeechDeps,
} from '@/lib/family/draw-engage';
import * as engage from '@/lib/family/draw-engage';
import { DRAW_GUIDE_LINES, drawStepText } from '@/lib/family/draw-voice';
import { DRAW_TEMPLATES, toStudioTemplate } from '@/lib/family/draw-templates';
import { DRAW_STUDIO_KEYS } from '@/lib/family/draw-words';
import { LANGUAGES } from '@/lib/family/languages';
import { speakAsk, speakLine } from '@/lib/family/voice-out';
import { t } from '@/lib/i18n';

vi.mock('@/lib/family/children', async (orig) => ({
  ...(await orig<typeof import('@/lib/family/children')>()),
  listChildren: async () => [{ childId: 'c1', firstName: 'Mina', classLevel: 1, language: 'hi' }],
  activeChild: (kids: unknown[]) => kids[0],
}));

// C519: the Draw guide's voice. The pure parts, without a browser: which phone voice is picked, the order a line is
// spoken in (the first tap, the phone, the server, none), the server's own words, and the melody.

const ask: DrawLineAsk = { templateId: 'x', step: 0, lang: 'hi' };
function deps(over: Partial<Omit<SpeechDeps, 'voices'>> & { voices?: string[] }): SpeechDeps & { calls: string[] } {
  const { voices: names = [], ...rest } = over;
  const calls: string[] = [];
  return {
    calls,
    unlocked: () => true,
    voices: async () => names.map((lang) => ({ lang })),
    phone: async () => void calls.push('phone'),
    server: async () => (calls.push('server'), true),
    stale: () => false,
    ...rest,
  } as SpeechDeps & { calls: string[] };
}

describe('voice choice', () => {
  it('prefers the language\'s Indian tag, then any voice of the language, and has one for every language the app has', () => {
    const voices = [{ lang: 'en_GB' }, { lang: 'en-IN' }, { lang: 'hi-IN' }];
    expect(pickVoice(voices, 'hi')).toEqual({ lang: 'hi-IN' });
    expect(pickVoice(voices, 'en')).toEqual({ lang: 'en-IN' });
    expect(pickVoice([{ lang: 'en_GB' }], 'en')).toEqual({ lang: 'en_GB' });
    expect(pickVoice([{ lang: 'en-IN' }], 'hi')).toBeNull();
    for (const l of LANGUAGES) expect(pickVoice([{ lang: l.voice }], l.code)).toEqual({ lang: l.voice });
    expect(pickVoice([{ lang: 'ta-IN' }], 'pa')).toBeNull();
  });
});

describe('the order a line is spoken in', () => {
  it('says nothing before the first tap, even with a voice', async () => {
    const d = deps({ voices: ['hi-IN'], unlocked: () => false });
    expect(await speakWith(d, 'नमस्ते', 'hi', ask)).toBe('locked');
    expect(d.calls).toEqual([]);
  });
  it('speaks with the phone voice after the tap, and does not call the server', async () => {
    const d = deps({ voices: ['hi-IN'] });
    expect(await speakWith(d, 'नमस्ते', 'hi', ask)).toBe('phone');
    expect(d.calls).toEqual(['phone']);
  });
  it('falls back to the server voice when the phone has no voice for the language', async () => {
    const d = deps({ voices: ['en-IN'] });
    expect(await speakWith(d, 'नमस्ते', 'hi', ask)).toBe('server');
    expect(d.calls).toEqual(['server']);
  });
  it('says "none" when there is no phone voice and the server fails or has no line to ask for', async () => {
    const failing = deps({ voices: [], server: async () => false });
    expect(await speakWith(failing, 'x', 'hi', ask)).toBe('none');
    const noAsk = deps({ voices: [] });
    expect(await speakWith(noAsk, 'x', 'hi', null)).toBe('none');
    expect(noAsk.calls).toEqual([]);
  });
  it('drops a line a newer one has replaced', async () => {
    const d = deps({ voices: ['hi-IN'], stale: () => true });
    expect(await speakWith(d, 'x', 'hi', ask)).toBe('locked');
    expect(d.calls).toEqual([]);
  });
  it('waits a moment between cancel and speak, and keys the cache by template, step and language', () => {
    expect(CANCEL_GAP_MS).toBeGreaterThanOrEqual(80);
    expect(CANCEL_GAP_MS).toBeLessThanOrEqual(150);
    expect(lineKey({ templateId: 'a', step: 2, lang: 'hi' })).not.toBe(lineKey({ templateId: 'a', step: 2, lang: 'en' }));
    expect(lineKey({ templateId: 'a', step: 2, lang: 'hi' })).not.toBe(lineKey({ templateId: 'a', step: 3, lang: 'hi' }));
  });
  it('plays nothing and does not unlock on its own', () => {
    expect(engage.isUnlocked()).toBe(false);
    expect(engage.musicPlaying()).toBe(false);
    engage.startMusic();
    expect(engage.musicPlaying()).toBe(false);
  });
});

describe('the melody', () => {
  it('loops a soft pentatonic phrase for ever, quietly', () => {
    const a = melodySchedule(0, MELODY_LENGTH);
    const b = melodySchedule(MELODY_LENGTH, MELODY_LENGTH);
    expect(a.map((n) => n.hz)).toEqual(b.map((n) => n.hz));
    expect(new Set(a.map((n) => n.hz)).size).toBeLessThanOrEqual(6);
    expect(a.map((n) => n.beat)).toEqual([...Array(MELODY_LENGTH).keys()]);
    expect(MUSIC_LEVEL).toBeLessThan(0.06);
  });
});

describe('the server voice speaks only what the server holds', () => {
  it('builds the same words the phone shows, for every template step in both languages', () => {
    for (const lang of ['en', 'hi'] as const) {
      for (const tpl of DRAW_TEMPLATES) {
        const guide = guidedSteps(toStudioTemplate(tpl, lang, '', 'x', 1), { colourIt: DRAW_GUIDE_LINES[lang].colourIt, finish: DRAW_GUIDE_LINES[lang].finish });
        guide.forEach((g, i) => expect(drawStepText(tpl.id, i, lang)).toBe(g.text));
        expect(drawStepText(tpl.id, guide.length, lang)).toBeNull();
      }
    }
    expect(drawStepText('no-such-template', 0, 'en')).toBeNull();
    expect(drawStepText(DRAW_TEMPLATES[0].id, -1, 'en')).toBeNull();
  });
  it('keeps its two fixed lines equal to the guide\'s words', () => {
    expect(DRAW_STUDIO_KEYS).toContain('fam.draw.g.noVoice');
    for (const lang of ['en', 'hi'] as const) {
      expect(DRAW_GUIDE_LINES[lang].colourIt).toBe(t(lang, 'fam.draw.g.colourIt'));
      expect(DRAW_GUIDE_LINES[lang].finish).toBe(t(lang, 'fam.draw.g.finish'));
      expect(t(lang, 'fam.draw.g.noVoice').length).toBeGreaterThan(10);
    }
  });
  it('takes only an id, a step place and a language from the phone', () => {
    const id = DRAW_TEMPLATES[0].id;
    expect(speakAsk({ kind: 'draw', templateId: id, step: 1, lang: 'hi' })).toEqual({ kind: 'draw', templateId: id, step: 1, lang: 'hi' });
    expect(speakAsk({ kind: 'draw', templateId: id, step: 1, lang: 'ta' })).toBeNull();
    expect(speakAsk({ kind: 'draw', templateId: id, step: -1, lang: 'en' })).toBeNull();
    expect(speakAsk({ kind: 'draw', templateId: id, step: 1.5, lang: 'en' })).toBeNull();
    expect(speakAsk({ kind: 'draw', templateId: id, step: 99, lang: 'en' })).toBeNull();
    expect(speakAsk({ kind: 'draw', step: 1, lang: 'en', text: 'free words' })).toBeNull();
  });
  it('looks the words up: a known step is spoken in the asked language; free text and unknown steps are refused', async () => {
    const tpl = DRAW_TEMPLATES.find((x) => x.steps && x.steps.length > 1) ?? DRAW_TEMPLATES[0];
    const db = { query: async () => ({ rows: [] }) };
    const ok = await speakLine(db, 'acct', undefined, { kind: 'draw', templateId: tpl.id, step: 0, lang: 'hi' });
    expect(ok.ok && ok.text).toBe(drawStepText(tpl.id, 0, 'hi'));
    expect(ok.ok && ok.language).toBe('hi');
    expect(await speakLine(db, 'acct', undefined, { kind: 'draw', templateId: tpl.id, step: 40, lang: 'en' })).toMatchObject({ ok: false, status: 404 });
    expect(await speakLine(db, 'acct', undefined, { kind: 'draw', templateId: 'nope', step: 0, lang: 'en' })).toMatchObject({ ok: false, status: 404 });
  });
});
