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
