import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_COLUMNS, readCatalogCsv, type CatalogProblem } from '@/lib/content/catalog-csv';
import { parseCsvChecked } from '@/lib/import/csv';
import { diffSyllabus, type DiffLine } from '@/lib/content/diff';
import { academicYearOf } from '@/lib/family/catalog';
import { stageSubjects } from '@/lib/family/subjects';

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
    // CBSE prints no Hindi version; Hindi titles come from NCERT's Hindi editions (F2), for chapters and topics only:
    // NCERT's Classes 9-10 books print no units.
    const hindi = r.lines.filter((l) => l.titleHi !== null);
    expect(hindi).toHaveLength(130);
    expect(r.lines.filter((l) => l.level === 'unit').every((l) => l.titleHi === null)).toBe(true);
    const count = (cls: number, subject: string) => hindi.filter((l) => l.classLevel === cls && l.subject === subject).length;
    expect([count(9, 'mathematics'), count(9, 'science'), count(10, 'mathematics'), count(10, 'science')]).toEqual([41, 54, 25, 10]);
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
      'CBSE 9 english 2026-27': [2, 23, 3],
      'CBSE 10 english 2026-27': [3, 33, 3],
      'CBSE 9 hindi 2026-27': [2, 16, 3],
      'CBSE 10 hindi 2026-27': [3, 19, 9],
    });
    // Lines come from CBSE's documents, except the lessons CBSE does not list (Class IX English and Hindi, Class X
    // Hindi): those come from the contents page of NCERT's book (C273).
    const ncert = r.lines.filter((l) => !l.sourceUrl.startsWith('https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/'));
    expect(new Set(ncert.map((l) => l.sourceUrl))).toEqual(new Set(['iebe1', 'ihga1', 'jhks1', 'jhkr1'].map((b) => `https://ncert.nic.in/textbook/pdf/${b}ps.pdf`)));
    expect(new Set(ncert.map((l) => `${l.classLevel} ${l.subject}`))).toEqual(new Set(['9 english', '9 hindi', '10 hindi']));
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
    // CBSE prints no Hindi version; Hindi titles come from NCERT's Hindi editions (F2). Units have one only where NCERT
    // prints the same unit (Chemistry, Biology); the nine formatively assessed lines have no NCERT chapter, so none.
    expect(r.lines.filter((l) => l.titleHi !== null)).toHaveLength(116);
    expect(r.lines.filter((l) => l.level === 'unit' && l.titleHi !== null).every((l) => l.subject === 'chemistry' || l.subject === 'biology')).toBe(true);
    const formative = ['cbse.c11.chemistry.u10', 'cbse.c11.chemistry.u11', 'cbse.c12.chemistry.u11', 'cbse.c12.chemistry.u12', 'cbse.c12.chemistry.u13', 'cbse.c12.chemistry.u14', 'cbse.c11.biology.u5.ch07', 'cbse.c12.biology.u5.ch04', 'cbse.c11.mathematics.u2.ch06'];
    expect(r.lines.filter((l) => l.level === 'chapter' && l.titleHi === null).map((l) => l.key).sort()).toEqual(formative.filter((k) => /\.ch\d{2}$/.test(k)).sort());
    expect(r.lines.filter((l) => formative.includes(l.key)).every((l) => l.titleHi === null)).toBe(true);
  });

  it('every Hindi title in the Classes 9-12 CBSE Mathematics and Science files is Devanagari and has its NCERT source recorded', () => {
    const files = ['cbse-2026-27-maths-science.csv', 'cbse-2026-27-classes-11-12-science-maths.csv'];
    const lines = files.flatMap((f) => readCatalogCsv(readFileSync(path.resolve(__dirname, '../../data/catalog', f), 'utf8'), '2026-10-22').lines);
    // The record of where each Hindi title is printed: one line per key, NCERT's Hindi PDF and page.
    const sources = parseCsvChecked(readFileSync(path.resolve(__dirname, '../../data/catalog/hindi-sources/cbse-2026-27-classes-9-12.csv'), 'utf8')).rows.filter((row) => row.some((c) => c !== ''));
    expect(sources[0]).toEqual(['key', 'title_hi', 'source_url', 'source_page', 'ncert_ref', 'ncert_title_en', 'checked_on']);
    const byKey = new Map(sources.slice(1).map(([key, titleHi, sourceUrl, sourcePage, ncertRef, ncertTitleEn, checkedOn]) => [key, { titleHi, sourceUrl, sourcePage, ncertRef, ncertTitleEn, checkedOn }]));
    expect(byKey.size).toBe(sources.length - 1);
    const withHindi = lines.filter((l) => l.titleHi !== null);
    expect(withHindi).toHaveLength(246);
    for (const l of withHindi) {
      expect(l.titleHi, l.key).toMatch(/[ऀ-ॿ]/);
      // Typed from the page: no damaged-text joiners, no doubled spaces, no ends with a space.
      expect(l.titleHi, l.key).not.toMatch(/[‌‍]| {2}|^ | $/);
      const src = byKey.get(l.key);
      expect(src, l.key).toBeDefined();
      expect(src!.titleHi, l.key).toBe(l.titleHi);
      expect(src!.sourceUrl, l.key).toMatch(/^https:\/\/ncert\.nic\.in\/textbook\/pdf\/[a-z]h[a-z]{2}[12](ps|\d{2})\.pdf$/);
      expect(src!.sourcePage, l.key).toMatch(/^[0-9]{1,3}$/);
      expect(src!.ncertRef, l.key).toMatch(/^(ch\. \d{1,2}|Unit (\d{1,2}|[IVX]+)|§\d{1,2}\.\d{1,2}(\.\d{1,2})?)$/);
      expect(src!.ncertTitleEn, l.key).not.toBe('');
      expect(src!.checkedOn, l.key).toBe('2026-10-22');
    }
    // No source line without its Hindi title in a file.
    expect([...byKey.keys()].sort()).toEqual(withHindi.map((l) => l.key).sort());
  });

  it('the committed NCERT Classes 1-5 file passes the same check the import runs', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/ncert-2026-27-classes-1-5.csv'), 'utf8');
    // The day its lines were read: no line may be checked after it.
    const r = readCatalogCsv(text, '2026-10-22');
    expect(r.problems).toEqual([]);
    // Classes 1-2: mathematics, english, hindi; classes 3-5 add evs (the app's subjects, src/lib/family/subjects.ts).
    const want = [1, 2, 3, 4, 5].flatMap((c) => stageSubjects(c).map((s) => `CBSE ${c} ${s} 2026-27`));
    expect(r.syllabi.map((s) => `${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`).sort()).toEqual(want.sort());
    const count = (s: { units: unknown[]; chapters: unknown[]; topics: unknown[] }) => [s.units.length, s.chapters.length, s.topics.length];
    expect(Object.fromEntries(r.syllabi.map((s) => [`${s.classLevel} ${s.subject}`, count(s)]))).toEqual({
      '1 mathematics': [0, 13, 0], '1 english': [4, 9, 0], '1 hindi': [5, 19, 0],
      '2 mathematics': [0, 11, 0], '2 english': [5, 13, 0], '2 hindi': [5, 26, 0],
      '3 mathematics': [0, 14, 48], '3 evs': [4, 12, 58], '3 english': [4, 12, 0], '3 hindi': [5, 18, 0],
      '4 mathematics': [0, 14, 79], '4 evs': [5, 10, 54], '4 english': [4, 12, 0], '4 hindi': [0, 13, 0],
      '5 mathematics': [0, 15, 92], '5 evs': [5, 10, 67], '5 english': [5, 10, 0], '5 hindi': [0, 12, 0],
    });
    // Every line names NCERT's own PDF of the book: its contents (units and chapters) or the chapter (topics).
    expect(r.lines.every((l) => l.sourceUrl.startsWith('https://ncert.nic.in/textbook/pdf/'))).toBe(true);
    expect(r.lines.filter((l) => l.level === 'topic').every((l) => !l.sourceUrl.endsWith('ps.pdf'))).toBe(true);
    // A Hindi book's title is its printed Devanagari title, in both columns.
    expect(r.lines.filter((l) => l.subject === 'hindi').every((l) => l.titleHi === l.titleEn)).toBe(true);
    // Topics have none, apart from Class 5 EVS (P1-1): all 67 of its topics have the heading of NCERT's Hindi edition.
    const topics = r.lines.filter((l) => l.level === 'topic');
    const isC5Evs = (l: { classLevel: number; subject: string }) => l.classLevel === 5 && l.subject === 'evs';
    expect(topics.filter((l) => !isC5Evs(l)).every((l) => l.titleHi === null)).toBe(true);
    expect(topics.filter(isC5Evs).filter((l) => l.titleHi !== null)).toHaveLength(67);
    expect(r.lines.filter((l) => l.titleHi !== null)).toHaveLength(283);
    // English books have no Hindi edition: no Hindi title.
    expect(r.lines.filter((l) => l.subject === 'english').every((l) => l.titleHi === null)).toBe(true);
  });

  it('every Hindi title of Class 5 EVS is Devanagari and has its page in NCERT\'s Hindi edition recorded', () => {
    const r = readCatalogCsv(readFileSync(path.resolve(__dirname, '../../data/catalog/ncert-2026-27-classes-1-5.csv'), 'utf8'), '2026-10-22');
    const evs = r.lines.filter((l) => l.classLevel === 5 && l.subject === 'evs');
    expect(evs).toHaveLength(82);
    // The record of where each Hindi title is printed in हमारा अद्भुत संसार: one line per key, its PDF and page, and how the
    // line was matched (the book's topic headings are not numbered).
    const sources = parseCsvChecked(readFileSync(path.resolve(__dirname, '../../data/catalog/hindi-sources/ncert-2026-27-classes-1-5.csv'), 'utf8')).rows.filter((row) => row.some((c) => c !== ''));
    expect(sources[0]).toEqual(['key', 'title_hi', 'source_url', 'source_page', 'ncert_ref', 'ncert_title_en', 'checked_on', 'matched_by']);
    const byKey = new Map(sources.slice(1).map(([key, titleHi, sourceUrl, sourcePage, ncertRef, ncertTitleEn, checkedOn, matchedBy]) => [key, { titleHi, sourceUrl, sourcePage, ncertRef, ncertTitleEn, checkedOn, matchedBy }]));
    expect(byKey.size).toBe(sources.length - 1);
    for (const l of evs) {
      // Every line has its Hindi title: Devanagari, typed from the page (NFC, no joiners, no doubled or edge spaces), with
      // only the punctuation NCERT prints in these headings.
      expect(l.titleHi, l.key).not.toBeNull();
      const hi = l.titleHi!;
      expect(hi, l.key).toMatch(/[ऀ-ॿ]/);
      expect(hi, l.key).toMatch(/^[ऀ-ॿ0-9 ,!?()—-]+$/);
      expect(hi, l.key).not.toMatch(/ {2}|^ | $/);
      expect(hi, l.key).toBe(hi.normalize('NFC'));
      const src = byKey.get(l.key);
      expect(src, l.key).toBeDefined();
      expect(src!.titleHi, l.key).toBe(hi);
      expect(src!.ncertTitleEn, l.key).toBe(l.titleEn);
      expect(src!.sourcePage, l.key).toMatch(/^[0-9]{1,2}$/);
      expect(src!.checkedOn, l.key).toBe('2026-10-22');
      expect(src!.matchedBy, l.key).not.toBe('');
      const [, , , unit, chapter, topic] = l.key.split('.');
      if (l.level === 'topic') {
        // The Hindi PDF of the same chapter (ehev1NN for the English eeev1NN), and the topic's place among its headings.
        expect(src!.sourceUrl, l.key).toBe(l.sourceUrl.replace('/textbook/pdf/eeev1', '/textbook/pdf/ehev1'));
        expect(src!.sourceUrl, l.key).toMatch(/^https:\/\/ncert\.nic\.in\/textbook\/pdf\/ehev1(0[1-9]|10)\.pdf$/);
        expect(src!.ncertRef, l.key).toBe(`ch. ${Number(chapter.slice(2))}, heading ${Number(topic.slice(1))}`);
      } else {
        // Units and chapters: the Hindi edition's contents page.
        expect(src!.sourceUrl, l.key).toBe('https://ncert.nic.in/textbook/pdf/ehev1ps.pdf');
        expect(src!.sourcePage, l.key).toBe('15');
        expect(src!.ncertRef, l.key).toBe(l.level === 'unit' ? `Unit ${Number(unit.slice(1))}` : `ch. ${Number(chapter.slice(2))}`);
      }
    }
    // No source line without its line in the file.
    expect([...byKey.keys()].sort()).toEqual(evs.map((l) => l.key).sort());
    // Each heading is on the same page of both editions, apart from the last one of chapter 10, which the longer Hindi
    // text moves to the next page.
    expect(evs.filter((l) => l.level === 'topic' && byKey.get(l.key)!.sourcePage !== l.sourcePage).map((l) => [l.key, l.sourcePage, byKey.get(l.key)!.sourcePage])).toEqual([['cbse.c5.evs.u5.ch10.t09', '13', '14']]);
  });

  it('the committed CBSE file for classes 11 and 12 (commerce, humanities, English, Hindi) passes the same check', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/cbse-2026-27-classes-11-12-commerce-humanities-languages.csv'), 'utf8');
    const r = readCatalogCsv(text, '2026-10-22');
    expect(r.problems).toEqual([]);
    const count = (s: { units: unknown[]; chapters: unknown[]; topics: unknown[] }) => [s.units.length, s.chapters.length, s.topics.length];
    expect(Object.fromEntries(r.syllabi.map((s) => [`${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`, count(s)]))).toEqual({
      'CBSE 11 accountancy 2026-27': [2, 3, 0],
      'CBSE 12 accountancy 2026-27': [3, 5, 0],
      'CBSE 11 business_studies 2026-27': [2, 10, 44],
      'CBSE 12 business_studies 2026-27': [2, 12, 51],
      'CBSE 11 economics 2026-27': [2, 7, 0],
      'CBSE 12 economics 2026-27': [2, 8, 0],
      'CBSE 11 history 2026-27': [5, 12, 3],
      'CBSE 12 history 2026-27': [3, 12, 0],
      'CBSE 11 geography 2026-27': [3, 27, 75],
      'CBSE 12 geography 2026-27': [3, 24, 132],
      'CBSE 11 political_science 2026-27': [2, 18, 89],
      'CBSE 12 political_science 2026-27': [2, 15, 79],
      'CBSE 11 english 2026-27': [2, 15, 0],
      'CBSE 12 english 2026-27': [2, 19, 2],
      'CBSE 11 hindi 2026-27': [3, 27, 2],
      'CBSE 12 hindi 2026-27': [3, 24, 10],
    });
    // One document per subject for both classes, in CBSE's Senior Secondary Curriculum Part 2 (English Core, Hindi Core),
    // and the contents pages of NCERT's Hindi Core books for their lessons (C273).
    expect(new Set(r.lines.map((l) => l.sourceUrl))).toEqual(
      new Set([
        ...['Accountancy', 'BusinessStudies', 'Economics', 'History', 'Geography', 'PoliticalScience', 'English_core', 'Hindi_Core'].map(
          (s) => `https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/${s}_SecP2_2026-27.pdf`
        ),
        ...['khar1', 'khvt1', 'kham1', 'lhar1', 'lhvt1'].map((b) => `https://ncert.nic.in/textbook/pdf/${b}ps.pdf`),
      ])
    );
    // CBSE names the books (the units) and lists only the lessons it removes, so only Hindi Core's lessons come from NCERT.
    expect(r.lines.filter((l) => l.sourceUrl.startsWith('https://ncert.nic.in/')).every((l) => l.subject === 'hindi' && l.level !== 'unit')).toBe(true);
    // CBSE prints Hindi Core in Devanagari, so its titles are Hindi in both columns; the other documents have no Hindi
    // version, so nothing is filled in.
    const hindi = r.lines.filter((l) => l.subject === 'hindi');
    expect(hindi.length).toBeGreaterThan(0);
    expect(hindi.every((l) => /[ऀ-ॿ]/.test(l.titleEn) && l.titleHi === l.titleEn)).toBe(true);
    expect(r.lines.filter((l) => l.subject !== 'hindi').every((l) => l.titleHi === null)).toBe(true);
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

  it('the committed CISCE file for ICSE classes 9 and 10 passes the same check', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/cisce-2026-27-icse-classes-9-10.csv'), 'utf8');
    const r = readCatalogCsv(text, '2026-10-22');
    expect(r.problems).toEqual([]);
    const count = (s: { units: unknown[]; chapters: unknown[]; topics: unknown[] }) => [s.units.length, s.chapters.length, s.topics.length];
    expect(Object.fromEntries(r.syllabi.map((s) => [`${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`, count(s)]))).toEqual({
      'CISCE 9 physics 2026-27': [0, 8, 18],
      'CISCE 10 physics 2026-27': [0, 6, 21],
      'CISCE 9 chemistry 2026-27': [0, 8, 24],
      'CISCE 10 chemistry 2026-27': [0, 9, 37],
      'CISCE 9 biology 2026-27': [0, 7, 17],
      'CISCE 10 biology 2026-27': [0, 6, 22],
      'CISCE 9 mathematics 2026-27': [0, 8, 28],
      'CISCE 10 mathematics 2026-27': [0, 7, 17],
      'CISCE 9 history 2026-27': [2, 11, 7],
      'CISCE 10 history 2026-27': [2, 6, 19],
      'CISCE 9 geography 2026-27': [1, 7, 17],
      'CISCE 10 geography 2026-27': [2, 11, 37],
      'CISCE 9 english 2026-27': [2, 2, 10],
      'CISCE 10 english 2026-27': [2, 2, 10],
      'CISCE 9 hindi 2026-27': [2, 4, 13],
      'CISCE 10 hindi 2026-27': [2, 4, 13],
    });
    // Class IX (examination year 2028) from CISCE's "ICSE 2028" documents, Class X (examination year 2027) from its
    // "ICSE 2027" documents; every line names a PDF on cisce.org.
    expect(r.lines.every((l) => l.sourceUrl.startsWith('https://cisce.org/wp-content/uploads/'))).toBe(true);
    expect(new Set(r.lines.filter((l) => l.classLevel === 9).map((l) => l.sourceUrl.split('/uploads/')[1].slice(0, 4)))).toEqual(new Set(['2026']));
    expect(r.lines.filter((l) => l.classLevel === 10 && l.subject !== 'hindi').every((l) => l.sourceUrl.includes('/uploads/2025/03/'))).toBe(true);
    // CISCE prints every document in English, the Hindi lessons too (in Roman letters): no Hindi title is filled in, and
    // nothing was transliterated or translated.
    expect(r.lines.filter((l) => l.subject === 'hindi').length).toBeGreaterThan(0);
    expect(r.lines.every((l) => l.titleHi === null && !/[ऀ-ॿ]/.test(l.titleEn))).toBe(true);
    // The app's ICSE subjects for these classes (C272) are exactly the subjects this file holds.
    for (const c of [9, 10]) {
      expect(r.syllabi.filter((s) => s.classLevel === c).map((s) => s.subject).sort()).toEqual([...stageSubjects(c, 'CISCE')].sort());
    }
  });

  it('the committed CISCE ISC file for classes 11 and 12 passes the same check', () => {
    const text = readFileSync(path.resolve(__dirname, '../../data/catalog/cisce-2026-27-isc-classes-11-12.csv'), 'utf8');
    const r = readCatalogCsv(text, '2026-10-22');
    expect(r.problems).toEqual([]);
    const count = (s: { units: unknown[]; chapters: unknown[]; topics: unknown[] }) => [s.units.length, s.chapters.length, s.topics.length];
    expect(Object.fromEntries(r.syllabi.map((s) => [`${s.board} ${s.classLevel} ${s.subject} ${s.academicYear}`, count(s)]))).toEqual({
      'CISCE 11 physics 2026-27': [10, 10, 0],
      'CISCE 12 physics 2026-27': [9, 12, 0],
      'CISCE 11 chemistry 2026-27': [9, 4, 0],
      'CISCE 12 chemistry 2026-27': [10, 0, 0],
      'CISCE 11 biology 2026-27': [5, 19, 0],
      'CISCE 12 biology 2026-27': [5, 13, 0],
      'CISCE 11 mathematics 2026-27': [5, 15, 0],
      'CISCE 12 mathematics 2026-27': [7, 9, 0],
      'CISCE 11 accountancy 2026-27': [10, 37, 31],
      'CISCE 12 accountancy 2026-27': [7, 20, 49],
      'CISCE 11 business_studies 2026-27': [5, 20, 14],
      'CISCE 12 business_studies 2026-27': [5, 25, 5],
      'CISCE 11 economics 2026-27': [3, 18, 0],
      'CISCE 12 economics 2026-27': [2, 12, 7],
      'CISCE 11 history 2026-27': [2, 12, 25],
      'CISCE 12 history 2026-27': [2, 11, 37],
      'CISCE 11 geography 2026-27': [2, 6, 26],
      'CISCE 12 geography 2026-27': [1, 6, 26],
      'CISCE 11 political_science 2026-27': [2, 12, 0],
      'CISCE 12 political_science 2026-27': [2, 10, 2],
      'CISCE 11 english 2026-27': [3, 10, 0],
      'CISCE 12 english 2026-27': [3, 10, 0],
      'CISCE 11 hindi 2026-27': [4, 12, 0],
      'CISCE 12 hindi 2026-27': [4, 13, 0],
    });
    // Class XI from the Regulations and Syllabuses for the ISC Year 2028 Examinations, Class XII from those for 2027;
    // English Literature (Class XI) and Hindi from Appendix I, the list of prescribed textbooks. All on cisce.org.
    expect(r.lines.every((l) => l.sourceUrl.startsWith('https://cisce.org/wp-content/uploads/'))).toBe(true);
    expect(new Set(r.lines.filter((l) => l.classLevel === 11).map((l) => l.sourceUrl))).toEqual(
      new Set(
        [
          '2026/02/ISC-2028-Physics',
          '2026/01/19.-Chemistry',
          '2026/01/20.-Biology',
          '2026/01/17.-Mathematics',
          '2026/01/15.-Accountancy',
          '2026/09/Business-Studies',
          '2026/01/13.-Economics-1',
          '2026/01/8.-History',
          '2026/01/10.-Geography',
          '2026/01/9.-Political-Science',
          '2026/04/40.-Appendix-I-List-of-Prescribed-Textbooks',
        ].map((f) => `https://cisce.org/wp-content/uploads/${f}.pdf`)
      )
    );
    expect(new Set(r.lines.filter((l) => l.classLevel === 12).map((l) => l.sourceUrl))).toEqual(
      new Set(
        [
          '2026/02/ISC-2027-Physics',
          '2025/04/19.-ISC-Chemistry-1',
          '2025/04/20.-ISC-Biology',
          '2025/04/17.-ISC-Mathematics',
          '2025/04/15.-ISC-Accountancy.docx',
          '2025/04/16.-ISC-Business-Studies-1',
          '2025/04/13.-ISC-Economics-1',
          '2025/04/8.-ISC-History-2',
          '2025/04/10.-ISC-Geography-1',
          '2025/04/9.-ISC-Political-Science-1',
          '2025/04/2.-ISC-English',
          '2026/04/40.-ISC-Appendix-I-List-of-Prescribed-Textbooks',
        ].map((f) => `https://cisce.org/wp-content/uploads/${f}.pdf`)
      )
    );
    // Every CISCE document is in English; CISCE prints the Hindi prescribed books in Roman letters. So no line has a
    // Hindi title, and nothing is translated or transliterated.
    expect(r.lines.some((l) => l.subject === 'hindi')).toBe(true);
    expect(r.lines.every((l) => l.titleHi === null && !/[ऀ-ॿ]/.test(l.titleEn))).toBe(true);
    // The app's ISC subjects for these classes (C264, C272) are exactly the subjects this file holds.
    for (const c of [11, 12]) {
      expect(r.syllabi.filter((s) => s.classLevel === c).map((s) => s.subject).sort()).toEqual([...stageSubjects(c, 'CISCE')].sort());
    }
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
