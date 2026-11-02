import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { caseSummaries, labCase, labDataset } from '@/lib/ai/lab/cases';
import { CLASS8_CHAPTERS, CLASS8_KINDS, CLASS8_SCIENCE, RULES_PASS, citedChapter, class8LabCases, gradeByRules } from '@/lib/ai/lab/class8-science';
import { runLabCall } from '@/lib/ai/lab/runner';
import type { TextAdapter } from '@/lib/ai/adapters/types';
import { parseCsv } from '@/lib/import/csv';

// W16-A5: the Class 8 Science eval set. Fifty questions across the library's thirteen chapters; every expected chapter
// is one the library lists, every key phrase is wording the chapter's own title or a topic title carries; the rules
// grader scores a good answer high and a bad one low with no second model; and the Lab lists and runs the set. No
// database and no real model here: the adapter is a stand-in that returns what the test gives it.

const CSV = parseCsv(readFileSync(path.join(process.cwd(), 'data/catalog/ncert-2026-27-classes-6-8-maths-science.csv'), 'utf8'));
const [HEAD, ...LINES] = CSV;
const col = (name: string) => HEAD.indexOf(name);
const class8 = LINES.filter((r) => r[col('board')] === 'CBSE' && r[col('class')] === '8' && r[col('subject')] === 'science');
const chapters = class8.filter((r) => r[col('level')] === 'chapter');
const titlesOf = (key: string) => class8.filter((r) => r[col('key')] === key || r[col('parent_key')] === key).map((r) => r[col('title_en')].toLowerCase());

const CASE_ID = /^[a-z][a-z0-9-]{2,40}$/;

describe('the set', () => {
  it('is fifty cases with unique well-formed ids, graded by rules, for the class 6 to 8 band', () => {
    expect(CLASS8_SCIENCE).toHaveLength(50);
    expect(new Set(CLASS8_SCIENCE.map((c) => c.id)).size).toBe(50);
    for (const c of CLASS8_SCIENCE) {
      expect(c.id, c.id).toMatch(CASE_ID);
      expect(c.graded_by).toBe('rules');
      expect(c.band).toBe('c6_8');
      expect(c.question.length).toBeGreaterThan(8);
    }
  });

  it('covers every one of the thirteen chapters and every kind of question', () => {
    expect(new Set(CLASS8_SCIENCE.map((c) => c.expectedChapterKey)).size).toBe(13);
    expect(new Set(CLASS8_SCIENCE.map((c) => c.kind))).toEqual(new Set(CLASS8_KINDS));
    for (const ch of CLASS8_CHAPTERS) expect(CLASS8_SCIENCE.filter((c) => c.expectedChapterKey === ch.key).length, ch.key).toBeGreaterThanOrEqual(3);
  });

  it("every expected chapter key and title is one the library's catalog lists", () => {
    expect(chapters).toHaveLength(13);
    expect(CLASS8_CHAPTERS.map((c) => c.key)).toEqual(chapters.map((r) => r[col('key')]));
    expect(CLASS8_CHAPTERS.map((c) => c.title)).toEqual(chapters.map((r) => r[col('title_en')]));
    const keys = new Set(chapters.map((r) => r[col('key')]));
    for (const c of CLASS8_SCIENCE) expect(keys.has(c.expectedChapterKey), c.id).toBe(true);
  });

  it("every key phrase is wording from the expected chapter's own title or a topic title, or digits of a numerical's answer", () => {
    for (const c of CLASS8_SCIENCE) {
      const titles = titlesOf(c.expectedChapterKey).join(' | ');
      for (const p of c.keyPhrases) {
        if (/\d/.test(p)) {
          expect(c.kind, `${c.id} ${p}`).toBe('numerical');
          continue;
        }
        expect(titles.includes(p.toLowerCase()), `${c.id}: "${p}" is not in ${c.expectedChapterKey}'s titles`).toBe(true);
      }
      expect(c.keyPhrases.length === 0 || c.keyPhrases.length >= 2, c.id).toBe(true);
    }
  });
});

describe('the Lab', () => {
  it('lists the set as its own area, with a grade on each case, and can fetch a case by id', () => {
    const { cases } = labDataset();
    const set = cases.filter((c) => c.area === 'class8_science');
    expect(set).toHaveLength(50);
    expect(caseSummaries().filter((c) => c.area === 'class8_science')).toHaveLength(50);
    for (const c of set) {
      expect(c.grade?.graded_by).toBe('rules');
      expect(c.system).toContain('cbse.c8.science.ch13');
      expect(c.messages).toHaveLength(1);
    }
    expect(labCase(CLASS8_SCIENCE[0].id)?.grade?.expectedChapterKey).toBe(CLASS8_SCIENCE[0].expectedChapterKey);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });
});

