import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_COLUMNS, readCatalogCsv, type CatalogProblem } from '@/lib/content/catalog-csv';
import { diffSyllabus, type DiffLine } from '@/lib/content/diff';
import { academicYearOf } from '@/lib/family/catalog';

// M1-4: the catalog CSV reader and checker, the diff by stable key, and the academic year. No database. The lines below
// are made up for the test (a made-up board "TESTB" and example.org sources), apart from the committed catalog file,
// which must pass the same check the import runs.

const TODAY = '2026-10-21';
const HEADER = CATALOG_COLUMNS.join(',');
const SRC = 'https://example.org/curriculum.pdf';
const row = (o: Partial<Record<(typeof CATALOG_COLUMNS)[number], string>>) =>
  CATALOG_COLUMNS.map((c) => {
    const v =
      o[c] ??
      ({ board: 'TESTB', class: '7', subject: 'science', academic_year: '2026-27', level: 'unit', key: 'testb.c7.science.u1', parent_key: '', position: '1', title_en: 'Unit one', title_hi: '', source_url: SRC, source_page: '3', checked_on: '2026-10-20', status: 'in_review' } as Record<string, string>)[c];
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const GOOD = [
  HEADER,
  row({}),
  row({ level: 'chapter', key: 'testb.c7.science.u1.ch01', parent_key: 'testb.c7.science.u1', title_en: 'Chapter one, with a comma' }),
  row({ level: 'topic', key: 'testb.c7.science.u1.ch01.t01', parent_key: 'testb.c7.science.u1.ch01', title_en: 'Topic one', title_hi: 'विषय एक', source_page: '4-5' }),
  row({ level: 'topic', key: 'testb.c7.science.u1.ch01.t02', parent_key: 'testb.c7.science.u1.ch01', position: '2', title_en: 'Topic two' }),
  row({ level: 'chapter', key: 'testb.c7.science.ch99', parent_key: '', position: '1', title_en: 'A chapter with no unit' }),
  row({ class: '8', key: 'testb.c8.science.u1', title_en: 'Class eight unit' }),
].join('\n');
const codes = (problems: CatalogProblem[]) => problems.map((p) => `${p.line}:${p.code}`);
const check = (lines: string[]) => readCatalogCsv([HEADER, ...lines].join('\n'), TODAY);

describe('the catalog CSV', () => {
  it('a good file: every line read, one syllabus per board, class, subject and year', () => {
    const r = readCatalogCsv(GOOD, TODAY);
    expect(r.problems).toEqual([]);
    expect(r.rowCount).toBe(6);
    expect(r.lines).toHaveLength(6);
    expect(r.syllabi.map((s) => [s.classLevel, s.units.length, s.chapters.length, s.topics.length])).toEqual([
      [7, 1, 2, 2],
      [8, 1, 0, 0],
    ]);
    const topic = r.lines.find((l) => l.key === 'testb.c7.science.u1.ch01.t01')!;
    expect(topic).toMatchObject({ titleHi: 'विषय एक', sourcePage: '4-5', parentKey: 'testb.c7.science.u1.ch01' });
    expect(r.lines.find((l) => l.level === 'chapter')!.titleEn).toBe('Chapter one, with a comma');
  });

  it('the shape of the file', () => {
    expect(codes(readCatalogCsv('board,class\nTESTB,7', TODAY).problems)).toEqual(['1:header']);
    expect(codes(readCatalogCsv(CATALOG_COLUMNS.slice().reverse().join(','), TODAY).problems)).toEqual(['1:header']);
    expect(codes(readCatalogCsv(HEADER, TODAY).problems)).toEqual(['1:no_rows']);
    expect(codes(readCatalogCsv(`${HEADER}\n"open`, TODAY).problems)).toEqual(['1:unclosed_quote']);
    expect(codes(readCatalogCsv(`${HEADER}\n${Array.from({ length: 5001 }, () => row({})).join('\n')}`, TODAY).problems)).toEqual(['1:too_many_rows']);
    expect(codes(readCatalogCsv('x'.repeat(2_000_001), TODAY).problems)).toEqual(['1:too_large']);
    expect(codes(check([`${row({})},extra`]).problems)).toEqual(['2:value_count']);
  });

  it('each kind of bad line, by line number, all at once', () => {
    const r = check([
      row({ board: 'cbse' }),
      row({ key: 'k2', class: '13' }),
      row({ key: 'testb.c7.science.u3', subject: 'Science' }),
      row({ key: 'testb.c7.science.u4', academic_year: '2026-28' }),
      row({ key: 'testb.c7.science.u5', level: 'section' }),
      row({ key: 'Bad Key' }),
      row({ key: 'testb.c7.science.u7', position: '0' }),
      row({ key: 'testb.c7.science.u8', title_en: '' }),
      row({ key: 'testb.c7.science.u9', title_en: 'x'.repeat(301) }),
      row({ key: 'testb.c7.science.u10', title_en: 'two\nlines' }),
      row({ key: 'testb.c7.science.u11', title_hi: 'ह'.repeat(301) }),
      row({ key: 'testb.c7.science.u12', source_url: 'http://example.org/a.pdf' }),
      row({ key: 'testb.c7.science.u13', source_page: 'iv' }),
      row({ key: 'testb.c7.science.u14', checked_on: '2026-02-30' }),
      row({ key: 'testb.c7.science.u15', checked_on: '2026-10-22' }),
      row({ key: 'testb.c7.science.u16', status: 'published' }),
      row({ key: 'testb.c7.science.u17', parent_key: 'testb.c7.science.u1' }),
      row({ level: 'topic', key: 'testb.c7.science.t18', parent_key: '' }),
    ]);
    expect(codes(r.problems)).toEqual([
      '2:board_bad',
      '3:class_bad',
      '3:key_bad',
      '4:subject_bad',
      '5:year_bad',
      '6:level_bad',
      '7:key_bad',
      '8:position_bad',
      '9:title_missing',
      '10:title_too_long',
      '11:title_lines',
      '12:title_hi_too_long',
      '13:source_url_bad',
      '14:source_page_bad',
      '15:checked_on_bad',
      '16:checked_on_future',
      '17:status_bad',
      '18:parent_not_allowed',
      '19:parent_missing',
    ]);
    expect(r.lines).toEqual([]);
    expect(r.syllabi).toEqual([]);
  });

  it('the lines against each other: keys, parents and positions', () => {
    const r = check([
      row({}),
      row({ title_en: 'Same key again' }),
      row({ level: 'chapter', key: 'testb.c7.science.u1.ch01', parent_key: 'testb.c7.science.nowhere' }),
      row({ level: 'chapter', key: 'testb.c7.science.u1.ch02', parent_key: 'testb.c7.science.u1' }),
      row({ level: 'topic', key: 'testb.c7.science.u1.t01', parent_key: 'testb.c7.science.u1' }),
      row({ level: 'chapter', key: 'testb.c7.science.u1.ch03', parent_key: 'testb.c7.science.u1', position: '1' }),
      row({ class: '8', level: 'chapter', key: 'testb.c8.science.ch01', parent_key: 'testb.c7.science.u1', position: '3' }),
    ]);
    expect(r.problems).toEqual([
      { line: 3, code: 'key_duplicate', value: 'testb.c7.science.u1', with: 2 },
      { line: 4, code: 'parent_unknown', value: 'testb.c7.science.nowhere' },
      { line: 6, code: 'parent_level', value: 'testb.c7.science.u1', with: 2 },
      { line: 7, code: 'position_duplicate', value: '1', with: 5 },
      { line: 8, code: 'parent_syllabus', value: 'testb.c7.science.u1', with: 2 },
    ]);
  });

  it('the committed catalog file passes the same check the import runs', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/cbse-2026-27-maths-science.csv'), 'utf8');
    const r = readCatalogCsv(text, TODAY);
    expect(r.problems).toEqual([]);
    expect(r.syllabi.map((s) => `${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`).sort()).toEqual([
      'CBSE 10 mathematics 2026-27',
      'CBSE 10 science 2026-27',
      'CBSE 9 mathematics 2026-27',
      'CBSE 9 science 2026-27',
    ]);
    // Every line names the board's own document, on cbseacademic.nic.in.
    expect(r.lines.every((l) => l.sourceUrl.startsWith('https://cbseacademic.nic.in/web_material/CurriculumMain27/'))).toBe(true);
    // No Hindi title was printed in a document that was read: none is filled in.
    expect(r.lines.every((l) => l.titleHi === null)).toBe(true);
  });

  it('the committed NCERT file (classes 6 to 8) passes the same check', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/ncert-2026-27-classes-6-8-maths-science.csv'), 'utf8');
    const r = readCatalogCsv(text, '2026-10-22');
    expect(r.problems).toEqual([]);
    const count = (s: { units: unknown[]; chapters: unknown[]; topics: unknown[] }) => [s.units.length, s.chapters.length, s.topics.length];
    expect(Object.fromEntries(r.syllabi.map((s) => [`${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`, count(s)]))).toEqual({
      'CBSE 6 mathematics 2026-27': [0, 10, 65],
      'CBSE 6 science 2026-27': [0, 12, 53],
      'CBSE 7 mathematics 2026-27': [2, 15, 65],
      'CBSE 7 science 2026-27': [0, 12, 50],
      'CBSE 8 mathematics 2026-27': [2, 14, 59],
      'CBSE 8 science 2026-27': [0, 13, 62],
    });
    // Every line names NCERT's own PDF: the book's contents (units, chapters) or the chapter (topics).
    expect(r.lines.every((l) => /^https:\/\/ncert\.nic\.in\/textbook\/pdf\/[a-z]{4}[12](ps|\d{2})\.pdf$/.test(l.sourceUrl))).toBe(true);
    // A book in one volume has no unit line: its chapters hang from the syllabus itself. Ganita Prakash for classes 7
    // and 8 comes in two parts, which are the units.
    const chapters = r.lines.filter((l) => l.level === 'chapter');
    expect(chapters.filter((l) => l.parentKey === null).map((l) => l.key.split('.').slice(0, 3).join('.'))).toEqual(
      expect.arrayContaining(['cbse.c6.mathematics', 'cbse.c6.science', 'cbse.c7.science', 'cbse.c8.science'])
    );
    expect(chapters.filter((l) => l.classLevel !== 6 && l.subject === 'mathematics').every((l) => /\.u[12]$/.test(l.parentKey ?? ''))).toBe(true);
    // Hindi titles come from NCERT's Hindi editions; every chapter and part has one.
    expect(r.lines.filter((l) => l.level !== 'topic').every((l) => l.titleHi !== null && /[ऀ-ॿ]/.test(l.titleHi))).toBe(true);
  });

  it('the committed CBSE file for classes 9 and 10 (Social Science, English, Hindi) passes the same check', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/cbse-2026-27-classes-9-10-languages-social-science.csv'), 'utf8');
    const r = readCatalogCsv(text, '2026-10-22');
    expect(r.problems).toEqual([]);
    const count = (s: { units: unknown[]; chapters: unknown[]; topics: unknown[] }) => [s.units.length, s.chapters.length, s.topics.length];
    expect(Object.fromEntries(r.syllabi.map((s) => [`${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`, count(s)]))).toEqual({
      'CBSE 9 social_science 2026-27': [2, 16, 74],
      'CBSE 10 social_science 2026-27': [4, 22, 10],
      'CBSE 9 english 2026-27': [1, 7, 3],
      'CBSE 10 english 2026-27': [3, 33, 3],
      'CBSE 9 hindi 2026-27': [1, 4, 3],
      'CBSE 10 hindi 2026-27': [1, 4, 1],
    });
    expect(r.lines.every((l) => l.sourceUrl.startsWith('https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/'))).toBe(true);
    // CBSE prints the Hindi documents in Devanagari, so their titles are Hindi in both columns; the other documents have
    // no Hindi version, so nothing is filled in.
    const hindi = r.lines.filter((l) => l.subject === 'hindi');
    expect(hindi.every((l) => /[ऀ-ॿ]/.test(l.titleEn) && l.titleHi === l.titleEn)).toBe(true);
    expect(r.lines.filter((l) => l.subject !== 'hindi').every((l) => l.titleHi === null)).toBe(true);
  });

  it('the committed CBSE file for classes 11 and 12 (Physics, Chemistry, Biology, Mathematics) passes the same check', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/cbse-2026-27-classes-11-12-science-maths.csv'), 'utf8');
    const r = readCatalogCsv(text, '2026-10-22');
    expect(r.problems).toEqual([]);
    const count = (s: { units: unknown[]; chapters: unknown[]; topics: unknown[] }) => [s.units.length, s.chapters.length, s.topics.length];
    expect(Object.fromEntries(r.syllabi.map((s) => [`${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`, count(s)]))).toEqual({
      'CBSE 11 physics 2026-27': [10, 14, 0],
      'CBSE 12 physics 2026-27': [9, 14, 0],
      'CBSE 11 chemistry 2026-27': [11, 0, 0],
      'CBSE 12 chemistry 2026-27': [14, 0, 0],
      'CBSE 11 biology 2026-27': [5, 20, 0],
      'CBSE 12 biology 2026-27': [5, 14, 0],
      'CBSE 11 mathematics 2026-27': [5, 15, 0],
      'CBSE 12 mathematics 2026-27': [6, 13, 0],
    });
    // One document per subject for both classes, in CBSE's Senior Secondary Curriculum Part 2; no Hindi version exists.
    expect(new Set(r.lines.map((l) => l.sourceUrl))).toEqual(
      new Set(['Physics', 'Chemistry', 'Biology', 'Maths'].map((s) => `https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/${s}_SecP2_2026-27.pdf`))
    );
    expect(r.lines.every((l) => l.titleHi === null)).toBe(true);
  });

  it('the committed NCERT file for classes 6 to 8 (Social Science, English, Hindi) passes the same check', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/ncert-2026-27-classes-6-8-social-science-languages.csv'), 'utf8');
    const r = readCatalogCsv(text, '2026-10-22');
    expect(r.problems).toEqual([]);
    const count = (s: { units: unknown[]; chapters: unknown[]; topics: unknown[] }) => [s.units.length, s.chapters.length, s.topics.length];
    expect(Object.fromEntries(r.syllabi.map((s) => [`${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`, count(s)]))).toEqual({
      'CBSE 6 social_science 2026-27': [0, 14, 52],
      'CBSE 7 social_science 2026-27': [2, 20, 130],
      'CBSE 8 social_science 2026-27': [2, 15, 113],
      'CBSE 6 english 2026-27': [5, 16, 0],
      'CBSE 7 english 2026-27': [5, 15, 0],
      'CBSE 8 english 2026-27': [5, 15, 9],
      'CBSE 6 hindi 2026-27': [0, 13, 0],
      'CBSE 7 hindi 2026-27': [0, 10, 0],
      'CBSE 8 hindi 2026-27': [0, 10, 0],
    });
    // Every line names NCERT's own PDF: the book's prelims (parts, units, chapters) or the chapter (topics).
    expect(r.lines.every((l) => /^https:\/\/ncert\.nic\.in\/textbook\/pdf\/[a-z]{4}[12](ps|\d{2})\.pdf$/.test(l.sourceUrl))).toBe(true);
    // Social Science for classes 7 and 8 comes in two parts, which are the units; class 6 is one volume, so its
    // chapters hang from the syllabus itself. Poorvi (English) prints its lessons in five units; Malhar (Hindi) has none.
    const chapters = r.lines.filter((l) => l.level === 'chapter');
    expect(chapters.filter((l) => l.subject === 'social_science' && l.classLevel !== 6).every((l) => /\.u[12]$/.test(l.parentKey ?? ''))).toBe(true);
    expect(chapters.filter((l) => (l.subject === 'social_science' && l.classLevel === 6) || l.subject === 'hindi').every((l) => l.parentKey === null)).toBe(true);
    expect(chapters.filter((l) => l.subject === 'english').every((l) => /\.u[1-5]$/.test(l.parentKey ?? ''))).toBe(true);
    // Hindi titles: Malhar prints in Devanagari, so its titles are Hindi in both columns. Social Science takes them from
    // NCERT's Hindi edition (no Hindi edition of class 8 Part 2 is published, so that part has none; one class 7 topic
    // has no matching heading in the Hindi edition). Poorvi has no Hindi edition: nothing is filled in.
    const hindi = r.lines.filter((l) => l.subject === 'hindi');
    expect(hindi.every((l) => /[ऀ-ॿ]/.test(l.titleEn) && l.titleHi === l.titleEn)).toBe(true);
    expect(r.lines.filter((l) => l.subject === 'english').every((l) => l.titleHi === null)).toBe(true);
    const ss = r.lines.filter((l) => l.subject === 'social_science');
    const part2Of8 = (l: { key: string }) => l.key.startsWith('cbse.c8.social_science.u2');
    expect(ss.filter(part2Of8).every((l) => l.titleHi === null)).toBe(true);
    expect(ss.filter((l) => !part2Of8(l) && l.titleHi === null).map((l) => l.key)).toEqual(['cbse.c7.social_science.u2.ch07.t01']);
    expect(ss.filter((l) => l.titleHi !== null).every((l) => /[ऀ-ॿ]/.test(l.titleHi ?? '') && !/[ऀ-ॿ]/.test(l.titleEn))).toBe(true);
  });
});

