import { describe, expect, it } from 'vitest';
import {
  addDays,
  admissionsReport,
  admissionsSummary,
  blankEnquiry,
  cleanEnquiry,
  daysBetween,
  enquiriesFromCsv,
  enquiriesToCsv,
  enquiryTemplateCsv,
  followUpDraft,
  followUps,
  formatDate,
  isIsoDate,
  phoneProblem,
  readDate,
  recordOutcome,
  type Enquiry,
} from './admissions-tracker';
import { pct } from './report';
import { whatsappDraftLink } from './whatsapp-draft';

const TODAY = '2026-10-14';
const row = (id: string, patch: Partial<Enquiry>): Enquiry => ({ ...blankEnquiry('2026-10-01', id), parentName: `Parent ${id}`, ...patch });

describe('calendar dates', () => {
  it('reads ISO and day-first dates and refuses impossible ones', () => {
    expect(readDate('2026-10-14')).toBe('2026-10-14');
    expect(readDate('4/9/2026')).toBe('2026-09-04');
    expect(readDate('14-10-2026')).toBe('2026-10-14');
    expect(readDate('  ')).toBe('');
    expect(readDate('31/02/2026')).toBeNull();
    expect(readDate('next week')).toBeNull();
    expect(isIsoDate('2026-02-30')).toBe(false);
  });
  it('counts whole days across months and formats for print', () => {
    expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2);
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(formatDate('2026-10-04')).toBe('4 Oct 2026');
    expect(formatDate('')).toBe('');
  });
});

describe("today's follow-up list", () => {
  const list = [
    row('a', { followUp: TODAY, updated: '2026-10-12' }),
    row('b', { followUp: '2026-10-10', updated: '2026-10-09' }),
    row('c', { followUp: '2026-10-20', updated: '2026-09-01' }),
    row('d', { stage: 'Admitted', followUp: '2026-10-01', updated: '2026-08-01' }),
    row('e', { updated: '2026-09-30' }),
    row('f', { stage: 'Not joining', updated: '2026-01-01' }),
    { ...blankEnquiry('2026-01-01', 'g'), followUp: '2026-10-01' },
  ];

  it('puts the most overdue first, then today, and leaves closed and empty rows out', () => {
    const { due } = followUps(list, TODAY, 14);
    expect(due.map((d) => [d.e.id, d.overdueDays])).toEqual([
      ['b', 4],
      ['a', 0],
    ]);
  });
  it('lists open enquiries with no update for the set number of days as gone quiet', () => {
    expect(followUps(list, TODAY, 14).quiet.map((q) => [q.e.id, q.quietDays])).toEqual([
      ['c', 43],
      ['e', 14],
    ]);
    expect(followUps(list, TODAY, 15).quiet.map((q) => q.e.id)).toEqual(['c']);
  });
});

describe('record what happened', () => {
  it('adds a dated note, moves the stage and sets the next date in one step', () => {
    const e = row('a', { notes: 'Asked about transport', followUp: '2026-10-10' });
    const next = recordOutcome(e, { note: '  Called,   visit on Saturday ', stage: 'Visit booked', nextStep: 'Show the labs', followUp: '2026-10-17', reason: '' }, TODAY);
    expect(next.notes).toBe('Asked about transport\n14 Oct 2026: Called, visit on Saturday');
    expect(next).toMatchObject({ stage: 'Visit booked', nextStep: 'Show the labs', followUp: '2026-10-17', updated: TODAY });
  });
  it('keeps no follow-up date on a closed enquiry and keeps the not joining reason', () => {
    const next = recordOutcome(row('a', { followUp: '2026-10-10' }), { note: 'Chose a school nearer home', stage: 'Not joining', nextStep: 'x', followUp: '2026-10-20', reason: 'Distance' }, TODAY);
    expect(next).toMatchObject({ stage: 'Not joining', followUp: '', nextStep: '', notJoiningReason: 'Distance' });
    expect(followUps([next], TODAY, 0).due).toHaveLength(0);
  });
});

describe('numbers', () => {
  const list = [
    row('1', { source: 'Walk-in', stage: 'Admitted' }),
    row('2', { source: 'Walk-in', stage: 'Form submitted' }),
    row('3', { source: 'Walk-in', stage: 'Not joining', notJoiningReason: 'Fees' }),
    row('4', { source: 'Website', stage: 'Visited' }),
    row('5', { source: 'Website', stage: 'Not joining' }),
    row('6', { source: 'Referral', stage: 'Admitted' }),
    row('7', { source: 'Referral', stage: 'Enquiry' }),
    row('8', { source: 'Referral', stage: 'Not joining', notJoiningReason: 'Fees' }),
    blankEnquiry(TODAY, 'empty'),
  ];
  const s = admissionsSummary(list);

  it('counts every stage and works out conversion as admitted ÷ all enquiries', () => {
    expect(s.total).toBe(8);
    expect(s.byStage.find((b) => b.stage === 'Not joining')?.count).toBe(3);
    expect(s.admitted).toBe(2);
    expect(s.conversion).toBe(2 / 8);
    expect(s.open).toBe(3);
  });
  it('works out conversion for each source', () => {
    expect(s.bySource.map((b) => [b.source, b.enquiries, b.admitted, b.notJoining])).toEqual([
      ['Walk-in', 3, 1, 1],
      ['Website', 2, 0, 1],
      ['Referral', 3, 1, 1],
    ]);
    expect(s.bySource.find((b) => b.source === 'Referral')?.conversion).toBe(1 / 3);
  });
  it('counts how far families have got, leaving not joining out, and groups the reasons', () => {
    expect(s.reached.map((r) => [r.stage, r.count])).toEqual([
      ['Visit booked', 4],
      ['Visited', 4],
      ['Form taken', 3],
      ['Form submitted', 3],
      ['Admitted', 2],
    ]);
    expect(s.reasons).toEqual([
      { reason: 'Fees', count: 2 },
      { reason: 'No reason recorded', count: 1 },
    ]);
  });
  it('builds a report with the conversion, the stages, the sources and the follow-ups', () => {
    const r = admissionsReport([...list, row('9', { followUp: '2026-10-11' })], TODAY, 14);
    const stats = r.sections[0];
    expect(stats.kind === 'stats' && stats.items.find((i) => i.label === 'Conversion')?.value).toBe(pct((2 / 9) * 100));
    expect(r.sections.map((x) => x.heading)).toEqual([undefined, 'Enquiries by stage', 'How far families have got', 'Conversion by source', 'Follow-ups due today and overdue', 'Why families are not joining']);
    const due = r.sections.find((x) => x.heading === 'Follow-ups due today and overdue');
    expect(due?.kind === 'table' && due.rows[0][6]).toBe('Overdue by 3 days');
  });
});

