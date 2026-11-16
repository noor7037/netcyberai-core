import { readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { QUICK_ANSWER_LINE, resolverSystem as v16System } from '@/lib/ai/prompts/family.resolver/v16';
import {
  BOARD_AFTER_EXPLANATION,
  LANGUAGE_NAMES,
  MODEL_FILES,
  PHOTO_LINE,
  QUICK_ANSWER_PHOTO_LINE,
  SAME_LANGUAGE_LINE,
  YOUNG_PHOTO_LINES,
  isPhotoQuestion,
  languageRule,
  resolverSystem as v17System,
  resolverUser as v17User,
} from '@/lib/ai/prompts/family.resolver/v17';
import { resolverUser as v16User, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v16';
import { boardLines } from '@/lib/ai/prompts/family.resolver/v9';
import { isHinglish, questionLanguage, settingLang } from '@/lib/family/question-language';
import { LANGUAGES } from '@/lib/family/languages';
import { askLanguage } from '@/lib/family/resolver';
import { parseBlockLine } from '@/lib/family/blocks';
import { labDataset } from '@/lib/ai/lab/cases';
import { TUTOR_V17_QUESTIONS, tutorV17Ask, tutorV17LabCases } from '@/lib/ai/lab/tutor-v17';

const PHOTO = '\n\nThe student attached files. What they say:\n[File 1, photo]\n';
const ask = (classLevel: number, question: string, extra: Partial<ResolverAsk> = {}): ResolverAsk =>
  ({ board: 'CBSE', classLevel, subject: 'mathematics', openSubjects: ['mathematics'], classSubjects: ['mathematics', 'evs'], chapter: null, topic: null, question, language: 'en', style: 'en', followUp: null, misconception: null, bookSubjects: [], ...extra }) as ResolverAsk;

describe('question language (C521)', () => {
  const lang = (t: string, setting: Parameters<typeof questionLanguage>[1] = 'en', mt: Parameters<typeof questionLanguage>[2] = null) => questionLanguage(t, setting, mt);
  it('reads English, Hindi, Hinglish, Tamil, Punjabi and the other scripts', () => {
    expect(lang('Why do leaves fall in autumn?')).toEqual({ lang: 'en', detected: true });
    expect(lang('पौधे अपना भोजन कैसे बनाते हैं?')).toEqual({ lang: 'hi', detected: true });
    expect(lang('fraction kya hota hai samjhao')).toEqual({ lang: 'hinglish', detected: true });
    expect(lang('photosynthesis kaise hota hai batao')).toEqual({ lang: 'hinglish', detected: true });
    expect(lang('மழை எப்படி பெய்கிறது?')).toEqual({ lang: 'ta', detected: true });
    expect(lang('ਤਿਕੋਣ ਦੀਆਂ ਕਿੰਨੀਆਂ ਭੁਜਾਵਾਂ ਹੁੰਦੀਆਂ ਹਨ?')).toEqual({ lang: 'pa', detected: true });
    expect(lang('వర్షం ఎలా పడుతుంది?').lang).toBe('te');
    expect(lang('ಮಳೆ ಹೇಗೆ ಬರುತ್ತದೆ?').lang).toBe('kn');
    expect(lang('বৃষ্টি কীভাবে হয়?').lang).toBe('bn');
    expect(lang('বৰষুণ কেনেকৈ হয়?').lang).toBe('as');
    expect(lang('ਪਾਣੀ').lang).toBe('pa');
    expect(lang('بارش کیسے ہوتی ہے؟').lang).toBe('ur');
  });
  it('reads a shared script by the mother tongue', () => {
    expect(lang('पाऊस कसा पडतो?', 'en', 'mr').lang).toBe('mr');
    expect(lang('पाऊस कसा पडतो?', 'en', 'ta').lang).toBe('hi');
  });
  it('never reads plain English as Hinglish', () => {
    for (const t of ['Is the main idea of this poem about me?', 'What is 5 times 3?', 'So he went to the park', 'Explain photosynthesis']) expect(lang(t).lang).toBe('en');
    expect(isHinglish(['kya'])).toBe(false);
    expect(isHinglish([])).toBe(false);
  });
  it('mixed, short and number-only questions', () => {
    // Mostly Hindi with one English word: Hindi.
    expect(lang('photosynthesis क्या होता है?').lang).toBe('hi');
    // Mostly English with one Hindi word: English.
    expect(lang('What is the meaning of पानी in English?').lang).toBe('en');
    // A tie, no letters, empty: the setting, not detected.
    expect(lang('water पानी', 'hi')).toEqual({ lang: 'hi', detected: false });
    expect(lang('12 × 15 = ?', 'hinglish')).toEqual({ lang: 'hinglish', detected: false });
    expect(lang('', 'en')).toEqual({ lang: 'en', detected: false });
    expect(lang('?')).toEqual({ lang: 'en', detected: false });
    // One short word.
    expect(lang('why').lang).toBe('en');
    expect(lang('क्यों').lang).toBe('hi');
  });
  it('the setting as a reply language', () => {
    expect(settingLang({ style: 'hinglish' })).toBe('hinglish');
    expect(settingLang({ style: 'hi' })).toBe('hi');
    expect(settingLang({ style: 'en' })).toBe('en');
  });
});

describe('prompt v17 (C521): registered, opt-in, v16 unchanged', () => {
  it('is registered after v16, chosen only by name, and the only one that reads the language', () => {
    const versions = RESOLVER_PROMPTS.map((p) => p.version);
    expect(versions.indexOf('v17')).toBe(versions.indexOf('v16') + 1);
    expect(resolverPrompt('v17', true).version).toBe('v17');
    expect(resolverPrompt('v16', true).readsLanguage).toBeUndefined();
    // v18 is v17 with the redirect line and v19 is v18 with one stage, so both read the language too.
    expect(RESOLVER_PROMPTS.filter((p) => p.readsLanguage).map((p) => p.version)).toEqual(['v17', 'v18', 'v19']);
  });
  it('v16 ignores the language fields', () => {
    const a = ask(4, 'Why?');
    expect(v16System({ ...a, replyLang: 'ta', motherTongue: 'ta' })).toBe(v16System(a));
  });
  it('a typed question with no language is v16 word for word', () => {
    for (const c of [1, 3, 5, 8, 12]) expect(v17System(ask(c, 'What is a fraction?'))).toBe(v16System(ask(c, 'What is a fraction?')));
    expect(v17User).toBe(v16User);
  });
  it('keeps its language names equal to the word-help languages', () => {
    expect(LANGUAGE_NAMES).toEqual(Object.fromEntries(LANGUAGES.map((l) => [l.code, l.english])));
  });
  it('keeps its model list equal to public/models', () => {
    const files = readdirSync(join(process.cwd(), 'public/models')).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')).sort();
    expect([...MODEL_FILES].sort()).toEqual(files);
  });
  it('the board line it moves is v9\'s', () => {
    expect(boardLines()[0]).toContain(BOARD_AFTER_EXPLANATION);
  });
});

describe('prompt v17: a photo question', () => {
  const q = `Q2 please${PHOTO}1. Add 245 and 132.\n2. Find the perimeter of a rectangle 6 cm by 4 cm.`;
  it('knows a photo from a PDF and a sketch', () => {
    expect(isPhotoQuestion({ question: q })).toBe(true);
    expect(isPhotoQuestion({ question: q, sketch: true })).toBe(false);
    expect(isPhotoQuestion({ question: 'x\n\nThe student attached files. What they say:\n[File 1, PDF]\ny' })).toBe(false);
    expect(isPhotoQuestion({ question: null })).toBe(false);
  });
  it('Classes 3 to 5: names the question, one visual by meaning, before the explanation, four parts with a worked example', () => {
    const s = v17System(ask(4, q));
    expect(s).toContain(PHOTO_LINE);
    expect(s).toContain(QUICK_ANSWER_PHOTO_LINE);
    expect(s).not.toContain(QUICK_ANSWER_LINE);
    expect(s).toMatch(/SHOW IT: write exactly ONE visual block.*right after the quick answer, before the explanation/);
    for (const kind of ['the board, drawing that real shape', '"type":"chart"', '"type":"steps"', '"type":"scene"', '"type":"image"']) expect(s).toContain(kind);
    expect(s).toContain('Teach it in four parts: the ANSWER');
    expect(s).toContain('"type":"worked_example"');
    expect(s).not.toContain(BOARD_AFTER_EXPLANATION);
    expect(s).not.toContain('Draw first:');
    // The quick answer it asks for still passes the key-points rules.
    const shape = /\{"type":"key_points".*?\]\}/.exec(QUICK_ANSWER_PHOTO_LINE)![0];
    expect(parseBlockLine(shape)).not.toBeNull();
    // v16 for the same photo has none of it.
    const before = v16System(ask(4, q));
    expect(before).not.toContain('PHOTO QUESTION');
    expect(before).not.toContain('SHOW IT');
  });
  it('offers the 3D model only for an organ we have a file for', () => {
    const evs = v17System(ask(4, q, { subject: 'evs' }));
    expect(evs).toContain('"type":"model"');
    for (const m of MODEL_FILES) expect(evs).toContain(m);
    expect(v17System(ask(4, q))).not.toContain('"type":"model"');
  });
  it('the youngest keep the board first, with the question named in its first step', () => {
    const s = v17System(ask(1, q));
    expect(s).toContain(PHOTO_LINE);
    for (const l of YOUNG_PHOTO_LINES) expect(s).toContain(l);
    expect(s).not.toContain('SHOW IT');
    expect(s.indexOf(PHOTO_LINE)).toBeLessThan(s.indexOf('\nRules: '));
  });
});

describe('prompt v17: the language of the question', () => {
  it('English with the mother tongue', () => {
    const s = v17System(ask(4, 'Why?', { replyLang: 'en', motherTongue: 'ta' }));
    expect(s.split('\n')[0]).toContain('Explain in simple English, because the student asked in English. Help in Tamil too');
    expect(s.split('\n')[1]).toBe(SAME_LANGUAGE_LINE);
    expect(languageRule({ replyLang: 'en', motherTongue: 'en' })).toBe('simple English, because the student asked in English.');
  });
  it('Hindi, Tamil, Punjabi mostly in their own script, with English words taught', () => {
    for (const [code, name] of [['hi', 'Hindi'], ['ta', 'Tamil'], ['pa', 'Punjabi']] as const) {
      const first = v17System(ask(4, 'q', { replyLang: code, motherTongue: code })).split('\n')[0];
      expect(first).toContain(`Explain in simple ${name}, mostly, in ${name} script`);
      expect(first).toContain('key English school words');
    }
  });
  it('Hinglish in Roman letters', () => {
    expect(v17System(ask(4, 'q', { replyLang: 'hinglish' })).split('\n')[0]).toContain('Explain in easy Hinglish (everyday Hindi in Roman letters)');
  });
  it('an unknown language leaves the style setting', () => {
    expect(v17System(ask(4, 'q', { replyLang: 'xx' }))).toBe(v16System(ask(4, 'q')));
  });
});

describe('the resolver wiring (C521)', () => {
  const db = (settings: unknown) => ({ query: async () => ({ rows: settings ? [{ settings }] : [] }) });
  const child = (style: string) => ({ accountId: 'a', child: { childId: 'c', language: 'en', style } }) as never;
  it('takes the question\'s language and the parent\'s word-help language as the mother tongue', async () => {
    expect(await askLanguage(db({ meaningLang: 'ta' }) as never, child('en'), 'மழை எப்படி பெய்கிறது?')).toEqual({ replyLang: 'ta', motherTongue: 'ta' });
    expect(await askLanguage(db({ meaningLang: 'pa' }) as never, child('en'), 'Why is the sky blue?')).toEqual({ replyLang: 'en', motherTongue: 'pa' });
    expect(await askLanguage(db(null) as never, child('hinglish'), '12 + 5')).toEqual({ replyLang: 'hinglish', motherTongue: 'en' });
    expect(await askLanguage(db({ meaningLang: 'mr' }) as never, child('en'), 'पाऊस कसा पडतो?')).toEqual({ replyLang: 'mr', motherTongue: 'mr' });
  });
});

describe('the Lab\'s tutor v17 set (C521)', () => {
  const cases = tutorV17LabCases();
  it('has at least 12 photo questions across Classes 1 to 5 and four subjects, and the five languages', () => {
    const photos = TUTOR_V17_QUESTIONS.filter((q) => q.photo);
    expect(photos.length).toBeGreaterThanOrEqual(12);
    expect(new Set(photos.map((q) => q.classLevel))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(new Set(photos.map((q) => q.subject))).toEqual(new Set(['mathematics', 'evs', 'english', 'hindi']));
    const langs = new Set(TUTOR_V17_QUESTIONS.map((q) => tutorV17Ask(q).replyLang));
    for (const l of ['en', 'hi', 'hinglish', 'ta', 'pa']) expect(langs).toContain(l);
  });
  it('every question is a before (v16) and an after (v17) case, with the real prompts', () => {
    expect(cases).toHaveLength(TUTOR_V17_QUESTIONS.length * 2);
    for (const q of TUTOR_V17_QUESTIONS) {
      const before = cases.find((c) => c.id === `t17-${q.id}-v16`)!;
      const after = cases.find((c) => c.id === `t17-${q.id}-v17`)!;
      expect(before.system).toBe(v16System(tutorV17Ask(q)));
      expect(after.system).toBe(v17System(tutorV17Ask(q)));
      expect(after.system).not.toBe(before.system);
      if (q.photo) expect(after.system).toContain(PHOTO_LINE);
    }
  });
  it('is in the Lab\'s dataset with unique ids', () => {
    const { cases: all } = labDataset();
    expect(all.filter((c) => c.area === 'tutor_v17')).toHaveLength(cases.length);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });
});
