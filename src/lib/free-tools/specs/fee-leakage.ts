import { Checker, bi, n, type ToolSpec } from '../engine';
import { money, pct, type ReportSection } from '../report';
import { EMPTY_REPORT, ESTIMATE, picker } from './common';

const F = {
  students: bi('Students enrolled', 'Enrolled students'),
  fee: bi('Average annual fee per student', 'Har student ki ausat saalana fees'),
  overdue: bi('Fee overdue by more than 30 days', '30 din se zyada overdue fees'),
  online: bi('Share of fees paid online', 'Online bhari gayi fees ka hissa'),
  failed: bi('Online payments that fail and are not retried', 'Fail hue online payments jo dobara nahi hue'),
  cash: bi('Cash collected but not receipted (your estimate)', 'Cash mila par receipt nahi bani (aapka anumaan)'),
  reminder: bi('Overdue recovered with timely reminders', 'Samay par reminder se wapas aaya overdue'),
  retry: bi('Failed payments recovered by a retry link', 'Retry link se wapas aaye failed payments'),
  months: bi('Months to reach the recovery target', 'Recovery target ke liye mahine'),
};

export const feeLeakageSpec: ToolSpec = {
  slug: 'fee-leakage-calculator',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('Your school', 'Aapka school'),
      fields: [
        { kind: 'number', id: 'students', label: F.students, suffix: 'students', min: 1 },
        { kind: 'number', id: 'fee', label: F.fee, suffix: 'money', min: 1 },
      ],
    },
    {
      title: bi('Where fees leak', 'Fees kahan se nikalti hai'),
      fields: [
        { kind: 'number', id: 'overdue', label: F.overdue, suffix: 'percent', min: 0, max: 100, help: bi('Share of the year’s billed fee.', 'Saal ki billed fees ka hissa.') },
        { kind: 'number', id: 'online', label: F.online, suffix: 'percent', min: 0, max: 100 },
        { kind: 'number', id: 'failed', label: F.failed, suffix: 'percent', min: 0, max: 100, help: bi('Share of online payment value.', 'Online payment ki rakam ka hissa.') },
        { kind: 'number', id: 'cash', label: F.cash, suffix: 'percent', min: 0, max: 100, help: bi('Share of cash collections. Be honest; this stays in your browser.', 'Cash collection ka hissa. Sach bhariye; ye aapke browser mein hi rehta hai.') },
      ],
    },
    {
      title: bi('Recovery scenario', 'Recovery scenario'),
      fields: [
        { kind: 'number', id: 'reminder', label: F.reminder, suffix: 'percent', min: 0, max: 100 },
        { kind: 'number', id: 'retry', label: F.retry, suffix: 'percent', min: 0, max: 100 },
        { kind: 'number', id: 'months', label: F.months, suffix: 'months', min: 1, max: 24 },
      ],
    },
  ],
  defaults: { students: '', fee: '', overdue: '', online: '', failed: '0', cash: '0', reminder: '', retry: '0', months: '6' },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const students = c.num(n(v, 'students'), F.students, { min: 1, int: true });
    const fee = c.num(n(v, 'fee'), F.fee, { min: 1 });
    const overdue = c.num(n(v, 'overdue'), F.overdue, { min: 0, max: 100 });
    const online = c.num(n(v, 'online'), F.online, { min: 0, max: 100 });
    const failed = c.opt(n(v, 'failed'), 0, F.failed, { min: 0, max: 100 });
    const cash = c.opt(n(v, 'cash'), 0, F.cash, { min: 0, max: 100 });
    const reminder = c.num(n(v, 'reminder'), F.reminder, { min: 0, max: 100 });
    const retry = c.opt(n(v, 'retry'), 0, F.retry, { min: 0, max: 100 });
    const months = c.opt(n(v, 'months'), 6, F.months, { min: 1, max: 24, int: true });
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };

    const billed = students * fee;
    const overdueAmt = billed * (overdue / 100);
    const failedAmt = billed * (online / 100) * (failed / 100);
    const cashAmt = billed * (1 - online / 100) * (cash / 100);
    const leakage = overdueAmt + failedAmt + cashAmt;
    const recovery = (rem: number) => overdueAmt * (rem / 100) + failedAmt * (retry / 100) + cashAmt;
    const expected = recovery(reminder);
    const monthly = expected / months;
    const levels = [
      { name: p('Weak reminders', 'Kamzor reminders'), r: reminder / 2 },
      { name: p('Your estimate', 'Aapka anumaan'), r: reminder },
      { name: p('Strong reminders', 'Mazboot reminders'), r: Math.min(100, reminder * 1.5) },
    ];

    const sections: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Annual fee leakage', 'Saal ki fee leakage'), value: money(leakage), tone: leakage > 0 ? 'bad' : 'good', note: pct(billed ? (leakage / billed) * 100 : 0) + p(' of billed fee', ' billed fees ka') },
          { label: p('Expected recovery', 'Anumanit recovery'), value: money(expected), tone: 'good', note: p('with the reminder rate you entered', 'aapke bhare reminder rate se') },
          { label: p('Monthly recovery target', 'Mahine ka recovery target'), value: money(monthly), note: p(`over ${months} months`, `${months} mahinon mein`) },
          { label: p('Still at risk after recovery', 'Recovery ke baad bhi jokhim mein'), value: money(leakage - expected), tone: leakage - expected > 0 ? 'warn' : 'good' },
        ],
      },
      {
        kind: 'table',
        heading: p('Where the money goes', 'Paisa kahan jaata hai'),
        columns: [p('Source', 'Srot'), p('Amount a year', 'Saal ki rakam'), p('Share of leakage', 'Leakage ka hissa')],
        rows: [
          [p('Overdue fees', 'Overdue fees'), money(overdueAmt), pct(leakage ? (overdueAmt / leakage) * 100 : 0)],
          [p('Failed online payments', 'Fail online payments'), money(failedAmt), pct(leakage ? (failedAmt / leakage) * 100 : 0)],
          [p('Unreceipted cash', 'Bina receipt cash'), money(cashAmt), pct(leakage ? (cashAmt / leakage) * 100 : 0)],
        ],
        numeric: [false, true, true],
      },
      {
        kind: 'table',
        heading: p('Reminder effectiveness scenarios', 'Reminder asar ke scenarios'),
        columns: [p('Scenario', 'Scenario'), p('Overdue recovered', 'Wapas aaya overdue'), p('Total recovered a year', 'Saal mein kul recovery')],
        rows: levels.map((l) => [l.name, pct(l.r), money(recovery(l.r))]),
        numeric: [false, true, true],
      },
      {
        kind: 'notes',
        heading: p('Action checklist', 'Action checklist'),
        items: [
          p('Give a numbered receipt for every cash payment, the same day. Close the cash book daily.', 'Har cash payment ki numbered receipt usi din dein. Cash book roz band karein.'),
          p('Remind each family privately three days before the due date, on the date, and seven days after.', 'Har parivaar ko alag se due date se teen din pehle, us din, aur saat din baad yaad dilayein.'),
          p('Send a fresh payment link when an online payment fails, within a day.', 'Online payment fail ho to ek din mein naya payment link bhejein.'),
          p('Review the overdue list every week with one named owner for each family.', 'Har hafte overdue list dekhein, har parivaar ke liye ek zimmedaar vyakti tay karein.'),
          p('Never name a family in a group or on a notice board.', 'Kisi parivaar ka naam group ya notice board par kabhi na likhein.'),
        ],
      },
    ];

    return {
      errors: [],
      report: {
        title: p('Fee Leakage and Recovery Estimate', 'Fee Leakage aur Recovery Anumaan'),
        subtitle: p(`${students} students · billed ${money(billed)} a year`, `${students} students · saal ka bill ${money(billed)}`),
        sections,
        assumptions: [
          p('Unreceipted cash counts as fully recoverable once receipting is fixed.', 'Receipt theek hone par bina receipt cash poora wapas maana gaya hai.'),
          p('Overdue, failed and cash leaks do not overlap.', 'Overdue, fail aur cash leakage ek doosre mein shaamil nahi.'),
          p('Recovery rates are your own estimates, not measured results.', 'Recovery rate aapke anumaan hain, naape gaye nateeje nahi.'),
        ],
        disclaimer: ESTIMATE(p),
      },
    };
  },
};