describe('the diff between two versions, by stable key', () => {
  const L = (key: string, level: DiffLine['level'], parentKey: string | null, position: number, titleEn: string, titleHi: string | null = null): DiffLine => ({ key, level, parentKey, position, titleEn, titleHi });
  it('added, removed, renamed and moved lines', () => {
    const older = [L('u1', 'unit', null, 1, 'Algebra'), L('u1.ch1', 'chapter', 'u1', 1, 'Polynomials'), L('u1.ch2', 'chapter', 'u1', 2, 'Sequences'), L('u1.ch3', 'chapter', 'u1', 3, 'Old one')];
    const newer = [
      L('u1', 'unit', null, 1, 'Algebra'),
      L('u1.ch1', 'chapter', 'u1', 2, 'Polynomials'),
      L('u1.ch2', 'chapter', 'u1', 1, 'Sequences and Progressions', 'अनुक्रम'),
      L('u1.ch4', 'chapter', 'u1', 3, 'New one'),
    ];
    const d = diffSyllabus(older, newer);
    expect(d.added.map((l) => l.key)).toEqual(['u1.ch4']);
    expect(d.removed.map((l) => l.key)).toEqual(['u1.ch3']);
    expect(d.renamed).toEqual([{ key: 'u1.ch2', level: 'chapter', from: { titleEn: 'Sequences', titleHi: null }, to: { titleEn: 'Sequences and Progressions', titleHi: 'अनुक्रम' } }]);
    expect(d.moved.map((m) => [m.key, m.from.position, m.to.position])).toEqual([
      ['u1.ch1', 1, 2],
      ['u1.ch2', 2, 1],
    ]);
    expect(d.unchanged).toBe(1);
  });
  it('a line under another parent is moved, matched by its key not its title', () => {
    const d = diffSyllabus([L('t1', 'topic', 'ch1', 1, 'Same')], [L('t1', 'topic', 'ch2', 1, 'Same')]);
    expect(d.moved).toEqual([{ key: 't1', level: 'topic', from: { parentKey: 'ch1', position: 1 }, to: { parentKey: 'ch2', position: 1 } }]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

describe('the academic year (India: from 1 April)', () => {
  it('turns on 1 April', () => {
    expect(academicYearOf('2026-10-21')).toBe('2026-27');
    expect(academicYearOf('2027-03-31')).toBe('2026-27');
    expect(academicYearOf('2027-04-01')).toBe('2027-28');
    expect(academicYearOf('2099-04-01')).toBe('2099-00');
  });
});
