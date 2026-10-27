import { describe, expect, it } from 'vitest';
import type { PageReading, RosterChild } from '@/lib/contracts/marking';
import { assignScripts, groupPages, matchIdentity, nameSimilarity, rollKey, type GroupPage } from '@/lib/marking/matching';
import { countedQuestions, markedParts, partTotals, structureProblems } from '@/lib/marking/rollup';
import { checkQuestion } from '@/lib/marking/setup';

// AI marking's rules (C347), with no database: from question marks to a paper's parts, internal choice, which pages
// make a script and whose script it is. Every name and number is made up.

const q = (id: string, component: string, maxMarks: number, choiceGroup: string | null = null) => ({ questionId: id, component, maxMarks, choiceGroup });
const PARTS = [
  { key: 'theory', name: 'Theory', max: 20 },
  { key: 'internal', name: 'Internal', max: 20 },
];

describe('from question marks to the paper’s parts', () => {
  const qs = [q('q1', 'theory', 4), q('q2', 'theory', 6), q('q3a', 'theory', 10, 'A'), q('q3b', 'theory', 10, 'A')];
  it('counts the best answers of a group with internal choice, and leaves the others out', () => {
    const marks = new Map<string, number | null>([['q1', 3], ['q2', 6], ['q3a', 4.5], ['q3b', 8]]);
    expect([...countedQuestions(qs, marks, { A: 1 })].sort()).toEqual(['q1', 'q2', 'q3b']);
    expect(partTotals(markedParts(PARTS, qs), qs, marks, { A: 1 })).toEqual([{ component: 'theory', score: 17, max: 20 }]);
  });
  it('a part with no question is not on the script: it is neither checked nor written', () => {
    expect(markedParts(PARTS, qs).map((p) => p.key)).toEqual(['theory']);
    expect(structureProblems(PARTS, qs, { A: 1 })).toEqual([]);
  });
  it('the questions must make up each marked part exactly, and a group needs a count within its questions', () => {
    expect(structureProblems(PARTS, qs, {})).toEqual([{ kind: 'group_count', group: 'A' }, { kind: 'part_total', component: 'theory', counted: 30, max: 20 }]);
    expect(structureProblems(PARTS, qs.slice(0, 2), {})).toEqual([{ kind: 'part_total', component: 'theory', counted: 10, max: 20 }]);
    expect(structureProblems(PARTS, [], {})).toEqual([{ kind: 'no_questions' }]);
    expect(structureProblems(PARTS, [q('a', 'theory', 10, 'B'), q('b', 'internal', 10, 'B'), q('c', 'theory', 10)], { B: 1 })).toContainEqual({ kind: 'group_parts', group: 'B' });
  });
  it('a total is to one decimal place and never above the part’s maximum', () => {
    const marks = new Map<string, number | null>([['q1', 4], ['q2', 6], ['q3a', 10], ['q3b', 10]]);
    expect(partTotals(PARTS.slice(0, 1), qs, marks, { A: 2 })).toEqual([{ component: 'theory', score: 20, max: 20 }]);
    expect(partTotals(PARTS.slice(0, 1), [q('x', 'theory', 1), q('y', 'theory', 1)], new Map([['x', 0.1], ['y', 0.2]]), {})[0].score).toBe(0.3);
  });
});

describe('a question as the teacher writes it', () => {
  const units = new Set(['11111111-1111-4111-8111-111111111111']);
  const ok = { label: '2(a)', component: 'theory', maxMarks: 3, kind: 'short', prompt: 'Add 1/2 and 1/4.', answerKey: '3/4', steps: [{ step: 'Common denominator', marks: 1 }, { step: 'Sum', marks: 2 }] };
  it('takes a question with its steps', () => {
    expect(checkQuestion(ok, ['theory'], units)).toMatchObject({ ok: true, q: { label: '2(a)', maxMarks: 3, choiceGroup: null, unitId: null } });
  });
  it('refuses steps worth more than the question, a part the paper does not have, a topic of another class and a mark below a tenth', () => {
    expect(checkQuestion({ ...ok, steps: [{ step: 'All of it', marks: 4 }] }, ['theory'], units)).toEqual({ ok: false, field: 'steps' });
    expect(checkQuestion({ ...ok, component: 'practical' }, ['theory'], units)).toEqual({ ok: false, field: 'component' });
    expect(checkQuestion({ ...ok, unitId: '22222222-2222-4222-8222-222222222222' }, ['theory'], units)).toEqual({ ok: false, field: 'unitId' });
    expect(checkQuestion({ ...ok, maxMarks: 2.25 }, ['theory'], units)).toEqual({ ok: false, field: 'maxMarks' });
    expect(checkQuestion({ ...ok, label: '' }, ['theory'], units)).toEqual({ ok: false, field: 'label' });
    expect(checkQuestion({ ...ok, choiceGroup: 'a' }, ['theory'], units)).toMatchObject({ ok: true, q: { choiceGroup: 'A' } });
  });
});

