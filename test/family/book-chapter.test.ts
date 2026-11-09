import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aboutLine, cleanSpeak, MAX_SENTENCES, wordAt } from '@/components/family/book/messages';

// W22-S2: the book chapter page and the chapter reader talk by messages (components/family/book/messages.ts): what the
// reader asks to be spoken is checked, the word boundary is found the way the reader draws it, and the two sides of
// the conversation (reader/reader.js and BookChapter.tsx) name the same messages.

describe('what the reader asks to be spoken', () => {
  it('accepts a well formed request and tidies the sentences', () => {
    expect(cleanSpeak({ id: 3, lang: 'hi', sentences: ['  यह   एक वाक्य है। ', 'दूसरा।'], offset: 4 })).toEqual({ id: 3, lang: 'hi', sentences: ['यह एक वाक्य है।', 'दूसरा।'], offset: 4 });
  });
  it('refuses another language, no sentences, too many, an empty one or a bad id', () => {
    expect(cleanSpeak({ id: 1, lang: 'fr', sentences: ['a'], offset: 0 })).toBeNull();
    expect(cleanSpeak({ id: 1, lang: 'en', sentences: [], offset: 0 })).toBeNull();
    expect(cleanSpeak({ id: 1, lang: 'en', sentences: Array(MAX_SENTENCES + 1).fill('a'), offset: 0 })).toBeNull();
    expect(cleanSpeak({ id: 1, lang: 'en', sentences: ['ok', '  '], offset: 0 })).toBeNull();
    expect(cleanSpeak({ id: 1.5, lang: 'en', sentences: ['a'], offset: 0 })).toBeNull();
    expect(cleanSpeak({ id: 1, lang: 'en', sentences: 'a', offset: 0 })).toBeNull();
  });
  it('keeps a long sentence whole and only caps a runaway one at 600 characters', () => {
    const long = 'word '.repeat(100).trim();
    expect(cleanSpeak({ id: 1, lang: 'en', sentences: [long], offset: 0 })?.sentences[0].length).toBe(long.length);
  });
  it('puts a bad offset back to the start', () => {
    expect(cleanSpeak({ id: 1, lang: 'en', sentences: ['a'], offset: -2 })?.offset).toBe(0);
  });
});

describe('the word being said', () => {
  it('finds the word that holds a character, and none in a gap', () => {
    expect(wordAt('Iron turns brown', 5)).toEqual({ start: 5, end: 10 });
    expect(wordAt('Iron turns brown', 7)).toEqual({ start: 5, end: 10 });
    expect(wordAt('Iron turns brown', 4)).toEqual({ start: 0, end: 4 });
    expect(wordAt('', 0)).toBeNull();
  });
});

describe('the line the tutor is given', () => {
  it('names the chapter and the topic, kept short', () => {
    expect(aboutLine('Chemical Reactions', 'Balancing')).toBe('Chemical Reactions / Balancing');
    expect(aboutLine('Chemical Reactions', '')).toBe('Chemical Reactions');
    expect(aboutLine('x'.repeat(300), 'y').length).toBe(120);
  });
});

describe('both sides name the same messages', () => {
  const reader = readFileSync('reader/reader.js', 'utf8');
  const page = readFileSync('src/components/family/book/BookChapter.tsx', 'utf8');
  const lab = readFileSync('labs/engine.js', 'utf8');
  const posted = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1]);
  it('the page handles everything the reader posts', () => {
    const types = new Set(posted(reader, /post\(\{ type: '(\w+)'/g));
    expect(types.size).toBeGreaterThan(3);
    for (const type of types) expect(page).toContain(`'${type}'`);
  });
  it('the reader handles everything the page posts', () => {
    for (const type of new Set(posted(page, /type: '(\w+)'/g))) expect(reader).toContain(`'${type}'`);
  });
  it('the lab asks the reader, and the reader answers it', () => {
    expect(lab).toContain("type: 'ask'");
    expect(reader).toContain("m.type === 'ask'");
    expect(lab).toContain("d.type === 'asked'");
    expect(reader).toContain("type: 'asked'");
  });
  it('every message is checked for its origin', () => {
    expect(reader).toContain('e.origin !== location.origin');
    expect(page).toContain('e.origin !== window.location.origin');
    expect(page).toContain('e.source !== frame.current?.contentWindow');
    expect(lab).toContain('e.origin !== location.origin');
  });
  it('the reader no longer cuts its text at 1800 characters', () => {
    expect(reader).not.toContain('slice(0, 1800)');
  });
});
