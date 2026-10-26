import { describe, expect, it } from 'vitest';
import type { MarkingQuestion, SheetDetail, SheetQuestion, SheetRow } from '@/lib/contracts/marking';
import { firstProblem, formFromQuestion, groupsOf, move, nextLabel, newQuestion, partsWithoutQuestions, problemsOf, sameAsSaved, toSaveBody, type QuestionForm } from '@/lib/marking/question-form';
import { bucketCounts, bucketOf, changesOf, clampMark, countedOf, emptyDraft, filterSheets, finalOf, flagsInOrder, grandTotal, inProgress, noteOf, parseMark, readyIds, stepMark, sureness, totalsOf } from '@/lib/marking/review-view';

// What the teacher's screens work out for themselves, with no server: the questions as they are typed and the mistakes
// named at once, which list a script belongs in, marks kept within their question, how sure the AI was in words, and what
// was changed on a script. Every name and number is made up.

const PARTS = [
  { key: 'written', name: 'Written', max: 20 },
  { key: 'oral', name: 'Oral', max: 10 },
];
const q = (over: Partial<QuestionForm> = {}): QuestionForm => ({ key: 'k', label: '1', component: 'written', maxMarks: '4', choiceGroup: '', unitId: '', kind: 'short', prompt: '', answerKey: '', steps: [], ...over });

