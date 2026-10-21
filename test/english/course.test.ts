import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TRACKS,
  UNITS_PER_TRACK,
  checkAssessments,
  checkTrack,
  checkUnit,
  forChild,
  lessonStars,
  normaliseSentence,
  scoreItems,
  shuffleByKey,
  wordCount,
  type CheckItem,
} from '@/lib/family/english/course';
import { COURSE_EMOJI, isCoursePicture } from '@/lib/family/english/emoji';

// The English course (docs/family-app/12, C274): the lesson checker, scoring and the committed lesson files.

const DATA = path.resolve(__dirname, '../../data/english');
const unitFiles = (track: string) =>
  existsSync(path.join(DATA, track)) ? readdirSync(path.join(DATA, track)).filter((f) => /^unit-\d{2}\.json$/.test(f)).sort() : [];
const read = (track: string, file: string) => JSON.parse(readFileSync(path.join(DATA, track, file), 'utf8'));

describe('the committed lesson files', () => {
  for (const track of TRACKS) {
    const files = unitFiles(track);
    it(`track ${track}: every unit file passes the lesson checker`, () => {
      for (const f of files) {
        const n = Number(f.slice(5, 7));
        expect(checkUnit(read(track, f), track, n), `${track}/${f}`).toEqual([]);
      }
    });
    it(`track ${track}: a finished track has 18 units in order and its assessments, with every key unique`, () => {
      const hasAssessments = existsSync(path.join(DATA, track, 'assessments.json'));
      if (files.length < UNITS_PER_TRACK && !hasAssessments) return; // still being written
      expect(files).toEqual(Array.from({ length: UNITS_PER_TRACK }, (_, i) => `unit-${String(i + 1).padStart(2, '0')}.json`));
      expect(checkTrack(track, files.map((f) => read(track, f)), read(track, 'assessments.json'))).toEqual([]);
    });
  }
});

describe('the lesson checker', () => {
  const unit = () => read('b', 'unit-01.json');

  it('accepts the sample unit and refuses each broken rule', () => {
    expect(checkUnit(unit(), 'b', 1)).toEqual([]);

    const u1 = unit();
    u1.lessons.pop();
    expect(checkUnit(u1, 'b', 1).map((p) => p.problem)).toContain('exactly 5 lessons');

    const u2 = unit();
    u2.lessons[0].steps[1].words[0].pic = '🫓'; // flatbread: Unicode 13, not on the list
    expect(checkUnit(u2, 'b', 1).some((p) => p.problem.includes('not on the course list'))).toBe(true);

    const u3 = unit();
    u3.lessons[1].check[0].answer = 'I am Arjun and Meera.';
    expect(checkUnit(u3, 'b', 1).some((p) => p.problem === 'the answer does not use exactly the tiles')).toBe(true);

    const u4 = unit();
    u4.lessons[2].steps[0].lines[0].en = 'Hello! I am Meera and I live in a very small village.';
    expect(checkUnit(u4, 'b', 1).some((p) => p.problem.includes('track b allows 9'))).toBe(true);

    const u5 = unit();
    delete u5.lessons[0].steps[0].text.hi;
    expect(checkUnit(u5, 'b', 1).some((p) => p.problem === 'Hindi missing')).toBe(true);

    const u6 = unit();
    u6.lessons[3].check[0].key = 'b.u01.l3.c-where'; // a key of another lesson's item
    expect(checkUnit(u6, 'b', 1).some((p) => p.problem.includes('must be "b.u01.l4.'))).toBe(true);

    const u7 = unit();
    u7.lessons[0].kind = 'review';
    expect(checkUnit(u7, 'b', 1).some((p) => p.problem === 'lesson 1 is the words lesson')).toBe(true);

    const u8 = unit();
    u8.lessons[0].steps[0].text.en = 'Visit https://example.org now';
    expect(checkUnit(u8, 'b', 1).some((p) => p.problem.startsWith('markup, a link'))).toBe(true);
  });

  it('track a: no reading steps and no scored check', () => {
    const u = read('b', 'unit-01.json');
    u.track = 'a';
    u.key = 'a.u01';
    const problems = checkUnit(u, 'a', 1).map((p) => p.problem);
    expect(problems).toContain('track a has no scored check (12 §4)');
    expect(problems).toContain('track a does not read: no build step');
  });

  it('assessments need the three kinds in order', () => {
    expect(checkAssessments({ track: 'b', assessments: [] }, 'b').map((p) => p.problem)).toContain('the assessments are day0, day45, day90, in that order');
  });

  it('every listed picture is a single allowed emoji, and none needs Unicode 13 or later', () => {
    expect(COURSE_EMOJI.size).toBeGreaterThan(300);
    for (const e of ['🫓', '🪴', '🛖', '🪥', '🪙', '❌']) expect(isCoursePicture(e), e).toBe(false);
    for (const e of ['🛺', '🪔', '🥭', '🦜', 'own:roti']) expect(isCoursePicture(e), e).toBe(true);
    expect(isCoursePicture('own:pizza')).toBe(false);
  });
});

describe('scoring', () => {
  const items: CheckItem[] = [
    { key: 'b.u01.l2.x1', type: 'choose', prompt: { en: 'I ___ Arjun.' }, options: [{ text: 'am' }, { text: 'is' }], answer: 0 },
    { key: 'b.u01.l2.x2', type: 'build', tiles: ['Arjun.', 'am', 'I'], answer: 'I am Arjun.' },
  ];

  it('scores on the server; the phone never gets an answer', () => {
    expect(scoreItems(items, { 'b.u01.l2.x1': 0, 'b.u01.l2.x2': 'i am arjun' })).toEqual({
      results: [
        { key: 'b.u01.l2.x1', correct: true, answer: 'am', why: undefined },
        { key: 'b.u01.l2.x2', correct: true, answer: 'I am Arjun.', why: undefined },
      ],
      score: 100,
    });
    expect(scoreItems(items, { 'b.u01.l2.x1': 1 }).score).toBe(0);
    expect(scoreItems(items, { 'b.u01.l2.x1': '0', 'b.u01.l2.x2': 'Arjun am I' }).score).toBe(0);
    const child = items.map(forChild);
    expect(JSON.stringify(child)).not.toContain('"answer"');
    expect(child[1]).toMatchObject({ type: 'build' });
    expect((child[1] as { tiles: string[] }).tiles.join(' ')).not.toBe('I am Arjun.');
  });

  it('stars: 3 first try at 100%, 2 at 80% or more, 1 on a later try, 0 below 80%; track a always 3', () => {
    expect([lessonStars('b', 100, 1), lessonStars('b', 80, 1), lessonStars('b', 100, 2), lessonStars('b', 79, 1), lessonStars('a', 0, 1)]).toEqual([3, 2, 1, 0, 3]);
  });

  it('a stable shuffle that never shows the answer order', () => {
    const tiles = ['I', 'am', 'Arjun.'];
    expect(shuffleByKey(tiles, 'k1')).toEqual(shuffleByKey(tiles, 'k1'));
    expect(shuffleByKey(tiles, 'k1').join(' ')).not.toBe(tiles.join(' '));
    expect([...shuffleByKey(tiles, 'k2')].sort()).toEqual([...tiles].sort());
  });

  it('sentence rules', () => {
    expect(wordCount('Hello! I am Meera.')).toBe(4);
    expect(normaliseSentence('  My name is   Arjun. ')).toBe('my name is arjun');
  });
});