describe('WhatsApp follow-up', () => {
  it('fills the school, the parent and the class into an editable draft', () => {
    const d = followUpDraft(row('a', { parentName: 'Meena Joshi', classWanted: 'Class 1', stage: 'Visited' }), 'Sunrise Public School');
    expect(d).toContain('Namaste Meena Joshi,');
    expect(d).toContain('admissions office of Sunrise Public School');
    expect(d).toContain('admission to Class 1');
    expect(d).toContain('Thank you for visiting us');
    expect(followUpDraft(row('a', { classWanted: '' }), '')).toContain('This is the school admissions office. Thank you for your enquiry about admission.');
  });
  it('has no follow-up for a family not joining', () => {
    expect(followUpDraft(row('a', { stage: 'Not joining' }), 'Sunrise Public School')).toBe('');
  });
  it('says why there is no link instead of making one for a bad number', () => {
    expect(phoneProblem('')).toMatch(/Add a mobile number/);
    expect(phoneProblem('0141 2345678')).toMatch(/not a 10-digit Indian mobile number/);
    expect(phoneProblem('98765 43210')).toBeNull();
    expect(whatsappDraftLink('98765 43210', followUpDraft(row('a', {}), ''))).toMatch(/^https:\/\/wa\.me\/919876543210\?text=Namaste/);
  });
});

describe('storage and CSV', () => {
  it('cleans rows read back from the device and drops junk', () => {
    expect(cleanEnquiry('x')).toBeNull();
    expect(cleanEnquiry({ evil: 1 })).toBeNull();
    const e = cleanEnquiry({ id: 'ok-1', parentName: 'x'.repeat(200), stage: 'Hacked', source: 'Billboard', followUp: '2026-13-01', added: TODAY });
    expect(e).toMatchObject({ id: 'ok-1', stage: 'Enquiry', source: 'Other', followUp: '', added: TODAY });
    expect(e?.parentName).toHaveLength(60);
    expect(cleanEnquiry({ id: '<script>', phone: '9876543210' })?.id).not.toBe('<script>');
  });

  it('round-trips through CSV, including a phone that starts with +', () => {
    const list = [
      row('a', { phone: '+91 98765 43210', childName: 'Ira', classWanted: 'Nursery', source: 'WhatsApp', stage: 'Form taken', nextStep: 'Collect, form', followUp: '2026-10-16', notes: 'Line one\nLine two', added: '2026-10-01', updated: '2026-10-05' }),
      row('b', { stage: 'Not joining', notJoiningReason: 'Moved city' }),
    ];
    const csv = enquiriesToCsv(list);
    expect(csv.split('\r\n')[0]).toBe(enquiryTemplateCsv());
    const back = enquiriesFromCsv(csv, TODAY);
    expect(back.problems).toEqual([]);
    expect(back.rows.map(({ id: _id, ...rest }) => rest)).toEqual(list.map(({ id: _id, ...rest }) => rest));
  });

  it('accepts other column names and day-first dates, and reports what it changed', () => {
    const csv = 'Parent,Mobile,Student,Class,Source,Stage,Follow up,Date added\nAsha,9876500000,Kiran,LKG,Billboard,Joined,16/10/2026,\n,,,,,,,\n,,,,Walk-in,,,\nRavi,9876500001,,UKG,walk in,Interested,someday,01/10/2026\n';
    const { rows, problems } = enquiriesFromCsv(csv, TODAY);
    expect(rows.map((r) => [r.parentName, r.childName, r.source, r.stage, r.followUp, r.added, r.updated])).toEqual([
      ['Asha', 'Kiran', 'Other', 'Admitted', '2026-10-16', TODAY, TODAY],
      ['Ravi', '', 'Walk-in', 'Enquiry', '', '2026-10-01', '2026-10-01'],
    ]);
    expect(problems).toEqual([
      '1 row had no parent name, child name or phone and was left out.',
      '1 date could not be read and was left blank. Write dates as 2026-10-14 or 14/10/2026.',
      '1 row had a source the tracker does not list and was set to Other.',
      '1 row had a stage the tracker does not list and was set to Enquiry.',
    ]);
  });

  it('explains a file it cannot use', () => {
    expect(enquiriesFromCsv('Parent name\n', TODAY).error).toMatch(/no enquiries/);
    expect(enquiriesFromCsv('Roll,Marks\n1,40\n', TODAY).error).toMatch(/column names/);
  });
});
