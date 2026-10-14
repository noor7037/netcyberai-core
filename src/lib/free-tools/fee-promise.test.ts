import { describe, expect, it } from 'vitest';
import {
  amount,
  askForHelp,
  blankPromise,
  cleanPromise,
  feeReport,
  feeTotals,
  promiseLists,
  promiseTemplateCsv,
  promisesFromCsv,
  promisesToCsv,
  recordPayment,
  reminderDraft,
  reminderLink,
  renewPromise,
  viewPromise,
  type FeePromise,
} from './fee-promise';
import { RUPEE, money } from './report';

const TODAY = '2026-10-14';
const P = (id: string, patch: Partial<FeePromise>): FeePromise => ({ ...blankPromise(id), student: `Student ${id}`, phone: '98765 43210', amountDue: '6000', amountPromised: '5000', promisedDate: '2026-10-10', ...patch });
const status = (patch: Partial<FeePromise>) => viewPromise(P('x', patch), TODAY).status;

describe('amounts as typed', () => {
  it('allows commas, spaces, the rupee sign and Rs', () => {
    expect(amount(`${RUPEE}1,500`)).toBe(1500);
    expect(amount('Rs. 2,000.50')).toBe(2000.5);
    expect(amount(' 1 500 ')).toBe(1500);
    expect(amount('')).toBeNaN();
    expect(amount('15oo')).toBeNaN();
  });
});

describe('kept, partly kept and broken', () => {
  it('is kept when the amount promised is received by the date', () => {
    expect(status({ amountReceived: '5000', receivedDate: '2026-10-10' })).toBe('kept');
    expect(status({ amountReceived: '5500', receivedDate: '2026-10-02', promisedDate: '2026-10-20' })).toBe('kept');
    expect(status({ amountReceived: '5000' })).toBe('kept');
  });
  it('shows a full payment after the date separately, neither kept nor broken', () => {
    expect(status({ amountReceived: '5000', receivedDate: '2026-10-12' })).toBe('paid-late');
  });
  it('is partly kept or broken once the date has passed without the full amount', () => {
    expect(status({ amountReceived: '2000', receivedDate: '2026-10-09' })).toBe('partly-kept');
    expect(status({})).toBe('broken');
    expect(status({ amountReceived: '0' })).toBe('broken');
  });
  it('is due today or coming up while the date has not passed', () => {
    expect(status({ promisedDate: TODAY, amountReceived: '1000' })).toBe('due-today');
    expect(status({ promisedDate: '2026-10-15' })).toBe('upcoming');
  });
  it('takes the amount due when no amount is promised, and asks for what is missing', () => {
    expect(viewPromise(P('x', { amountPromised: '', amountReceived: '6000' }), TODAY).status).toBe('kept');
    const v = viewPromise(P('x', { promisedDate: '', amountReceived: 'lots' }), TODAY);
    expect(v.status).toBe('incomplete');
    expect(v.missing).toEqual(['promised date', 'amount received as a number']);
  });
  it('keeps a family that asked for help apart, whatever the dates say', () => {
    const v = viewPromise(P('x', { needsHelp: true }), TODAY);
    expect(v.status).toBe('needs-help');
    expect(v.missing).toEqual(['staff member who will speak to the family']);
    expect(viewPromise(P('x', { needsHelp: true, helpStaff: 'Mrs Rao' }), TODAY).missing).toEqual([]);
  });
});

describe('lists and totals', () => {
  const list = [
    P('kept', { amountReceived: '5000', receivedDate: '2026-10-08' }),
    P('part', { amountReceived: '2000', receivedDate: '2026-10-09', promisedDate: '2026-10-05' }),
    P('broken', {}),
    P('today', { promisedDate: TODAY }),
    P('soon', { promisedDate: '2026-10-16' }),
    P('later', { promisedDate: '2026-10-30' }),
    P('help', { needsHelp: true, helpStaff: 'Mrs Rao', helpNote: 'Lost job' }),
    P('nodate', { promisedDate: '' }),
    blankPromise('empty'),
  ];
  const l = promiseLists(list, TODAY);

  it('orders the working lists and never puts a help case in them', () => {
    expect(l.dueToday.map((v) => v.p.id)).toEqual(['today']);
    expect(l.broken.map((v) => v.p.id)).toEqual(['part', 'broken']);
    expect(l.upcoming.map((v) => v.p.id)).toEqual(['soon', 'later']);
    expect(l.help.map((v) => v.p.id)).toEqual(['help']);
    expect([...l.dueToday, ...l.broken, ...l.upcoming].some((v) => v.p.needsHelp)).toBe(false);
  });
  it('totals promised against received, leaving out help cases and incomplete rows', () => {
    const t = feeTotals(l.views);
    expect(t.promises).toBe(6);
    expect(t.promised).toBe(30000);
    expect(t.received).toBe(7000);
    expect(t.balance).toBe(23000);
    expect([t.counts.kept, t.counts['partly-kept'], t.counts.broken, t.counts['needs-help'], t.counts.incomplete]).toEqual([1, 1, 1, 1, 1]);
  });
  it('builds the report: totals, follow-up list, broken promises and help cases', () => {
    const r = feeReport(list, TODAY);
    expect(r.sections.map((s) => s.heading)).toEqual(['Totals', 'Follow-up list: due today and coming up', 'Broken and partly kept promises', 'Families needing help', 'Details to complete']);
    const follow = r.sections[1];
    expect(follow.kind === 'table' && follow.rows.map((x) => x[0])).toEqual(['Student today', 'Student soon', 'Student later']);
    const broken = r.sections[2];
    expect(broken.kind === 'table' && broken.rows.map((x) => [x[0], x[5], x[7]])).toEqual([
      ['Student part', money(3000), '9'],
      ['Student broken', money(5000), '4'],
    ]);
    const notes = r.sections[4];
    expect(notes.kind === 'notes' && notes.items).toEqual(['Student nodate: add the promised date.']);
  });
});