// A good answer to a case: the key words in it, a plain length for classes 6 to 8, and the chapter named last.
const SENTENCE = 'We can see this when we look at the things around us, and we can check it with a simple test at home.';
const goodAnswer = (key: string, phrases: string[]) =>
  `Here is the idea in simple steps. The key words are ${phrases.join(' and ')}. ${Array.from({ length: 9 }, () => SENTENCE).join(' ')}\nSource: ${key}`;
const BAD = 'Science is nice. It is good.';

describe('the rules grader', () => {
  it('scores a good answer at 90 or more and a bad one under 50, for every case', () => {
    for (const c of CLASS8_SCIENCE) {
      const good = gradeByRules(c, goodAnswer(c.expectedChapterKey, c.keyPhrases));
      expect(good.score, c.id).toBeGreaterThanOrEqual(90);
      expect(good.problems, c.id).toEqual([]);
      expect(gradeByRules(c, BAD).score, c.id).toBeLessThan(50);
    }
  });

  it('weighs the chapter, two key phrases and the depth', () => {
    const c = CLASS8_SCIENCE.find((x) => x.id === 'c8sci-ch02-cell')!;
    const full = goodAnswer(c.expectedChapterKey, c.keyPhrases);
    expect(gradeByRules(c, full).score).toBe(100);
    // Wrong chapter named last: 60 of 100.
    const wrong = gradeByRules(c, full.replace(c.expectedChapterKey, 'cbse.c8.science.ch07'));
    expect(wrong).toMatchObject({ score: 60, citation: false, problems: ['wrong_chapter'] });
    // No chapter named.
    expect(gradeByRules(c, full.replace(/\nSource:.*$/, '')).problems).toEqual(['no_citation']);
    // One phrase of two: half of the 40.
    const one = gradeByRules(c, full.replace('basic unit of life', 'building block'));
    expect(one).toMatchObject({ score: 80, phrasesFound: 1, phrasesNeeded: 2, problems: ['key_phrases'] });
    // Too short for the band.
    expect(gradeByRules(c, `${c.keyPhrases.join(' ')}. Source: ${c.expectedChapterKey}`)).toMatchObject({ score: 80, bandOk: false, problems: ['off_band'] });
  });

  it('grades a case with no key phrases on the chapter and the depth alone', () => {
    const c = CLASS8_SCIENCE.find((x) => x.keyPhrases.length === 0)!;
    expect(c.id).toBe('c8sci-ch01-explore');
    expect(gradeByRules(c, goodAnswer(c.expectedChapterKey, [])).score).toBe(100);
    expect(gradeByRules(c, BAD).score).toBe(0);
  });

  it('takes the last Source line, and falls back to the last chapter key in the text', () => {
    expect(citedChapter('Source: cbse.c8.science.ch01\nSource: CBSE.C8.Science.CH05')).toBe('cbse.c8.science.ch05');
    expect(citedChapter('See cbse.c8.science.ch03 and then cbse.c8.science.ch04.')).toBe('cbse.c8.science.ch04');
    expect(citedChapter('no chapter')).toBeNull();
  });
});

describe('a run of the set', () => {
  const adapter = (text: string): TextAdapter =>
    ({ providerId: 'fake', needsKey: false, capabilities: { stream: true }, streamText: async (_r: unknown, onDelta: (t: string) => void) => (onDelta(text), { ok: true as const, text, tokensIn: 10, tokensOut: 20 }) }) as unknown as TextAdapter;

  it('scores the answer by rules in the runner: the check passes at the pass mark and the grade is kept for the table', async () => {
    const c = class8LabCases().find((x) => x.id === 'c8sci-ch06-calc-pressure')!;
    const good = await runLabCall(adapter(goodAnswer('cbse.c8.science.ch06', ['400', 'pressure'])), 'k', 'm', c);
    expect(good).toMatchObject({ rulesScore: 100, rulesProblems: [], checkPassed: true, errorClass: null });
    const bad = await runLabCall(adapter(BAD), 'k', 'm', c);
    expect(bad.rulesScore).toBeLessThan(50);
    expect(bad.rulesScore).toBeLessThan(RULES_PASS);
    expect(bad.checkPassed).toBe(false);
    expect(bad.rulesProblems).toContain('no_citation');
  });

  it('leaves a case without a grade as it was', async () => {
    const plain = labCase('maths-percent-discount')!;
    const out = await runLabCall(adapter('The discount is 200.'), 'k', 'm', plain);
    expect(out.rulesScore).toBeNull();
  });
});