describe('whose script it is', () => {
  const roster: RosterChild[] = [
    { studentId: 's1', name: 'Meera Sharma', rollNo: '1', seatNo: 'HY0001' },
    { studentId: 's2', name: 'Zoya Khan', rollNo: '2', seatNo: 'HY0002' },
    { studentId: 's3', name: 'Dev Patel', rollNo: '3', seatNo: 'HY0003' },
    { studentId: 's4', name: 'Devika Patil', rollNo: '14', seatNo: null },
  ];
  it('reads names written by hand as the same child', () => {
    expect(nameSimilarity('MEERA SHARMA', 'Meera Sharma')).toBe(1);
    expect(nameSimilarity('Meera S.', 'Meera Sharma')).toBeGreaterThan(0.85);
    expect(nameSimilarity('Zoya Khan', 'Dev Patel')).toBeLessThan(0.3);
    expect(rollKey('Roll No. 07')).toBe('7');
  });
  it('matches by exam number, then roll number, then name', () => {
    expect(matchIdentity({ name: null, rollNo: null, seatNo: 'hy-0002' }, roster)).toMatchObject({ studentId: 's2', by: 'seat' });
    expect(matchIdentity({ name: 'Dev Patel', rollNo: '03', seatNo: null }, roster)).toMatchObject({ studentId: 's3', by: 'roll' });
    expect(matchIdentity({ name: 'Zoya Khan', rollNo: null, seatNo: null }, roster)).toMatchObject({ studentId: 's2', by: 'name' });
  });
  it('a number with no name read is matched, but marked for the teacher to check (review of #317)', () => {
    expect(matchIdentity({ name: null, rollNo: '3', seatNo: null }, roster)).toEqual({ studentId: 's3', by: 'roll', candidates: [], flags: ['check_child'] });
    expect(matchIdentity({ name: 'Dev Patel', rollNo: '3', seatNo: null }, roster).flags).toEqual([]);
  });
  it('does not trust a number whose name plainly disagrees, nor a name close to two children', () => {
    expect(matchIdentity({ name: 'Zoya Khan', rollNo: '3', seatNo: null }, roster)).toEqual({ studentId: null, by: 'none', candidates: ['s3'], flags: ['identity'] });
    const close = matchIdentity({ name: 'Dev Pat', rollNo: null, seatNo: null }, [...roster, { studentId: 's5', name: 'Dev Patil', rollNo: '20', seatNo: null }]);
    expect(close.studentId).toBeNull();
    expect(close.candidates).toContain('s3');
    expect(matchIdentity(null, roster)).toMatchObject({ studentId: null, flags: ['identity'] });
  });
  it('two scripts read as one child both wait for the teacher, and so does one read as a child who already has a script', () => {
    const groups = [
      { pageIds: ['a'], read: { name: 'Meera Sharma', rollNo: '1', seatNo: null }, flags: [] },
      { pageIds: ['b'], read: { name: 'Meera Sharma', rollNo: '1', seatNo: null }, flags: [] },
      { pageIds: ['c'], read: { name: 'Zoya Khan', rollNo: '2', seatNo: null }, flags: [] },
    ];
    const m = assignScripts(groups, roster, new Set(['s2']));
    expect(m.map((x) => [x.studentId, x.flags])).toEqual([
      [null, ['two_scripts']],
      [null, ['two_scripts']],
      [null, ['two_scripts']],
    ]);
    expect(m[0].candidates).toEqual(['s1']);
  });
});