describe('the questions as the teacher types them', () => {
  it('counts the next number on: "6(b)" is followed by "7", "Q3" by "Q4", nothing by "1"', () => {
    expect(nextLabel([])).toBe('1');
    expect(nextLabel(['1', '2(a)', '6(b)'])).toBe('7');
    expect(nextLabel(['Q3'])).toBe('Q4');
    expect(nextLabel(['Part'])).toBe('1');
  });
  it('a new question follows the one before it in part, topic and kind', () => {
    const forms = [q({ label: '4', component: 'oral', unitId: 'u1', kind: 'long' })];
    expect(newQuestion(forms, ['written', 'oral'])).toMatchObject({ label: '5', component: 'oral', unitId: 'u1', kind: 'long', maxMarks: '', steps: [] });
    expect(newQuestion([], ['written', 'oral'])).toMatchObject({ label: '1', component: 'written' });
  });
  it('moves a question up or down, and not past either end', () => {
    expect(move(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(move(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
  it('names the first thing that is wrong, as the server would', () => {
    const parts = ['written', 'oral'];
    expect(firstProblem([q()], parts, {})).toBeNull();
    expect(firstProblem([q({ label: '' })], parts, {})).toEqual({ at: 0, field: 'label' });
    expect(firstProblem([q({ label: 'a b' })], parts, {})).toEqual({ at: 0, field: 'label' });
    expect(firstProblem([q(), q({ label: '1' })], parts, {})).toEqual({ at: 1, field: 'twice' });
    expect(firstProblem([q({ label: 'q1' }), q({ label: 'Q1' })], parts, {})).toEqual({ at: 1, field: 'twice' });
    expect(firstProblem([q({ component: 'practical' })], parts, {})).toEqual({ at: 0, field: 'component' });
    for (const bad of ['', '0', '-1', '101', '2.25', 'two']) expect(firstProblem([q({ maxMarks: bad })], parts, {}), bad).toEqual({ at: 0, field: 'maxMarks' });
    expect(firstProblem([q({ maxMarks: '2,5' })], parts, {})).toBeNull();
    expect(firstProblem([q({ choiceGroup: 'abc' })], parts, {})).toEqual({ at: 0, field: 'choiceGroup' });
    expect(firstProblem([q({ steps: [{ step: 'All of it', marks: '5' }] })], parts, {})).toEqual({ at: 0, field: 'steps' });
    expect(firstProblem([q({ steps: [{ step: '', marks: '1' }] })], parts, {})).toEqual({ at: 0, field: 'steps' });
    expect(firstProblem([q({ steps: [{ step: 'Method', marks: '2' }, { step: 'Answer', marks: '2' }] })], parts, {})).toBeNull();
  });
  it('a choice group needs a count of at least one', () => {
    const parts = ['written'];
    const forms = [q({ label: '6(a)', choiceGroup: 'a', maxMarks: '10' }), q({ label: '6(b)', choiceGroup: 'A', maxMarks: '10' })];
    expect(firstProblem(forms, parts, {})).toEqual({ at: -1, field: 'group_count' });
    expect(firstProblem(forms, parts, { A: '0' })).toEqual({ at: -1, field: 'group_count' });
    expect(firstProblem(forms, parts, { A: '1' })).toBeNull();
    expect(groupsOf(forms)).toEqual(['A']);
  });
  it('says in plain numbers when a part does not add up: "Written adds up to 18; it must be 20"', () => {
    const forms = [q({ label: '1', maxMarks: '8' }), q({ label: '2', maxMarks: '10' })];
    expect(problemsOf(forms, PARTS, {})).toEqual([{ kind: 'part_total', component: 'written', counted: 18, max: 20 }]);
    expect(problemsOf([...forms, q({ label: '3', maxMarks: '2' })], PARTS, {})).toEqual([]);
    expect(problemsOf([], PARTS, {})).toEqual([{ kind: 'no_questions' }]);
  });
  it('counts only the best answers of a choice group toward the part', () => {
    const forms = [q({ label: '1', maxMarks: '10' }), q({ label: '2(a)', maxMarks: '5', choiceGroup: 'A' }), q({ label: '2(b)', maxMarks: '5', choiceGroup: 'A' })];
    expect(problemsOf(forms, PARTS, { A: '1' })).toEqual([{ kind: 'part_total', component: 'written', counted: 15, max: 20 }]);
    expect(problemsOf(forms, PARTS, { A: '2' })).toEqual([]);
    expect(problemsOf(forms, PARTS, {})).toContainEqual({ kind: 'group_count', group: 'A' });
  });
  it('a part with no question is typed by hand, and the screen says so', () => {
    expect(partsWithoutQuestions([q()], PARTS).map((p) => p.key)).toEqual(['oral']);
    expect(partsWithoutQuestions([q(), q({ component: 'oral' })], PARTS)).toEqual([]);
  });
  it('is sent as the whole list with numbers, in order, the groups upper case and the counts as numbers', () => {
    const forms = [q({ label: ' 1 ', maxMarks: '2,5', choiceGroup: ' a ', unitId: '', steps: [{ step: ' Method ', marks: '1.5' }] }), q({ label: '2', maxMarks: '3', choiceGroup: 'a' })];
    const body = toSaveBody(forms, { A: '1' }, { language: 'hi', guidance: 'Be kind' });
    expect(body.setup).toEqual({ language: 'hi', guidance: 'Be kind', choiceCounts: { A: 1 } });
    expect(body.questions[0]).toEqual({ position: 1, label: '1', component: 'written', maxMarks: 2.5, choiceGroup: 'A', unitId: null, kind: 'short', prompt: '', answerKey: '', steps: [{ step: 'Method', marks: 1.5 }] });
    expect(body.questions.map((x) => x.position)).toEqual([1, 2]);
  });
  it('knows when nothing has changed from what is saved', () => {
    const saved: MarkingQuestion[] = [{ questionId: 'a', position: 1, label: '1', component: 'written', maxMarks: 4, choiceGroup: null, unitId: null, kind: 'short', prompt: 'Add.', answerKey: '3', steps: [{ step: 'Sum', marks: 4 }] }];
    const forms = saved.map(formFromQuestion);
    const same = { language: 'en', guidance: 'x' };
    expect(sameAsSaved(forms, {}, { questions: saved, choiceCounts: {} }, same, same)).toBe(true);
    expect(sameAsSaved([{ ...forms[0], maxMarks: '5' }], {}, { questions: saved, choiceCounts: {} }, same, same)).toBe(false);
    expect(sameAsSaved(forms, {}, { questions: saved, choiceCounts: {} }, { ...same, language: 'hi' }, same)).toBe(false);
    expect(sameAsSaved([], {}, { questions: saved, choiceCounts: {} }, same, same)).toBe(false);
    expect(sameAsSaved(forms, { A: '1' }, { questions: saved, choiceCounts: {} }, same, same)).toBe(true);
  });
});

// ---- the review list and a script -----------------------------------------------------------------------------

const kid = { studentId: 's1', name: 'Meera Example', rollNo: '2', seatNo: null };
const sheet = (over: Partial<SheetRow> = {}): SheetRow => ({ sheetId: 'x', student: kid, matchedBy: 'roll', state: 'marked', flags: [], failure: null, pages: 2, total: 20, max: 40, confidence: 0.9, approvedAt: null, ...over });

describe('which list a script is in', () => {
  it('ready: marked, a child, no flag; needs a look: any flag, a failure or no child; approved; or still being worked on', () => {
    expect(bucketOf(sheet())).toBe('ready');
    expect(bucketOf(sheet({ flags: ['unsure'] }))).toBe('needs');
    expect(bucketOf(sheet({ student: null }))).toBe('needs');
    expect(bucketOf(sheet({ state: 'failed' }))).toBe('needs');
    expect(bucketOf(sheet({ state: 'approved' }))).toBe('approved');
    expect(bucketOf(sheet({ state: 'approved', flags: ['changed'] }))).toBe('needs');
    expect(bucketOf(sheet({ state: 'waiting' }))).toBe('working');
    expect(bucketOf(sheet({ state: 'marking' }))).toBe('working');
  });
  it('counts them, leaving a script set aside out, and names the ones “Approve all ready” takes', () => {
    const list = [sheet({ sheetId: 'a' }), sheet({ sheetId: 'b', flags: ['identity'] }), sheet({ sheetId: 'c', state: 'approved' }), sheet({ sheetId: 'd' }), sheet({ sheetId: 'e', state: 'set_aside' }), sheet({ sheetId: 'f', state: 'waiting' })];
    expect(bucketCounts(list)).toEqual({ needs: 1, ready: 2, approved: 1, working: 1 });
    expect(readyIds(list)).toEqual(['a', 'd']);
  });
  it('filters keep the roll order they came in; there is no sort by marks', () => {
    const list = [sheet({ sheetId: 'a', total: 5 }), sheet({ sheetId: 'b', total: 39, flags: ['unsure'] }), sheet({ sheetId: 'c', total: 12 }), sheet({ sheetId: 'd', state: 'approved', total: 40 })];
    expect(filterSheets(list, 'all').map((s) => s.sheetId)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterSheets(list, 'ready').map((s) => s.sheetId)).toEqual(['a', 'c']);
    expect(filterSheets(list, 'needs').map((s) => s.sheetId)).toEqual(['b']);
    expect(filterSheets(list, 'approved').map((s) => s.sheetId)).toEqual(['d']);
  });
  it('the page asks again only while something is being read or marked', () => {
    const base = { uploads: [{ closed: true }], pages: { new: 0 }, sheets: [{ state: 'marked' }, { state: 'approved' }] };
    expect(inProgress(base)).toBe(false);
    expect(inProgress({ ...base, pages: { new: 3 } })).toBe(true);
    expect(inProgress({ ...base, sheets: [{ state: 'marking' }] })).toBe(true);
    expect(inProgress({ ...base, sheets: [{ state: 'waiting' }] })).toBe(true);
    // Pages waiting in an upload the teacher has not yet closed are waiting for the teacher, not for the AI.
    expect(inProgress({ ...base, uploads: [{ closed: false }], pages: { new: 9 } })).toBe(false);
    expect(inProgress({ ...base, sheets: [{ state: 'failed' }] })).toBe(false);
  });
});

describe('how sure the AI was, in words', () => {
  it('"check this" below the school’s line, "sure" from nine in ten, otherwise fairly sure, and nothing when it did not say', () => {
    expect(sureness(0.62, 0.75)).toBe('check');
    expect(sureness(0.74, 0.75)).toBe('check');
    expect(sureness(0.75, 0.75)).toBe('fair');
    expect(sureness(0.89, 0.75)).toBe('fair');
    expect(sureness(0.9, 0.75)).toBe('sure');
    expect(sureness(0.9, 0.95)).toBe('check');
    expect(sureness(0.96, 0.95)).toBe('sure');
    expect(sureness(null, 0.75)).toBe('none');
  });
});

describe('a mark kept within its question', () => {
  it('goes up and down by half a mark, landing on halves, and stays between 0 and the question’s marks', () => {
    expect(stepMark(3, 0.5, 4)).toBe(3.5);
    expect(stepMark(3.5, 0.5, 4)).toBe(4);
    expect(stepMark(4, 0.5, 4)).toBe(4);
    expect(stepMark(0.5, -0.5, 4)).toBe(0);
    expect(stepMark(0, -0.5, 4)).toBe(0);
    expect(stepMark(3.2, 0.5, 4)).toBe(3.5);
    expect(stepMark(3.2, -0.5, 4)).toBe(3);
    expect(stepMark(null, 0.5, 4)).toBe(0.5);
    expect(stepMark(null, -0.5, 4)).toBe(0);
  });
  it('reads a typed mark: empty, a number within the question, more than the question’s marks, or not a number', () => {
    expect(parseMark('', 4)).toEqual({ kind: 'empty' });
    expect(parseMark(' 3,5 ', 4)).toEqual({ kind: 'ok', value: 3.5 });
    expect(parseMark('4', 4)).toEqual({ kind: 'ok', value: 4 });
    expect(parseMark('3.', 4)).toEqual({ kind: 'ok', value: 3 });
    expect(parseMark('.5', 4)).toEqual({ kind: 'ok', value: 0.5 });
    expect(parseMark('4.5', 4)).toEqual({ kind: 'over' });
    expect(parseMark('9', 4)).toEqual({ kind: 'over' });
    for (const bad of ['-1', '1.25', 'two', '1e2', '3..5']) expect(parseMark(bad, 4), bad).toEqual({ kind: 'bad' });
  });
  it('clamps to a tenth within the question', () => {
    expect(clampMark(5, 4)).toBe(4);
    expect(clampMark(-1, 4)).toBe(0);
    expect(clampMark(2.26, 4)).toBe(2.3);
  });
});

function question(id: string, label: string, over: Partial<SheetQuestion> = {}): SheetQuestion {
  return {
    questionId: id,
    position: Number(label.replace(/\D/g, '')) || 1,
    label,
    component: 'written',
    maxMarks: 10,
    choiceGroup: null,
    unitId: null,
    kind: 'short',
    prompt: '',
    answerKey: '',
    steps: [],
    ai: { attempted: true, marks: 6, steps: [], note: 'Good.', reason: null, confidence: 0.9 },
    teacher: { marks: null, note: null, changedAt: null },
    errorType: null,
    final: 6,
    counted: true,
    place: null,
    ...over,
  };
}
const detail = (questions: SheetQuestion[], totals = [{ component: 'written', name: 'Written', score: 16, max: 20 }]): SheetDetail =>
  ({ questions, totals, strengths: 'Neat.', improve: null, practice: [{ unitId: null, text: 'Fractions' }], sheet: sheet(), pages: [], roster: [], match: { read: null, candidates: [] }, mayChange: true, next: null, paper: {} as never }) as SheetDetail;

describe('what the teacher changes on a script', () => {
  const d = detail([question('a', '1', { final: 6 }), question('b', '2', { final: 10, ai: { attempted: true, marks: 10, steps: [], note: null, reason: null, confidence: 0.5 } })]);
  it('a mark as typed beats the AI’s; null gives the AI’s back', () => {
    const draft = { questions: { a: { marks: 8 } } };
    expect(finalOf(d.questions[0], draft)).toBe(8);
    expect(finalOf(d.questions[0], { questions: { a: { marks: null } } })).toBe(6);
    expect(finalOf(d.questions[0], emptyDraft())).toBe(6);
  });
  it('the note shown is the teacher’s, else the AI’s', () => {
    expect(noteOf(d.questions[0], emptyDraft())).toBe('Good.');
    expect(noteOf(d.questions[0], { questions: { a: { note: 'Well done' } } })).toBe('Well done');
    expect(noteOf({ ...d.questions[1], teacher: { marks: null, note: 'Mine', changedAt: null } }, emptyDraft())).toBe('Mine');
  });
  it('the totals follow the marks as typed, at once', () => {
    expect(grandTotal(totalsOf(d, {}, emptyDraft()))).toEqual({ score: 16, max: 20 });
    expect(totalsOf(d, {}, { questions: { a: { marks: 9.5 } } })[0].score).toBe(19.5);
  });
  it('internal choice counts the better answer, and changes when the marks do', () => {
    const c = detail([question('a', '6(a)', { choiceGroup: 'A', final: 7 }), question('b', '6(b)', { choiceGroup: 'A', final: 4 })]);
    expect([...countedOf(c, { A: 1 }, emptyDraft())]).toEqual(['a']);
    expect([...countedOf(c, { A: 1 }, { questions: { b: { marks: 9 } } })]).toEqual(['b']);
  });
  it('sends only what differs from the server: nothing for no change', () => {
    expect(changesOf(d, emptyDraft())).toBeNull();
    expect(changesOf(d, { questions: { a: { marks: 8 } } })).toEqual({ questions: [{ questionId: 'a', marks: 8 }] });
    expect(changesOf(d, { questions: { a: { marks: null } } })).toBeNull();
    expect(changesOf(d, { questions: { a: { note: '  Check the last line ' } }, strengths: 'Neat.' })).toEqual({ questions: [{ questionId: 'a', note: 'Check the last line' }] });
    expect(changesOf(d, { questions: { a: { errorType: 'calculation' } }, improve: ' Show steps ' })).toEqual({ questions: [{ questionId: 'a', errorType: 'calculation' }], improve: 'Show steps' });
    expect(changesOf(d, { questions: {}, strengths: '' })).toEqual({ strengths: null });
    expect(changesOf(d, { questions: {}, practice: [{ unitId: null, text: 'Fractions' }] })).toBeNull();
    expect(changesOf(d, { questions: {}, practice: [{ unitId: null, text: 'Fractions' }, { unitId: null, text: '  ' }, { unitId: 'u', text: 'Decimals' }] })).toEqual({ practice: [{ unitId: null, text: 'Fractions' }, { unitId: 'u', text: 'Decimals' }] });
  });
  it('puts the flags in the order a person meets them: who it is first', () => {
    expect(flagsInOrder(['unsure', 'identity', 'changed', 'missing_page'])).toEqual(['identity', 'missing_page', 'unsure', 'changed']);
  });
});