describe('one-step updates', () => {
  it('adds a payment to what was received', () => {
    const p = recordPayment(P('x', { amountReceived: '1000.5' }), 1500, TODAY);
    expect(p).toMatchObject({ amountReceived: '2500.5', receivedDate: TODAY });
  });
  it('sets a new date for the balance, or for a new amount', () => {
    const p = P('x', { amountReceived: '2000' });
    expect(renewPromise(p, '2026-10-25', null, TODAY)).toMatchObject({ promisedDate: '2026-10-25', amountPromised: '5000' });
    expect(renewPromise(p, '2026-10-25', 1000, TODAY)).toMatchObject({ amountPromised: '3000' });
    expect(viewPromise(renewPromise(p, '2026-10-25', null, TODAY), TODAY).status).toBe('upcoming');
  });
  it('records a request for help with the named staff member', () => {
    expect(askForHelp(P('x', {}), ' Mrs Rao ', 'Asked for instalments')).toMatchObject({ needsHelp: true, helpStaff: 'Mrs Rao', helpNote: 'Asked for instalments' });
  });
});

describe('polite WhatsApp reminder', () => {
  const draft = (patch: Partial<FeePromise>, school = 'Sunrise Public School') => reminderDraft(viewPromise(P('x', { student: 'Aarav Mehta', className: '4B', ...patch }), TODAY), school);

  it('names the school, the student and the balance', () => {
    const d = draft({}) ?? '';
    expect(d).toContain('gentle reminder from Sunrise Public School about the fee for Aarav Mehta (4B)');
    expect(d).toContain(`We have not yet received the ${money(5000)} planned for 10 Oct 2026.`);
    expect(draft({ amountReceived: '2000' }, '')).toContain(`from the school office about the fee for Aarav Mehta (4B). Thank you for the ${money(2000)} received. The remaining ${money(3000)}`);
  });
  it('never threatens and never mentions late fees', () => {
    const drafts = [draft({}), draft({ amountReceived: '2000' }), draft({ promisedDate: TODAY }), draft({ promisedDate: '2026-10-20' })];
    expect(drafts.every((d) => typeof d === 'string')).toBe(true);
    for (const d of drafts) expect(d).not.toMatch(/late fee|penalt|\bfine\b|legal|action|strict|warning|defaulter|overdue|immediately|last chance/i);
  });
  it('has no draft and no link for a family that asked for help, or with nothing due', () => {
    const help = P('x', { needsHelp: true, helpStaff: 'Mrs Rao' });
    expect(reminderDraft(viewPromise(help, TODAY), 'Sunrise Public School')).toBeNull();
    expect(reminderLink(help, 'Hello')).toBeNull();
    expect(draft({ amountReceived: '5000', receivedDate: '2026-10-01' })).toBeNull();
    expect(reminderLink(P('x', {}), 'Hello')).toBe('https://wa.me/919876543210?text=Hello');
    expect(reminderLink(P('x', { phone: '12345' }), 'Hello')).toBeNull();
  });
});

describe('storage and CSV', () => {
  it('cleans rows read back from the device', () => {
    expect(cleanPromise(null)).toBeNull();
    expect(cleanPromise({ evil: true })).toBeNull();
    const p = cleanPromise({ student: 'A', needsHelp: 'yes', promisedDate: 'soon', amountDue: '9'.repeat(40) });
    expect(p).toMatchObject({ student: 'A', needsHelp: false, promisedDate: '' });
    expect(p?.amountDue).toHaveLength(12);
  });
  it('round-trips through CSV, help cases included', () => {
    const list = [P('a', { className: '4B', owner: 'Mr Khan', amountReceived: '2000', receivedDate: '2026-10-09' }), P('b', { needsHelp: true, helpStaff: 'Mrs Rao', helpNote: 'Lost job, asked for time' })];
    const csv = promisesToCsv(list);
    expect(csv.split('\r\n')[0]).toBe(promiseTemplateCsv());
    const back = promisesFromCsv(csv);
    expect(back.problems).toEqual([]);
    expect(back.rows.map(({ id: _id, ...rest }) => rest)).toEqual(list.map(({ id: _id, ...rest }) => rest));
  });
  it('reads day-first dates and other column names, and explains a file it cannot use', () => {
    const { rows, problems } = promisesFromCsv('Name,Phone,Due,Promised by,Hardship\nIra,9876500000,4000,20/10/2026,yes\nKabir,,3000,tomorrow,\n,,,,\n');
    expect(rows.map((r) => [r.student, r.amountDue, r.promisedDate, r.needsHelp])).toEqual([
      ['Ira', '4000', '2026-10-20', true],
      ['Kabir', '3000', '', false],
    ]);
    expect(problems).toEqual(['1 date could not be read and was left blank. Write dates as 2026-10-14 or 14/10/2026.']);
    expect(promisesFromCsv('Roll,Marks\n1,2\n').error).toMatch(/Student/);
  });
});