describe('which pages make a script', () => {
  const reading = (over: Partial<PageReading>): PageReading => ({ firstPage: false, name: null, rollNo: null, seatNo: null, classSection: null, pageNumber: null, blank: false, legible: true, answerPage: true, idDocument: false, ...over });
  const page = (id: string, fileNo: number, pageNo: number, r: Partial<PageReading> | null, state: GroupPage['state'] = 'read'): GroupPage => ({ pageId: id, fileNo, pageNo, state, reading: r ? reading(r) : null });
  it('one file per child: each file is a script, unless a page plainly starts another child’s', () => {
    const groups = groupPages(
      [
        page('a1', 1, 1, { firstPage: true, name: 'Meera Sharma', rollNo: '1', pageNumber: 1 }),
        page('a2', 1, 2, { pageNumber: 2 }),
        page('b1', 2, 1, { firstPage: true, name: 'Zoya Khan', rollNo: '2', pageNumber: 1 }),
        page('b2', 2, 2, { firstPage: true, name: 'Dev Patel', rollNo: '3', pageNumber: 1 }),
        page('b3', 2, 3, { pageNumber: 3 }),
      ],
      'per_file'
    );
    expect(groups.map((g) => g.pageIds)).toEqual([['a1', 'a2'], ['b1'], ['b2', 'b3']]);
    expect(groups[2].flags).toEqual(['missing_page']);
  });
  it('a first page that cannot be compared with the script so far starts a new script; a page number read twice flags it (review of #317)', () => {
    const groups = groupPages(
      [
        page('a1', 1, 1, { firstPage: true, name: 'Meera Sharma', pageNumber: 1 }),
        page('a2', 1, 2, { firstPage: true, rollNo: '2', pageNumber: 1 }),
        page('a3', 1, 3, { pageNumber: 2 }),
      ],
      'combined'
    );
    expect(groups.map((g) => g.pageIds)).toEqual([['a1'], ['a2', 'a3']]);
    const twice = groupPages([page('b1', 1, 1, { firstPage: true, name: 'Zoya Khan', pageNumber: 1 }), page('b2', 1, 2, { pageNumber: 2 }), page('b3', 1, 3, { pageNumber: 1 }), page('b4', 1, 4, { pageNumber: 2 })], 'per_file');
    expect(twice).toHaveLength(1);
    expect(twice[0].flags).toEqual(['identity']);
  });
  it('one file per child: a file whose first page shows no name takes the first one shown later', () => {
    const groups = groupPages([page('c1', 1, 1, { pageNumber: 1 }), page('c2', 1, 2, { firstPage: true, name: 'Dev Patel', rollNo: '3', pageNumber: 2 })], 'per_file');
    expect(groups.map((g) => g.pageIds)).toEqual([['c1', 'c2']]);
    expect(groups[0].read).toEqual({ name: 'Dev Patel', rollNo: '3', seatNo: null });
  });
  it('one combined scan: a new script at each first page of another child; a name on every page stays one script; duplicates are left out', () => {
    const groups = groupPages(
      [
        page('x', 1, 1, { pageNumber: 2 }),
        page('m1', 1, 2, { firstPage: true, name: 'Meera Sharma', rollNo: '1', pageNumber: 1 }),
        page('m2', 1, 3, { firstPage: true, name: 'Meera Sharma', rollNo: '1', pageNumber: 2 }),
        page('dup', 1, 4, null, 'duplicate'),
        page('z1', 1, 5, { firstPage: true, name: 'Zoya Khan', rollNo: '2', pageNumber: 1 }),
        page('z2', 1, 6, { legible: false }, 'unreadable'),
      ],
      'combined'
    );
    expect(groups.map((g) => g.pageIds)).toEqual([['x'], ['m1', 'm2'], ['z1', 'z2']]);
    expect(groups[0].read).toBeNull();
    expect(groups[0].flags).toEqual(['missing_page']);
    expect(groups[2].flags).toEqual(['unreadable']);
  });
});
