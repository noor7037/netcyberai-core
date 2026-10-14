import { describe, expect, it } from 'vitest';
import { RTE_EXAMPLE_CHILDREN, RTE_EXAMPLE_SETTINGS } from '@/demo-fixture/rte-claim-sheet-builder-example';
import { money } from './report';
import type { KeyValueStore } from './school-profile';
import {
  DEFAULT_DOCUMENTS,
  RTE_KEY,
  ageBucket,
  blankSettings,
  buildClaim,
  childrenFromCsv,
  childrenToCsv,
  cleanSettings,
  feeForClass,
  forgetRteSettings,
  readRteSettings,
  rteTemplateCsv,
  saveRteSettings,
  type RteChild,
  type RteSettings,
} from './rte-claim';

const TODAY = { y: 2026, m: 10, d: 14 };
const all = [true, true, true, true, true];

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const settings = (patch: Partial<RteSettings> = {}): RteSettings => ({ ...blankSettings(), rate: '15000', fee: '20000', ...patch });
const child = (name: string, cls: string, docs = all): RteChild => ({ name, cls, admitted: '2026-04-06', docs });

describe('RTE claim: the section 12(2) rule', () => {
  it('claims the lower of the state rate and the school fee, and says which applied', () => {
    const r = buildClaim(settings({ classFees: [{ cls: 'Nursery', fee: '12000' }] }), [child('A', '5'), child('B', 'Nursery')], TODAY);
    expect(r.errors).toEqual([]);
    expect(r.claims.map((c) => [c.claim, c.applied])).toEqual([
      [15000, 'rate'],
      [12000, 'fee'],
    ]);
    expect(buildClaim(settings({ fee: '15000' }), [child('A', '5')], TODAY).claims[0].applied).toBe('equal');
  });
  it('finds a class fee with or without the section and the word class', () => {
    const s = settings({ classFees: [{ cls: 'Class 1', fee: '18000' }, { cls: 'UKG', fee: '16000' }] });
    expect(feeForClass(s, '1')).toBe(18000);
    expect(feeForClass(s, '1-A')).toBe(18000);
    expect(feeForClass(s, '1A')).toBe(18000);
    expect(feeForClass(s, 'class 1 b')).toBe(18000);
    expect(feeForClass(s, 'ukg-a')).toBe(16000);
    expect(feeForClass(s, '10')).toBe(20000);
    expect(feeForClass(settings({ fee: '' }), '3')).toBeNaN();
  });
  it('accepts amounts with commas and a rupee sign', () => {
    expect(buildClaim(settings({ rate: '₹ 15,000', fee: '20,000' }), [child('A', '5')], TODAY).claims[0].claim).toBe(15000);
  });
});

describe('RTE claim: checks before any figure is shown', () => {
  it('never assumes a state rate', () => {
    const r = buildClaim(settings({ rate: '' }), [child('A', '5')], TODAY);
    expect(r.report).toBeNull();
    expect(r.errors[0]).toContain('per-child rate');
    expect(blankSettings().rate).toBe('');
  });
  it('asks for a fee for every class that has none, once per class', () => {
    const r = buildClaim(settings({ fee: '' }), [child('A', '3'), child('B', '3'), child('C', '4')], TODAY);
    expect(r.errors).toEqual(['Enter the school’s annual fee, or a fee for class 3.', 'Enter the school’s annual fee, or a fee for class 4.']);
  });
  it('asks for missing names, classes and readable dates, and ignores blank rows', () => {
    const r = buildClaim(settings(), [child('', '5'), child('B', ''), { ...child('C', '5'), admitted: 'soon' }, { name: '', cls: '', admitted: '', docs: [false] }], TODAY);
    expect(r.errors).toEqual(['Add the child’s name in row 1.', 'Add the class for B.', 'Write the admission date for C as dd-mm-yyyy.']);
  });
  it('numbers rows as they are on screen, blank rows included', () => {
    const blank = { name: '', cls: '', admitted: '', docs: [] };
    expect(buildClaim(settings(), [blank, child('A', '')], TODAY).errors).toEqual(['Add the class for A.']);
    expect(buildClaim(settings(), [blank, child('', '5')], TODAY).errors).toEqual(['Add the child’s name in row 2.']);
  });
  it('leaves a document that has no name yet out of the checklist, the CSV and the counts', () => {
    const s = settings({ documents: ['Proof of age', '', 'Proof of residence'] });
    const r = buildClaim(s, [child('A', '5', [true, false, false])], TODAY);
    expect(r.claims[0].missing).toEqual(['Proof of residence']);
    const sheet = r.report!.sections[1];
    expect(sheet.kind === 'table' && sheet.rows[0][8]).toBe('1 of 2');
    expect(childrenToCsv([child('A', '5', [true, false, false])], s.documents).split('\r\n')[0]).toBe('name,class,admission_date,Proof of age,Proof of residence');
    expect(childrenFromCsv('name,class,\nA,5,yes\n', s.documents).children[0].docs).toEqual([false, false, false]);
  });
  it('shows nothing until something is entered', () => {
    expect(buildClaim(blankSettings(), [], TODAY)).toMatchObject({ errors: [], report: null });
  });
});

describe('RTE claim: documents, totals and ageing', () => {
  it('splits children ready to claim from those missing documents', () => {
    const r = buildClaim(settings(), [child('A', '5'), child('B', '5', [true, false, true, false, true])], TODAY);
    expect(r.claims[1].missing).toEqual([DEFAULT_DOCUMENTS[1], DEFAULT_DOCUMENTS[3]]);
    const stats = r.report!.sections[0];
    expect(stats.kind === 'stats' && stats.items.slice(0, 5).map((i) => i.value)).toEqual(['2', '1', '1', money(30000), money(15000)]);
    const sheet = r.report!.sections[1];
    expect(sheet.kind === 'table' && sheet.rows[1]).toEqual(['2', 'B', '5', '06-04-2026', money(20000), money(15000), money(15000), 'State rate', '3 of 5']);
    expect(sheet.kind === 'table' && sheet.rows[2][6]).toBe(money(30000));
    const notes = r.report!.sections[2];
    expect(notes).toMatchObject({ kind: 'notes', items: [`2. B, class 5: ${DEFAULT_DOCUMENTS[1]}, ${DEFAULT_DOCUMENTS[3]}`] });
  });
  it('states the rule and where the rate comes from', () => {
    const r = buildClaim(settings(), [child('A', '5')], TODAY);
    expect(r.report!.assumptions.join(' ')).toContain('section 12(2) of the RTE Act');
    expect(r.report!.assumptions.join(' ')).toContain('figures you entered');
  });
  it('ages each year’s claim, oldest first, with what is still due', () => {
    const ageing = [
      { year: '2025-26', claimed: '100000', filed: '2026-07-16', received: '' },
      { year: '2023-24', claimed: '90000', filed: '2024-09-12', received: '90000' },
      { year: '2024-25', claimed: '80000', filed: '2025-08-20', received: '20000' },
    ];
    const r = buildClaim(settings({ ageing }), [], TODAY);
    expect(r.errors).toEqual([]);
    expect(r.ageing.map((a) => [a.year, a.due, a.days, a.bucket])).toEqual([
      ['2023-24', 0, 762, 'paid'],
      ['2024-25', 60000, 420, 'overYear'],
      ['2025-26', 100000, 90, 'upTo90'],
    ]);
    const table = r.report!.sections.find((s) => s.kind === 'table');
    expect(table && table.kind === 'table' && table.rows[3]).toEqual(['Total', money(270000), '', money(110000), money(160000), '', '']);
  });
  it('puts each age in its bucket', () => {
    expect([90, 91, 180, 181, 365, 366].map((d) => ageBucket(d, 1))).toEqual(['upTo90', 'upTo180', 'upTo180', 'upTo365', 'upTo365', 'overYear']);
    expect(ageBucket(900, 0)).toBe('paid');
  });
  it('checks claim rows', () => {
    const r = buildClaim(settings({ ageing: [{ year: '', claimed: 'abc', filed: '2027-01-01', received: '' }] }), [], TODAY);
    expect(r.errors).toEqual(['Add the academic year for claim row 1.', 'Enter the amount claimed for row 1.', 'The date the row 1 claim was filed is after today.']);
  });
  it('builds the example without errors', () => {
    const r = buildClaim(RTE_EXAMPLE_SETTINGS, RTE_EXAMPLE_CHILDREN, TODAY);
    expect(r.errors).toEqual([]);
    expect(r.claims).toHaveLength(RTE_EXAMPLE_CHILDREN.length);
    expect(r.claims.some((c) => c.applied === 'fee') && r.claims.some((c) => c.applied === 'rate')).toBe(true);
  });
});

describe('RTE claim: settings and CSV', () => {
  it('saves only the school’s settings, cleaned, and fails soft', () => {
    const store = memoryStore();
    expect(readRteSettings(store)).toBeNull();
    expect(saveRteSettings(settings({ year: '2026-27' }), store)).toBe(true);
    expect(readRteSettings(store)).toMatchObject({ year: '2026-27', rate: '15000' });
    store.data.set(RTE_KEY, JSON.stringify({ rate: 5, year: 'x'.repeat(50), documents: ['A', 7, ''], children: [{ name: 'Z' }] }));
    const back = readRteSettings(store)!;
    expect(back).toEqual({ year: 'x'.repeat(20), rate: '', fee: '', classFees: [], documents: ['A'], ageing: [] });
    store.data.set(RTE_KEY, '{');
    expect(readRteSettings(store)).toBeNull();
    expect(readRteSettings(null)).toBeNull();
    expect(saveRteSettings(settings(), null)).toBe(false);
    forgetRteSettings(store);
    expect(store.data.size).toBe(0);
    expect(cleanSettings(null).documents).toEqual(DEFAULT_DOCUMENTS);
  });
  it('round-trips the children through CSV, matching documents by name', () => {
    const kids = [child('Aditi, K', 'Nursery'), child('Bilal', '1-A', [true, false, true, false, false])];
    const csv = childrenToCsv(kids, DEFAULT_DOCUMENTS);
    expect(csv.split('\r\n')[2]).toBe('Bilal,1-A,06-04-2026,yes,no,yes,no,no');
    const back = childrenFromCsv(csv, DEFAULT_DOCUMENTS);
    expect(back.children).toEqual(kids);
    expect(back.ignored).toEqual([]);
  });
  it('ignores columns that are not on the document list, and reads dates and ticks', () => {
    const r = childrenFromCsv('Name,Class,Admission date,Category,Proof of age\nA,5,6/4/2026,X,Yes\nB,5,next week,,no\n', DEFAULT_DOCUMENTS);
    expect(r.ignored).toEqual(['Category']);
    expect(r.unreadableDates).toBe(1);
    expect(r.children[0]).toEqual({ name: 'A', cls: '5', admitted: '2026-04-06', docs: [false, true, false, false, false] });
    expect(childrenFromCsv('class\n5\n', DEFAULT_DOCUMENTS).error).toContain('name column');
    expect(rteTemplateCsv(['Proof of age'])).toBe('name,class,admission_date,Proof of age\r\n');
  });
});
